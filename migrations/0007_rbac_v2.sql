-- migrations/0007_rbac_v2.sql

-- 1. Create User Permission Overrides tables
CREATE TABLE IF NOT EXISTS user_permission_grants (
    user_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, permission_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_permission_denials (
    user_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, permission_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 2. Clear existing permissions and roles to ensure a clean state as requested
DELETE FROM role_permissions;
DELETE FROM permissions;
DELETE FROM roles;

-- 3. Seed Roles
INSERT INTO roles (id, name, description) VALUES
('role_super_admin', 'super_admin', 'Full system access'),
('role_admin', 'admin', 'Administrative and operational control'),
('role_warehouse_manager', 'warehouse_manager', 'Warehouse operations and approvals'),
('role_warehouse_staff', 'warehouse_staff', 'Daily warehouse operations');

-- 4. Seed Permissions
-- General & Dashboards
INSERT INTO permissions (id, key, description) VALUES
('p_dash_v', 'dashboard.view', 'View dashboard'),
('p_ana_v', 'analytics.view', 'View analytics'),
('p_fin_v', 'finance.view', 'View finance'),
('p_alt_v', 'alerts.view', 'View alerts'),
('p_not_v', 'notifications.view', 'View notifications'),
('p_rep_v', 'reports.view', 'View reports'),
('p_rep_e', 'reports.export', 'Export reports'),
('p_int_v', 'intelligence.view', 'View warehouse intelligence'),
('p_kpi_v', 'kpi.view', 'View KPIs');

-- Master Data
INSERT INTO permissions (id, key, description) VALUES
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
('p_m_o_d', 'master.outlets.deactivate', 'Deactivate outlets');

-- Inventory
INSERT INTO permissions (id, key, description) VALUES
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
('p_inv_w_p', 'wastage.post', 'Post wastage');

-- Requests
INSERT INTO permissions (id, key, description) VALUES
('p_req_v', 'stock_requests.view', 'View stock requests'),
('p_req_c', 'stock_requests.create', 'Create stock requests'),
('p_req_a', 'stock_requests.approve', 'Approve stock requests'),
('p_req_f', 'stock_requests.fulfill', 'Fulfill stock requests');

-- Administration
INSERT INTO permissions (id, key, description) VALUES
('p_u_v', 'users.view', 'View Users'),
('p_u_c', 'users.create', 'Create Users'),
('p_u_u', 'users.update', 'Update Users'),
('p_u_d', 'users.deactivate', 'Deactivate Users'),
('p_u_p_m', 'users.permissions.manage', 'Manage User Permissions'),
('p_rol_v', 'roles.view', 'View Roles'),
('p_set_v', 'settings.view', 'View Settings'),
('p_set_u', 'settings.update', 'Update Settings');

-- Other
INSERT INTO permissions (id, key, description) VALUES
('p_att_u', 'attachments.upload', 'Upload Attachments'),
('p_att_v', 'attachments.view', 'View Attachments'),
('p_att_d', 'attachments.delete', 'Delete Attachments'),
('p_bar_v', 'barcodes.view', 'View Barcodes'),
('p_bar_m', 'barcodes.manage', 'Manage Barcodes'),
('p_onb_v', 'onboarding.view', 'View Onboarding'),
('p_onb_c', 'onboarding.complete', 'Complete Onboarding'),
('p_onb_r', 'onboarding.reset', 'Reset Onboarding');

-- 5. Role Mapping

-- Super Admin: All permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_super_admin', id FROM permissions;

-- Admin: All permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_admin', id FROM permissions;

-- Warehouse Manager: Operational + Approvals
INSERT INTO role_permissions (role_id, permission_id)
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
);

-- Warehouse Staff: Daily work, no approvals
INSERT INTO role_permissions (role_id, permission_id)
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
);

-- Ensure existing admin user is super_admin
UPDATE users SET role_id = 'role_super_admin' WHERE username = 'admin';
