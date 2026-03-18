-- Phase 3: Stock Count and Wastage Tracking

-- Stock Count Sessions
CREATE TABLE stock_count_sessions (
    id TEXT PRIMARY KEY,
    session_number TEXT UNIQUE NOT NULL,
    godown_id TEXT NOT NULL,
    storage_location_id TEXT,
    count_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- draft, in_progress, submitted, approved, posted, cancelled
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
    status TEXT NOT NULL DEFAULT 'draft', -- draft, posted, cancelled
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

-- Indexes for performance
CREATE INDEX idx_stock_count_session_godown ON stock_count_sessions(godown_id);
CREATE INDEX idx_stock_count_items_session ON stock_count_items(stock_count_session_id);
CREATE INDEX idx_wastage_records_godown ON wastage_records(godown_id);
CREATE INDEX idx_wastage_record_items_record ON wastage_record_items(wastage_record_id);
CREATE INDEX idx_stock_movements_type_date ON stock_movements(movement_type, movement_date);
CREATE INDEX idx_inventory_balance_item_godown ON inventory_balance_summary(item_id, godown_id);
