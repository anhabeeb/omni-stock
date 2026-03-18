/// <reference types="@cloudflare/workers-types" />

export class ReportingService {
  constructor(private db: any) {}

  async getDashboardSummary(filters: any) {
    const { godownId, categoryId, from, to } = filters;
    
    let whereClause = "WHERE 1=1";
    const params: any[] = [];
    if (godownId) { whereClause += " AND godown_id = ?"; params.push(godownId); }

    // Total Stock Value & Quantity
    const stockSummary = await this.db.prepare(`
      SELECT 
        SUM(quantity_on_hand) as total_qty,
        SUM(quantity_on_hand * IFNULL(average_unit_cost, 0)) as total_value
      FROM inventory_balance_summary
      ${whereClause}
    `).bind(...params).first() as any;

    // Low Stock Count
    const lowStock = await this.db.prepare(`
      SELECT COUNT(DISTINCT s.item_id) as count
      FROM inventory_balance_summary s
      JOIN items i ON s.item_id = i.id
      WHERE s.quantity_on_hand <= i.reorder_level
      ${godownId ? " AND s.godown_id = ?" : ""}
    `).bind(...(godownId ? [godownId] : [])).first() as any;

    // Out of Stock Count
    const outOfStock = await this.db.prepare(`
      SELECT COUNT(*) as count FROM items i
      WHERE NOT EXISTS (
        SELECT 1 FROM inventory_balance_summary s 
        WHERE s.item_id = i.id AND s.quantity_on_hand > 0
        ${godownId ? " AND s.godown_id = ?" : ""}
      )
    `).bind(...(godownId ? [godownId] : [])).first() as any;

    // Near Expiry (30 days)
    const nearExpiry = await this.db.prepare(`
      SELECT COUNT(*) as count FROM stock_batches
      WHERE expiry_date IS NOT NULL 
      AND expiry_date <= ? 
      AND expiry_date > ?
      AND current_quantity > 0
      ${godownId ? " AND godown_id = ?" : ""}
    `).bind(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      new Date().toISOString(),
      ...(godownId ? [godownId] : [])
    ).first() as any;

    // Expired Stock Value
    const expiredStock = await this.db.prepare(`
      SELECT SUM(current_quantity * current_cost) as total_value
      FROM stock_batches
      WHERE expiry_date IS NOT NULL AND expiry_date <= ? AND current_quantity > 0
      ${godownId ? " AND godown_id = ?" : ""}
    `).bind(new Date().toISOString(), ...(godownId ? [godownId] : [])).first() as any;

    // Wastage Value (Period)
    let wastageWhere = "WHERE status = 'posted'";
    const wastageParams: any[] = [];
    if (from) { wastageWhere += " AND wastage_date >= ?"; wastageParams.push(from); }
    if (to) { wastageWhere += " AND wastage_date <= ?"; wastageParams.push(to); }
    if (godownId) { wastageWhere += " AND godown_id = ?"; wastageParams.push(godownId); }

    const wastageSummary = await this.db.prepare(`
      SELECT SUM(i.total_cost) as total_value
      FROM wastage_record_items i
      JOIN wastage_records r ON i.wastage_record_id = r.id
      ${wastageWhere}
    `).bind(...wastageParams).first() as any;

    // Movements Summary (Period)
    let moveWhere = "WHERE 1=1";
    const moveParams: any[] = [];
    if (from) { moveWhere += " AND movement_date >= ?"; moveParams.push(from); }
    if (to) { moveWhere += " AND movement_date <= ?"; moveParams.push(to); }
    if (godownId) { moveWhere += " AND godown_id = ?"; moveParams.push(godownId); }

    const receipts = await this.db.prepare(`
      SELECT SUM(total_value) as total FROM stock_movements
      ${moveWhere} AND movement_type = 'purchase_receipt'
    `).bind(...moveParams).first() as any;

    const issues = await this.db.prepare(`
      SELECT SUM(total_value) as total FROM stock_movements
      ${moveWhere} AND movement_type = 'issue_to_outlet'
    `).bind(...moveParams).first() as any;

    // Dead Stock Count (90 days)
    const deadStock = await this.db.prepare(`
      SELECT COUNT(DISTINCT s.item_id) as count
      FROM inventory_balance_summary s
      JOIN items i ON s.item_id = i.id
      WHERE s.quantity_on_hand > 0
      AND NOT EXISTS (
        SELECT 1 FROM stock_movements m
        WHERE m.item_id = i.id AND m.movement_date >= ?
      )
      ${godownId ? " AND s.godown_id = ?" : ""}
    `).bind(
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      ...(godownId ? [godownId] : [])
    ).first() as any;

    return {
      totalQuantity: stockSummary?.total_qty || 0,
      totalValue: stockSummary?.total_value || 0,
      lowStockCount: lowStock?.count || 0,
      outOfStockCount: outOfStock?.count || 0,
      nearExpiryCount: nearExpiry?.count || 0,
      deadStockCount: deadStock?.count || 0,
      expiredValue: expiredStock?.total_value || 0,
      wastageValue: wastageSummary?.total_value || 0,
      totalReceived: receipts?.total || 0,
      totalIssued: issues?.total || 0
    };
  }

