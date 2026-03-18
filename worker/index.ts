/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { z } from 'zod';

const grnSchema = z.object({
  grn_number: z.string().min(1).max(50),
  supplier_id: z.string().uuid(),
  received_date: z.string().datetime(),
  godown_id: z.string().uuid(),
  remarks: z.string().optional(),
  items: z.array(z.object({
    item_id: z.string().uuid(),
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
import { UserService } from './services/user';
import { SettingsService } from './services/settings';
import { ReferenceType } from '../src/types';
import { CacheManager } from './cache';
import { hashPassword, verifyPassword } from './utils/auth';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  KV: KVNamespace;
  JWT_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

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
  const ip = c.req.header('CF-Connecting-IP') || 'anonymous';
  const path = c.req.path;
  const key = `ratelimit:${ip}:${path}`;
  
  const current = await c.env.KV.get(key);
  const count = current ? parseInt(current) : 0;
  
  if (count >= 100) { // 100 requests per window
    return c.json({ message: "Too many requests" }, 429);
  }
  
  await c.env.KV.put(key, (count + 1).toString(), { expirationTtl: 60 }); // 1 minute window
  await next();
};

app.use('*', cors());

// --- Auth Middleware ---
const authMiddleware = (c: any, next: any) => {
  const secret = c.env.JWT_SECRET || "omnistock-secret-key-2026";
  return jwt({ secret, alg: 'HS256' })(c, next);
};

// --- RBAC Helper ---
const checkRole = (roles: string[]) => async (c: any, next: any) => {
  const payload = c.get('jwtPayload') as any;
  if (!payload || !roles.includes(payload.role)) {
    return c.json({ message: "Forbidden: Insufficient permissions" }, 403);
  }
  await next();
};

// --- API Routes ---

// Auth
app.post("/api/auth/login", rateLimiter, async (c) => {
  const { username, password } = await c.req.json();
  const secret = c.env.JWT_SECRET || "omnistock-secret-key-2026";
  const userService = new UserService(c.env.DB);
  
  const users = await userService.getUsers({ search: username, is_active: 1 });
  const user = users.find(u => u.username === username);

  if (!user) {
    return c.json({ message: "Invalid credentials" }, 401);
  }

  // Get user with password hash
  const dbUser = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{password_hash: string}>();
  if (!dbUser || !(await verifyPassword(password, dbUser.password_hash))) {
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
  
  return c.json({ 
    token, 
    user: { 
      id: user.id, 
      username: user.username, 
      role: user.role_name,
      fullName: user.full_name
    } 
  });
});

// Settings Public
app.get("/api/settings/public", async (c) => {
  const settingsService = new SettingsService(c.env.DB);
  const settings = await settingsService.getPublicSettings();
  return c.json(settings);
});

// Users & Settings (Protected)
app.get("/api/users", authMiddleware, checkRole(['super_admin', 'admin']), async (c) => {
  const role_id = c.req.query('role_id') ? parseInt(c.req.query('role_id')!) : undefined;
  const is_active = c.req.query('is_active') ? parseInt(c.req.query('is_active')!) : undefined;
  const search = c.req.query('search');
  
  const userService = new UserService(c.env.DB);
  const users = await userService.getUsers({ role_id, is_active, search });
  return c.json(users);
});

app.get("/api/users/:id", authMiddleware, checkRole(['super_admin', 'admin']), async (c) => {
  const userService = new UserService(c.env.DB);
  const user = await userService.getUserById(c.req.param('id'));
  if (!user) return c.json({ message: "User not found" }, 404);
  return c.json(user);
});

app.post("/api/users", authMiddleware, checkRole(['super_admin', 'admin']), async (c) => {
  const data = await c.req.json();
  const userService = new UserService(c.env.DB);
  
  const passwordHash = await hashPassword(data.password || "omnistock123");
  const id = await userService.createUser({ ...data, password_hash: passwordHash });
  
  return c.json({ id, message: "User created successfully" }, 201);
});

app.put("/api/users/:id", authMiddleware, checkRole(['super_admin', 'admin']), async (c) => {
  const data = await c.req.json();
  const userService = new UserService(c.env.DB);
  
  if (data.password) {
    data.password_hash = await hashPassword(data.password);
    delete data.password;
  }
  
  await userService.updateUser(c.req.param('id'), data);
  return c.json({ message: "User updated successfully" });
});

app.post("/api/users/:id/deactivate", authMiddleware, checkRole(['super_admin', 'admin']), async (c) => {
  const userService = new UserService(c.env.DB);
  await userService.deactivateUser(c.req.param('id'));
  return c.json({ message: "User deactivated" });
});

app.post("/api/users/:id/reactivate", authMiddleware, checkRole(['super_admin', 'admin']), async (c) => {
  const userService = new UserService(c.env.DB);
  await userService.reactivateUser(c.req.param('id'));
  return c.json({ message: "User reactivated" });
});

app.post("/api/users/:id/reset-password", authMiddleware, checkRole(['super_admin', 'admin']), async (c) => {
  const { password } = await c.req.json();
  const userService = new UserService(c.env.DB);
  const passwordHash = await hashPassword(password);
  await userService.resetPassword(c.req.param('id'), passwordHash);
  return c.json({ message: "Password reset successfully" });
});

app.get("/api/roles", authMiddleware, checkRole(['super_admin', 'admin']), async (c) => {
  const userService = new UserService(c.env.DB);
  const roles = await userService.getRoles();
  return c.json(roles);
});

app.get("/api/settings", authMiddleware, checkRole(['super_admin', 'admin']), async (c) => {
  const settingsService = new SettingsService(c.env.DB);
  const settings = await settingsService.getSettings();
  return c.json(settings);
});

app.put("/api/settings", authMiddleware, checkRole(['super_admin', 'admin']), async (c) => {
  const data = await c.req.json();
  const settingsService = new SettingsService(c.env.DB);
  await settingsService.updateSettings(data);
  CacheManager.invalidate(c); // Invalidate cache on settings update
  return c.json({ message: "Settings updated successfully" });
});

// Master Data
app.get("/api/items", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 600);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM items").all();
  return CacheManager.put(c, c.json(results), 600);
});

app.get("/api/suppliers", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 600);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM suppliers").all();
  return CacheManager.put(c, c.json(results), 600);
});

app.get("/api/godowns", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 600);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM godowns").all();
  return CacheManager.put(c, c.json(results), 600);
});

