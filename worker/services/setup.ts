/// <reference types="@cloudflare/workers-types" />

import { IdService } from './id';

export class SetupService {
  private idService: IdService;
  constructor(private db: D1Database) {
    this.idService = new IdService(db);
  }

  async isInitialized(): Promise<boolean> {
    try {
      const result = await this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").first();
      return !!result;
    } catch (e) {
      return false;
    }
  }

  async getBootstrapStatus(): Promise<{ is_initialized: boolean }> {
    try {
      const result = await this.db.prepare("SELECT is_initialized FROM system_bootstrap WHERE id = 'main'").first<{ is_initialized: number }>();
      return { is_initialized: result?.is_initialized === 1 };
    } catch (e) {
      // If table doesn't exist, it's not initialized
      return { is_initialized: false };
    }
  }

  async initializeSystem(data: any): Promise<{ success: boolean; message: string }> {
    try {
      // 1. Check if already initialized
      const status = await this.getBootstrapStatus();
      if (status.is_initialized) {
        return { success: false, message: "System is already initialized" };
      }

      // 2. Run initialization (schema & base data)
      const initResult = await this.initialize();
      if (!initResult.success) return initResult;

      // 3. Clear default admin if it exists (we will create a new one from data)
      await this.db.prepare("DELETE FROM users WHERE username = 'admin'").run();

      // 4. Create Super Admin
      const adminId = await this.idService.generateId('usr');
      const adminPasswordHash = await this.hashPassword(data.admin.password);
      await this.db.prepare(`
        INSERT INTO users (id, username, email, password_hash, full_name, phone, role_id, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 'role_super_admin', 1)
      `).bind(
        adminId,
        data.admin.username,
        data.admin.email,
        adminPasswordHash,
        data.admin.full_name,
        data.admin.phone || null
      ).run();

      // 5. Update Settings
      await this.db.prepare(`
        UPDATE settings SET
          company_name = ?,
          system_name = ?,
          default_currency = ?,
          currency_symbol = ?,
          currency_position = ?,
          decimal_places = ?,
          timezone = ?,
          date_format = ?,
          default_theme = ?,
          allow_negative_stock = ?,
          default_fefo_behavior = ?,
          expiry_warning_threshold_days = ?,
          low_stock_threshold_percent = ?,
          stock_count_approval_required = ?,
          wastage_approval_required = ?,
          user_theme_override_allowed = ?,
          dark_mode_enabled = ?,
          light_mode_enabled = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).bind(
        data.settings.company_name,
        data.settings.system_name,
        data.settings.default_currency,
        data.settings.currency_symbol,
        data.settings.currency_position,
        data.settings.decimal_places,
        data.settings.timezone,
        data.settings.date_format,
        data.settings.default_theme,
        data.settings.allow_negative_stock ? 1 : 0,
        data.settings.default_fefo_behavior ? 1 : 0,
        data.settings.expiry_warning_threshold_days,
        data.settings.low_stock_threshold_percent,
        data.settings.stock_count_approval_required ? 1 : 0,
        data.settings.wastage_approval_required ? 1 : 0,
        data.settings.user_theme_override_allowed ? 1 : 0,
        data.settings.dark_mode_enabled ? 1 : 0,
        data.settings.light_mode_enabled ? 1 : 0
      ).run();

      // 6. Create Godowns
      for (const godown of data.godowns) {
        const godownId = await this.idService.generateId('gdn');
        await this.db.prepare(`
          INSERT INTO godowns (id, code, name, address, is_active)
          VALUES (?, ?, ?, ?, ?)
        `).bind(godownId, godown.code, godown.name, godown.address || null, godown.is_active ? 1 : 0).run();
      }

      // 7. Create Outlets
      for (const outlet of data.outlets) {
        const outletId = await this.idService.generateId('olt');
        await this.db.prepare(`
          INSERT INTO outlets (id, code, name, address, is_active)
          VALUES (?, ?, ?, ?, ?)
        `).bind(outletId, outlet.code, outlet.name, outlet.address || null, outlet.is_active ? 1 : 0).run();
      }

      // 8. Create Optional Users
      if (data.additionalUsers && data.additionalUsers.length > 0) {
        for (const user of data.additionalUsers) {
          const userId = await this.idService.generateId('usr');
          const pHash = await this.hashPassword(user.password);
          await this.db.prepare(`
            INSERT INTO users (id, username, email, password_hash, full_name, role_id, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
          `).bind(userId, user.username, user.email, pHash, user.full_name, user.role_id).run();
        }
      }

      // 9. Mark as Initialized
      await this.db.prepare(`
        UPDATE system_bootstrap SET
          is_initialized = 1,
          initialized_at = CURRENT_TIMESTAMP,
          initialized_by = ?
        WHERE id = 'main'
      `).bind(adminId).run();

      return { success: true, message: "System initialized successfully" };
    } catch (e: any) {
      console.error("System initialization failed:", e);
      return { success: false, message: e.message };
    }
  }

  private async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async initialize(): Promise<{ success: boolean; message: string }> {
    try {
      // Core Schema (Simplified for bootstrap)
      const schema = [
        `CREATE TABLE IF NOT EXISTS roles (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS permissions (
            id TEXT PRIMARY KEY,
            key TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS role_permissions (
            role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (role_id, permission_id)
        )`,
        `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role_id TEXT REFERENCES roles(id),
            full_name TEXT,
            phone TEXT,
            is_active INTEGER DEFAULT 1,
            last_login DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS godowns (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            is_active INTEGER DEFAULT 1
        )`,
        `CREATE TABLE IF NOT EXISTS outlets (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            manager_id TEXT REFERENCES users(id),
            is_active INTEGER DEFAULT 1
        )`,
        `CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            parent_id INTEGER REFERENCES categories(id)
        )`,
        `CREATE TABLE IF NOT EXISTS units (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            sku TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            category_id INTEGER REFERENCES categories(id),
            base_unit_id INTEGER REFERENCES units(id),
            is_perishable INTEGER DEFAULT 0,
            track_batches INTEGER DEFAULT 0,
            track_expiry INTEGER DEFAULT 0,
            reorder_level REAL DEFAULT 0,
            min_stock REAL DEFAULT 0,
            max_stock REAL DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS unit_conversions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id TEXT REFERENCES items(id),
            from_unit_id INTEGER REFERENCES units(id),
            to_unit_id INTEGER REFERENCES units(id),
            multiplier REAL NOT NULL,
            UNIQUE(item_id, from_unit_id, to_unit_id)
        )`,
        `CREATE TABLE IF NOT EXISTS suppliers (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            contact_person TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            is_active INTEGER DEFAULT 1
        )`,
        `CREATE TABLE IF NOT EXISTS stock_batches (
            id TEXT PRIMARY KEY,
            item_id TEXT REFERENCES items(id),
            batch_number TEXT NOT NULL,
            expiry_date TEXT,
            manufacture_date TEXT,
            supplier_id TEXT REFERENCES suppliers(id),
            initial_cost REAL NOT NULL,
            current_cost REAL NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS stock_movements (
            id TEXT PRIMARY KEY,
            movement_type TEXT NOT NULL,
            item_id TEXT REFERENCES items(id),
            batch_id TEXT REFERENCES stock_batches(id),
            godown_id TEXT REFERENCES godowns(id),
            destination_id TEXT,
            quantity REAL NOT NULL,
            unit_id INTEGER REFERENCES units(id),
            unit_cost REAL,
            reference_id TEXT,
            created_by TEXT REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            system_name TEXT DEFAULT 'OmniStock',
            company_name TEXT DEFAULT 'OmniStock Group',
            default_currency TEXT DEFAULT 'MVR',
            currency_symbol TEXT DEFAULT 'MVR',
            currency_position TEXT DEFAULT 'before',
            decimal_places INTEGER DEFAULT 2,
            date_format TEXT DEFAULT 'YYYY-MM-DD',
            timezone TEXT DEFAULT 'Asia/Male',
            allow_negative_stock INTEGER DEFAULT 0,
            default_fefo_behavior INTEGER DEFAULT 1,
            expiry_warning_threshold_days INTEGER DEFAULT 30,
            low_stock_threshold_percent REAL DEFAULT 20.0,
            stock_count_approval_required INTEGER DEFAULT 1,
            wastage_approval_required INTEGER DEFAULT 1,
            dark_mode_enabled INTEGER DEFAULT 1,
            light_mode_enabled INTEGER DEFAULT 1,
            default_theme TEXT DEFAULT 'dark',
            user_theme_override_allowed INTEGER DEFAULT 1,
            notification_threshold_high REAL DEFAULT 80.0,
            enable_expiry_alerts INTEGER DEFAULT 1,
            enable_low_stock_alerts INTEGER DEFAULT 1,
            enable_wastage_alerts INTEGER DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS system_bootstrap (
            id TEXT PRIMARY KEY,
            is_initialized INTEGER NOT NULL DEFAULT 0,
            initialized_at DATETIME NULL,
            initialized_by TEXT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS user_onboarding (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            tutorial_completed INTEGER NOT NULL DEFAULT 0,
            tutorial_version TEXT NOT NULL DEFAULT 'v1',
            force_tutorial INTEGER NOT NULL DEFAULT 1,
            last_started_at DATETIME NULL,
            last_completed_at DATETIME NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS id_sequences (
            prefix TEXT PRIMARY KEY,
            current_value INTEGER NOT NULL DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      ];

      for (const sql of schema) {
        await this.db.prepare(sql).run();
      }

      // Seed Data
      await this.db.prepare(`INSERT OR IGNORE INTO settings (id) VALUES (1)`).run();
      
      await this.db.prepare(`INSERT OR IGNORE INTO id_sequences (prefix, current_value) VALUES
        ('inv', 0), ('olt', 0), ('gdn', 0), ('usr', 0), ('grn', 0),
        ('iss', 0), ('trf', 0), ('adj', 0), ('req', 0), ('cnt', 0), ('wst', 0),
        ('mov', 0), ('bat', 0), ('bal', 0), ('cat', 0), ('unt', 0), ('sup', 0),
        ('sal', 0), ('sal_item', 0), ('ib', 0), ('bb', 0), ('ack', 0), ('ntf', 0), ('att', 0)`).run();
      
      await this.db.prepare(`INSERT OR IGNORE INTO roles (id, name, description) VALUES
        ('role_super_admin', 'super_admin', 'Full system access'),
        ('role_admin', 'admin', 'Administrative and operational control'),
        ('role_warehouse_manager', 'warehouse_manager', 'Warehouse operations and approvals'),
        ('role_warehouse_staff', 'warehouse_staff', 'Daily warehouse operations')`).run();

      await this.db.prepare(`INSERT OR IGNORE INTO permissions (id, key, description) VALUES
        ('perm_001', 'inventory.view', 'View inventory'),
        ('perm_002', 'inventory.grn.create', 'Create goods receipt'),
        ('perm_003', 'inventory.grn.post', 'Post goods receipt'),
        ('perm_004', 'inventory.issue.create', 'Create stock issue'),
        ('perm_005', 'inventory.issue.post', 'Post stock issue'),
        ('perm_006', 'inventory.transfer.create', 'Create transfer'),
        ('perm_007', 'inventory.transfer.approve', 'Approve transfer'),
        ('perm_008', 'inventory.transfer.dispatch', 'Dispatch transfer'),
        ('perm_009', 'inventory.transfer.receive', 'Receive transfer'),
        ('perm_010', 'inventory.adjustment.create', 'Create stock adjustment'),
        ('perm_011', 'inventory.adjustment.post', 'Post stock adjustment'),
        ('perm_012', 'stockcount.view', 'View stock counts'),
        ('perm_013', 'stockcount.create', 'Create stock count'),
        ('perm_014', 'stockcount.submit', 'Submit stock count'),
        ('perm_015', 'stockcount.approve', 'Approve stock count'),
        ('perm_016', 'stockcount.post', 'Post stock count'),
        ('perm_017', 'wastage.view', 'View wastage'),
        ('perm_018', 'wastage.create', 'Create wastage'),
        ('perm_019', 'wastage.approve', 'Approve wastage'),
        ('perm_020', 'wastage.post', 'Post wastage'),
        ('perm_021', 'requests.view', 'View stock requests'),
        ('perm_022', 'requests.create', 'Create stock requests'),
        ('perm_023', 'requests.approve', 'Approve stock requests'),
        ('perm_024', 'requests.fulfill', 'Fulfill stock requests'),
        ('perm_025', 'reports.view', 'View reports'),
        ('perm_026', 'reports.export', 'Export reports'),
        ('perm_027', 'finance.view', 'View finance screens'),
        ('perm_028', 'kpi.view', 'View KPI dashboards'),
        ('perm_029', 'users.view', 'View users'),
        ('perm_030', 'users.create', 'Create users'),
        ('perm_031', 'users.update', 'Update users'),
        ('perm_032', 'users.deactivate', 'Deactivate users'),
        ('perm_033', 'roles.view', 'View roles'),
        ('perm_034', 'settings.view', 'View settings'),
        ('perm_035', 'settings.update', 'Update settings'),
        ('perm_036', 'alerts.view', 'View alerts'),
        ('perm_037', 'notifications.view', 'View notifications'),
        ('perm_038', 'attachments.upload', 'Upload attachments'),
        ('perm_039', 'attachments.view', 'View attachments'),
        ('perm_040', 'attachments.delete', 'Delete attachments'),
        ('perm_041', 'barcodes.view', 'View barcodes'),
        ('perm_042', 'barcodes.manage', 'Manage barcodes'),
        ('perm_043', 'onboarding.view', 'View onboarding status'),
        ('perm_044', 'onboarding.complete', 'Complete onboarding'),
        ('perm_045', 'onboarding.reset', 'Reset onboarding for users'),
        ('perm_master_items_view', 'master.items.view', 'View items'),
        ('perm_master_items_create', 'master.items.create', 'Create items'),
        ('perm_master_items_update', 'master.items.update', 'Update items'),
        ('perm_master_items_deactivate', 'master.items.deactivate', 'Deactivate items'),
        ('perm_master_suppliers_view', 'master.suppliers.view', 'View suppliers'),
        ('perm_master_suppliers_create', 'master.suppliers.create', 'Create suppliers'),
        ('perm_master_suppliers_update', 'master.suppliers.update', 'Update suppliers'),
        ('perm_master_suppliers_deactivate', 'master.suppliers.deactivate', 'Deactivate suppliers'),
        ('perm_master_godowns_view', 'master.godowns.view', 'View godowns'),
        ('perm_master_godowns_create', 'master.godowns.create', 'Create godowns'),
        ('perm_master_godowns_update', 'master.godowns.update', 'Update godowns'),
        ('perm_master_godowns_deactivate', 'master.godowns.deactivate', 'Deactivate godowns'),
        ('perm_master_outlets_view', 'master.outlets.view', 'View outlets'),
        ('perm_master_outlets_create', 'master.outlets.create', 'Create outlets'),
        ('perm_master_outlets_update', 'master.outlets.update', 'Update outlets'),
        ('perm_master_outlets_deactivate', 'master.outlets.deactivate', 'Deactivate outlets')`).run();

      // Seed Role Permissions
      // Super Admin = all permissions
      await this.db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
        SELECT 'role_super_admin', id FROM permissions`).run();

      // Admin
      await this.db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
        ('role_admin', 'perm_001'), ('role_admin', 'perm_002'), ('role_admin', 'perm_003'), ('role_admin', 'perm_004'), ('role_admin', 'perm_005'),
        ('role_admin', 'perm_006'), ('role_admin', 'perm_007'), ('role_admin', 'perm_008'), ('role_admin', 'perm_009'), ('role_admin', 'perm_010'),
        ('role_admin', 'perm_011'), ('role_admin', 'perm_012'), ('role_admin', 'perm_013'), ('role_admin', 'perm_014'), ('role_admin', 'perm_015'),
        ('role_admin', 'perm_016'), ('role_admin', 'perm_017'), ('role_admin', 'perm_018'), ('role_admin', 'perm_019'), ('role_admin', 'perm_020'),
        ('role_admin', 'perm_021'), ('role_admin', 'perm_022'), ('role_admin', 'perm_023'), ('role_admin', 'perm_024'), ('role_admin', 'perm_025'),
        ('role_admin', 'perm_026'), ('role_admin', 'perm_027'), ('role_admin', 'perm_028'), ('role_admin', 'perm_029'), ('role_admin', 'perm_030'),
        ('role_admin', 'perm_031'), ('role_admin', 'perm_032'), ('role_admin', 'perm_033'), ('role_admin', 'perm_034'), ('role_admin', 'perm_035'),
        ('role_admin', 'perm_036'), ('role_admin', 'perm_037'), ('role_admin', 'perm_038'), ('role_admin', 'perm_039'), ('role_admin', 'perm_040'),
        ('role_admin', 'perm_041'), ('role_admin', 'perm_042'), ('role_admin', 'perm_043'), ('role_admin', 'perm_044'), ('role_admin', 'perm_045'),
        ('role_admin', 'perm_master_items_view'), ('role_admin', 'perm_master_items_create'), ('role_admin', 'perm_master_items_update'), ('role_admin', 'perm_master_items_deactivate'),
        ('role_admin', 'perm_master_suppliers_view'), ('role_admin', 'perm_master_suppliers_create'), ('role_admin', 'perm_master_suppliers_update'), ('role_admin', 'perm_master_suppliers_deactivate'),
        ('role_admin', 'perm_master_godowns_view'), ('role_admin', 'perm_master_godowns_create'), ('role_admin', 'perm_master_godowns_update'), ('role_admin', 'perm_master_godowns_deactivate'),
        ('role_admin', 'perm_master_outlets_view'), ('role_admin', 'perm_master_outlets_create'), ('role_admin', 'perm_master_outlets_update'), ('role_admin', 'perm_master_outlets_deactivate')`).run();

      // Warehouse Manager
      await this.db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
        ('role_warehouse_manager', 'perm_001'), ('role_warehouse_manager', 'perm_002'), ('role_warehouse_manager', 'perm_003'), ('role_warehouse_manager', 'perm_004'), ('role_warehouse_manager', 'perm_005'),
        ('role_warehouse_manager', 'perm_006'), ('role_warehouse_manager', 'perm_007'), ('role_warehouse_manager', 'perm_008'), ('role_warehouse_manager', 'perm_009'), ('role_warehouse_manager', 'perm_010'),
        ('role_warehouse_manager', 'perm_011'), ('role_warehouse_manager', 'perm_012'), ('role_warehouse_manager', 'perm_013'), ('role_warehouse_manager', 'perm_014'), ('role_warehouse_manager', 'perm_015'),
        ('role_warehouse_manager', 'perm_016'), ('role_warehouse_manager', 'perm_017'), ('role_warehouse_manager', 'perm_018'), ('role_warehouse_manager', 'perm_019'), ('role_warehouse_manager', 'perm_020'),
        ('role_warehouse_manager', 'perm_021'), ('role_warehouse_manager', 'perm_023'), ('role_warehouse_manager', 'perm_024'), ('role_warehouse_manager', 'perm_025'), ('role_warehouse_manager', 'perm_028'),
        ('role_warehouse_manager', 'perm_036'), ('role_warehouse_manager', 'perm_037'), ('role_warehouse_manager', 'perm_038'), ('role_warehouse_manager', 'perm_039'), ('role_warehouse_manager', 'perm_041'),
        ('role_warehouse_manager', 'perm_043'), ('role_warehouse_manager', 'perm_044'),
        ('role_warehouse_manager', 'perm_master_items_view'), ('role_warehouse_manager', 'perm_master_items_create'), ('role_warehouse_manager', 'perm_master_items_update'),
        ('role_warehouse_manager', 'perm_master_suppliers_view'), ('role_warehouse_manager', 'perm_master_suppliers_create'), ('role_warehouse_manager', 'perm_master_suppliers_update'),
        ('role_warehouse_manager', 'perm_master_godowns_view'), ('role_warehouse_manager', 'perm_master_godowns_create'), ('role_warehouse_manager', 'perm_master_godowns_update'),
        ('role_warehouse_manager', 'perm_master_outlets_view'), ('role_warehouse_manager', 'perm_master_outlets_create'), ('role_warehouse_manager', 'perm_master_outlets_update')`).run();

      // Warehouse Staff
      await this.db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
        ('role_warehouse_staff', 'perm_001'), ('role_warehouse_staff', 'perm_002'), ('role_warehouse_staff', 'perm_004'), ('role_warehouse_staff', 'perm_006'), ('role_warehouse_staff', 'perm_012'),
        ('role_warehouse_staff', 'perm_013'), ('role_warehouse_staff', 'perm_014'), ('role_warehouse_staff', 'perm_017'), ('role_warehouse_staff', 'perm_018'), ('role_warehouse_staff', 'perm_021'),
        ('role_warehouse_staff', 'perm_022'), ('role_warehouse_staff', 'perm_036'), ('role_warehouse_staff', 'perm_037'), ('role_warehouse_staff', 'perm_038'), ('role_warehouse_staff', 'perm_039'),
        ('role_warehouse_staff', 'perm_041'), ('role_warehouse_staff', 'perm_043'), ('role_warehouse_staff', 'perm_044'),
        ('role_warehouse_staff', 'perm_master_items_view'), ('role_warehouse_staff', 'perm_master_suppliers_view'),
        ('role_warehouse_staff', 'perm_master_godowns_view'), ('role_warehouse_staff', 'perm_master_outlets_view')`).run();

      await this.db.prepare("INSERT OR IGNORE INTO units (code, name) VALUES ('kg', 'Kilogram'), ('g', 'Gram'), ('ltr', 'Liter'), ('pcs', 'Pieces'), ('ml', 'Milliliter'), ('box', 'Box'), ('carton', 'Carton'), ('tray', 'Tray'), ('bag', 'Bag'), ('bottle', 'Bottle'), ('can', 'Can'), ('packet', 'Packet')").run();
      
      // Default Admin: admin / omnistock123
      await this.db.prepare(`INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name, role_id, is_active)
        VALUES ('00000000-0000-0000-0000-000000000001', 'admin', 'admin@omnistock.com', 'e22d2a64f93df13c3560a0420e926529006adc85d12b24735fced9e5d13664b6', 'System Admin', 'role_super_admin', 1)`).run();

      // Seed Bootstrap
      await this.db.prepare("INSERT OR IGNORE INTO system_bootstrap (id, is_initialized) VALUES ('main', 0)").run();

      return { success: true, message: "Database initialized successfully" };
    } catch (e: any) {
      console.error("Initialization failed:", e);
      return { success: false, message: e.message };
    }
  }
}
