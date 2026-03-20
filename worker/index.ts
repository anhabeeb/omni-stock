/// <reference types="@cloudflare/workers-types" />
import { Hono, Context, Next } from 'hono';
import { z } from 'zod';

const grnSchema = z.object({
  grn_number: z.string().min(1).max(50),
  supplier_id: z.string(),
  received_date: z.string().datetime(),
  godown_id: z.string(),
  remarks: z.string().optional(),
  items: z.array(z.object({
    item_id: z.string(),
    entered_quantity: z.number().positive(),
    entered_unit_id: z.number().int().positive(),
    unit_cost: z.number().nonnegative(),
    total_line_cost: z.number().nonnegative(),
    batch_number: z.string().optional(),
    manufacture_date: z.string().optional(),
    expiry_date: z.string().optional(),
  })).min(1),
});
import { jwt, sign, verify } from 'hono/jwt';
import { cors } from 'hono/cors';
import { InventoryService } from './services/inventory';
import { ReportingService } from './services/reporting';
import { StockCountService } from './services/stockCount';
import { WastageService } from './services/wastage';
import { AlertsService } from './services/alerts';
import { BarcodeService } from './services/barcode';
import { FinanceService } from './services/finance';
import { SmartAlertsService } from './services/smartAlerts';
import { StockRequestService } from './services/stockRequest';
import { ExpiryRiskService } from './services/expiryRisk';
import { DiscrepancyService } from './services/discrepancy';
import { KPIService } from './services/kpi';
import { AttachmentService } from './services/attachment';
import { NotificationService } from './services/notification';
import { OnboardingService } from './services/onboarding';
import { UserService } from './services/user';
import { SettingsService } from './services/settings';
import { SetupService } from './services/setup';
import { EventService, EventType } from './services/event';
import { IdService } from './services/id';
import { ReferenceType } from '../src/types';
import { CacheManager } from './cache';
import { hashPassword, verifyPassword } from './utils/auth';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  "omni-stock": KVNamespace;
  JWT_SECRET: string;
};

type Variables = {
  jwtPayload: any;
  user: any;
  permissions: string[];
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// --- Security Middleware ---
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
});

const rateLimiter = async (c: any, next: any) => {
  if (!c.env['omni-stock']) {
    await next();
    return;
  }
  const ip = c.req.header('CF-Connecting-IP') || 'anonymous';
  const path = c.req.path;
  const key = `ratelimit:${ip}:${path}`;
  
  const current = await c.env['omni-stock'].get(key);
  const count = current ? parseInt(current) : 0;
  
  if (count >= 100) { // 100 requests per window
    return c.json({ message: "Too many requests" }, 429);
  }
  
  await c.env['omni-stock'].put(key, (count + 1).toString(), { expirationTtl: 60 }); // 1 minute window
  await next();
};

app.use('*', cors());

// --- Initialization Check Middleware ---
const initCheckMiddleware = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const path = c.req.path;
  // Skip check for setup, public settings, and login
  if (path.startsWith('/api/setup') || path === '/api/settings/public' || path === '/api/auth/login') {
    await next();
    return;
  }

  const setupService = new SetupService(c.env.DB);
  const status = await setupService.getBootstrapStatus();
  if (!status.is_initialized) {
    return c.json({ message: "System not initialized", needsSetup: true }, 403);
  }
  await next();
};

app.use('/api/*', initCheckMiddleware);

// --- Auth Middleware ---
const authMiddleware = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const secret = c.env.JWT_SECRET || "omnistock-secret-key-2026";
  const jwtMiddleware = jwt({ secret, alg: 'HS256' });
  
  try {
    // Run JWT middleware to verify token and set jwtPayload
    let jwtError = false;
    await jwtMiddleware(c, async () => {
      // If we are here, JWT is valid
    }).catch(() => {
      jwtError = true;
    });

    if (jwtError || !c.get('jwtPayload')) {
      return c.json({ message: "Unauthorized" }, 401);
    }

    const payload = c.get('jwtPayload');
    const userService = new UserService(c.env.DB);
    
    // Fetch user to ensure they are still active and get latest permissions
    const user = await userService.getUserById(payload.id);
    if (!user || !user.is_active) {
      return c.json({ message: "Unauthorized: User is inactive or not found" }, 401);
    }
    
    const permissions = await userService.getUserPermissions(user.id);
    
    // Attach to context
    c.set('user', user);
    c.set('permissions', permissions);
    
    await next();
  } catch (e) {
    return c.json({ message: "Unauthorized" }, 401);
  }
};

// --- RBAC Helper ---
const requirePermission = (permission: string) => async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const permissions = c.get('permissions') as string[];
  const user = c.get('user') as any;
  
  // Super admin bypass
  if (user.role_name === 'super_admin' || permissions.includes(permission)) {
    await next();
  } else {
    return c.json({ message: `Forbidden: Missing permission ${permission}` }, 403);
  }
};

// --- API Routes ---

// Auth
app.post("/api/auth/login", rateLimiter, async (c) => {
  const { username, password } = await c.req.json();
  const secret = c.env.JWT_SECRET || "omnistock-secret-key-2026";
  const userService = new UserService(c.env.DB);
  const setupService = new SetupService(c.env.DB);
  
  // Check if DB is initialized
  const bootstrapStatus = await setupService.getBootstrapStatus();
  if (!bootstrapStatus.is_initialized) {
    return c.json({ 
      message: "System not initialized. Please run setup wizard.",
      needsSetup: true 
    }, 400);
  }
  
  const user = await userService.getUserForLogin(username);

  if (!user || !user.password_hash) {
    return c.json({ message: "Invalid credentials" }, 401);
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    return c.json({ message: "Invalid credentials" }, 401);
  }

  await userService.updateLastLogin(user.id);
  
  const token = await sign({ 
    id: user.id, 
    username: user.username, 
    role: user.role_name,
    fullName: user.full_name,
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24 hours
  }, secret);

  const permissions = await userService.getUserPermissions(user.id);
  
  return c.json({ 
    token, 
    user: { 
      id: user.id, 
      username: user.username, 
      role: user.role_name,
      fullName: user.full_name,
      permissions
    } 
  });
});

// Events Poll
app.get("/api/events/poll", authMiddleware, async (c) => {
  const since = c.req.query('since') || new Date(Date.now() - 60000).toISOString();
  const eventService = new EventService(c.env.DB);
  const events = await eventService.getEventsSince(since);
  return c.json(events);
});

// Settings Public
app.get("/api/settings/public", async (c) => {
  const settingsService = new SettingsService(c.env.DB);
  const settings = await settingsService.getPublicSettings();
  return c.json(settings);
});

// Setup & Initialization
app.get("/api/setup/status", async (c) => {
  const setupService = new SetupService(c.env.DB);
  const status = await setupService.getBootstrapStatus();
  return c.json(status);
});

app.post("/api/setup/initialize", async (c) => {
  const data = await c.req.json();
  const setupService = new SetupService(c.env.DB);
  const result = await setupService.initializeSystem(data);
  return c.json(result, result.success ? 200 : 400);
});

app.post("/api/setup/init", async (c) => {
  const setupService = new SetupService(c.env.DB);
  const result = await setupService.initialize();
  return c.json(result, result.success ? 200 : 500);
});

