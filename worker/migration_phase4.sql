-- Phase 4: Barcodes and Sales
CREATE TABLE IF NOT EXISTS item_barcodes (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    barcode TEXT NOT NULL UNIQUE,
    barcode_type TEXT DEFAULT 'primary', -- primary, secondary, packaging
    created_at TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS batch_barcodes (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    barcode TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES stock_batches(id)
);

CREATE TABLE IF NOT EXISTS sales_documents (
    id TEXT PRIMARY KEY,
    outlet_id TEXT NOT NULL,
    sale_date TEXT NOT NULL,
    reference_number TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'posted', -- draft, posted, cancelled
    total_sales_value REAL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id)
);

CREATE TABLE IF NOT EXISTS sales_document_items (
    id TEXT PRIMARY KEY,
    sales_document_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    quantity REAL NOT NULL,
    sales_price REAL NOT NULL,
    net_sales_value REAL NOT NULL,
    linked_cost_value REAL, -- COGS at time of sale
    created_at TEXT NOT NULL,
    FOREIGN KEY (sales_document_id) REFERENCES sales_documents(id),
    FOREIGN KEY (item_id) REFERENCES items(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_item_barcodes_code ON item_barcodes(barcode);
CREATE INDEX IF NOT EXISTS idx_batch_barcodes_code ON batch_barcodes(barcode);
CREATE INDEX IF NOT EXISTS idx_sales_docs_date ON sales_documents(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_docs_outlet ON sales_documents(outlet_id);

CREATE TABLE IF NOT EXISTS acknowledged_alerts (
    id TEXT PRIMARY KEY,
    alert_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    acknowledged_at TEXT NOT NULL,
    UNIQUE(alert_id, user_id)
);
