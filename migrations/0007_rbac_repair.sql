-- 0007_rbac_repair.sql
-- Corrective migration for RBAC repair

-- 1. Ensure roles table has the correct rows
INSERT OR IGNORE INTO roles (id, name, description) VALUES
('role_super_admin', 'super_admin', 'Full system access'),
('role_admin', 'admin', 'Administrative and operational control'),
('role_warehouse_manager', 'warehouse_manager', 'Warehouse operations and approvals'),
('role_warehouse_staff', 'warehouse_staff', 'Daily warehouse operations');

-- 2. Ensure permissions table exists
CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Ensure role_permissions table exists
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 4. Insert missing permissions
INSERT OR IGNORE INTO permissions (id, key, description) VALUES
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
('perm_master_outlets_deactivate', 'master.outlets.deactivate', 'Deactivate outlets'),
('perm_users_permissions_manage', 'users.permissions.manage', 'Manage user permissions'),
('perm_onboarding_reset', 'onboarding.reset', 'Reset onboarding');

-- 5. Insert missing role_permissions
-- Super Admin = all permissions
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_super_admin', id FROM permissions;

-- Admin
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
('role_admin', 'perm_master_items_view'),
('role_admin', 'perm_master_items_create'),
('role_admin', 'perm_master_items_update'),
('role_admin', 'perm_master_items_deactivate'),
('role_admin', 'perm_master_suppliers_view'),
('role_admin', 'perm_master_suppliers_create'),
('role_admin', 'perm_master_suppliers_update'),
('role_admin', 'perm_master_suppliers_deactivate'),
('role_admin', 'perm_master_godowns_view'),
('role_admin', 'perm_master_godowns_create'),
('role_admin', 'perm_master_godowns_update'),
('role_admin', 'perm_master_godowns_deactivate'),
('role_admin', 'perm_master_outlets_view'),
('role_admin', 'perm_master_outlets_create'),
('role_admin', 'perm_master_outlets_update'),
('role_admin', 'perm_master_outlets_deactivate'),
('role_admin', 'perm_users_permissions_manage'),
('role_admin', 'perm_onboarding_reset');

-- Warehouse Manager
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
('role_warehouse_manager', 'perm_master_items_view'),
('role_warehouse_manager', 'perm_master_suppliers_view'),
('role_warehouse_manager', 'perm_master_godowns_view'),
('role_warehouse_manager', 'perm_master_outlets_view');

-- Warehouse Staff
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
('role_warehouse_staff', 'perm_master_items_view'),
('role_warehouse_staff', 'perm_master_suppliers_view'),
('role_warehouse_staff', 'perm_master_godowns_view'),
('role_warehouse_staff', 'perm_master_outlets_view');

-- 6. Remap old users.role_id values to new TEXT role IDs safely
UPDATE users SET role_id = 'role_super_admin' WHERE role_id = '1' OR role_id = 'super_admin';
UPDATE users SET role_id = 'role_admin' WHERE role_id = '2' OR role_id = 'admin';
UPDATE users SET role_id = 'role_warehouse_manager' WHERE role_id = '3' OR role_id = 'warehouse_manager';
UPDATE users SET role_id = 'role_warehouse_staff' WHERE role_id = '4' OR role_id = 'warehouse_staff' OR role_id = 'staff';

-- Fallback for invalid or unknown role_id
UPDATE users SET role_id = 'role_admin' WHERE role_id NOT IN ('role_super_admin', 'role_admin', 'role_warehouse_manager', 'role_warehouse_staff');

-- Ensure admin username is super_admin
UPDATE users SET role_id = 'role_super_admin' WHERE username = 'admin';