// Emergency Admin Reset
app.get("/api/setup/reset-admin", async (c) => {
  const hash = 'e22d2a64f93df13c3560a0420e926529006adc85d12b24735fced9e5d13664b6'; // omnistock123
  try {
    await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE username = 'admin'").bind(hash).run();
    return c.json({ message: "Admin password reset to 'omnistock123' successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 500);
  }
});

// Onboarding
app.get("/api/onboarding/status", authMiddleware, async (c) => {
  const user = c.get('user');
  const onboardingService = new OnboardingService(c.env.DB);
  const status = await onboardingService.getStatus(user.id);
  return c.json(status);
});

app.post("/api/onboarding/start", authMiddleware, async (c) => {
  const user = c.get('user');
  const onboardingService = new OnboardingService(c.env.DB);
  await onboardingService.startTutorial(user.id);
  return c.json({ success: true });
});

app.post("/api/onboarding/complete", authMiddleware, async (c) => {
  const user = c.get('user');
  const onboardingService = new OnboardingService(c.env.DB);
  await onboardingService.completeTutorial(user.id);
  return c.json({ success: true });
});

app.post("/api/onboarding/self-reset", authMiddleware, async (c) => {
  const user = c.get('user');
  const onboardingService = new OnboardingService(c.env.DB);
  await onboardingService.resetTutorial(user.id);
  return c.json({ success: true });
});

app.post("/api/onboarding/reset/:userId", authMiddleware, requirePermission('onboarding.reset'), async (c) => {
  const userId = c.req.param('userId');
  const onboardingService = new OnboardingService(c.env.DB);
  await onboardingService.resetTutorial(userId);
  return c.json({ success: true });
});

app.get("/api/onboarding/users", authMiddleware, requirePermission('onboarding.reset'), async (c) => {
  const onboardingService = new OnboardingService(c.env.DB);
  const statuses = await onboardingService.getAllStatuses();
  return c.json(statuses);
});

// Users & Settings (Protected)
app.get("/api/users", authMiddleware, requirePermission('users.view'), async (c) => {
  const role_id = c.req.query('role_id');
  const is_active = c.req.query('is_active') ? parseInt(c.req.query('is_active')!) : undefined;
  const search = c.req.query('search');
  
  const userService = new UserService(c.env.DB);
  const users = await userService.getUsers({ role_id, is_active, search });
  return c.json(users);
});

app.get("/api/users/:id", authMiddleware, requirePermission('users.view'), async (c) => {
  const userService = new UserService(c.env.DB);
  const user = await userService.getUserById(c.req.param('id'));
  if (!user) return c.json({ message: "User not found" }, 404);
  return c.json(user);
});

app.post("/api/users", authMiddleware, requirePermission('users.create'), async (c) => {
  const data = await c.req.json();
  const userService = new UserService(c.env.DB);
  const currentUser = c.get('user');

  // Validation
  if (data.role_id === 'role_super_admin' && currentUser.role_name !== 'super_admin') {
    return c.json({ message: "Only super_admin can create super_admin users" }, 403);
  }
  
  const passwordHash = await hashPassword(data.password || "omnistock123");
  const id = await userService.createUser({ ...data, password_hash: passwordHash });
  
  return c.json({ id, message: "User created successfully" }, 201);
});

app.put("/api/users/:id", authMiddleware, requirePermission('users.update'), async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const userService = new UserService(c.env.DB);
  const currentUser = c.get('user');

  const targetUser = await userService.getUserById(id);
  if (!targetUser) return c.json({ message: "User not found" }, 404);

  // Security checks
  if (targetUser.role_name === 'super_admin' && currentUser.role_name !== 'super_admin') {
    return c.json({ message: "Only super_admin can modify super_admin users" }, 403);
  }

  if (data.password) {
    data.password_hash = await hashPassword(data.password);
    delete data.password;
  }

  await userService.updateUser(id, data);
  return c.json({ message: "User updated successfully" });
});

app.post("/api/users/:id/deactivate", authMiddleware, requirePermission('users.deactivate'), async (c) => {
  const id = c.req.param('id');
  const userService = new UserService(c.env.DB);
  const currentUser = c.get('user');

  if (id === currentUser.id) {
    return c.json({ message: "Cannot deactivate yourself" }, 400);
  }

  const targetUser = await userService.getUserById(id);
  if (targetUser?.role_name === 'super_admin' && currentUser.role_name !== 'super_admin') {
    return c.json({ message: "Only super_admin can deactivate super_admin users" }, 403);
  }

  await userService.deactivateUser(id);
  return c.json({ message: "User deactivated" });
});

app.post("/api/users/:id/reactivate", authMiddleware, requirePermission('users.update'), async (c) => {
  const id = c.req.param('id');
  const userService = new UserService(c.env.DB);
  await userService.reactivateUser(id);
  return c.json({ message: "User reactivated" });
});

app.post("/api/users/:id/reset-password", authMiddleware, requirePermission('users.update'), async (c) => {
  const id = c.req.param('id');
  const { password } = await c.req.json();
  const userService = new UserService(c.env.DB);
  const currentUser = c.get('user');

  const targetUser = await userService.getUserById(id);
  if (targetUser?.role_name === 'super_admin' && currentUser.role_name !== 'super_admin') {
    return c.json({ message: "Only super_admin can reset super_admin passwords" }, 403);
  }

  const hash = await hashPassword(password);
  await userService.resetPassword(id, hash);
  return c.json({ message: "Password reset successfully" });
});

app.get("/api/roles", authMiddleware, requirePermission('roles.view'), async (c) => {
  const userService = new UserService(c.env.DB);
  const roles = await userService.getRoles();
  return c.json(roles);
});

app.get("/api/roles/:id/permissions", authMiddleware, requirePermission('roles.view'), async (c) => {
  const userService = new UserService(c.env.DB);
  const permissions = await userService.getRolePermissions(c.req.param('id'));
  return c.json(permissions);
});

app.get("/api/settings", authMiddleware, requirePermission('settings.view'), async (c) => {
  const settingsService = new SettingsService(c.env.DB);
  const settings = await settingsService.getSettings();
  return c.json(settings);
});

app.put("/api/settings", authMiddleware, requirePermission('settings.update'), async (c) => {
  const data = await c.req.json();
  const settingsService = new SettingsService(c.env.DB);
  await settingsService.updateSettings(data);
  await CacheManager.invalidate(c); // Invalidate cache on settings update
  return c.json({ message: "Settings updated successfully" });
});

// Master Data
app.get("/api/items", authMiddleware, requirePermission('master.items.view'), async (c) => {
  const cached = await CacheManager.get(c, 600);
  if (cached) return cached;
  
  const activeOnly = c.req.query("activeOnly") === "true";
  let query = "SELECT * FROM items";
  if (activeOnly) {
    query += " WHERE is_active = 1";
  }
  
  const { results } = await c.env.DB.prepare(query).all();
  return CacheManager.put(c, c.json(results), 600);
});

app.get("/api/items/:id", authMiddleware, requirePermission('master.items.view'), async (c) => {
  const id = c.req.param("id");
  const item = await c.env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(id).first();
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
});

app.post("/api/items", authMiddleware, requirePermission('master.items.create'), async (c) => {
  const data = await c.req.json();
  const idService = new IdService(c.env.DB);
  const id = await idService.generateId('inv');
  
  await c.env.DB.prepare(`
    INSERT INTO items (id, sku, name, description, category_id, base_unit_id, is_perishable, track_batches, track_expiry, reorder_level, min_stock, max_stock, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, data.sku || id, data.name, data.description || null, data.category_id || null, data.base_unit_id || null, 
    data.is_perishable ? 1 : 0, data.track_batches ? 1 : 0, data.track_expiry ? 1 : 0, 
    data.reorder_level || 0, data.min_stock || 0, data.max_stock || 0, data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1
  ).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('item.created', 'item', id, data, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ id, message: "Item created successfully" });
});

app.put("/api/items/:id", authMiddleware, requirePermission('master.items.update'), async (c) => {
  const id = c.req.param("id");
  const data = await c.req.json();
  
  await c.env.DB.prepare(`
    UPDATE items SET sku = ?, name = ?, description = ?, category_id = ?, base_unit_id = ?, is_perishable = ?, track_batches = ?, track_expiry = ?, reorder_level = ?, min_stock = ?, max_stock = ?, is_active = ?
    WHERE id = ?
  `).bind(
    data.sku, data.name, data.description || null, data.category_id || null, data.base_unit_id || null, 
    data.is_perishable ? 1 : 0, data.track_batches ? 1 : 0, data.track_expiry ? 1 : 0, 
    data.reorder_level || 0, data.min_stock || 0, data.max_stock || 0, data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
    id
  ).run();
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Item updated successfully" });
});

app.post("/api/items/:id/deactivate", authMiddleware, requirePermission('master.items.deactivate'), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE items SET is_active = 0 WHERE id = ?").bind(id).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('item.deactivated', 'item', id, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Item deactivated successfully" });
});

app.post("/api/items/:id/reactivate", authMiddleware, requirePermission('master.items.deactivate'), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE items SET is_active = 1 WHERE id = ?").bind(id).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('item.reactivated', 'item', id, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Item reactivated successfully" });
});

app.delete("/api/items/:id", authMiddleware, requirePermission('master.items.deactivate'), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('item.deleted', 'item', id, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Item deleted successfully" });
});

// Suppliers
app.get("/api/suppliers", authMiddleware, requirePermission('master.suppliers.view'), async (c) => {
  const cached = await CacheManager.get(c, 600);
  if (cached) return cached;
  
  const activeOnly = c.req.query("activeOnly") === "true";
  let query = "SELECT * FROM suppliers";
  if (activeOnly) {
    query += " WHERE is_active = 1";
  }
  
  const { results } = await c.env.DB.prepare(query).all();
  return CacheManager.put(c, c.json(results), 600);
});

app.get("/api/suppliers/:id", authMiddleware, requirePermission('master.suppliers.view'), async (c) => {
  const id = c.req.param("id");
  const supplier = await c.env.DB.prepare("SELECT * FROM suppliers WHERE id = ?").bind(id).first();
  if (!supplier) return c.json({ error: "Not found" }, 404);
  return c.json(supplier);
});

app.post("/api/suppliers", authMiddleware, requirePermission('master.suppliers.create'), async (c) => {
  const data = await c.req.json();
  const idService = new IdService(c.env.DB);
  const id = await idService.generateId('sup');
  
  await c.env.DB.prepare(`
    INSERT INTO suppliers (id, code, name, contact_person, phone, email, address, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, data.code || id, data.name, data.contact_person || null, data.phone || null, data.email || null, data.address || null, data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1
  ).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('supplier.created', 'supplier', id, data, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ id, message: "Supplier created successfully" });
});

app.put("/api/suppliers/:id", authMiddleware, requirePermission('master.suppliers.update'), async (c) => {
  const id = c.req.param("id");
  const data = await c.req.json();
  
  await c.env.DB.prepare(`
    UPDATE suppliers SET code = ?, name = ?, contact_person = ?, phone = ?, email = ?, address = ?, is_active = ?
    WHERE id = ?
  `).bind(
    data.code, data.name, data.contact_person || null, data.phone || null, data.email || null, data.address || null, data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1, id
  ).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('supplier.updated', 'supplier', id, data, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Supplier updated successfully" });
});

app.post("/api/suppliers/:id/deactivate", authMiddleware, requirePermission('master.suppliers.deactivate'), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE suppliers SET is_active = 0 WHERE id = ?").bind(id).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('supplier.deactivated', 'supplier', id, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Supplier deactivated successfully" });
});

