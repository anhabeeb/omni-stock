-- 0009_rbac_master_data_v2.sql
-- This migration updates the master data permissions to match the user's requested ID scheme and role assignments.

-- 1. Clean up existing master data permissions to avoid conflicts with new IDs
DELETE FROM role_permissions WHERE permission_id LIKE 'perm_master_%';
DELETE FROM permissions WHERE id LIKE 'perm_master_%' OR key LIKE 'master.%';

-- 2. Add missing permissions with the requested IDs
INSERT OR IGNORE INTO permissions (id, key, description) VALUES
('perm_master_items_view', 'master.items.view', 'View items'),
('perm_master_items_create', 'master.items.create', 'Create items'),
('perm_master_items_update', 'master.items.update', 'Update items'),
('perm_master_items_delete', 'master.items.deactivate', 'Deactivate items'),

('perm_master_suppliers_view', 'master.suppliers.view', 'View suppliers'),
('perm_master_suppliers_create', 'master.suppliers.create', 'Create suppliers'),
('perm_master_suppliers_update', 'master.suppliers.update', 'Update suppliers'),
('perm_master_suppliers_delete', 'master.suppliers.deactivate', 'Deactivate suppliers'),

('perm_master_godowns_view', 'master.godowns.view', 'View godowns'),
('perm_master_godowns_create', 'master.godowns.create', 'Create godowns'),
('perm_master_godowns_update', 'master.godowns.update', 'Update godowns'),
('perm_master_godowns_delete', 'master.godowns.deactivate', 'Deactivate godowns'),

('perm_master_outlets_view', 'master.outlets.view', 'View outlets'),
('perm_master_outlets_create', 'master.outlets.create', 'Create outlets'),
('perm_master_outlets_update', 'master.outlets.update', 'Update outlets'),
('perm_master_outlets_delete', 'master.outlets.deactivate', 'Deactivate outlets');

-- 3. Assign to roles

-- Super Admin (All)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_super_admin', id FROM permissions WHERE id LIKE 'perm_master_%';

-- Admin (All)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_admin', id FROM permissions WHERE id LIKE 'perm_master_%';

-- Warehouse Manager (View, Create, Update)
-- Excludes 'delete' (deactivate) permissions
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_warehouse_manager', id FROM permissions 
WHERE id LIKE 'perm_master_%' AND id NOT LIKE '%_delete';

-- Warehouse Staff (View Only)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_warehouse_staff', id FROM permissions 
WHERE id LIKE 'perm_master_%_view';
