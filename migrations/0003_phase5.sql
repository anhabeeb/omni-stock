-- Phase 5: Advanced Control, Requests, and Intelligence

-- Stock Requests (from Outlets to Warehouse)
CREATE TABLE IF NOT EXISTS stock_requests (
    id TEXT PRIMARY KEY,
    request_number TEXT UNIQUE NOT NULL,
    outlet_id TEXT NOT NULL,
    requested_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- draft, submitted, approved, partially_fulfilled, fulfilled, cancelled
    remarks TEXT,
    created_by TEXT NOT NULL,
    approved_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS stock_request_items (
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

-- Attachments (Cloudflare R2 Evidence)
CREATE TABLE IF NOT EXISTS attachments (
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
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL, -- high_wastage, expiry_risk, low_stock, pending_approval, discrepancy, transfer_delay
    severity TEXT NOT NULL, -- low, medium, high, critical
    message TEXT NOT NULL,
    related_entity_type TEXT,
    related_entity_id TEXT,
    is_read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Enhance Wastage Records (SQLite doesn't support multiple columns in one ALTER TABLE)
-- We check if columns exist first or just try to add them.
-- Since this is a new migration, we assume they don't exist.
ALTER TABLE wastage_records ADD COLUMN severity TEXT DEFAULT 'medium';
ALTER TABLE wastage_records ADD COLUMN category TEXT;
ALTER TABLE wastage_records ADD COLUMN sub_category TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stock_requests_outlet ON stock_requests(outlet_id);
CREATE INDEX IF NOT EXISTS idx_stock_requests_status ON stock_requests(status);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
