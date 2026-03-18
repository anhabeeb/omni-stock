-- OmniStock Initial Schema for Cloudflare D1 (SQLite)

-- Roles & Users
CREATE TABLE roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    permissions TEXT NOT NULL -- JSON string
);

CREATE TABLE users (
    id TEXT PRIMARY KEY, -- UUID string
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role_id INTEGER REFERENCES roles(id),
    full_name TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Master Data: Locations
CREATE TABLE godowns (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE outlets (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    manager_id TEXT REFERENCES users(id),
    is_active INTEGER DEFAULT 1
);

-- Master Data: Items & Units
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    parent_id INTEGER REFERENCES categories(id)
);

CREATE TABLE units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL
);

CREATE TABLE items (
    id TEXT PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category_id INTEGER REFERENCES categories(id),
    base_unit_id INTEGER REFERENCES units(id),
    is_perishable INTEGER DEFAULT 0,
    track_batches INTEGER DEFAULT 0,
    track_expiry INTEGER DEFAULT 0,
    reorder_level REAL DEFAULT 0,
    min_stock REAL DEFAULT 0,
    max_stock REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE unit_conversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT REFERENCES items(id),
    from_unit_id INTEGER REFERENCES units(id),
    to_unit_id INTEGER REFERENCES units(id),
    multiplier REAL NOT NULL,
    UNIQUE(item_id, from_unit_id, to_unit_id)
);

CREATE TABLE suppliers (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    is_active INTEGER DEFAULT 1
);

-- Inventory Core
CREATE TABLE stock_batches (
    id TEXT PRIMARY KEY,
    item_id TEXT REFERENCES items(id),
    batch_number TEXT NOT NULL,
    expiry_date TEXT, -- ISO Date string
    manufacture_date TEXT,
    supplier_id TEXT REFERENCES suppliers(id),
    initial_cost REAL NOT NULL,
    current_cost REAL NOT NULL
);

CREATE TABLE stock_movements (
    id TEXT PRIMARY KEY,
    movement_type TEXT NOT NULL,
    item_id TEXT REFERENCES items(id),
    batch_id TEXT REFERENCES stock_batches(id),
    godown_id TEXT REFERENCES godowns(id),
    destination_id TEXT,
    quantity REAL NOT NULL,
    unit_id INTEGER REFERENCES units(id),
    unit_cost REAL,
    reference_id TEXT,
    created_by TEXT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Initial Data
INSERT INTO roles (name, permissions) VALUES ('super_admin', '{"all": true}');
INSERT INTO units (code, name) VALUES ('kg', 'Kilogram'), ('g', 'Gram'), ('ltr', 'Liter'), ('pcs', 'Pieces');
INSERT INTO categories (name) VALUES ('Rice & Grains'), ('Oils & Fats');
