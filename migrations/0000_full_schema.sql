-- OmniStock Consolidated Production Schema for Cloudflare D1 (SQLite)
-- Version: 0000_full_schema.sql

-- =============================================================================
-- 1. CORE SYSTEM TABLES
-- =============================================================================

-- Roles Table
CREATE TABLE roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Permissions Table
CREATE TABLE permissions (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Role Permissions Mapping
CREATE TABLE role_permissions (
    role_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- Users Table
CREATE TABLE users (
    id TEXT PRIMARY KEY, -- Prefixed human-readable ID
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role_id TEXT REFERENCES roles(id),
    full_name TEXT,
    phone TEXT,
    is_active INTEGER DEFAULT 1,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Permission Overrides (Grants)
CREATE TABLE user_permission_grants (
    user_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, permission_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- User Permission Overrides (Denials)
CREATE TABLE user_permission_denials (
    user_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, permission_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- Settings Table (Single row for global configuration)
CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    -- General
    system_name TEXT DEFAULT 'OmniStock',
    company_name TEXT DEFAULT 'OmniStock Group',
    default_currency TEXT DEFAULT 'MVR',
    currency_symbol TEXT DEFAULT 'MVR',
    currency_position TEXT DEFAULT 'before' CHECK (currency_position IN ('before', 'after')), -- before, after
    decimal_places INTEGER DEFAULT 2,
    date_format TEXT DEFAULT 'YYYY-MM-DD',
    timezone TEXT DEFAULT 'UTC',
    
    -- Inventory
    allow_negative_stock INTEGER DEFAULT 0,
    default_fefo_behavior INTEGER DEFAULT 1,
    expiry_warning_threshold_days INTEGER DEFAULT 30,
    low_stock_threshold_percent REAL DEFAULT 20.0,
    stock_count_approval_required INTEGER DEFAULT 1,
    wastage_approval_required INTEGER DEFAULT 1,
    
    -- UI
    dark_mode_enabled INTEGER DEFAULT 1,
    light_mode_enabled INTEGER DEFAULT 1,
    default_theme TEXT DEFAULT 'dark' CHECK (default_theme IN ('dark', 'light')), -- dark, light
    user_theme_override_allowed INTEGER DEFAULT 1,
    
    -- Notifications
    notification_threshold_high REAL DEFAULT 80.0,
    enable_expiry_alerts INTEGER DEFAULT 1,
    enable_low_stock_alerts INTEGER DEFAULT 1,
    enable_wastage_alerts INTEGER DEFAULT 1,
    
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 2. MASTER DATA TABLES
-- =============================================================================

-- Categories
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    parent_id INTEGER REFERENCES categories(id)
);

-- Units
CREATE TABLE units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL
);

-- Items
CREATE TABLE items (
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
);

-- Unit Conversions
CREATE TABLE unit_conversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT REFERENCES items(id),
    from_unit_id INTEGER REFERENCES units(id),
    to_unit_id INTEGER REFERENCES units(id),
    multiplier REAL NOT NULL,
    UNIQUE(item_id, from_unit_id, to_unit_id)
);

-- Suppliers
CREATE TABLE suppliers (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    is_active INTEGER DEFAULT 1
);

-- Godowns (Warehouses)
CREATE TABLE godowns (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    is_active INTEGER DEFAULT 1
);

-- Outlets
CREATE TABLE outlets (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    is_active INTEGER DEFAULT 1
);

-- =============================================================================
-- 3. INVENTORY CORE TABLES
-- =============================================================================

-- Stock Batches
CREATE TABLE stock_batches (
    id TEXT PRIMARY KEY,
    item_id TEXT REFERENCES items(id),
    batch_number TEXT NOT NULL,
    expiry_date TEXT, -- ISO Date string
    manufacture_date TEXT,
    supplier_id TEXT REFERENCES suppliers(id),
    godown_id TEXT REFERENCES godowns(id),
    initial_cost REAL NOT NULL,
    current_cost REAL NOT NULL,
    received_quantity REAL DEFAULT 0,
    current_quantity REAL DEFAULT 0,
    reserved_quantity REAL DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'depleted', 'expired', 'blocked')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Stock Movements (Audit Log)
CREATE TABLE stock_movements (
    id TEXT PRIMARY KEY,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase_receipt', 'issue_to_outlet', 'transfer_out', 'transfer_in', 'adjustment_plus', 'adjustment_minus', 'expired_writeoff', 'wastage')), -- purchase_receipt, issue_to_outlet, transfer_out, transfer_in, adjustment_plus, adjustment_minus, expired_writeoff, wastage
    reference_type TEXT NOT NULL, -- goods_receipt, stock_issue, transfer, stock_adjustment, stock_count, wastage
    reference_id TEXT NOT NULL,
    item_id TEXT REFERENCES items(id),
    batch_id TEXT REFERENCES stock_batches(id),
    godown_id TEXT REFERENCES godowns(id),
    source_godown_id TEXT REFERENCES godowns(id),
    destination_godown_id TEXT REFERENCES godowns(id),
    destination_outlet_id TEXT REFERENCES outlets(id),
    entered_quantity REAL NOT NULL,
    entered_unit_id INTEGER REFERENCES units(id),
    base_quantity REAL NOT NULL,
    unit_cost REAL,
    total_value REAL,
    movement_date TEXT NOT NULL,
    created_by TEXT REFERENCES users(id),
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Inventory Balance Summary
CREATE TABLE inventory_balance_summary (
    id TEXT PRIMARY KEY,
    item_id TEXT REFERENCES items(id),
    godown_id TEXT REFERENCES godowns(id),
    storage_location_id TEXT,
    batch_id TEXT REFERENCES stock_batches(id),
    quantity_on_hand REAL DEFAULT 0,
    reserved_quantity REAL DEFAULT 0,
    average_unit_cost REAL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(item_id, godown_id, batch_id)
);

-- =============================================================================
-- 4. INVENTORY OPERATIONS TABLES
-- =============================================================================

-- Goods Receipts (GRN)
CREATE TABLE goods_receipts (
    id TEXT PRIMARY KEY,
    grn_number TEXT UNIQUE NOT NULL,
    supplier_id TEXT REFERENCES suppliers(id),
    purchase_order_reference TEXT,
    invoice_number TEXT,
    invoice_date TEXT,
    received_date TEXT NOT NULL,
    godown_id TEXT REFERENCES godowns(id),
    storage_location_id TEXT,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
    created_by TEXT REFERENCES users(id),
    approved_by TEXT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    posted_at DATETIME,
    cancelled_at DATETIME
);

CREATE TABLE goods_receipt_items (
    id TEXT PRIMARY KEY,
    goods_receipt_id TEXT REFERENCES goods_receipts(id) ON DELETE CASCADE,
    item_id TEXT REFERENCES items(id),
    entered_quantity REAL NOT NULL,
    entered_unit_id INTEGER REFERENCES units(id),
    base_quantity REAL NOT NULL,
    batch_number TEXT,
    manufacture_date TEXT,
    expiry_date TEXT,
    unit_cost REAL NOT NULL,
    tax_amount REAL DEFAULT 0,
    other_charges REAL DEFAULT 0,
    total_line_cost REAL NOT NULL,
    remarks TEXT
);

-- Stock Issues (to Outlets)
CREATE TABLE stock_issues (
    id TEXT PRIMARY KEY,
    issue_number TEXT UNIQUE NOT NULL,
    source_godown_id TEXT REFERENCES godowns(id),
    outlet_id TEXT REFERENCES outlets(id),
    request_reference TEXT,
    issue_date TEXT NOT NULL,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
    created_by TEXT REFERENCES users(id),
    approved_by TEXT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    posted_at DATETIME,
    cancelled_at DATETIME
);

CREATE TABLE stock_issue_items (
    id TEXT PRIMARY KEY,
    stock_issue_id TEXT REFERENCES stock_issues(id) ON DELETE CASCADE,
    item_id TEXT REFERENCES items(id),
    requested_quantity REAL NOT NULL,
    issued_quantity REAL NOT NULL,
    entered_unit_id INTEGER REFERENCES units(id),
    base_quantity REAL NOT NULL,
    unit_cost REAL NOT NULL,
    total_cost REAL NOT NULL,
    remarks TEXT
);

CREATE TABLE stock_issue_batch_allocations (
    id TEXT PRIMARY KEY,
    stock_issue_item_id TEXT REFERENCES stock_issue_items(id) ON DELETE CASCADE,
    batch_id TEXT REFERENCES stock_batches(id),
    allocated_quantity REAL NOT NULL,
    allocated_base_quantity REAL NOT NULL
);

-- Transfers (Between Godowns)
CREATE TABLE transfers (
    id TEXT PRIMARY KEY,
    transfer_number TEXT UNIQUE NOT NULL,
    source_godown_id TEXT REFERENCES godowns(id),
    destination_godown_id TEXT REFERENCES godowns(id),
    transfer_date TEXT NOT NULL,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'dispatched', 'received', 'cancelled')),
    created_by TEXT REFERENCES users(id),
    approved_by TEXT REFERENCES users(id),
    dispatched_by TEXT REFERENCES users(id),
    received_by TEXT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    dispatched_at DATETIME,
    received_at DATETIME,
    cancelled_at DATETIME
);

CREATE TABLE transfer_items (
    id TEXT PRIMARY KEY,
    transfer_id TEXT REFERENCES transfers(id) ON DELETE CASCADE,
    item_id TEXT REFERENCES items(id),
    entered_quantity REAL NOT NULL,
    entered_unit_id INTEGER REFERENCES units(id),
    base_quantity REAL NOT NULL,
    remarks TEXT
);

CREATE TABLE transfer_batch_allocations (
    id TEXT PRIMARY KEY,
    transfer_item_id TEXT REFERENCES transfer_items(id) ON DELETE CASCADE,
    batch_id TEXT REFERENCES stock_batches(id),
    allocated_quantity REAL NOT NULL,
    allocated_base_quantity REAL NOT NULL
);

-- Stock Adjustments
CREATE TABLE stock_adjustments (
    id TEXT PRIMARY KEY,
    adjustment_number TEXT UNIQUE NOT NULL,
    godown_id TEXT REFERENCES godowns(id),
    adjustment_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
    created_by TEXT REFERENCES users(id),
    approved_by TEXT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    posted_at DATETIME,
    cancelled_at DATETIME
);

CREATE TABLE stock_adjustment_items (
    id TEXT PRIMARY KEY,
    stock_adjustment_id TEXT REFERENCES stock_adjustments(id) ON DELETE CASCADE,
    item_id TEXT REFERENCES items(id),
    batch_id TEXT REFERENCES stock_batches(id),
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')), -- in, out
    entered_quantity REAL NOT NULL,
    entered_unit_id INTEGER REFERENCES units(id),
    base_quantity REAL NOT NULL,
    unit_cost REAL,
    total_cost REAL,
    remarks TEXT
);

-- =============================================================================
-- 5. PHASE 3: STOCK COUNT AND WASTAGE TABLES
-- =============================================================================

-- Stock Count Sessions
CREATE TABLE stock_count_sessions (
    id TEXT PRIMARY KEY,
    session_number TEXT UNIQUE NOT NULL,
    godown_id TEXT NOT NULL,
    storage_location_id TEXT,
    count_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'submitted', 'approved', 'posted', 'cancelled')),
    remarks TEXT,
    created_by TEXT NOT NULL,
    approved_by TEXT,
    posted_at TEXT,
    cancelled_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (godown_id) REFERENCES godowns(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Stock Count Items
CREATE TABLE stock_count_items (
    id TEXT PRIMARY KEY,
    stock_count_session_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    batch_id TEXT,
    system_quantity REAL NOT NULL DEFAULT 0,
    counted_quantity REAL NOT NULL DEFAULT 0,
    variance_quantity REAL NOT NULL DEFAULT 0,
    entered_unit_id INTEGER,
    base_variance_quantity REAL NOT NULL DEFAULT 0,
    unit_cost REAL,
    variance_value REAL,
    remarks TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_count_session_id) REFERENCES stock_count_sessions(id),
    FOREIGN KEY (item_id) REFERENCES items(id),
    FOREIGN KEY (batch_id) REFERENCES stock_batches(id),
    FOREIGN KEY (entered_unit_id) REFERENCES units(id)
);

