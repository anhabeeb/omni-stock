/// <reference types="@cloudflare/workers-types" />

export class KPIService {
  constructor(private db: any) {}

  async getWarehouseSummary(godownId?: string) {
    const whereClause = godownId ? `WHERE godown_id = ?` : '';
    const params = godownId ? [godownId] : [];

    // 1. Total Inventory Value
    const inventoryValue = await this.db.prepare(`
      SELECT SUM(quantity_on_hand * IFNULL(average_unit_cost, 0)) as total_value 
      FROM inventory_balance_summary 
      ${whereClause}
    `).bind(...params).first();

    // 2. Wastage Rate (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const wastageValue = await this.db.prepare(`
      SELECT SUM(total_cost) as total_wastage 
      FROM wastage_record_items wri
      JOIN wastage_records wr ON wri.wastage_record_id = wr.id
      WHERE wr.status = 'posted' AND wr.wastage_date >= ?
      ${godownId ? 'AND wr.godown_id = ?' : ''}
    `).bind(thirtyDaysAgo, ...(godownId ? [godownId] : [])).first();

    // 3. Expiry Risk (next 30 days)
    const thirtyDaysFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const expiryRiskValue = await this.db.prepare(`
      SELECT SUM(current_quantity * initial_cost) as risk_value 
      FROM stock_batches 
      WHERE expiry_date <= ? AND status = 'active' AND current_quantity > 0
      ${godownId ? 'AND godown_id = ?' : ''}
    `).bind(thirtyDaysFuture, ...(godownId ? [godownId] : [])).first();

    // 4. Dispatch Performance (Average time from request to fulfillment)
    const dispatchPerformance = await this.db.prepare(`
      SELECT AVG(JULIANDAY(updated_at) - JULIANDAY(requested_date)) as avg_days 
      FROM stock_requests 
      WHERE status = 'fulfilled'
      ${godownId ? 'AND outlet_id IN (SELECT id FROM outlets WHERE godown_id = ?)' : ''}
    `).bind(...(godownId ? [godownId] : [])).first();

    return {
      totalInventoryValue: inventoryValue?.total_value || 0,
      wastageValue30d: wastageValue?.total_wastage || 0,
      expiryRiskValue30d: expiryRiskValue?.risk_value || 0,
      avgDispatchDays: dispatchPerformance?.avg_days || 0
    };
  }

  async getStockTurnover(period: 'month' | 'quarter' | 'year' = 'month') {
    // Turnover = COGS / Average Inventory
    // Simplified for now: COGS (last X days) / Current Inventory
    const days = period === 'month' ? 30 : period === 'quarter' ? 90 : 365;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const cogs = await this.db.prepare(`
      SELECT SUM(total_value) as total_cogs 
      FROM stock_movements 
      WHERE movement_type IN ('issue_to_outlet', 'transfer_out') AND movement_date >= ?
    `).bind(startDate).first();

    const avgInventory = await this.db.prepare(`
      SELECT SUM(quantity_on_hand * IFNULL(average_unit_cost, 0)) as total_value 
      FROM inventory_balance_summary
    `).first();

    const turnoverRatio = avgInventory?.total_value > 0 ? (cogs?.total_cogs || 0) / avgInventory.total_value : 0;

    return {
      cogs: cogs?.total_cogs || 0,
      inventoryValue: avgInventory?.total_value || 0,
      turnoverRatio,
      period
    };
  }
}
