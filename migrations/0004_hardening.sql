-- Production Hardening: D1 Query Optimization
-- This migration adds indexes to improve performance for reporting and operational lookups.

-- 1. Stock Movements Optimization
-- Indexing reference_type and reference_id for faster document history lookups
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON stock_movements(reference_type, reference_id);
-- Indexing batch_id for faster batch movement history
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(batch_id);

-- 2. Stock Batches Optimization
-- Indexing batch_number for faster barcode/manual lookups
CREATE INDEX IF NOT EXISTS idx_stock_batches_number ON stock_batches(batch_number);
-- Indexing item_id and godown_id for faster batch filtering
CREATE INDEX IF NOT EXISTS idx_stock_batches_item_godown ON stock_batches(item_id, godown_id);

-- 3. Inventory Balance Summary Optimization
-- Indexing godown_id for faster godown-level stock reports
CREATE INDEX IF NOT EXISTS idx_inventory_balance_godown ON inventory_balance_summary(godown_id);

-- 4. Stock Count Optimization
-- Indexing item_id for faster item-level count history
CREATE INDEX IF NOT EXISTS idx_stock_count_items_item ON stock_count_items(item_id);

-- 5. Wastage Optimization
-- Indexing item_id for faster item-level wastage reports
CREATE INDEX IF NOT EXISTS idx_wastage_record_items_item ON wastage_record_items(item_id);

-- 6. Reporting Optimization
-- Indexing item categories for category-based reports
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
-- Indexing item status (if it exists, let's check items table again)
-- idx_items_status is not needed if status is not a column yet. 
-- items table has is_active, let's index that.
CREATE INDEX IF NOT EXISTS idx_items_active ON items(is_active);
