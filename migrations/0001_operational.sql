-- OmniStock Phase 2 Operational Schema
-- Assumes 0000_init.sql has run

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
    status TEXT NOT NULL DEFAULT 'draft', -- draft, posted, cancelled
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
    status TEXT NOT NULL DEFAULT 'draft', -- draft, posted, cancelled
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
    status TEXT NOT NULL DEFAULT 'draft', -- draft, approved, dispatched, received, cancelled
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
    status TEXT NOT NULL DEFAULT 'draft', -- draft, posted, cancelled
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
    direction TEXT NOT NULL, -- in, out
    entered_quantity REAL NOT NULL,
    entered_unit_id INTEGER REFERENCES units(id),
    base_quantity REAL NOT NULL,
    unit_cost REAL,
    total_cost REAL,
    remarks TEXT
);

-- Update existing tables from 0000_init.sql
-- (Dropping and recreating for a clean Phase 2 state if needed, but let's use ALTER for safety if possible)
-- Actually, for D1, it's often easier to just define the final state if we are in dev.
-- But I'll use ALTER to be professional.

-- Update stock_batches
ALTER TABLE stock_batches ADD COLUMN godown_id TEXT REFERENCES godowns(id);
ALTER TABLE stock_batches ADD COLUMN received_quantity REAL DEFAULT 0;
ALTER TABLE stock_batches ADD COLUMN current_quantity REAL DEFAULT 0;
ALTER TABLE stock_batches ADD COLUMN reserved_quantity REAL DEFAULT 0;
ALTER TABLE stock_batches ADD COLUMN status TEXT DEFAULT 'active'; -- active, depleted, expired, blocked
ALTER TABLE stock_batches ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE stock_batches ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Update stock_movements (Recreating is better because of many new fields)
DROP TABLE IF EXISTS stock_movements;
CREATE TABLE stock_movements (
    id TEXT PRIMARY KEY,
    movement_type TEXT NOT NULL, -- purchase_receipt, issue_to_outlet, transfer_out, transfer_in, adjustment_plus, adjustment_minus, expired_writeoff
    reference_type TEXT NOT NULL, -- goods_receipt, stock_issue, transfer, stock_adjustment
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

-- Indexes for performance
CREATE INDEX idx_grn_status ON goods_receipts(status);
CREATE INDEX idx_issue_status ON stock_issues(status);
CREATE INDEX idx_transfer_status ON transfers(status);
CREATE INDEX idx_adj_status ON stock_adjustments(status);
CREATE INDEX idx_movements_item ON stock_movements(item_id);
CREATE INDEX idx_movements_godown ON stock_movements(godown_id);
CREATE INDEX idx_movements_date ON stock_movements(movement_date);
CREATE INDEX idx_batches_expiry ON stock_batches(expiry_date);
CREATE INDEX idx_balance_item_godown ON inventory_balance_summary(item_id, godown_id);
