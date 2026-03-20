-- RBAC schema for OmniStock

-- 1. Create Roles table (if not exists, but we want to ensure the new structure)
-- We'll use a temporary table to migrate if needed, but for now let's assume we can drop and recreate or just create if missing.
-- Since D1 is SQLite, we can't easily change PK type. 
-- However, the user provided a specific schema.

CREATE TABLE IF NOT EXISTS roles_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create Permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Role Permissions mapping table
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles_new(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 4. Seed Roles
INSERT OR IGNORE INTO roles_new (id, name, description) VALUES
('role_super_admin', 'super_admin', 'Full system access'),
('role_admin', 'admin', 'Administrative and operational control'),
('role_warehouse_manager', 'warehouse_manager', 'Warehouse operations and approvals'),
('role_warehouse_staff', 'warehouse_staff', 'Daily warehouse operations');

-- 5. Seed Permissions
INSERT OR IGNORE INTO permissions (id, key, description) VALUES
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
('perm_042', 'barcodes.manage', 'Manage barcodes');

-- 6. Seed Role Permissions
-- Super Admin = all permissions
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_super_admin', id FROM permissions;

-- Admin
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
('role_admin', 'perm_001'), ('role_admin', 'perm_002'), ('role_admin', 'perm_003'), ('role_admin', 'perm_004'), ('role_admin', 'perm_005'),
('role_admin', 'perm_006'), ('role_admin', 'perm_007'), ('role_admin', 'perm_008'), ('role_admin', 'perm_009'), ('role_admin', 'perm_010'),
('role_admin', 'perm_011'), ('role_admin', 'perm_012'), ('role_admin', 'perm_013'), ('role_admin', 'perm_014'), ('role_admin', 'perm_015'),
('role_admin', 'perm_016'), ('role_admin', 'perm_017'), ('role_admin', 'perm_018'), ('role_admin', 'perm_019'), ('role_admin', 'perm_020'),
('role_admin', 'perm_021'), ('role_admin', 'perm_022'), ('role_admin', 'perm_023'), ('role_admin', 'perm_024'), ('role_admin', 'perm_025'),
('role_admin', 'perm_026'), ('role_admin', 'perm_027'), ('role_admin', 'perm_028'), ('role_admin', 'perm_029'), ('role_admin', 'perm_030'),
('role_admin', 'perm_031'), ('role_admin', 'perm_032'), ('role_admin', 'perm_033'), ('role_admin', 'perm_034'), ('role_admin', 'perm_035'),
('role_admin', 'perm_036'), ('role_admin', 'perm_037'), ('role_admin', 'perm_038'), ('role_admin', 'perm_039'), ('role_admin', 'perm_040'),
('role_admin', 'perm_041'), ('role_admin', 'perm_042');

-- Warehouse Manager
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
('role_warehouse_manager', 'perm_001'), ('role_warehouse_manager', 'perm_002'), ('role_warehouse_manager', 'perm_003'), ('role_warehouse_manager', 'perm_004'), ('role_warehouse_manager', 'perm_005'),
('role_warehouse_manager', 'perm_006'), ('role_warehouse_manager', 'perm_007'), ('role_warehouse_manager', 'perm_008'), ('role_warehouse_manager', 'perm_009'), ('role_warehouse_manager', 'perm_010'),
('role_warehouse_manager', 'perm_011'), ('role_warehouse_manager', 'perm_012'), ('role_warehouse_manager', 'perm_013'), ('role_warehouse_manager', 'perm_014'), ('role_warehouse_manager', 'perm_015'),
('role_warehouse_manager', 'perm_016'), ('role_warehouse_manager', 'perm_017'), ('role_warehouse_manager', 'perm_018'), ('role_warehouse_manager', 'perm_019'), ('role_warehouse_manager', 'perm_020'),
('role_warehouse_manager', 'perm_021'), ('role_warehouse_manager', 'perm_023'), ('role_warehouse_manager', 'perm_024'), ('role_warehouse_manager', 'perm_025'), ('role_warehouse_manager', 'perm_028'),
('role_warehouse_manager', 'perm_036'), ('role_warehouse_manager', 'perm_037'), ('role_warehouse_manager', 'perm_038'), ('role_warehouse_manager', 'perm_039'), ('role_warehouse_manager', 'perm_041');

-- Warehouse Staff
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
('role_warehouse_staff', 'perm_001'), ('role_warehouse_staff', 'perm_002'), ('role_warehouse_staff', 'perm_004'), ('role_warehouse_staff', 'perm_006'), ('role_warehouse_staff', 'perm_012'),
('role_warehouse_staff', 'perm_013'), ('role_warehouse_staff', 'perm_014'), ('role_warehouse_staff', 'perm_017'), ('role_warehouse_staff', 'perm_018'), ('role_warehouse_staff', 'perm_021'),
('role_warehouse_staff', 'perm_022'), ('role_warehouse_staff', 'perm_036'), ('role_warehouse_staff', 'perm_037'), ('role_warehouse_staff', 'perm_038'), ('role_warehouse_staff', 'perm_039'),
('role_warehouse_staff', 'perm_041');

-- 7. Migrate existing users to new roles if they exist
-- This is tricky because existing role_id is INTEGER.
-- We need to recreate the users table to change role_id to TEXT and point to roles_new.

CREATE TABLE IF NOT EXISTS users_new (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role_id TEXT,
    full_name TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    phone TEXT,
    last_login DATETIME,
    FOREIGN KEY (role_id) REFERENCES roles_new(id)
);

INSERT INTO users_new (id, username, email, password_hash, role_id, full_name, is_active, created_at, updated_at, phone, last_login)
SELECT id, username, email, password_hash, 
    CASE 
        WHEN role_id = 1 OR role_id = '1' OR role_id = 'super_admin' OR role_id = 'role_super_admin' THEN 'role_super_admin'
        WHEN role_id = 2 OR role_id = '2' OR role_id = 'admin' OR role_id = 'role_admin' THEN 'role_admin'
        WHEN role_id = 3 OR role_id = '3' OR role_id = 'warehouse_manager' OR role_id = 'role_warehouse_manager' THEN 'role_warehouse_manager'
        WHEN role_id = 4 OR role_id = '4' OR role_id = 'warehouse_staff' OR role_id = 'role_warehouse_staff' THEN 'role_warehouse_staff'
        ELSE 'role_admin'
    END, 
    full_name, is_active, created_at, updated_at, phone, last_login 
FROM users;

UPDATE users_new SET role_id = 'role_super_admin' WHERE username = 'admin';

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

DROP TABLE IF EXISTS roles;
ALTER TABLE roles_new RENAME TO roles;

-- 9. Indexes
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_key ON permissions(key);
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