app.get("/api/outlets", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 600);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM outlets").all();
  return CacheManager.put(c, c.json(results), 600);
});

app.get("/api/categories", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 600);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM categories").all();
  return CacheManager.put(c, c.json(results), 600);
});

app.get("/api/units", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 600);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM units").all();
  return CacheManager.put(c, c.json(results), 600);
});

// GRN
app.get("/api/grn", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM goods_receipts ORDER BY created_at DESC").all();
  return CacheManager.put(c, c.json(results), 60);
});

app.post("/api/grn", authMiddleware, checkRole(['super_admin', 'warehouse_manager', 'warehouse_staff']), async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = grnSchema.parse(body);
    
    const id = crypto.randomUUID();
    const user = c.get('jwtPayload') as any;
    const inventoryService = new InventoryService(c.env.DB);
    
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
        crypto.randomUUID(), id, item.item_id, item.entered_quantity, item.entered_unit_id, baseQty,
        item.batch_number, item.manufacture_date, item.expiry_date, item.unit_cost, item.total_line_cost
      ));
    }

    await c.env.DB.batch(statements);
    await CacheManager.invalidate(c);
    return c.json({ id, message: "GRN created successfully" }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation failed", details: error.issues }, 400);
    }
    return c.json({ message: error instanceof Error ? error.message : "Failed to create GRN" }, 400);
  }
});

app.get("/api/grn/:id", authMiddleware, async (c) => {
  const id = c.req.param('id');
  const grn = await c.env.DB.prepare("SELECT * FROM goods_receipts WHERE id = ?").bind(id).first();
  const { results: items } = await c.env.DB.prepare("SELECT * FROM goods_receipt_items WHERE goods_receipt_id = ?").bind(id).all();
  return c.json({ ...grn, items });
});

