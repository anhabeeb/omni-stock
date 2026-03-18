/// <reference types="@cloudflare/workers-types" />

export class AlertsService {
  constructor(private db: any) {}

  async getLowStockAlerts(godownId?: string) {
    const { results } = await this.db.prepare(`
      SELECT i.id, i.name, i.sku, i.reorder_level, SUM(s.quantity_on_hand) as total_qty, g.name as godown_name
      FROM inventory_balance_summary s
      JOIN items i ON s.item_id = i.id
      JOIN godowns g ON s.godown_id = g.id
      ${godownId ? "WHERE s.godown_id = ?" : ""}
      GROUP BY i.id, g.id
      HAVING total_qty <= i.reorder_level
    `).bind(...(godownId ? [godownId] : [])).all();
    return results;
  }

  async getNearExpiryAlerts(days = 30, godownId?: string) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const now = new Date().toISOString();

    const { results } = await this.db.prepare(`
      SELECT b.id, b.batch_number, b.expiry_date, b.current_quantity, i.name as item_name, g.name as godown_name
      FROM stock_batches b
      JOIN items i ON b.item_id = i.id
      JOIN godowns g ON b.godown_id = g.id
      WHERE b.expiry_date IS NOT NULL 
      AND b.expiry_date <= ? 
      AND b.expiry_date > ?
      AND b.current_quantity > 0
      ${godownId ? "AND b.godown_id = ?" : ""}
      ORDER BY b.expiry_date ASC
    `).bind(targetDate.toISOString(), now, ...(godownId ? [godownId] : [])).all();
    return results;
  }

  async getExpiredAlerts(godownId?: string) {
    const now = new Date().toISOString();
    const { results } = await this.db.prepare(`
      SELECT b.id, b.batch_number, b.expiry_date, b.current_quantity, i.name as item_name, g.name as godown_name
      FROM stock_batches b
      JOIN items i ON b.item_id = i.id
      JOIN godowns g ON b.godown_id = g.id
      WHERE b.expiry_date IS NOT NULL AND b.expiry_date <= ? AND b.current_quantity > 0
      ${godownId ? "AND b.godown_id = ?" : ""}
      ORDER BY b.expiry_date ASC
    `).bind(now, ...(godownId ? [godownId] : [])).all();
    return results;
  }

  async getDeadStockAlerts(days = 90, godownId?: string) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - days);

    const { results } = await this.db.prepare(`
      SELECT s.item_id, i.name, i.sku, s.quantity_on_hand, g.name as godown_name
      FROM inventory_balance_summary s
      JOIN items i ON s.item_id = i.id
      JOIN godowns g ON s.godown_id = g.id
      WHERE s.quantity_on_hand > 0
      ${godownId ? "AND s.godown_id = ?" : ""}
      AND NOT EXISTS (
        SELECT 1 FROM stock_movements m
        WHERE m.item_id = s.item_id AND m.godown_id = s.godown_id AND m.movement_date >= ?
      )
    `).bind(thresholdDate.toISOString(), ...(godownId ? [godownId] : [])).all();
    return results;
  }
}