app.post("/api/suppliers/:id/reactivate", authMiddleware, requirePermission('master.suppliers.deactivate'), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE suppliers SET is_active = 1 WHERE id = ?").bind(id).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('supplier.reactivated', 'supplier', id, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Supplier reactivated successfully" });
});

app.delete("/api/suppliers/:id", authMiddleware, requirePermission('master.suppliers.deactivate'), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM suppliers WHERE id = ?").bind(id).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('supplier.deleted', 'supplier', id, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Supplier deleted successfully" });
});

// Godowns
app.get("/api/godowns", authMiddleware, requirePermission('master.godowns.view'), async (c) => {
  const cached = await CacheManager.get(c, 600);
  if (cached) return cached;
  
  const activeOnly = c.req.query("activeOnly") === "true";
  let query = "SELECT * FROM godowns";
  if (activeOnly) {
    query += " WHERE is_active = 1";
  }
  
  const { results } = await c.env.DB.prepare(query).all();
  return CacheManager.put(c, c.json(results), 600);
});

app.get("/api/godowns/:id", authMiddleware, requirePermission('master.godowns.view'), async (c) => {
  const id = c.req.param("id");
  const godown = await c.env.DB.prepare("SELECT * FROM godowns WHERE id = ?").bind(id).first();
  if (!godown) return c.json({ error: "Not found" }, 404);
  return c.json(godown);
});

app.post("/api/godowns", authMiddleware, requirePermission('master.godowns.create'), async (c) => {
  const data = await c.req.json();
  const idService = new IdService(c.env.DB);
  const id = await idService.generateId('gdn');
  
  await c.env.DB.prepare(`
    INSERT INTO godowns (id, code, name, address, is_active)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    id, data.code || id, data.name, data.address || null, data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1
  ).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('godown.created', 'godown', id, data, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ id, message: "Godown created successfully" });
});

app.put("/api/godowns/:id", authMiddleware, requirePermission('master.godowns.update'), async (c) => {
  const id = c.req.param("id");
  const data = await c.req.json();
  
  await c.env.DB.prepare(`
    UPDATE godowns SET code = ?, name = ?, address = ?, is_active = ?
    WHERE id = ?
  `).bind(
    data.code, data.name, data.address || null, data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1, id
  ).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('godown.updated', 'godown', id, data, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Godown updated successfully" });
});

app.post("/api/godowns/:id/deactivate", authMiddleware, requirePermission('master.godowns.deactivate'), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE godowns SET is_active = 0 WHERE id = ?").bind(id).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('godown.deactivated', 'godown', id, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Godown deactivated successfully" });
});

app.post("/api/godowns/:id/reactivate", authMiddleware, requirePermission('master.godowns.deactivate'), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE godowns SET is_active = 1 WHERE id = ?").bind(id).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('godown.reactivated', 'godown', id, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Godown reactivated successfully" });
});

app.delete("/api/godowns/:id", authMiddleware, requirePermission('master.godowns.deactivate'), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM godowns WHERE id = ?").bind(id).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('godown.deleted', 'godown', id, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Godown deleted successfully" });
});

// Outlets
app.get("/api/outlets", authMiddleware, requirePermission('master.outlets.view'), async (c) => {
  const cached = await CacheManager.get(c, 600);
  if (cached) return cached;
  
  const activeOnly = c.req.query("activeOnly") === "true";
  let query = "SELECT * FROM outlets";
  if (activeOnly) {
    query += " WHERE is_active = 1";
  }
  
  const { results } = await c.env.DB.prepare(query).all();
  return CacheManager.put(c, c.json(results), 600);
});

app.get("/api/outlets/:id", authMiddleware, requirePermission('master.outlets.view'), async (c) => {
  const id = c.req.param("id");
  const outlet = await c.env.DB.prepare("SELECT * FROM outlets WHERE id = ?").bind(id).first();
  if (!outlet) return c.json({ error: "Not found" }, 404);
  return c.json(outlet);
});

app.post("/api/outlets", authMiddleware, requirePermission('master.outlets.create'), async (c) => {
  const data = await c.req.json();
  const idService = new IdService(c.env.DB);
  const id = await idService.generateId('olt');
  
  await c.env.DB.prepare(`
    INSERT INTO outlets (id, code, name, address, manager_id, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id, data.code || id, data.name, data.address || null, data.manager_id || null, data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1
  ).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('outlet.created', 'outlet', id, data, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ id, message: "Outlet created successfully" });
});