  async getStockByGodown() {
    const { results } = await this.db.prepare(`
      SELECT g.name, SUM(s.quantity_on_hand) as quantity, SUM(s.quantity_on_hand * IFNULL(s.average_unit_cost, 0)) as value
      FROM inventory_balance_summary s
      JOIN godowns g ON s.godown_id = g.id
      GROUP BY g.id
    `).all();
    return results;
  }

  async getStockByCategory() {
    const { results } = await this.db.prepare(`
      SELECT c.name, SUM(s.quantity_on_hand) as quantity, SUM(s.quantity_on_hand * IFNULL(s.average_unit_cost, 0)) as value
      FROM inventory_balance_summary s
      JOIN items i ON s.item_id = i.id
      JOIN categories c ON i.category_id = c.id
      GROUP BY c.id
    `).all();
    return results;
  }

  async getFastMoving(limit = 10) {
    const { results } = await this.db.prepare(`
      SELECT i.name, SUM(m.base_quantity) as total_issued
      FROM stock_movements m
      JOIN items i ON m.item_id = i.id
      WHERE m.movement_type = 'issue_to_outlet'
      AND m.movement_date >= ?
      GROUP BY i.id
      ORDER BY total_issued DESC
      LIMIT ?
    `).bind(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), limit).all();
    return results;
  }

  async getDeadStock(days = 90) {
    const { results } = await this.db.prepare(`
      SELECT i.name, s.quantity_on_hand, s.average_unit_cost
      FROM inventory_balance_summary s
      JOIN items i ON s.item_id = i.id
      WHERE s.quantity_on_hand > 0
      AND NOT EXISTS (
        SELECT 1 FROM stock_movements m
        WHERE m.item_id = i.id AND m.movement_date >= ?
      )
    `).bind(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()).all();
    return results;
  }

  async getValuationReport(groupBy: 'godown' | 'category' | 'item' = 'item') {
    let sql = "";
    if (groupBy === 'godown') {
      sql = `SELECT g.name as group_name, SUM(s.quantity_on_hand * IFNULL(s.average_unit_cost, 0)) as total_value 
             FROM inventory_balance_summary s JOIN godowns g ON s.godown_id = g.id GROUP BY g.id`;
    } else if (groupBy === 'category') {
      sql = `SELECT c.name as group_name, SUM(s.quantity_on_hand * IFNULL(s.average_unit_cost, 0)) as total_value 
             FROM inventory_balance_summary s JOIN items i ON s.item_id = i.id JOIN categories c ON i.category_id = c.id GROUP BY c.id`;
    } else {
      sql = `SELECT i.name as group_name, i.sku, SUM(s.quantity_on_hand * IFNULL(s.average_unit_cost, 0)) as total_value 
             FROM inventory_balance_summary s JOIN items i ON s.item_id = i.id GROUP BY i.id`;
    }
    const { results } = await this.db.prepare(sql).all();
    return results;
  }
}
