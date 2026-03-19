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
        `CREATE TABLE IF NOT EXISTS user_permission_grants (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, permission_id)
        )`,
        `CREATE TABLE IF NOT EXISTS user_permission_denials (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, permission_id)
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
        ('p_dash_v', 'dashboard.view', 'View dashboard'),
        ('p_ana_v', 'analytics.view', 'View analytics'),
        ('p_fin_v', 'finance.view', 'View finance'),
        ('p_alt_v', 'alerts.view', 'View alerts'),
        ('p_not_v', 'notifications.view', 'View notifications'),
        ('p_rep_v', 'reports.view', 'View reports'),
        ('p_rep_e', 'reports.export', 'Export reports'),
        ('p_int_v', 'intelligence.view', 'View warehouse intelligence'),
        ('p_kpi_v', 'kpi.view', 'View KPIs'),
        ('p_req_v', 'stock_requests.view', 'View stock requests'),
        ('p_req_c', 'stock_requests.create', 'Create stock requests'),
        ('p_req_a', 'stock_requests.approve', 'Approve stock requests'),
        ('p_req_f', 'stock_requests.fulfill', 'Fulfill stock requests'),
        ('p_inv_v', 'inventory.view', 'View inventory'),
        ('p_inv_g', 'inventory.grn', 'Manage GRN'),
        ('p_inv_g_c', 'inventory.grn.create', 'Create GRN'),
        ('p_inv_g_p', 'inventory.grn.post', 'Post GRN'),
        ('p_inv_i', 'inventory.issue', 'Manage stock issue'),
        ('p_inv_i_c', 'inventory.issue.create', 'Create stock issue'),
        ('p_inv_i_p', 'inventory.issue.post', 'Post stock issue'),
        ('p_inv_t', 'inventory.transfer', 'Manage transfers'),
        ('p_inv_t_c', 'inventory.transfer.create', 'Create transfer'),
        ('p_inv_t_a', 'inventory.transfer.approve', 'Approve transfer'),
        ('p_inv_t_d', 'inventory.transfer.dispatch', 'Dispatch transfer'),
        ('p_inv_t_r', 'inventory.transfer.receive', 'Receive transfer'),
        ('p_inv_a', 'inventory.adjust', 'Manage stock adjustments'),
        ('p_inv_a_c', 'inventory.adjustment.create', 'Create stock adjustment'),
        ('p_inv_a_p', 'inventory.adjustment.post', 'Post stock adjustment'),
        ('p_inv_c', 'inventory.count', 'Manage stock count'),
        ('p_inv_c_v', 'stockcount.view', 'View stock counts'),
        ('p_inv_c_c', 'stockcount.create', 'Create stock count'),
        ('p_inv_c_s', 'stockcount.submit', 'Submit stock count'),
        ('p_inv_c_a', 'stockcount.approve', 'Approve stock count'),
        ('p_inv_c_p', 'stockcount.post', 'Post stock count'),
        ('p_inv_w', 'inventory.wastage', 'Manage wastage'),
        ('p_inv_w_v', 'wastage.view', 'View wastage'),
        ('p_inv_w_c', 'wastage.create', 'Create wastage'),
        ('p_inv_w_a', 'wastage.approve', 'Approve wastage'),
        ('p_inv_w_p', 'wastage.post', 'Post wastage'),
        ('p_m_i_v', 'master.items.view', 'View items'),
        ('p_m_i_c', 'master.items.create', 'Create items'),
        ('p_m_i_u', 'master.items.update', 'Update items'),
        ('p_m_i_d', 'master.items.deactivate', 'Deactivate items'),
        ('p_m_s_v', 'master.suppliers.view', 'View suppliers'),
        ('p_m_s_c', 'master.suppliers.create', 'Create suppliers'),
        ('p_m_s_u', 'master.suppliers.update', 'Update suppliers'),
        ('p_m_s_d', 'master.suppliers.deactivate', 'Deactivate suppliers'),
        ('p_m_g_v', 'master.godowns.view', 'View godowns'),
        ('p_m_g_c', 'master.godowns.create', 'Create godowns'),
        ('p_m_g_u', 'master.godowns.update', 'Update godowns'),
        ('p_m_g_d', 'master.godowns.deactivate', 'Deactivate godowns'),
        ('p_m_o_v', 'master.outlets.view', 'View outlets'),
        ('p_m_o_c', 'master.outlets.create', 'Create outlets'),
        ('p_m_o_u', 'master.outlets.update', 'Update outlets'),
        ('p_m_o_d', 'master.outlets.deactivate', 'Deactivate outlets'),
        ('p_u_v', 'users.view', 'View users'),
        ('p_u_c', 'users.create', 'Create users'),
        ('p_u_u', 'users.update', 'Update users'),
        ('p_u_d', 'users.deactivate', 'Deactivate users'),
        ('p_u_p_m', 'users.permissions.manage', 'Manage user permissions'),
        ('p_rol_v', 'roles.view', 'View roles'),
        ('p_set_v', 'settings.view', 'View settings'),
        ('p_set_u', 'settings.update', 'Update settings'),
        ('p_att_u', 'attachments.upload', 'Upload attachments'),
        ('p_att_v', 'attachments.view', 'View attachments'),
        ('p_att_d', 'attachments.delete', 'Delete attachments'),
        ('p_bar_v', 'barcodes.view', 'View barcodes'),
        ('p_bar_m', 'barcodes.manage', 'Manage barcodes'),
        ('p_onb_v', 'onboarding.view', 'View onboarding'),
        ('p_onb_c', 'onboarding.complete', 'Complete onboarding'),
        ('p_onb_r', 'onboarding.reset', 'Reset onboarding')`).run();

      // Seed Role Permissions
      // Super Admin = all permissions
      await this.db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
        SELECT 'role_super_admin', id FROM permissions`).run();

      // Admin = all permissions
      await this.db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
        SELECT 'role_admin', id FROM permissions`).run();

      // Warehouse Manager
      await this.db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
        SELECT 'role_warehouse_manager', id FROM permissions
        WHERE key IN (
          'dashboard.view', 'analytics.view', 'alerts.view', 'notifications.view', 'reports.view', 'kpi.view',
          'stock_requests.view', 'stock_requests.create', 'stock_requests.approve', 'stock_requests.fulfill',
          'inventory.view', 'inventory.grn', 'inventory.grn.create', 'inventory.grn.post',
          'inventory.issue', 'inventory.issue.create', 'inventory.issue.post',
          'inventory.transfer', 'inventory.transfer.create', 'inventory.transfer.approve', 'inventory.transfer.dispatch', 'inventory.transfer.receive',
          'inventory.adjust', 'inventory.adjustment.create', 'inventory.adjustment.post',
          'inventory.count', 'stockcount.view', 'stockcount.create', 'stockcount.submit', 'stockcount.approve', 'stockcount.post',
          'inventory.wastage', 'wastage.view', 'wastage.create', 'wastage.approve', 'wastage.post',
          'master.items.view', 'master.suppliers.view', 'master.godowns.view', 'master.outlets.view',
          'attachments.upload', 'attachments.view', 'barcodes.view', 'onboarding.view', 'onboarding.complete'
        )`).run();

      // Warehouse Staff
      await this.db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
        SELECT 'role_warehouse_staff', id FROM permissions
        WHERE key IN (
          'dashboard.view', 'alerts.view', 'notifications.view',
          'stock_requests.view', 'stock_requests.create',
          'inventory.view', 'inventory.grn', 'inventory.grn.create',
          'inventory.issue', 'inventory.issue.create',
          'inventory.transfer', 'inventory.transfer.create', 'inventory.transfer.receive',
          'inventory.adjust', 'inventory.adjustment.create',
          'inventory.count', 'stockcount.view', 'stockcount.create', 'stockcount.submit',
          'inventory.wastage', 'wastage.view', 'wastage.create',
          'attachments.upload', 'attachments.view', 'barcodes.view', 'onboarding.view', 'onboarding.complete'
        )`).run();

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