app.put("/api/outlets/:id", authMiddleware, requirePermission('master.outlets.update'), async (c) => {
  const id = c.req.param("id");
  const data = await c.req.json();
  
  await c.env.DB.prepare(`
    UPDATE outlets SET code = ?, name = ?, address = ?, manager_id = ?, is_active = ?
    WHERE id = ?
  `).bind(
    data.code, data.name, data.address || null, data.manager_id || null, data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1, id
  ).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('outlet.updated', 'outlet', id, data, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Outlet updated successfully" });
});

app.post("/api/outlets/:id/deactivate", authMiddleware, requirePermission('master.outlets.deactivate'), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE outlets SET is_active = 0 WHERE id = ?").bind(id).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('outlet.deactivated', 'outlet', id, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Outlet deactivated successfully" });
});

app.post("/api/outlets/:id/reactivate", authMiddleware, requirePermission('master.outlets.deactivate'), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE outlets SET is_active = 1 WHERE id = ?").bind(id).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('outlet.reactivated', 'outlet', id, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Outlet reactivated successfully" });
});

app.delete("/api/outlets/:id", authMiddleware, requirePermission('master.outlets.deactivate'), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM outlets WHERE id = ?").bind(id).run();
  
  const user = c.get('user');
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('outlet.deleted', 'outlet', id, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Outlet deleted successfully" });
});

app.get("/api/categories", authMiddleware, requirePermission('master.categories.view'), async (c) => {
  const cached = await CacheManager.get(c, 600);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM categories").all();
  return CacheManager.put(c, c.json(results), 600);
});

app.get("/api/units", authMiddleware, requirePermission('master.units.view'), async (c) => {
  const cached = await CacheManager.get(c, 600);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM units").all();
  return CacheManager.put(c, c.json(results), 600);
});

// GRN
app.get("/api/grn", authMiddleware, requirePermission('inventory.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM goods_receipts ORDER BY created_at DESC").all();
  return CacheManager.put(c, c.json(results), 60);
});