-- Wastage Records
CREATE TABLE wastage_records (
    id TEXT PRIMARY KEY,
    wastage_number TEXT UNIQUE NOT NULL,
    godown_id TEXT NOT NULL,
    wastage_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
    severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    category TEXT,
    sub_category TEXT,
    created_by TEXT NOT NULL,
    approved_by TEXT,
    posted_at TEXT,
    cancelled_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (godown_id) REFERENCES godowns(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Wastage Record Items
CREATE TABLE wastage_record_items (
    id TEXT PRIMARY KEY,
    wastage_record_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    batch_id TEXT,
    quantity REAL NOT NULL,
    entered_unit_id INTEGER NOT NULL,
    base_quantity REAL NOT NULL,
    unit_cost REAL NOT NULL,
    total_cost REAL NOT NULL,
    reason_detail TEXT,
    remarks TEXT,
    FOREIGN KEY (wastage_record_id) REFERENCES wastage_records(id),
    FOREIGN KEY (item_id) REFERENCES items(id),
    FOREIGN KEY (batch_id) REFERENCES stock_batches(id),
    FOREIGN KEY (entered_unit_id) REFERENCES units(id)
);

-- =============================================================================
-- 6. PHASE 5: STOCK REQUESTS, ATTACHMENTS, NOTIFICATIONS
-- =============================================================================

-- Stock Requests (from Outlets to Warehouse)
CREATE TABLE stock_requests (
    id TEXT PRIMARY KEY,
    request_number TEXT UNIQUE NOT NULL,
    outlet_id TEXT NOT NULL,
    requested_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'partially_fulfilled', 'fulfilled', 'cancelled')),
    remarks TEXT,
    created_by TEXT NOT NULL,
    approved_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE stock_request_items (
    id TEXT PRIMARY KEY,
    stock_request_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    requested_quantity REAL NOT NULL,
    approved_quantity REAL DEFAULT 0,
    fulfilled_quantity REAL DEFAULT 0,
    remarks TEXT,
    FOREIGN KEY (stock_request_id) REFERENCES stock_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

-- Item Barcodes
CREATE TABLE item_barcodes (
    id TEXT PRIMARY KEY,
    item_id TEXT REFERENCES items(id),
    barcode TEXT UNIQUE NOT NULL,
    type TEXT DEFAULT 'ean13',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Batch Barcodes
CREATE TABLE batch_barcodes (
    id TEXT PRIMARY KEY,
    batch_id TEXT REFERENCES stock_batches(id),
    barcode TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sales Documents
CREATE TABLE sales_documents (
    id TEXT PRIMARY KEY,
    doc_number TEXT UNIQUE NOT NULL,
    outlet_id TEXT REFERENCES outlets(id),
    customer_name TEXT,
    doc_date TEXT NOT NULL,
    total_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'completed',
    created_by TEXT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sales_document_items (
    id TEXT PRIMARY KEY,
    sales_doc_id TEXT REFERENCES sales_documents(id) ON DELETE CASCADE,
    item_id TEXT REFERENCES items(id),
    quantity REAL NOT NULL,
    unit_id INTEGER REFERENCES units(id),
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Smart Alerts
CREATE TABLE smart_alerts (
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
);

-- Attachments (Cloudflare R2 Evidence)
CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL, -- grn, wastage, transfer, stock_count, request
    entity_id TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- Notifications
CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('high_wastage', 'expiry_risk', 'low_stock', 'pending_approval', 'discrepancy', 'transfer_delay')), -- high_wastage, expiry_risk, low_stock, pending_approval, discrepancy, transfer_delay
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')), -- low, medium, high, critical
    message TEXT NOT NULL,
    related_entity_type TEXT,
    related_entity_id TEXT,
    is_read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- System Bootstrap Table
CREATE TABLE system_bootstrap (
    id TEXT PRIMARY KEY,
    is_initialized INTEGER NOT NULL DEFAULT 0,
    initialized_at DATETIME NULL,
    initialized_by TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Onboarding Table
CREATE TABLE user_onboarding (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tutorial_completed INTEGER NOT NULL DEFAULT 0,
    tutorial_version TEXT NOT NULL DEFAULT 'v1',
    force_tutorial INTEGER NOT NULL DEFAULT 1,
    last_started_at DATETIME NULL,
    last_completed_at DATETIME NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ID Sequences Table
CREATE TABLE id_sequences (
    prefix TEXT PRIMARY KEY,
    current_value INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 7. INDEXES FOR PERFORMANCE
-- =============================================================================

-- Core System
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_permissions_key ON permissions(key);
CREATE INDEX idx_roles_name ON roles(name);

-- Master Data
CREATE INDEX idx_items_category ON items(category_id);
CREATE INDEX idx_items_active ON items(is_active);
CREATE INDEX idx_outlets_manager ON outlets(manager_id);

-- Inventory Operations Status
CREATE INDEX idx_grn_status ON goods_receipts(status);
CREATE INDEX idx_issue_status ON stock_issues(status);
CREATE INDEX idx_transfer_status ON transfers(status);
CREATE INDEX idx_adj_status ON stock_adjustments(status);
CREATE INDEX idx_stock_count_status ON stock_count_sessions(status);
CREATE INDEX idx_wastage_status ON wastage_records(status);
CREATE INDEX idx_stock_requests_status ON stock_requests(status);

-- Inventory Movement and Balance
CREATE INDEX idx_movements_item ON stock_movements(item_id);
CREATE INDEX idx_movements_godown ON stock_movements(godown_id);
CREATE INDEX idx_movements_date ON stock_movements(movement_date);
CREATE INDEX idx_movements_type_date ON stock_movements(movement_type, movement_date);
CREATE INDEX idx_movements_ref ON stock_movements(reference_type, reference_id);
CREATE INDEX idx_movements_batch ON stock_movements(batch_id);

CREATE INDEX idx_batches_expiry ON stock_batches(expiry_date);
CREATE INDEX idx_batches_number ON stock_batches(batch_number);
CREATE INDEX idx_batches_item_godown ON stock_batches(item_id, godown_id);

CREATE INDEX idx_balance_item_godown ON inventory_balance_summary(item_id, godown_id);
CREATE INDEX idx_inventory_balance_godown ON inventory_balance_summary(godown_id);

-- Other Lookups
CREATE INDEX idx_stock_count_items_session ON stock_count_items(stock_count_session_id);
CREATE INDEX idx_stock_count_items_item ON stock_count_items(item_id);
CREATE INDEX idx_wastage_records_godown ON wastage_records(godown_id);
CREATE INDEX idx_wastage_record_items_record ON wastage_record_items(wastage_record_id);
CREATE INDEX idx_wastage_record_items_item ON wastage_record_items(item_id);
CREATE INDEX idx_stock_requests_outlet ON stock_requests(outlet_id);
CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- =============================================================================
-- 8. INITIAL DATA SEEDING
-- =============================================================================

-- Seed Roles
INSERT OR IGNORE INTO roles (id, name, description) VALUES
('role_super_admin', 'super_admin', 'Full system access'),
('role_admin', 'admin', 'Administrative and operational control'),
('role_warehouse_manager', 'warehouse_manager', 'Warehouse operations and approvals'),
('role_warehouse_staff', 'warehouse_staff', 'Daily warehouse operations');

-- Seed Permissions
INSERT OR IGNORE INTO permissions (id, key, description) VALUES
-- Master Data
('p_m_i_v', 'master.items.view', 'View items'),
('p_m_i_c', 'master.items.create', 'Create items'),
('p_m_i_u', 'master.items.update', 'Update items'),
('p_m_i_d', 'master.items.deactivate', 'Deactivate items'),
('p_m_c_v', 'master.categories.view', 'View item categories'),
('p_m_u_v', 'master.units.view', 'View item units'),
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

-- Inventory
('p_inv_v', 'inventory.view', 'View inventory'),
('p_inv_g_c', 'inventory.grn.create', 'Create goods receipt'),
('p_inv_g_p', 'inventory.grn.post', 'Post goods receipt'),
('p_inv_i_c', 'inventory.issue.create', 'Create stock issue'),
('p_inv_i_p', 'inventory.issue.post', 'Post stock issue'),
('p_inv_t_c', 'inventory.transfer.create', 'Create transfer'),
('p_inv_t_a', 'inventory.transfer.approve', 'Approve transfer'),
('p_inv_t_d', 'inventory.transfer.dispatch', 'Dispatch transfer'),
('p_inv_t_r', 'inventory.transfer.receive', 'Receive transfer'),
('p_inv_a_c', 'inventory.adjustment.create', 'Create stock adjustment'),
('p_inv_a_p', 'inventory.adjustment.post', 'Post stock adjustment'),

-- Stock Count
('p_sc_v', 'stockcount.view', 'View stock counts'),
('p_sc_c', 'stockcount.create', 'Create stock count'),
('p_sc_s', 'stockcount.submit', 'Submit stock count'),
('p_sc_a', 'stockcount.approve', 'Approve stock count'),
('p_sc_p', 'stockcount.post', 'Post stock count'),

-- Wastage
('p_w_v', 'wastage.view', 'View wastage'),
('p_w_c', 'wastage.create', 'Create wastage'),
('p_w_a', 'wastage.approve', 'Approve wastage'),
('p_w_p', 'wastage.post', 'Post wastage'),

-- Requests
('p_req_v', 'requests.view', 'View stock requests'),
('p_req_c', 'requests.create', 'Create stock requests'),
('p_req_a', 'requests.approve', 'Approve stock requests'),
('p_req_f', 'requests.fulfill', 'Fulfill stock requests'),

-- Sales
('p_sal_v', 'sales.view', 'View sales records'),
('p_sal_c', 'sales.create', 'Create sales records'),

-- Reports & Analytics
('p_rep_v', 'reports.view', 'View reports'),
('p_rep_e', 'reports.export', 'Export reports'),
('p_fin_v', 'finance.view', 'View finance'),
('p_kpi_v', 'kpi.view', 'View KPIs'),

-- System
('p_u_v', 'users.view', 'View users'),
('p_u_c', 'users.create', 'Create users'),
('p_u_u', 'users.update', 'Update users'),
('p_u_d', 'users.deactivate', 'Deactivate users'),
('p_u_p_m', 'users.permissions.manage', 'Manage user permissions'),
('p_rol_v', 'roles.view', 'View roles'),
('p_set_v', 'settings.view', 'View settings'),
('p_set_u', 'settings.update', 'Update settings'),
('p_onb_r', 'onboarding.reset', 'Reset onboarding'),

-- Other
('p_att_u', 'attachments.upload', 'Upload attachments'),
('p_att_v', 'attachments.view', 'View attachments'),
('p_att_d', 'attachments.delete', 'Delete attachments'),
('p_bar_v', 'barcodes.view', 'View barcodes'),
('p_bar_m', 'barcodes.manage', 'Manage barcodes'),
('p_alt_v', 'alerts.view', 'View alerts'),
('p_not_v', 'notifications.view', 'View notifications');

-- Role Permission Mapping

-- Super Admin: All permissions
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_super_admin', id FROM permissions;

-- Admin: Full operational + management (excluding onboarding reset, permission management, and settings update)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_admin', id FROM permissions
WHERE key NOT IN ('onboarding.reset', 'users.permissions.manage', 'settings.update');

-- Warehouse Manager: Operational + Approvals
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_warehouse_manager', id FROM permissions
WHERE key IN (
    'master.items.view', 'master.items.create', 'master.items.update',
    'master.categories.view', 'master.units.view',
    'master.suppliers.view', 'master.suppliers.create', 'master.suppliers.update',
    'master.godowns.view', 'master.godowns.create', 'master.godowns.update',
    'master.outlets.view', 'master.outlets.create', 'master.outlets.update',
    'inventory.view', 'inventory.grn.create', 'inventory.grn.post',
    'inventory.issue.create', 'inventory.issue.post',
    'inventory.transfer.create', 'inventory.transfer.approve', 'inventory.transfer.dispatch', 'inventory.transfer.receive',
    'inventory.adjustment.create', 'inventory.adjustment.post',
    'stockcount.view', 'stockcount.create', 'stockcount.submit', 'stockcount.approve', 'stockcount.post',
    'wastage.view', 'wastage.create', 'wastage.approve', 'wastage.post',
    'requests.view', 'requests.approve', 'requests.fulfill',
    'sales.view', 'sales.create',
    'reports.view', 'reports.export', 'finance.view', 'kpi.view',
    'attachments.upload', 'attachments.view', 'barcodes.view', 'alerts.view', 'notifications.view'
);

-- Warehouse Staff: Limited operational
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_warehouse_staff', id FROM permissions
WHERE key IN (
    'master.items.view', 'master.categories.view', 'master.units.view',
    'master.suppliers.view', 'master.godowns.view', 'master.outlets.view',
    'inventory.view', 'inventory.grn.create', 'inventory.issue.create', 'inventory.transfer.create', 'inventory.transfer.receive',
    'inventory.adjustment.create',
    'stockcount.view', 'stockcount.create', 'stockcount.submit',
    'wastage.view', 'wastage.create',
    'requests.view', 'requests.create',
    'attachments.upload', 'attachments.view', 'barcodes.view', 'alerts.view', 'notifications.view'
);

-- Default Settings
INSERT OR IGNORE INTO settings (id) VALUES (1);

-- Default Units
INSERT OR IGNORE INTO units (code, name) VALUES 
('kg', 'Kilogram'), 
('g', 'Gram'), 
('ltr', 'Liter'), 
('pcs', 'Pieces'),
('box', 'Box'),
('ctn', 'Carton');

-- Default Categories
INSERT OR IGNORE INTO categories (name) VALUES 
('Rice & Grains'), 
('Oils & Fats'),
('Dairy'),
('Beverages'),
('Cleaning Supplies');

-- Default ID Sequences
INSERT OR IGNORE INTO id_sequences (prefix, current_value) VALUES
('inv', 0), ('olt', 0), ('gdn', 0), ('usr', 0), ('grn', 0),
('iss', 0), ('trf', 0), ('adj', 0), ('req', 0), ('cnt', 0), ('wst', 0),
('mov', 0), ('bat', 0), ('bal', 0), ('cat', 0), ('unt', 0), ('sup', 0),
('sal', 0), ('sal_item', 0), ('ib', 0), ('bb', 0), ('ack', 0), ('ntf', 0), ('att', 0);

-- Default Bootstrap State
INSERT OR IGNORE INTO system_bootstrap (id, is_initialized) VALUES ('main', 0);

-- Note: Default Admin User is now created via the Setup Wizard (SetupService.initializeSystem)
-- and is not seeded in the base schema to ensure security and proper initialization flow.