app.post("/api/grn/:id/post", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const id = c.req.param('id');
  const user = c.get('jwtPayload') as any;
  const inventoryService = new InventoryService(c.env.DB);
  try {
    await inventoryService.postGRN(id, user.id);
    await CacheManager.invalidate(c);
    return c.json({ message: "GRN posted successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

app.post("/api/grn/:id/cancel", authMiddleware, checkRole(['super_admin']), async (c) => {
  const id = c.req.param('id');
  const user = c.get('jwtPayload') as any;
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
app.get("/api/issues", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM stock_issues ORDER BY created_at DESC").all();
  return CacheManager.put(c, c.json(results), 60);
});

app.post("/api/issues", authMiddleware, checkRole(['super_admin', 'warehouse_manager', 'warehouse_staff']), async (c) => {
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const user = c.get('jwtPayload') as any;
  const inventoryService = new InventoryService(c.env.DB);
  
  const statements: any[] = [];
  statements.push(c.env.DB.prepare(`
    INSERT INTO stock_issues (id, issue_number, source_godown_id, outlet_id, issue_date, remarks, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
  `).bind(id, body.issue_number, body.source_godown_id, body.outlet_id, body.issue_date, body.remarks, user.id));

  if (body.items && body.items.length > 0) {
    for (const item of body.items) {
      const itemId = crypto.randomUUID();
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
          `).bind(crypto.randomUUID(), itemId, alloc.batch_id, alloc.allocated_quantity, alloc.allocated_base_quantity));
        }
      }
    }
  }

  try {
    await c.env.DB.batch(statements);
    await CacheManager.invalidate(c);
    return c.json({ id, message: "Stock Issue created successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

app.get("/api/issues/:id", authMiddleware, async (c) => {
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

app.post("/api/issues/:id/post", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const id = c.req.param('id');
  const user = c.get('jwtPayload') as any;
  const inventoryService = new InventoryService(c.env.DB);
  try {
    await inventoryService.postIssue(id, user.id);
    await CacheManager.invalidate(c);
    return c.json({ message: "Stock Issue posted successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

app.get("/api/inventory/fefo-suggestions", authMiddleware, async (c) => {
  const itemId = c.req.query('itemId');
  const godownId = c.req.query('godownId');
  const quantity = parseFloat(c.req.query('quantity') || "0");
  if (!itemId || !godownId) return c.json({ message: "Missing params" }, 400);
  const inventoryService = new InventoryService(c.env.DB);
  const suggestions = await inventoryService.getFEFOSuggestions(itemId, godownId, quantity);
  return c.json(suggestions);
});

// Transfers
app.get("/api/transfers", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM transfers ORDER BY created_at DESC").all();
  return CacheManager.put(c, c.json(results), 60);
});

app.post("/api/transfers", authMiddleware, checkRole(['super_admin', 'warehouse_manager', 'warehouse_staff']), async (c) => {
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const user = c.get('jwtPayload') as any;
  const inventoryService = new InventoryService(c.env.DB);
  
  const statements: any[] = [];
  statements.push(c.env.DB.prepare(`
    INSERT INTO transfers (id, transfer_number, source_godown_id, destination_godown_id, transfer_date, remarks, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
  `).bind(id, body.transfer_number, body.source_godown_id, body.destination_godown_id, body.transfer_date, body.remarks, user.id));

  if (body.items && body.items.length > 0) {
    for (const item of body.items) {
      const itemId = crypto.randomUUID();
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
          `).bind(crypto.randomUUID(), itemId, alloc.batch_id, alloc.allocated_quantity, alloc.allocated_base_quantity));
        }
      }
    }
  }

  try {
    await c.env.DB.batch(statements);
    await CacheManager.invalidate(c);
    return c.json({ id, message: "Transfer created successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

app.post("/api/transfers/:id/dispatch", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const id = c.req.param('id');
  const user = c.get('jwtPayload') as any;
  const inventoryService = new InventoryService(c.env.DB);
  try {
    await inventoryService.dispatchTransfer(id, user.id);
    await CacheManager.invalidate(c);
    return c.json({ message: "Transfer dispatched successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

app.post("/api/transfers/:id/receive", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const id = c.req.param('id');
  const user = c.get('jwtPayload') as any;
  const inventoryService = new InventoryService(c.env.DB);
  try {
    await inventoryService.receiveTransfer(id, user.id);
    await CacheManager.invalidate(c);
    return c.json({ message: "Transfer received successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

// Adjustments
app.get("/api/adjustments", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM stock_adjustments ORDER BY created_at DESC").all();
  return CacheManager.put(c, c.json(results), 60);
});

app.post("/api/adjustments", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const user = c.get('jwtPayload') as any;
  const inventoryService = new InventoryService(c.env.DB);
  
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
        crypto.randomUUID(), id, item.item_id, item.batch_id, item.direction, item.entered_quantity,
        item.entered_unit_id, baseQty, item.unit_cost, item.total_cost, item.remarks
      ));
    }
  }

  try {
    await c.env.DB.batch(statements);
    await CacheManager.invalidate(c);
    return c.json({ id, message: "Adjustment created successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

app.post("/api/adjustments/:id/post", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const id = c.req.param('id');
  const user = c.get('jwtPayload') as any;
  const inventoryService = new InventoryService(c.env.DB);
  try {
    await inventoryService.postAdjustment(id, user.id);
    await CacheManager.invalidate(c);
    return c.json({ message: "Adjustment posted successfully" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

// Dashboard Analytics
app.get("/api/dashboard/summary", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 30);
  if (cached) return cached;
  const godownId = c.req.query('godownId');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const reportingService = new ReportingService(c.env.DB);
  const summary = await reportingService.getDashboardSummary({ godownId, from, to });
  return CacheManager.put(c, c.json(summary), 30);
});

app.get("/api/dashboard/stock-by-godown", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const reportingService = new ReportingService(c.env.DB);
  const data = await reportingService.getStockByGodown();
  return CacheManager.put(c, c.json(data), 60);
});

app.get("/api/dashboard/stock-by-category", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const reportingService = new ReportingService(c.env.DB);
  const data = await reportingService.getStockByCategory();
  return CacheManager.put(c, c.json(data), 60);
});

app.get("/api/dashboard/fast-moving", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const limit = parseInt(c.req.query('limit') || "10");
  const offset = parseInt(c.req.query('offset') || "0");
  const reportingService = new ReportingService(c.env.DB);
  const data = await reportingService.getFastMoving(limit, offset);
  return CacheManager.put(c, c.json(data), 60);
});

// Reports
app.get("/api/reports/current-stock", authMiddleware, async (c) => {
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

app.get("/api/reports/movements", authMiddleware, async (c) => {
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

app.get("/api/reports/valuation", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const groupBy = (c.req.query('groupBy') || 'item') as any;
  const limit = parseInt(c.req.query('limit') || "50");
  const offset = parseInt(c.req.query('offset') || "0");
  const reportingService = new ReportingService(c.env.DB);
  const data = await reportingService.getValuationReport(groupBy, limit, offset);
  return CacheManager.put(c, c.json(data), 120);
});

app.get("/api/reports/dead-stock", authMiddleware, async (c) => {
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
app.get("/api/stock-counts", authMiddleware, async (c) => {
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

app.post("/api/stock-counts", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const { godown_id, remarks } = await c.req.json();
  const user = c.get('jwtPayload') as any;
  const service = new StockCountService(c.env.DB);
  const result = await service.createSession(godown_id, user.id, remarks);
  await CacheManager.invalidate(c);
  return c.json(result);
});

app.get("/api/stock-counts/:id", authMiddleware, async (c) => {
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

app.post("/api/stock-counts/:id/load-system-stock", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const id = c.req.param('id');
  const service = new StockCountService(c.env.DB);
  await service.loadSystemStock(id);
  await CacheManager.invalidate(c);
  return c.json({ message: "System stock loaded" });
});

app.put("/api/stock-counts/items/:itemId", authMiddleware, checkRole(['super_admin', 'warehouse_manager', 'warehouse_staff']), async (c) => {
  const itemId = c.req.param('itemId');
  const { counted_quantity, entered_unit_id, remarks } = await c.req.json();
  const service = new StockCountService(c.env.DB);
  await service.updateItemCount(itemId, counted_quantity, entered_unit_id, remarks);
  await CacheManager.invalidate(c);
  return c.json({ message: "Item count updated" });
});

app.post("/api/stock-counts/:id/submit", authMiddleware, async (c) => {
  const id = c.req.param('id');
  const user = c.get('jwtPayload') as any;
  const service = new StockCountService(c.env.DB);
  await service.submitSession(id, user.id);
  await CacheManager.invalidate(c);
  return c.json({ message: "Session submitted" });
});

app.post("/api/stock-counts/:id/approve", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const id = c.req.param('id');
  const user = c.get('jwtPayload') as any;
  const service = new StockCountService(c.env.DB);
  await service.approveSession(id, user.id);
  await CacheManager.invalidate(c);
  return c.json({ message: "Session approved" });
});

app.post("/api/stock-counts/:id/post", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const id = c.req.param('id');
  const user = c.get('jwtPayload') as any;
  const service = new StockCountService(c.env.DB);
  try {
    await service.postSession(id, user.id);
    await CacheManager.invalidate(c);
    return c.json({ message: "Session posted and stock reconciled" });
  } catch (e: any) {
    return c.json({ message: e.message }, 400);
  }
});

// Wastage
app.get("/api/wastage", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare(`
    SELECT w.*, g.name as godown_name FROM wastage_records w
    JOIN godowns g ON w.godown_id = g.id
    ORDER BY w.created_at DESC
  `).all();
  return CacheManager.put(c, c.json(results), 60);
});

app.get("/api/wastage/analytics", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const godownId = c.req.query('godown_id');
  const wastageService = new WastageService(c.env.DB);
  const analytics = await wastageService.getWastageAnalytics(godownId);
  return CacheManager.put(c, c.json(analytics), 60);
});

app.post("/api/wastage", authMiddleware, checkRole(['super_admin', 'warehouse_manager', 'warehouse_staff']), async (c) => {
  const body = await c.req.json();
  const user = c.get('jwtPayload') as any;
  const service = new WastageService(c.env.DB);
  const result = await service.createWastage(body, user.id);
  await CacheManager.invalidate(c);
  return c.json(result);
});

app.get("/api/wastage/:id", authMiddleware, async (c) => {
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

app.post("/api/wastage/:id/post", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const id = c.req.param('id');
  const user = c.get('jwtPayload') as any;
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
app.get("/api/expiry/risk", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const godownId = c.req.query('godown_id');
  const expiryRiskService = new ExpiryRiskService(c.env.DB);
  const summary = await expiryRiskService.getExpiryRiskSummary(godownId);
  return CacheManager.put(c, c.json(summary), 60);
});

app.get("/api/expiry/recommendations", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const godownId = c.req.query('godown_id');
  const expiryRiskService = new ExpiryRiskService(c.env.DB);
  const recommendations = await expiryRiskService.getPreventionRecommendations(godownId);
  return CacheManager.put(c, c.json(recommendations), 60);
});

// Discrepancies
app.get("/api/discrepancies/summary", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const godownId = c.req.query('godown_id');
  const discrepancyService = new DiscrepancyService(c.env.DB);
  const summary = await discrepancyService.getDiscrepancySummary(godownId);
  return CacheManager.put(c, c.json(summary), 60);
});

app.get("/api/discrepancies/trends", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const discrepancyService = new DiscrepancyService(c.env.DB);
  const trends = await discrepancyService.getShrinkageTrends();
  return CacheManager.put(c, c.json(trends), 120);
});

// Stock Requests
app.get("/api/requests", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare("SELECT * FROM stock_requests ORDER BY created_at DESC").all();
  return CacheManager.put(c, c.json(results), 60);
});

app.get("/api/requests/:id", authMiddleware, async (c) => {
  const id = c.req.param('id');
  const request = await c.env.DB.prepare("SELECT * FROM stock_requests WHERE id = ?").bind(id).first();
  const { results: items } = await c.env.DB.prepare("SELECT * FROM stock_request_items WHERE stock_request_id = ?").bind(id).all();
  return c.json({ ...request, items });
});

app.post("/api/requests", authMiddleware, async (c) => {
  const body = await c.req.json();
  const payload = c.get('jwtPayload') as any;
  const requestService = new StockRequestService(c.env.DB);
  const result = await requestService.createRequest(body, payload.id);
  await CacheManager.invalidate(c);
  return c.json(result);
});

app.post("/api/requests/:id/submit", authMiddleware, async (c) => {
  const id = c.req.param('id');
  const requestService = new StockRequestService(c.env.DB);
  await requestService.submitRequest(id);
  await CacheManager.invalidate(c);
  return c.json({ success: true });
});

app.post("/api/requests/:id/approve", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const payload = c.get('jwtPayload') as any;
  const requestService = new StockRequestService(c.env.DB);
  await requestService.approveRequest(id, payload.id, body.items);
  await CacheManager.invalidate(c);
  return c.json({ success: true });
});

// KPIs
app.get("/api/kpi/summary", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 30);
  if (cached) return cached;
  const godownId = c.req.query('godown_id');
  const kpiService = new KPIService(c.env.DB);
  const summary = await kpiService.getWarehouseSummary(godownId);
  
  // Store in KV for cross-region access
  await c.env.KV.put(`kpi_summary_${godownId || 'all'}`, JSON.stringify(summary), { expirationTtl: 60 });
  
  return CacheManager.put(c, c.json(summary), 30);
});

app.get("/api/kpi/turnover", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const kpiService = new KPIService(c.env.DB);
  const result = await kpiService.getStockTurnover();
  return CacheManager.put(c, c.json(result), 120);
});

// Attachments
app.get("/api/attachments/:type/:id", authMiddleware, async (c) => {
  const type = c.req.param('type');
  const id = c.req.param('id');
  const attachmentService = new AttachmentService(c.env.DB, c.env.BUCKET);
  const attachments = await attachmentService.getAttachments(type, id);
  return c.json(attachments);
});

app.post("/api/attachments/upload", authMiddleware, rateLimiter, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;
  const entityType = formData.get('entityType') as string;
  const entityId = formData.get('entityId') as string;
  const payload = c.get('jwtPayload') as any;

  const attachmentService = new AttachmentService(c.env.DB, c.env.BUCKET);
  const result = await attachmentService.uploadAttachment(payload.id, entityType, entityId, file);
  return c.json(result);
});

app.get("/api/attachments/download/*", async (c) => {
  const key = c.req.path.replace('/api/attachments/download/', '');
  const attachmentService = new AttachmentService(c.env.DB, c.env.BUCKET);
  const file = await attachmentService.getFile(key);
  if (!file) return c.json({ message: "File not found" }, 404);
  return new Response(file.body, { headers: file.headers });
});

// Notifications
app.get("/api/notifications", authMiddleware, async (c) => {
  const payload = c.get('jwtPayload') as any;
  const notificationService = new NotificationService(c.env.DB);
  const notifications = await notificationService.getUnreadNotifications(payload.id);
  return c.json(notifications);
});

app.post("/api/notifications/:id/read", authMiddleware, async (c) => {
  const id = c.req.param('id');
  const payload = c.get('jwtPayload') as any;
  const notificationService = new NotificationService(c.env.DB);
  await notificationService.markAsRead(id, payload.id);
  return c.json({ success: true });
});

app.post("/api/notifications/read-all", authMiddleware, async (c) => {
  const payload = c.get('jwtPayload') as any;
  const notificationService = new NotificationService(c.env.DB);
  await notificationService.markAllAsRead(payload.id);
  return c.json({ success: true });
});

// Alerts
app.get("/api/alerts/summary", authMiddleware, async (c) => {
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
app.get("/api/inventory/current-stock", authMiddleware, async (c) => {
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

app.get("/api/inventory/batches", authMiddleware, async (c) => {
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

app.get("/api/inventory/expiry-alerts", authMiddleware, async (c) => {
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

app.get("/api/inventory/movements", authMiddleware, async (c) => {
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

app.post("/api/items/:id/barcodes", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const itemId = c.req.param('id');
  const { barcode, type } = await c.req.json();
  const service = new BarcodeService(c.env.DB);
  const result = await service.addItemBarcode(itemId, barcode, type);
  await CacheManager.invalidate(c);
  return c.json(result);
});

app.get("/api/items/:id/barcodes", authMiddleware, async (c) => {
  const itemId = c.req.param('id');
  const service = new BarcodeService(c.env.DB);
  const results = await service.getItemBarcodes(itemId);
  return c.json(results);
});

app.delete("/api/items/barcodes/:barcodeId", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const barcodeId = c.req.param('barcodeId');
  const service = new BarcodeService(c.env.DB);
  await service.deleteBarcode(barcodeId);
  await CacheManager.invalidate(c);
  return c.json({ message: "Barcode deleted" });
});

// --- Phase 4: Finance & Margin Tracking ---
app.get("/api/finance/summary", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const from = c.req.query('from');
  const to = c.req.query('to');
  const outletId = c.req.query('outletId');
  const service = new FinanceService(c.env.DB);
  const summary = await service.getFinanceSummary({ from, to, outletId });
  return CacheManager.put(c, c.json(summary), 60);
});

app.get("/api/finance/margin/by-outlet", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const from = c.req.query('from');
  const to = c.req.query('to');
  const service = new FinanceService(c.env.DB);
  const report = await service.getOutletMarginReport(from, to);
  return CacheManager.put(c, c.json(report), 120);
});

app.get("/api/finance/sales-trend", authMiddleware, checkRole(['super_admin', 'warehouse_manager']), async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const from = c.req.query('from');
  const to = c.req.query('to');
  const service = new FinanceService(c.env.DB);
  const trend = await service.getSalesTrend(from, to);
  return CacheManager.put(c, c.json(trend), 120);
});

// Sales Management (Minimal)
app.post("/api/sales", authMiddleware, async (c) => {
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const user = c.get('jwtPayload') as any;
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
    `).bind(crypto.randomUUID(), id, item.item_id, item.quantity, item.sales_price, item.net_sales_value, now));
  }

  await c.env.DB.batch(statements);
  await CacheManager.invalidate(c);
  return c.json({ id });
});

app.get("/api/sales", authMiddleware, async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM sales_documents ORDER BY sale_date DESC").all();
  return c.json(results);
});

// --- Phase 4: Smart Alerts ---
app.get("/api/smart-alerts", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 60);
  if (cached) return cached;
  const user = c.get('jwtPayload') as any;
  const service = new SmartAlertsService(c.env.DB);
  const alerts = await service.getAllAlerts(user.id);
  return CacheManager.put(c, c.json(alerts), 60);
});

app.post("/api/smart-alerts/:id/acknowledge", authMiddleware, async (c) => {
  const alertId = c.req.param('id');
  const user = c.get('jwtPayload') as any;
  const service = new SmartAlertsService(c.env.DB);
  await service.acknowledgeAlert(alertId, user.id);
  await CacheManager.invalidate(c);
  return c.json({ success: true });
});

app.get("/api/smart-alerts/low-stock-forecast", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const service = new SmartAlertsService(c.env.DB);
  const alerts = await service.getLowStockForecast();
  return CacheManager.put(c, c.json(alerts), 120);
});

app.get("/api/smart-alerts/expiry-risk", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const service = new SmartAlertsService(c.env.DB);
  const alerts = await service.getExpiryRisk();
  return CacheManager.put(c, c.json(alerts), 120);
});

app.get("/api/smart-alerts/unusual-issues", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const service = new SmartAlertsService(c.env.DB);
  const alerts = await service.getUnusualIssueVolume();
  return CacheManager.put(c, c.json(alerts), 120);
});

app.get("/api/smart-alerts/wastage-anomalies", authMiddleware, async (c) => {
  const cached = await CacheManager.get(c, 120);
  if (cached) return cached;
  const service = new SmartAlertsService(c.env.DB);
  const alerts = await service.getWastageAnomalies();
  return CacheManager.put(c, c.json(alerts), 120);
});

export default app;