app.post("/api/grn", authMiddleware, requirePermission('inventory.grn.create'), async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = grnSchema.parse(body);
    
    const inventoryService = new InventoryService(c.env.DB);
    const idService = new IdService(c.env.DB);
    
    const id = await idService.generateId('grn');
    const user = c.get('user') as any;
    
    const statements: any[] = [];
    statements.push(c.env.DB.prepare(`
      INSERT INTO goods_receipts (id, grn_number, supplier_id, received_date, godown_id, remarks, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
    `).bind(id, validatedData.grn_number, validatedData.supplier_id, validatedData.received_date, validatedData.godown_id, validatedData.remarks, user.id));

    for (const item of validatedData.items) {
      const baseQty = await inventoryService.convertToBaseQuantity(item.item_id, item.entered_unit_id, item.entered_quantity);
      statements.push(c.env.DB.prepare(`
        INSERT INTO goods_receipt_items (
          id, goods_receipt_id, item_id, entered_quantity, entered_unit_id, base_quantity, 
          batch_number, manufacture_date, expiry_date, unit_cost, total_line_cost
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        await idService.generateId('grn_item'), id, item.item_id, item.entered_quantity, item.entered_unit_id, baseQty,
        item.batch_number, item.manufacture_date, item.expiry_date, item.unit_cost, item.total_line_cost
      ));
    }

    await c.env.DB.batch(statements);
    
    const eventService = new EventService(c.env.DB);
    await eventService.broadcast('inventory.changed', 'grn', id, null, user.id);
    
    await CacheManager.invalidate(c);
    return c.json({ id, message: "GRN created successfully" }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation failed", details: error.issues }, 400);
    }
    return c.json({ message: error instanceof Error ? error.message : "Failed to create GRN" }, 400);
  }
});

app.get("/api/grn/:id", authMiddleware, requirePermission('inventory.view'), async (c) => {
  const id = c.req.param('id');
  const grn = await c.env.DB.prepare("SELECT * FROM goods_receipts WHERE id = ?").bind(id).first();
  const { results: items } = await c.env.DB.prepare("SELECT * FROM goods_receipt_items WHERE goods_receipt_id = ?").bind(id).all();
  return c.json({ ...grn, items });
});

app.post("/api/grn/:id/post", authMiddleware, requirePermission('inventory.grn.post'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as any;
  const inventoryService = new InventoryService(c.env.DB);
  try {
    await inventoryService.postGRN(id, user.id);
    
    const eventService = new EventService(c.env.DB);
    await eventService.broadcast('grn.posted', 'grn', id, null, user.id);
    await eventService.broadcast('inventory.changed', 'inventory', null, null, user.id);
    
    await CacheManager.invalidate(c);
    return c.json({ message: "GRN posted successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

app.post("/api/grn/:id/cancel", authMiddleware, requirePermission('inventory.grn.post'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as any;
  const inventoryService = new InventoryService(c.env.DB);
  try {
    await inventoryService.cancelDocument('goods_receipt', id, user.id);
    await CacheManager.invalidate(c);
    return c.json({ message: "GRN cancelled successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

// Issues
app.get("/api/issues", authMiddleware, requirePermission('inventory.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM stock_issues ORDER BY created_at DESC").all();
  return CacheManager.put(c, c.json(results), 60);
});

app.post("/api/issues", authMiddleware, requirePermission('inventory.issue.create'), async (c) => {
  const body = await c.req.json();
  const inventoryService = new InventoryService(c.env.DB);
  const idService = new IdService(c.env.DB);
  
  const id = await idService.generateId('iss');
  const user = c.get('user') as any;
  
  const statements: any[] = [];
  statements.push(c.env.DB.prepare(`
    INSERT INTO stock_issues (id, issue_number, source_godown_id, outlet_id, issue_date, remarks, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
  `).bind(id, body.issue_number, body.source_godown_id, body.outlet_id, body.issue_date, body.remarks, user.id));

  if (body.items && body.items.length > 0) {
    for (const item of body.items) {
      const itemId = await idService.generateId('iss_item');
      const baseQty = await inventoryService.convertToBaseQuantity(item.item_id, item.entered_unit_id, item.issued_quantity);
      statements.push(c.env.DB.prepare(`
        INSERT INTO stock_issue_items (
          id, stock_issue_id, item_id, requested_quantity, issued_quantity, entered_unit_id, base_quantity, unit_cost, total_cost
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        itemId, id, item.item_id, item.requested_quantity, item.issued_quantity, item.entered_unit_id, 
        baseQty, item.unit_cost, item.total_cost
      ));

      if (item.allocations) {
        for (const alloc of item.allocations) {
          statements.push(c.env.DB.prepare(`
            INSERT INTO stock_issue_batch_allocations (id, stock_issue_item_id, batch_id, allocated_quantity, allocated_base_quantity)
            VALUES (?, ?, ?, ?, ?)
          `).bind(await idService.generateId('iss_alloc'), itemId, alloc.batch_id, alloc.allocated_quantity, alloc.allocated_base_quantity));
        }
      }
    }
  }

  try {
    await c.env.DB.batch(statements);
    
    const eventService = new EventService(c.env.DB);
    await eventService.broadcast('inventory.changed', 'issue', id, null, user.id);
    
    await CacheManager.invalidate(c);
    return c.json({ id, message: "Stock Issue created successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

app.get("/api/issues/:id", authMiddleware, requirePermission('inventory.view'), async (c) => {
  const id = c.req.param('id');
  const issue = await c.env.DB.prepare("SELECT * FROM stock_issues WHERE id = ?").bind(id).first();
  const { results: items } = await c.env.DB.prepare("SELECT * FROM stock_issue_items WHERE stock_issue_id = ?").bind(id).all();
  
  const itemsWithAllocations = [];
  for (const item of items as any[]) {
    const { results: allocations } = await c.env.DB.prepare("SELECT * FROM stock_issue_batch_allocations WHERE stock_issue_item_id = ?").bind(item.id).all();
    itemsWithAllocations.push({ ...item, allocations });
  }

  return c.json({ ...issue, items: itemsWithAllocations });
});

app.post("/api/issues/:id/post", authMiddleware, requirePermission('inventory.issue.post'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as any;
  const inventoryService = new InventoryService(c.env.DB);
  try {
    await inventoryService.postIssue(id, user.id);
    
    const eventService = new EventService(c.env.DB);
    await eventService.broadcast('issue.posted', 'issue', id, null, user.id);
    await eventService.broadcast('inventory.changed', 'inventory', null, null, user.id);
    
    await CacheManager.invalidate(c);
    return c.json({ message: "Stock Issue posted successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

app.get("/api/inventory/fefo-suggestions", authMiddleware, requirePermission('inventory.view'), async (c) => {
  const itemId = c.req.query('itemId');
  const godownId = c.req.query('godownId');
  const quantity = parseFloat(c.req.query('quantity') || "0");
  if (!itemId || !godownId) return c.json({ message: "Missing params" }, 400);
  const inventoryService = new InventoryService(c.env.DB);
  const suggestions = await inventoryService.getFEFOSuggestions(itemId, godownId, quantity);
  return c.json(suggestions);
});

// Transfers
app.get("/api/transfers", authMiddleware, requirePermission('inventory.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM transfers ORDER BY created_at DESC").all();
  return CacheManager.put(c, c.json(results), 60);
});

app.get("/api/transfers/:id", authMiddleware, requirePermission('inventory.view'), async (c) => {
  const id = c.req.param("id");
  const transfer = await c.env.DB.prepare("SELECT * FROM transfers WHERE id = ?").bind(id).first();
  if (!transfer) return c.json({ error: "Transfer not found" }, 404);
  
  const { results: items } = await c.env.DB.prepare(`
    SELECT ti.*, i.name as item_name, i.sku, i.barcode
    FROM transfer_items ti
    JOIN items i ON ti.item_id = i.id
    WHERE ti.transfer_id = ?
  `).bind(id).all();
  
  return c.json({ ...transfer, items });
});

app.post("/api/transfers", authMiddleware, requirePermission('inventory.transfer.create'), async (c) => {
  const body = await c.req.json();
  const inventoryService = new InventoryService(c.env.DB);
  const idService = new IdService(c.env.DB);
  
  const id = await idService.generateId('trf');
  const user = c.get('user') as any;
  
  const statements: any[] = [];
  statements.push(c.env.DB.prepare(`
    INSERT INTO transfers (id, transfer_number, source_godown_id, destination_godown_id, transfer_date, remarks, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
  `).bind(id, body.transfer_number, body.source_godown_id, body.destination_godown_id, body.transfer_date, body.remarks, user.id));

  if (body.items && body.items.length > 0) {
    for (const item of body.items) {
      const itemId = await idService.generateId('trf_item');
      const baseQty = await inventoryService.convertToBaseQuantity(item.item_id, item.entered_unit_id, item.entered_quantity);
      statements.push(c.env.DB.prepare(`
        INSERT INTO transfer_items (id, transfer_id, item_id, entered_quantity, entered_unit_id, base_quantity, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(itemId, id, item.item_id, item.entered_quantity, item.entered_unit_id, baseQty, item.remarks));

      if (item.allocations) {
        for (const alloc of item.allocations) {
          statements.push(c.env.DB.prepare(`
            INSERT INTO transfer_batch_allocations (id, transfer_item_id, batch_id, allocated_quantity, allocated_base_quantity)
            VALUES (?, ?, ?, ?, ?)
          `).bind(await idService.generateId('trf_alloc'), itemId, alloc.batch_id, alloc.allocated_quantity, alloc.allocated_base_quantity));
        }
      }
    }
  }

  try {
    await c.env.DB.batch(statements);
    
    const eventService = new EventService(c.env.DB);
    await eventService.broadcast('inventory.changed', 'transfer', id, null, user.id);
    
    await CacheManager.invalidate(c);
    return c.json({ id, message: "Transfer created successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

app.post("/api/transfers/:id/dispatch", authMiddleware, requirePermission('inventory.transfer.dispatch'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as any;
  const inventoryService = new InventoryService(c.env.DB);
  try {
    await inventoryService.dispatchTransfer(id, user.id);
    
    const eventService = new EventService(c.env.DB);
    await eventService.broadcast('transfer.dispatched', 'transfer', id, null, user.id);
    await eventService.broadcast('inventory.changed', 'inventory', null, null, user.id);
    
    await CacheManager.invalidate(c);
    return c.json({ message: "Transfer dispatched successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

app.post("/api/transfers/:id/receive", authMiddleware, requirePermission('inventory.transfer.receive'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as any;
  const inventoryService = new InventoryService(c.env.DB);
  try {
    await inventoryService.receiveTransfer(id, user.id);
    
    const eventService = new EventService(c.env.DB);
    await eventService.broadcast('transfer.received', 'transfer', id, null, user.id);
    await eventService.broadcast('inventory.changed', 'inventory', null, null, user.id);
    
    await CacheManager.invalidate(c);
    return c.json({ message: "Transfer received successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

// Adjustments
app.get("/api/adjustments", authMiddleware, requirePermission('inventory.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM stock_adjustments ORDER BY created_at DESC").all();
  return CacheManager.put(c, c.json(results), 60);
});

app.post("/api/adjustments", authMiddleware, requirePermission('inventory.adjustment.create'), async (c) => {
  const body = await c.req.json();
  const inventoryService = new InventoryService(c.env.DB);
  const idService = new IdService(c.env.DB);
  
  const id = await idService.generateId('adj');
  const user = c.get('user') as any;
  
  const statements: any[] = [];
  statements.push(c.env.DB.prepare(`
    INSERT INTO stock_adjustments (id, adjustment_number, godown_id, adjustment_date, reason, remarks, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
  `).bind(id, body.adjustment_number, body.godown_id, body.adjustment_date, body.reason, body.remarks, user.id));

  if (body.items && body.items.length > 0) {
    for (const item of body.items) {
      const baseQty = await inventoryService.convertToBaseQuantity(item.item_id, item.entered_unit_id, item.entered_quantity);
      statements.push(c.env.DB.prepare(`
        INSERT INTO stock_adjustment_items (
          id, stock_adjustment_id, item_id, batch_id, direction, entered_quantity, 
          entered_unit_id, base_quantity, unit_cost, total_cost, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        await idService.generateId('adj_item'), id, item.item_id, item.batch_id, item.direction, item.entered_quantity,
        item.entered_unit_id, baseQty, item.unit_cost, item.total_cost, item.remarks
      ));
    }
  }

  try {
    await c.env.DB.batch(statements);
    
    const eventService = new EventService(c.env.DB);
    await eventService.broadcast('inventory.changed', 'adjustment', id, null, user.id);
    
    await CacheManager.invalidate(c);
    return c.json({ id, message: "Adjustment created successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

app.post("/api/adjustments/:id/post", authMiddleware, requirePermission('inventory.adjustment.post'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as any;
  const inventoryService = new InventoryService(c.env.DB);
  try {
    await inventoryService.postAdjustment(id, user.id);
    
    const eventService = new EventService(c.env.DB);
    await eventService.broadcast('adjustment.posted', 'adjustment', id, null, user.id);
    await eventService.broadcast('inventory.changed', 'inventory', null, null, user.id);
    
    await CacheManager.invalidate(c);
    return c.json({ message: "Adjustment posted successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

// Dashboard Analytics
app.get("/api/dashboard/summary", authMiddleware, requirePermission('kpi.view'), async (c) => {
  const cached = await CacheManager.get(c, 30);
  if (cached) return cached;
  const godownId = c.req.query('godownId');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const reportingService = new ReportingService(c.env.DB);
  const summary = await reportingService.getDashboardSummary({ godownId, from, to });
  return CacheManager.put(c, c.json(summary), 30);
});

app.get("/api/dashboard/stock-by-godown", authMiddleware, requirePermission('kpi.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const reportingService = new ReportingService(c.env.DB);
  const data = await reportingService.getStockByGodown();
  return CacheManager.put(c, c.json(data), 60);
});

app.get("/api/dashboard/stock-by-category", authMiddleware, requirePermission('kpi.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const reportingService = new ReportingService(c.env.DB);
  const data = await reportingService.getStockByCategory();
  return CacheManager.put(c, c.json(data), 60);
});

app.get("/api/dashboard/fast-moving", authMiddleware, requirePermission('kpi.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const limit = parseInt(c.req.query('limit') || "10");
  const offset = parseInt(c.req.query('offset') || "0");
  const reportingService = new ReportingService(c.env.DB);
  const data = await reportingService.getFastMoving(limit, offset);
  return CacheManager.put(c, c.json(data), 60);
});

// Reports
app.get("/api/reports/current-stock", authMiddleware, requirePermission('reports.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const godownId = c.req.query('godownId');
  const categoryId = c.req.query('categoryId');
  const limit = parseInt(c.req.query('limit') || "50");
  const offset = parseInt(c.req.query('offset') || "0");
  
  let sql = `
    SELECT s.*, i.name as item_name, i.sku as item_sku, g.name as godown_name, c.name as category_name
    FROM inventory_balance_summary s
    JOIN items i ON s.item_id = i.id
    JOIN godowns g ON s.godown_id = g.id
    JOIN categories c ON i.category_id = c.id
    WHERE s.quantity_on_hand > 0
  `;
  const params = [];
  if (godownId) { sql += " AND s.godown_id = ?"; params.push(godownId); }
  if (categoryId) { sql += " AND i.category_id = ?"; params.push(categoryId); }
  
  sql += " ORDER BY i.name ASC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return CacheManager.put(c, c.json(results), 60);
});

app.get("/api/reports/movements", authMiddleware, requirePermission('reports.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { from, to, itemId, godownId, movementType, limit = "50", offset = "0" } = c.req.query();
  const nLimit = parseInt(limit);
  const nOffset = parseInt(offset);
  
  let sql = `
    SELECT m.*, i.name as item_name, g.name as godown_name
    FROM stock_movements m
    JOIN items i ON m.item_id = i.id
    LEFT JOIN godowns g ON m.godown_id = g.id
    WHERE 1=1
  `;
  const params = [];
  if (from) { sql += " AND m.movement_date >= ?"; params.push(from); }
  if (to) { sql += " AND m.movement_date <= ?"; params.push(to); }
  if (itemId) { sql += " AND m.item_id = ?"; params.push(itemId); }
  if (godownId) { sql += " AND m.godown_id = ?"; params.push(godownId); }
  if (movementType) { sql += " AND m.movement_type = ?"; params.push(movementType); }
  
  sql += " ORDER BY m.movement_date DESC, m.created_at DESC LIMIT ? OFFSET ?";
  params.push(nLimit, nOffset);
  
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return CacheManager.put(c, c.json(results), 60);
});

app.get("/api/reports/valuation", authMiddleware, requirePermission('reports.view'), async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const groupBy = (c.req.query('groupBy') || 'item') as any;
  const limit = parseInt(c.req.query('limit') || "50");
  const offset = parseInt(c.req.query('offset') || "0");
  const reportingService = new ReportingService(c.env.DB);
  const data = await reportingService.getValuationReport(groupBy, limit, offset);
  return CacheManager.put(c, c.json(data), 120);
});

app.get("/api/reports/dead-stock", authMiddleware, requirePermission('reports.view'), async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const days = parseInt(c.req.query('days') || "90");
  const limit = parseInt(c.req.query('limit') || "50");
  const offset = parseInt(c.req.query('offset') || "0");
  const reportingService = new ReportingService(c.env.DB);
  const data = await reportingService.getDeadStock(days, limit, offset);
  return CacheManager.put(c, c.json(data), 120);
});

// Stock Counts
app.get("/api/stock-counts", authMiddleware, requirePermission('stockcount.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare(`
    SELECT s.*, g.name as godown_name, u.username as creator_name
    FROM stock_count_sessions s
    JOIN godowns g ON s.godown_id = g.id
    JOIN users u ON s.created_by = u.id
    ORDER BY s.created_at DESC
  `).all();
  return CacheManager.put(c, c.json(results), 60);
});

app.post("/api/stock-counts", authMiddleware, requirePermission('stockcount.create'), async (c) => {
  const { godown_id, remarks } = await c.req.json();
  const user = c.get('user') as any;
  const service = new StockCountService(c.env.DB);
  const result = await service.createSession(godown_id, user.id, remarks);
  
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('inventory.changed', 'stock_count', result.id, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json(result);
});

app.get("/api/stock-counts/:id", authMiddleware, requirePermission('stockcount.view'), async (c) => {
  const id = c.req.param('id');
  const session = await c.env.DB.prepare(`
    SELECT s.*, g.name as godown_name FROM stock_count_sessions s 
    JOIN godowns g ON s.godown_id = g.id WHERE s.id = ?
  `).bind(id).first();
  const { results: items } = await c.env.DB.prepare(`
    SELECT sci.*, i.name as item_name, i.sku as item_sku, b.batch_number
    FROM stock_count_items sci
    JOIN items i ON sci.item_id = i.id
    LEFT JOIN stock_batches b ON sci.batch_id = b.id
    WHERE sci.stock_count_session_id = ?
  `).bind(id).all();
  return c.json({ ...session, items });
});

app.post("/api/stock-counts/:id/load-system-stock", authMiddleware, requirePermission('stockcount.create'), async (c) => {
  const id = c.req.param('id');
  const service = new StockCountService(c.env.DB);
  await service.loadSystemStock(id);
  
  const user = c.get('user') as any;
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('inventory.changed', 'stock_count', id, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "System stock loaded" });
});

app.put("/api/stock-counts/items/:itemId", authMiddleware, requirePermission('stockcount.create'), async (c) => {
  const itemId = c.req.param('itemId');
  const { counted_quantity, entered_unit_id, remarks } = await c.req.json();
  const service = new StockCountService(c.env.DB);
  await service.updateItemCount(itemId, counted_quantity, entered_unit_id, remarks);
  
  const user = c.get('user') as any;
  const eventService = new EventService(c.env.DB);
  await eventService.broadcast('inventory.changed', 'stock_count_item', itemId, null, user.id);
  
  await CacheManager.invalidate(c);
  return c.json({ message: "Item count updated" });
});

app.post("/api/stock-counts/:id/submit", authMiddleware, requirePermission('stockcount.submit'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as any;
  const service = new StockCountService(c.env.DB);
  await service.submitSession(id, user.id);
  await CacheManager.invalidate(c);
  return c.json({ message: "Session submitted" });
});

app.post("/api/stock-counts/:id/approve", authMiddleware, requirePermission('stockcount.approve'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as any;
  const service = new StockCountService(c.env.DB);
  await service.approveSession(id, user.id);
  await CacheManager.invalidate(c);
  return c.json({ message: "Session approved" });
});

app.post("/api/stock-counts/:id/post", authMiddleware, requirePermission('stockcount.post'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as any;
  const service = new StockCountService(c.env.DB);
  try {
    await service.postSession(id, user.id);
    
    const eventService = new EventService(c.env.DB);
    await eventService.broadcast('stockcount.posted', 'stock_count', id, null, user.id);
    await eventService.broadcast('inventory.changed', 'inventory', null, null, user.id);
    
    await CacheManager.invalidate(c);
    return c.json({ message: "Session posted and stock reconciled" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

// Wastage
app.get("/api/wastage", authMiddleware, requirePermission('wastage.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare(`
    SELECT w.*, g.name as godown_name FROM wastage_records w
    JOIN godowns g ON w.godown_id = g.id
    ORDER BY w.created_at DESC
  `).all();
  return CacheManager.put(c, c.json(results), 60);
});

app.get("/api/wastage/analytics", authMiddleware, requirePermission('wastage.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const godownId = c.req.query('godown_id');
  const wastageService = new WastageService(c.env.DB);
  const analytics = await wastageService.getWastageAnalytics(godownId);
  return CacheManager.put(c, c.json(analytics), 60);
});

app.post("/api/wastage", authMiddleware, requirePermission('wastage.create'), async (c) => {
  const body = await c.req.json();
  const user = c.get('user') as any;
  const service = new WastageService(c.env.DB);
  const result = await service.createWastage(body, user.id);
  await CacheManager.invalidate(c);
  return c.json(result);
});

app.get("/api/wastage/:id", authMiddleware, requirePermission('wastage.view'), async (c) => {
  const id = c.req.param('id');
  const record = await c.env.DB.prepare("SELECT * FROM wastage_records WHERE id = ?").bind(id).first();
  const { results: items } = await c.env.DB.prepare(`
    SELECT wi.*, i.name as item_name, b.batch_number
    FROM wastage_record_items wi
    JOIN items i ON wi.item_id = i.id
    LEFT JOIN stock_batches b ON wi.batch_id = b.id
    WHERE wi.wastage_record_id = ?
  `).bind(id).all();
  return c.json({ ...record, items });
});

app.post("/api/wastage/:id/post", authMiddleware, requirePermission('wastage.post'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as any;
  const service = new WastageService(c.env.DB);
  try {
    await service.postWastage(id, user.id);
    await CacheManager.invalidate(c);
    return c.json({ message: "Wastage posted successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

// Expiry Risk
app.get("/api/expiry/risk", authMiddleware, requirePermission('alerts.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const godownId = c.req.query('godown_id');
  const expiryRiskService = new ExpiryRiskService(c.env.DB);
  const summary = await expiryRiskService.getExpiryRiskSummary(godownId);
  return CacheManager.put(c, c.json(summary), 60);
});

app.get("/api/expiry/recommendations", authMiddleware, requirePermission('alerts.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const godownId = c.req.query('godown_id');
  const expiryRiskService = new ExpiryRiskService(c.env.DB);
  const recommendations = await expiryRiskService.getPreventionRecommendations(godownId);
  return CacheManager.put(c, c.json(recommendations), 60);
});

// Discrepancies
app.get("/api/discrepancies/summary", authMiddleware, requirePermission('alerts.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const godownId = c.req.query('godown_id');
  const discrepancyService = new DiscrepancyService(c.env.DB);
  const summary = await discrepancyService.getDiscrepancySummary(godownId);
  return CacheManager.put(c, c.json(summary), 60);
});

app.get("/api/discrepancies/trends", authMiddleware, requirePermission('alerts.view'), async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const discrepancyService = new DiscrepancyService(c.env.DB);
  const trends = await discrepancyService.getShrinkageTrends();
  return CacheManager.put(c, c.json(trends), 120);
});

// Stock Requests
app.get("/api/requests", authMiddleware, requirePermission('requests.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM stock_requests ORDER BY created_at DESC").all();
  return CacheManager.put(c, c.json(results), 60);
});

app.get("/api/requests/:id", authMiddleware, requirePermission('requests.view'), async (c) => {
  const id = c.req.param('id');
  const request = await c.env.DB.prepare("SELECT * FROM stock_requests WHERE id = ?").bind(id).first();
  const { results: items } = await c.env.DB.prepare("SELECT * FROM stock_request_items WHERE stock_request_id = ?").bind(id).all();
  return c.json({ ...request, items });
});

app.post("/api/requests", authMiddleware, requirePermission('requests.create'), async (c) => {
  const body = await c.req.json();
  const user = c.get('user') as any;
  const requestService = new StockRequestService(c.env.DB);
  const result = await requestService.createRequest(body, user.id);
  await CacheManager.invalidate(c);
  return c.json(result);
});

app.post("/api/requests/:id/submit", authMiddleware, requirePermission('requests.create'), async (c) => {
  const id = c.req.param('id');
  const requestService = new StockRequestService(c.env.DB);
  await requestService.submitRequest(id);
  await CacheManager.invalidate(c);
  return c.json({ success: true });
});

app.post("/api/requests/:id/approve", authMiddleware, requirePermission('requests.approve'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const user = c.get('user') as any;
  const requestService = new StockRequestService(c.env.DB);
  await requestService.approveRequest(id, user.id, body.items);
  await CacheManager.invalidate(c);
  return c.json({ success: true });
});

// KPIs
app.get("/api/kpi/summary", authMiddleware, requirePermission('kpi.view'), async (c) => {
  const cached = await CacheManager.get(c, 30);
  if (cached) return cached;
  const godownId = c.req.query('godown_id');
  const kpiService = new KPIService(c.env.DB);
  const summary = await kpiService.getWarehouseSummary(godownId);
  
  // Store in KV for cross-region access if available
  if (c.env['omni-stock']) {
    await c.env['omni-stock'].put(`kpi_summary_${godownId || 'all'}`, JSON.stringify(summary), { expirationTtl: 60 });
  }
  
  return CacheManager.put(c, c.json(summary), 30);
});

app.get("/api/kpi/turnover", authMiddleware, requirePermission('kpi.view'), async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const kpiService = new KPIService(c.env.DB);
  const result = await kpiService.getStockTurnover();
  return CacheManager.put(c, c.json(result), 120);
});

// Attachments
app.get("/api/attachments/:type/:id", authMiddleware, requirePermission('attachments.view'), async (c) => {
  const type = c.req.param('type');
  const id = c.req.param('id');
  const attachmentService = new AttachmentService(c.env.DB, c.env.BUCKET);
  const attachments = await attachmentService.getAttachments(type, id);
  return c.json(attachments);
});

app.post("/api/attachments/upload", authMiddleware, requirePermission('attachments.upload'), rateLimiter, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;
  const entityType = formData.get('entityType') as string;
  const entityId = formData.get('entityId') as string;
  const user = c.get('user') as any;

  const attachmentService = new AttachmentService(c.env.DB, c.env.BUCKET);
  const result = await attachmentService.uploadAttachment(user.id, entityType, entityId, file);
  return c.json(result);
});

app.get("/api/attachments/download/*", authMiddleware, requirePermission('attachments.view'), async (c) => {
  const key = c.req.path.replace('/api/attachments/download/', '');
  const attachmentService = new AttachmentService(c.env.DB, c.env.BUCKET);
  const file = await attachmentService.getFile(key);
  if (!file) return c.json({ message: "File not found" }, 404);
  return new Response(file.body, { headers: file.headers });
});

// Notifications
app.get("/api/notifications", authMiddleware, async (c) => {
  const user = c.get('user') as any;
  const notificationService = new NotificationService(c.env.DB);
  const notifications = await notificationService.getUnreadNotifications(user.id);
  return c.json(notifications);
});

app.post("/api/notifications/:id/read", authMiddleware, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as any;
  const notificationService = new NotificationService(c.env.DB);
  await notificationService.markAsRead(id, user.id);
  return c.json({ success: true });
});

app.post("/api/notifications/read-all", authMiddleware, async (c) => {
  const user = c.get('user') as any;
  const notificationService = new NotificationService(c.env.DB);
  await notificationService.markAllAsRead(user.id);
  return c.json({ success: true });
});

// Alerts
app.get("/api/alerts/summary", authMiddleware, requirePermission('alerts.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const godownId = c.req.query('godownId');
  const service = new AlertsService(c.env.DB);
  const lowStock = await service.getLowStockAlerts(godownId);
  const nearExpiry = await service.getNearExpiryAlerts(30, godownId);
  const expired = await service.getExpiredAlerts(godownId);
  const deadStock = await service.getDeadStockAlerts(90, godownId);
  
  const res = {
    lowStock,
    nearExpiry,
    expired,
    deadStock
  };
  return CacheManager.put(c, c.json(res), 60);
});

// Queries
app.get("/api/inventory/current-stock", authMiddleware, requirePermission('inventory.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare(`
    SELECT s.*, i.name as item_name, i.sku as item_sku, g.name as godown_name, b.batch_number, b.expiry_date
    FROM inventory_balance_summary s
    JOIN items i ON s.item_id = i.id
    JOIN godowns g ON s.godown_id = g.id
    LEFT JOIN stock_batches b ON s.batch_id = b.id
    WHERE s.quantity_on_hand > 0
  `).all();
  return CacheManager.put(c, c.json(results), 60);
});

app.get("/api/inventory/batches", authMiddleware, requirePermission('inventory.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const itemId = c.req.query('itemId');
  const godownId = c.req.query('godownId');
  let query = "SELECT * FROM stock_batches WHERE current_quantity > 0";
  const params: any[] = [];
  if (itemId) { query += " AND item_id = ?"; params.push(itemId); }
  if (godownId) { query += " AND godown_id = ?"; params.push(godownId); }
  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return CacheManager.put(c, c.json(results), 60);
});

app.get("/api/inventory/expiry-alerts", authMiddleware, requirePermission('inventory.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const days = parseInt(c.req.query('days') || "30");
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + days);
  const { results } = await c.env.DB.prepare(`
    SELECT b.*, i.name as item_name, g.name as godown_name
    FROM stock_batches b
    JOIN items i ON b.item_id = i.id
    JOIN godowns g ON b.godown_id = g.id
    WHERE b.expiry_date IS NOT NULL AND b.expiry_date <= ? AND b.current_quantity > 0
    ORDER BY b.expiry_date ASC
  `).bind(targetDate.toISOString()).all();
  return CacheManager.put(c, c.json(results), 60);
});

app.get("/api/inventory/movements", authMiddleware, requirePermission('inventory.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare(`
    SELECT m.*, i.name as item_name, g.name as godown_name
    FROM stock_movements m
    JOIN items i ON m.item_id = i.id
    LEFT JOIN godowns g ON m.godown_id = g.id
    ORDER BY m.created_at DESC
  `).all();
  return CacheManager.put(c, c.json(results), 60);
});

// --- Phase 4: Barcode & QR Scanning ---
app.get("/api/items/lookup-by-code", authMiddleware, rateLimiter, async (c) => {
  const cached = await CacheManager.get(c, 300);
  if (cached) return cached;
  const code = c.req.query('code');
  if (!code) return c.json({ message: "Code is required" }, 400);
  const service = new BarcodeService(c.env.DB);
  const item = await service.lookupItemByCode(code);
  const res = item || { message: "Item not found" };
  return CacheManager.put(c, c.json(res, item ? 200 : 404), 300);
});

app.get("/api/batches/lookup-by-code", authMiddleware, rateLimiter, async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ message: "Code is required" }, 400);
  const service = new BarcodeService(c.env.DB);
  const batch = await service.lookupBatchByCode(code);
  return c.json(batch || { message: "Batch not found" }, batch ? 200 : 404);
});

app.post("/api/items/:id/barcodes", authMiddleware, requirePermission('barcodes.manage'), async (c) => {
  const itemId = c.req.param('id');
  const { barcode, type } = await c.req.json();
  const service = new BarcodeService(c.env.DB);
  const result = await service.addItemBarcode(itemId, barcode, type);
  await CacheManager.invalidate(c);
  return c.json(result);
});

app.get("/api/items/:id/barcodes", authMiddleware, requirePermission('master.items.view'), async (c) => {
  const itemId = c.req.param('id');
  const service = new BarcodeService(c.env.DB);
  const results = await service.getItemBarcodes(itemId);
  return c.json(results);
});

app.delete("/api/items/barcodes/:barcodeId", authMiddleware, requirePermission('barcodes.manage'), async (c) => {
  const barcodeId = c.req.param('barcodeId');
  const service = new BarcodeService(c.env.DB);
  await service.deleteBarcode(barcodeId);
  await CacheManager.invalidate(c);
  return c.json({ message: "Barcode deleted" });
});

// --- Phase 4: Finance & Margin Tracking ---
app.get("/api/finance/summary", authMiddleware, requirePermission('finance.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const from = c.req.query('from');
  const to = c.req.query('to');
  const outletId = c.req.query('outletId');
  const service = new FinanceService(c.env.DB);
  const summary = await service.getFinanceSummary({ from, to, outletId });
  return CacheManager.put(c, c.json(summary), 60);
});

app.get("/api/finance/margin/by-outlet", authMiddleware, requirePermission('finance.view'), async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const from = c.req.query('from');
  const to = c.req.query('to');
  const service = new FinanceService(c.env.DB);
  const report = await service.getOutletMarginReport(from, to);
  return CacheManager.put(c, c.json(report), 120);
});

app.get("/api/finance/sales-trend", authMiddleware, requirePermission('finance.view'), async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const from = c.req.query('from');
  const to = c.req.query('to');
  const service = new FinanceService(c.env.DB);
  const trend = await service.getSalesTrend(from, to);
  return CacheManager.put(c, c.json(trend), 120);
});

// Sales Management (Minimal)
app.post("/api/sales", authMiddleware, requirePermission('sales.create'), async (c) => {
  const body = await c.req.json();
  const idService = new IdService(c.env.DB);
  const id = await idService.generateId('sal');
  const user = c.get('user') as any;
  const now = new Date().toISOString();

  const statements: any[] = [];
  statements.push(c.env.DB.prepare(`
    INSERT INTO sales_documents (id, outlet_id, sale_date, reference_number, total_sales_value, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, body.outlet_id, body.sale_date, body.reference_number, body.total_sales_value, user.id, now));

  for (const item of body.items) {
    statements.push(c.env.DB.prepare(`
      INSERT INTO sales_document_items (id, sales_document_id, item_id, quantity, sales_price, net_sales_value, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(await idService.generateId('sal_item'), id, item.item_id, item.quantity, item.sales_price, item.net_sales_value, now));
  }

  await c.env.DB.batch(statements);
  await CacheManager.invalidate(c);
  return c.json({ id });
});

app.get("/api/sales", authMiddleware, requirePermission('sales.view'), async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM sales_documents ORDER BY sale_date DESC").all();
  return c.json(results);
});

// --- Phase 4: Smart Alerts ---
app.get("/api/smart-alerts", authMiddleware, requirePermission('alerts.view'), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const user = c.get('user') as any;
  const service = new SmartAlertsService(c.env.DB);
  const alerts = await service.getAllAlerts(user.id);
  return CacheManager.put(c, c.json(alerts), 60);
});

app.post("/api/smart-alerts/:id/acknowledge", authMiddleware, requirePermission('alerts.view'), async (c) => {
  const alertId = c.req.param('id');
  const user = c.get('user') as any;
  const service = new SmartAlertsService(c.env.DB);
  await service.acknowledgeAlert(alertId, user.id);
  await CacheManager.invalidate(c);
  return c.json({ success: true });
});

app.get("/api/smart-alerts/low-stock-forecast", authMiddleware, requirePermission('alerts.view'), async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const service = new SmartAlertsService(c.env.DB);
  const alerts = await service.getLowStockForecast();
  return CacheManager.put(c, c.json(alerts), 120);
});

app.get("/api/smart-alerts/expiry-risk", authMiddleware, requirePermission('alerts.view'), async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const service = new SmartAlertsService(c.env.DB);
  const alerts = await service.getExpiryRisk();
  return CacheManager.put(c, c.json(alerts), 120);
});

app.get("/api/smart-alerts/unusual-issues", authMiddleware, requirePermission('alerts.view'), async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const service = new SmartAlertsService(c.env.DB);
  const alerts = await service.getUnusualIssueVolume();
  return CacheManager.put(c, c.json(alerts), 120);
});

app.get("/api/smart-alerts/wastage-anomalies", authMiddleware, requirePermission('alerts.view'), async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const service = new SmartAlertsService(c.env.DB);
  const alerts = await service.getWastageAnomalies();
  return CacheManager.put(c, c.json(alerts), 120);
});

export default app;
