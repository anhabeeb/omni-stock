-- Migration: Admin Refinement
-- Adds settings table and updates users/roles

-- 1. Update Roles
ALTER TABLE roles ADD COLUMN description TEXT;

-- 2. Update Users
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN last_login DATETIME;

-- 3. Settings Table (Single row for global settings)
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    -- General
    system_name TEXT DEFAULT 'OmniStock',
    company_name TEXT DEFAULT 'OmniStock Group',
    default_currency TEXT DEFAULT 'MVR',
    currency_symbol TEXT DEFAULT 'MVR',
    currency_position TEXT DEFAULT 'before', -- before, after
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
    default_theme TEXT DEFAULT 'dark', -- dark, light
    user_theme_override_allowed INTEGER DEFAULT 1,
    
    -- Notifications
    notification_threshold_high REAL DEFAULT 80.0,
    enable_expiry_alerts INTEGER DEFAULT 1,
    enable_low_stock_alerts INTEGER DEFAULT 1,
    enable_wastage_alerts INTEGER DEFAULT 1,
    
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT OR IGNORE INTO settings (id) VALUES (1);

-- Add some default roles if they don't exist
INSERT OR IGNORE INTO roles (name, permissions, description) VALUES 
('super_admin', '{"all": true}', 'Full system access'),
('warehouse_manager', '{"inventory": true, "reports": true}', 'Manages warehouse operations'),
('outlet_manager', '{"requests": true, "inventory_view": true}', 'Manages outlet stock requests'),
('staff', '{"inventory_view": true}', 'Basic warehouse staff');

-- Insert default admin user if not exists
INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name, role_id, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'admin', 'admin@omnistock.com', '240be518fabd2724ddb6f0403f3d5d2f3c2c208300abb8acc394099c4c544d47', 'System Admin', 1, 1);
