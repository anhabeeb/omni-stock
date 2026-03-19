/// <reference types="@cloudflare/workers-types" />
import { IdService } from "./id";
import { InventoryService } from "./inventory";
import { WastageRecord, WastageRecordItem, StockBatch } from "../../src/types";

export class WastageService {
  private idService: IdService;

  constructor(private db: any) {
    this.idService = new IdService(db);
  }

  private async generateId(prefix: string) {
    return await this.idService.generateId(prefix);
  }

  async createWastage(body: any, userId: string) {
    const id = await this.generateId('wst');
    const wastageNumber = id;
    const now = new Date().toISOString();

    const statements = [];
    statements.push(this.db.prepare(`
      INSERT INTO wastage_records (id, wastage_number, godown_id, wastage_date, reason, remarks, status, created_by, created_at, updated_at, severity, category, sub_category)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
    `).bind(id, wastageNumber, body.godown_id, body.wastage_date, body.reason, body.remarks || null, userId, now, now, body.severity || 'medium', body.category || null, body.sub_category || null));

    const inventoryService = new InventoryService(this.db);

    for (const item of body.items) {
      const baseQty = await inventoryService.convertToBaseQuantity(item.item_id, item.entered_unit_id, item.quantity);
      statements.push(this.db.prepare(`
        INSERT INTO wastage_record_items (
          id, wastage_record_id, item_id, batch_id, quantity, entered_unit_id, 
          base_quantity, unit_cost, total_cost, reason_detail, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        await this.generateId('wst_item'), id, item.item_id, item.batch_id || null, item.quantity, 
        item.entered_unit_id, baseQty, item.unit_cost, item.total_cost, 
        item.reason_detail || null, item.remarks || null
      ));
    }

    await this.db.batch(statements);
    return { id, wastageNumber };
  }

  async getWastageAnalytics(godownId?: string) {
    const whereClause = godownId ? `WHERE wr.godown_id = ?` : '';
    const params = godownId ? [godownId] : [];

    // 1. Total Wastage Value (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const wastageValue = await this.db.prepare(`
      SELECT SUM(total_cost) as total_wastage, COUNT(DISTINCT wr.id) as record_count
      FROM wastage_record_items wri
      JOIN wastage_records wr ON wri.wastage_record_id = wr.id
      WHERE wr.status = 'posted' AND wr.wastage_date >= ?
      ${godownId ? 'AND wr.godown_id = ?' : ''}
    `).bind(thirtyDaysAgo, ...params).first();

    // 2. Wastage by Reason
    const { results: byReason } = await this.db.prepare(`
      SELECT wr.reason, SUM(wri.total_cost) as total_value, COUNT(DISTINCT wr.id) as count
      FROM wastage_record_items wri
      JOIN wastage_records wr ON wri.wastage_record_id = wr.id
      WHERE wr.status = 'posted' AND wr.wastage_date >= ?
      ${godownId ? 'AND wr.godown_id = ?' : ''}
      GROUP BY wr.reason
      ORDER BY total_value DESC
    `).bind(thirtyDaysAgo, ...params).all();

    // 3. High Value Wastage Alerts
    const { results: highValueAlerts } = await this.db.prepare(`
      SELECT wr.wastage_number, wr.wastage_date, SUM(wri.total_cost) as total_value, wr.reason
      FROM wastage_record_items wri
      JOIN wastage_records wr ON wri.wastage_record_id = wr.id
      WHERE wr.status = 'posted' AND wr.wastage_date >= ?
      ${godownId ? 'AND wr.godown_id = ?' : ''}
      GROUP BY wr.id
      HAVING total_value > 500 -- Threshold
      ORDER BY total_value DESC
      LIMIT 10
    `).bind(thirtyDaysAgo, ...params).all();

    // 4. Recurring Wastage (Items wasted multiple times)
    const { results: recurringWastage } = await this.db.prepare(`
      SELECT i.name as item_name, COUNT(DISTINCT wr.id) as wastage_frequency, SUM(wri.total_cost) as total_loss
      FROM wastage_record_items wri
      JOIN wastage_records wr ON wri.wastage_record_id = wr.id
      JOIN items i ON wri.item_id = i.id
      WHERE wr.status = 'posted' AND wr.wastage_date >= ?
      ${godownId ? 'AND wr.godown_id = ?' : ''}
      GROUP BY wri.item_id
      HAVING wastage_frequency > 2
      ORDER BY wastage_frequency DESC
      LIMIT 10
    `).bind(thirtyDaysAgo, ...params).all();

    return {
      totalWastage: wastageValue?.total_wastage || 0,
      recordCount: wastageValue?.record_count || 0,
      byReason,
      highValueAlerts,
      recurringWastage
    };
  }

  async postWastage(wastageId: string, userId: string) {
    const record = await this.db.prepare("SELECT * FROM wastage_records WHERE id = ?").bind(wastageId).first() as WastageRecord;
    if (!record || record.status !== 'draft') throw new Error("Invalid Wastage Record or already posted");

    const { results: items } = await this.db.prepare("SELECT * FROM wastage_record_items WHERE wastage_record_id = ?").bind(wastageId).all();
    const typedItems = items as WastageRecordItem[];
    const now = new Date().toISOString();

    const statements = [];
    const inventoryService = new InventoryService(this.db);

    for (const item of typedItems) {
      if (item.batch_id) {
        const batch = await this.db.prepare("SELECT current_quantity FROM stock_batches WHERE id = ?").bind(item.batch_id).first() as StockBatch;
        if (!batch || batch.current_quantity < item.base_quantity) {
          throw new Error(`Insufficient stock in batch ${item.batch_id} for item ${item.item_id}`);
        }

        statements.push(this.db.prepare(`
          UPDATE stock_batches 
          SET current_quantity = current_quantity - ?, 
              status = CASE WHEN current_quantity - ? <= 0 THEN 'depleted' ELSE 'active' END,
              updated_at = ?
          WHERE id = ?
        `).bind(item.base_quantity, item.base_quantity, now, item.batch_id));
      }

      statements.push(this.db.prepare(`
        INSERT INTO stock_movements (
          id, movement_type, reference_type, reference_id, item_id, batch_id, 
          godown_id, entered_quantity, entered_unit_id, base_quantity, 
          unit_cost, total_value, movement_date, created_by, created_at, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        await this.generateId('mov'), 'adjustment_minus', 'stock_adjustment', wastageId, 
        item.item_id, item.batch_id || null, record.godown_id, 
        item.quantity, item.entered_unit_id, item.base_quantity, 
        item.unit_cost, item.total_cost, record.wastage_date, userId, now, 
        `Wastage: ${record.reason} - ${item.reason_detail || ''}`
      ));

      // Update Balance
      statements.push(inventoryService.prepareUpdateBalance(item.item_id, record.godown_id, item.batch_id || null, -item.base_quantity));
    }

    statements.push(this.db.prepare(`
      UPDATE wastage_records SET status = 'posted', posted_at = ?, updated_at = ? WHERE id = ?
    `).bind(now, now, wastageId));

    await this.db.batch(statements);
  }
}
