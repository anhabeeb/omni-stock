-- 0008_master_data_rbac.sql

-- 1. Insert missing permissions safely
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
('perm_master_outlets_deactivate', 'master.outlets.deactivate', 'Deactivate outlets');

-- 2. Assign to super_admin
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_super_admin', id FROM permissions WHERE key LIKE 'master.%';

-- 3. Assign to admin
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_admin', id FROM permissions WHERE key LIKE 'master.%';

-- 4. Assign to warehouse_manager (view, create, update)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_warehouse_manager', id FROM permissions WHERE key LIKE 'master.%' AND (key LIKE '%.view' OR key LIKE '%.create' OR key LIKE '%.update');

-- 5. Assign to warehouse_staff (view only)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_warehouse_staff', id FROM permissions WHERE key LIKE 'master.%.view';
