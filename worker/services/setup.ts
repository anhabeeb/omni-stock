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
      
      // 2. Run initialization (schema & base data)
      // If already initialized, we only run syncPermissions to fix any RBAC misalignment
      if (status.is_initialized) {
        await this.syncPermissions();
        return { success: true, message: "System permissions synchronized successfully" };
      }

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
      // Core Schema
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
            id TEXT PRIMARY KEY, -- Prefixed human-readable ID
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
        `CREATE TABLE IF NOT EXISTS goods_receipts (
            id TEXT PRIMARY KEY,
            grn_number TEXT UNIQUE NOT NULL,
            supplier_id TEXT REFERENCES suppliers(id),
            godown_id TEXT REFERENCES godowns(id),
            reference_number TEXT,
            received_date TEXT NOT NULL,
            total_amount REAL DEFAULT 0,
            status TEXT DEFAULT 'draft',
            notes TEXT,
            created_by TEXT REFERENCES users(id),
            posted_by TEXT REFERENCES users(id),
            posted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS goods_receipt_items (
            id TEXT PRIMARY KEY,
            grn_id TEXT REFERENCES goods_receipts(id) ON DELETE CASCADE,
            item_id TEXT REFERENCES items(id),
            batch_number TEXT,
            expiry_date TEXT,
            quantity REAL NOT NULL,
            unit_id INTEGER REFERENCES units(id),
            unit_cost REAL NOT NULL,
            total_cost REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS stock_issues (
            id TEXT PRIMARY KEY,
            issue_number TEXT UNIQUE NOT NULL,
            outlet_id TEXT REFERENCES outlets(id),
            godown_id TEXT REFERENCES godowns(id),
            issue_date TEXT NOT NULL,
            status TEXT DEFAULT 'draft',
            notes TEXT,
            created_by TEXT REFERENCES users(id),
            posted_by TEXT REFERENCES users(id),
            posted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS stock_issue_items (
            id TEXT PRIMARY KEY,
            issue_id TEXT REFERENCES stock_issues(id) ON DELETE CASCADE,
            item_id TEXT REFERENCES items(id),
            quantity REAL NOT NULL,
            unit_id INTEGER REFERENCES units(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS stock_issue_batch_allocations (
            id TEXT PRIMARY KEY,
            issue_item_id TEXT REFERENCES stock_issue_items(id) ON DELETE CASCADE,
            batch_id TEXT REFERENCES stock_batches(id),
            quantity REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS transfers (
            id TEXT PRIMARY KEY,
            transfer_number TEXT UNIQUE NOT NULL,
            from_godown_id TEXT REFERENCES godowns(id),
            to_godown_id TEXT REFERENCES godowns(id),
            transfer_date TEXT NOT NULL,
            status TEXT DEFAULT 'draft',
            notes TEXT,
            created_by TEXT REFERENCES users(id),
            approved_by TEXT REFERENCES users(id),
            approved_at DATETIME,
            dispatched_by TEXT REFERENCES users(id),
            dispatched_at DATETIME,
            received_by TEXT REFERENCES users(id),
            received_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS transfer_items (
            id TEXT PRIMARY KEY,
            transfer_id TEXT REFERENCES transfers(id) ON DELETE CASCADE,
            item_id TEXT REFERENCES items(id),
            quantity REAL NOT NULL,
            unit_id INTEGER REFERENCES units(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS transfer_batch_allocations (
            id TEXT PRIMARY KEY,
            transfer_item_id TEXT REFERENCES transfer_items(id) ON DELETE CASCADE,
            batch_id TEXT REFERENCES stock_batches(id),
            quantity REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS stock_adjustments (
            id TEXT PRIMARY KEY,
            adjustment_number TEXT UNIQUE NOT NULL,
            godown_id TEXT REFERENCES godowns(id),
            adjustment_date TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT DEFAULT 'draft',
            notes TEXT,
            created_by TEXT REFERENCES users(id),
            posted_by TEXT REFERENCES users(id),
            posted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS stock_adjustment_items (
            id TEXT PRIMARY KEY,
            adjustment_id TEXT REFERENCES stock_adjustments(id) ON DELETE CASCADE,
            item_id TEXT REFERENCES items(id),
            batch_id TEXT REFERENCES stock_batches(id),
            direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
            entered_quantity REAL NOT NULL,
            entered_unit_id INTEGER REFERENCES units(id),
            base_quantity REAL NOT NULL,
            unit_cost REAL,
            total_cost REAL,
            remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS inventory_balance_summary (
            id TEXT PRIMARY KEY,
            item_id TEXT REFERENCES items(id),
            godown_id TEXT REFERENCES godowns(id),
            batch_id TEXT REFERENCES stock_batches(id),
            on_hand_quantity REAL DEFAULT 0,
            reserved_quantity REAL DEFAULT 0,
            available_quantity REAL DEFAULT 0,
            last_movement_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(item_id, godown_id, batch_id)
        )`,
        `CREATE TABLE IF NOT EXISTS stock_count_sessions (
            id TEXT PRIMARY KEY,
            count_number TEXT UNIQUE NOT NULL,
            godown_id TEXT REFERENCES godowns(id),
            scheduled_date TEXT NOT NULL,
            status TEXT DEFAULT 'draft',
            notes TEXT,
            created_by TEXT REFERENCES users(id),
            submitted_by TEXT REFERENCES users(id),
            submitted_at DATETIME,
            approved_by TEXT REFERENCES users(id),
            approved_at DATETIME,
            posted_by TEXT REFERENCES users(id),
            posted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS stock_count_items (
            id TEXT PRIMARY KEY,
            session_id TEXT REFERENCES stock_count_sessions(id) ON DELETE CASCADE,
            item_id TEXT REFERENCES items(id),
            batch_id TEXT REFERENCES stock_batches(id),
            system_quantity REAL NOT NULL,
            counted_quantity REAL,
            variance REAL,
            unit_id INTEGER REFERENCES units(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS wastage_records (
            id TEXT PRIMARY KEY,
            wastage_number TEXT UNIQUE NOT NULL,
            godown_id TEXT REFERENCES godowns(id),
            wastage_date TEXT NOT NULL,
            status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
            severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
            notes TEXT,
            created_by TEXT REFERENCES users(id),
            approved_by TEXT REFERENCES users(id),
            approved_at DATETIME,
            posted_by TEXT REFERENCES users(id),
            posted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS wastage_record_items (
            id TEXT PRIMARY KEY,
            wastage_id TEXT REFERENCES wastage_records(id) ON DELETE CASCADE,
            item_id TEXT REFERENCES items(id),
            batch_id TEXT REFERENCES stock_batches(id),
            quantity REAL NOT NULL,
            unit_id INTEGER REFERENCES units(id),
            reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS stock_requests (
            id TEXT PRIMARY KEY,
            request_number TEXT UNIQUE NOT NULL,
            requesting_outlet_id TEXT REFERENCES outlets(id),
            requesting_godown_id TEXT REFERENCES godowns(id),
            target_godown_id TEXT REFERENCES godowns(id),
            request_date TEXT NOT NULL,
            required_date TEXT,
            status TEXT DEFAULT 'pending',
            priority TEXT DEFAULT 'normal',
            notes TEXT,
            created_by TEXT REFERENCES users(id),
            approved_by TEXT REFERENCES users(id),
            approved_at DATETIME,
            fulfilled_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS stock_request_items (
            id TEXT PRIMARY KEY,
            request_id TEXT REFERENCES stock_requests(id) ON DELETE CASCADE,
            item_id TEXT REFERENCES items(id),
            requested_quantity REAL NOT NULL,
            fulfilled_quantity REAL DEFAULT 0,
            unit_id INTEGER REFERENCES units(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS item_barcodes (
            id TEXT PRIMARY KEY,
            item_id TEXT REFERENCES items(id),
            barcode TEXT UNIQUE NOT NULL,
            type TEXT DEFAULT 'ean13',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS batch_barcodes (
            id TEXT PRIMARY KEY,
            batch_id TEXT REFERENCES stock_batches(id),
            barcode TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS sales_documents (
            id TEXT PRIMARY KEY,
            doc_number TEXT UNIQUE NOT NULL,
            outlet_id TEXT REFERENCES outlets(id),
            customer_name TEXT,
            doc_date TEXT NOT NULL,
            total_amount REAL DEFAULT 0,
            status TEXT DEFAULT 'completed',
            created_by TEXT REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS sales_document_items (
            id TEXT PRIMARY KEY,
            sales_doc_id TEXT REFERENCES sales_documents(id) ON DELETE CASCADE,
            item_id TEXT REFERENCES items(id),
            quantity REAL NOT NULL,
            unit_id INTEGER REFERENCES units(id),
            unit_price REAL NOT NULL,
            total_price REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS smart_alerts (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            item_id TEXT REFERENCES items(id),
            godown_id TEXT REFERENCES godowns(id),
            is_resolved INTEGER DEFAULT 0,
            resolved_at DATETIME,
            resolved_by TEXT REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS attachments (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            storage_path TEXT NOT NULL,
            uploaded_by TEXT REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT REFERENCES users(id),
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'info',
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            system_name TEXT DEFAULT 'OmniStock',
            company_name TEXT DEFAULT 'OmniStock Group',
            default_currency TEXT DEFAULT 'MVR',
            currency_symbol TEXT DEFAULT 'MVR',
            currency_position TEXT DEFAULT 'before' CHECK (currency_position IN ('before', 'after')),
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
            default_theme TEXT DEFAULT 'dark' CHECK (default_theme IN ('dark', 'light')),
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
        )`,
        `CREATE TABLE IF NOT EXISTS system_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT,
            payload TEXT,
            created_by TEXT REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id)`,
        `CREATE INDEX IF NOT EXISTS idx_stock_movements_godown ON stock_movements(godown_id)`,
        `CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(batch_id)`,
        `CREATE INDEX IF NOT EXISTS idx_inventory_balance_item ON inventory_balance_summary(item_id)`,
        `CREATE INDEX IF NOT EXISTS idx_inventory_balance_godown ON inventory_balance_summary(godown_id)`,
        `CREATE INDEX IF NOT EXISTS idx_stock_batches_item ON stock_batches(item_id)`,
        `CREATE INDEX IF NOT EXISTS idx_stock_batches_expiry ON stock_batches(expiry_date)`
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
      // Note: This is a fallback seed. Official initialization happens via initializeSystem.
      await this.db.prepare(`INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name, role_id, is_active)
        VALUES ('00000000-0000-0000-0000-000000000001', 'admin', 'admin@omnistock.com', 'e22d2a64f93df13c3560a0420e926529006adc85d12b24735fced9e5d13664b6', 'System Admin', 'role_super_admin', 1)`).run();

      // Seed Bootstrap
      await this.db.prepare("INSERT OR IGNORE INTO system_bootstrap (id, is_initialized) VALUES ('main', 0)").run();

      // Sync Permissions (This will handle permissions and role_permissions)
      await this.syncPermissions();

      return { success: true, message: "Database initialized successfully" };
    } catch (e: any) {
      console.error("Initialization failed:", e);
      return { success: false, message: e.message };
    }
  }

  async syncPermissions(): Promise<void> {
    const permissions = [
      { key: 'inventory.view', desc: 'View inventory' },
      { key: 'inventory.grn.create', desc: 'Create goods receipt' },
      { key: 'inventory.grn.post', desc: 'Post goods receipt' },
      { key: 'inventory.issue.create', desc: 'Create stock issue' },
      { key: 'inventory.issue.post', desc: 'Post stock issue' },
      { key: 'inventory.transfer.create', desc: 'Create transfer' },
      { key: 'inventory.transfer.approve', desc: 'Approve transfer' },
      { key: 'inventory.transfer.dispatch', desc: 'Dispatch transfer' },
      { key: 'inventory.transfer.receive', desc: 'Receive transfer' },
      { key: 'inventory.adjustment.create', desc: 'Create stock adjustment' },
      { key: 'inventory.adjustment.post', desc: 'Post stock adjustment' },
      { key: 'stockcount.view', desc: 'View stock counts' },
      { key: 'stockcount.create', desc: 'Create stock count' },
      { key: 'stockcount.submit', desc: 'Submit stock count' },
      { key: 'stockcount.approve', desc: 'Approve stock count' },
      { key: 'stockcount.post', desc: 'Post stock count' },
      { key: 'wastage.view', desc: 'View wastage' },
      { key: 'wastage.create', desc: 'Create wastage' },
      { key: 'wastage.approve', desc: 'Approve wastage' },
      { key: 'wastage.post', desc: 'Post wastage' },
      { key: 'requests.view', desc: 'View stock requests' },
      { key: 'requests.create', desc: 'Create stock requests' },
      { key: 'requests.approve', desc: 'Approve stock requests' },
      { key: 'requests.fulfill', desc: 'Fulfill stock requests' },
      { key: 'reports.view', desc: 'View reports' },
      { key: 'reports.export', desc: 'Export reports' },
      { key: 'finance.view', desc: 'View finance screens' },
      { key: 'kpi.view', desc: 'View KPI dashboards' },
      { key: 'users.view', desc: 'View users' },
      { key: 'users.create', desc: 'Create users' },
      { key: 'users.update', desc: 'Update users' },
      { key: 'users.deactivate', desc: 'Deactivate users' },
      { key: 'roles.view', desc: 'View roles' },
      { key: 'settings.view', desc: 'View settings' },
      { key: 'settings.update', desc: 'Update settings' },
      { key: 'alerts.view', desc: 'View alerts' },
      { key: 'notifications.view', desc: 'View notifications' },
      { key: 'attachments.upload', desc: 'Upload attachments' },
      { key: 'attachments.view', desc: 'View attachments' },
      { key: 'attachments.delete', desc: 'Delete attachments' },
      { key: 'barcodes.view', desc: 'View barcodes' },
      { key: 'barcodes.manage', desc: 'Manage barcodes' },
      { key: 'onboarding.view', desc: 'View onboarding status' },
      { key: 'onboarding.complete', desc: 'Complete onboarding' },
      { key: 'onboarding.reset', desc: 'Reset onboarding for users' },
      { key: 'master.items.view', desc: 'View items' },
      { key: 'master.items.create', desc: 'Create items' },
      { key: 'master.items.update', desc: 'Update items' },
      { key: 'master.items.deactivate', desc: 'Deactivate items' },
      { key: 'master.suppliers.view', desc: 'View suppliers' },
      { key: 'master.suppliers.create', desc: 'Create suppliers' },
      { key: 'master.suppliers.update', desc: 'Update suppliers' },
      { key: 'master.suppliers.deactivate', desc: 'Deactivate suppliers' },
      { key: 'master.godowns.view', desc: 'View godowns' },
      { key: 'master.godowns.create', desc: 'Create godowns' },
      { key: 'master.godowns.update', desc: 'Update godowns' },
      { key: 'master.godowns.deactivate', desc: 'Deactivate godowns' },
      { key: 'master.outlets.view', desc: 'View outlets' },
      { key: 'master.outlets.create', desc: 'Create outlets' },
      { key: 'master.outlets.update', desc: 'Update outlets' },
      { key: 'master.outlets.deactivate', desc: 'Deactivate outlets' },
      { key: 'master.categories.view', desc: 'View categories' },
      { key: 'master.units.view', desc: 'View units' },
      { key: 'sales.view', desc: 'View sales' },
      { key: 'sales.create', desc: 'Create sales' }
    ];

    // 1. Ensure all permissions exist
    for (const p of permissions) {
      await this.db.prepare(`
        INSERT OR IGNORE INTO permissions (id, key, description)
        VALUES (?, ?, ?)
      `).bind(`perm_${p.key.replace(/\./g, '_')}`, p.key, p.desc).run();
    }

    // 2. Map permissions to roles
    const roleMappings: Record<string, string[]> = {
      'role_super_admin': permissions.map(p => p.key),
      'role_admin': permissions.map(p => p.key), // Admin gets everything for now, can be restricted later
      'role_warehouse_manager': [
        'inventory.view', 'inventory.grn.create', 'inventory.grn.post',
        'inventory.issue.create', 'inventory.issue.post',
        'inventory.transfer.create', 'inventory.transfer.approve', 'inventory.transfer.dispatch', 'inventory.transfer.receive',
        'inventory.adjustment.create', 'inventory.adjustment.post',
        'stockcount.view', 'stockcount.create', 'stockcount.submit', 'stockcount.approve', 'stockcount.post',
        'wastage.view', 'wastage.create', 'wastage.approve', 'wastage.post',
        'requests.view', 'requests.approve', 'requests.fulfill',
        'reports.view', 'kpi.view', 'alerts.view', 'notifications.view',
        'attachments.upload', 'attachments.view', 'barcodes.view',
        'onboarding.view', 'onboarding.complete',
        'master.items.view', 'master.items.create', 'master.items.update',
        'master.suppliers.view', 'master.suppliers.create', 'master.suppliers.update',
        'master.godowns.view', 'master.godowns.create', 'master.godowns.update',
        'master.outlets.view', 'master.outlets.create', 'master.outlets.update',
        'master.categories.view', 'master.units.view', 'sales.view'
      ],
      'role_warehouse_staff': [
        'inventory.view', 'inventory.grn.create', 'inventory.issue.create', 'inventory.transfer.create',
        'stockcount.view', 'stockcount.create', 'stockcount.submit',
        'wastage.view', 'wastage.create',
        'requests.view', 'requests.create',
        'alerts.view', 'notifications.view', 'attachments.upload', 'attachments.view',
        'barcodes.view', 'onboarding.view', 'onboarding.complete',
        'master.items.view', 'master.suppliers.view', 'master.godowns.view', 'master.outlets.view',
        'master.categories.view', 'master.units.view'
      ]
    };

    for (const [roleId, keys] of Object.entries(roleMappings)) {
      for (const key of keys) {
        await this.db.prepare(`
          INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
          SELECT ?, id FROM permissions WHERE key = ?
        `).bind(roleId, key).run();
      }
    }
  }
}
