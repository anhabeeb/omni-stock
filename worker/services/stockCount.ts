/// <reference types="@cloudflare/workers-types" />
import { IdService } from "./id";
import { InventoryService } from "./inventory";
import { StockCountSession, StockCountItem, InventoryBalanceSummary } from "../../src/types";

export class StockCountService {
  private idService: IdService;

  constructor(private db: any) {
    this.idService = new IdService(db);
  }

  private async generateId(prefix: string) {
    return await this.idService.generateId(prefix);
  }

  async createSession(godownId: string, userId: string, remarks?: string) {
    const id = await this.generateId('cnt');
    const sessionNumber = id;
    const now = new Date().toISOString();

    await this.db.prepare(`
      INSERT INTO stock_count_sessions (id, session_number, godown_id, count_date, status, created_by, created_at, updated_at, remarks)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)
    `).bind(id, sessionNumber, godownId, now.split('T')[0], userId, now, now, remarks || null).run();

    return { id, sessionNumber };
  }

  async loadSystemStock(sessionId: string) {
    const session = await this.db.prepare("SELECT godown_id FROM stock_count_sessions WHERE id = ?").bind(sessionId).first() as StockCountSession;
    if (!session) throw new Error("Session not found");

    const { results: balances } = await this.db.prepare(`
      SELECT * FROM inventory_balance_summary WHERE godown_id = ? AND quantity_on_hand > 0
    `).bind(session.godown_id).all();
    const typedBalances = balances as InventoryBalanceSummary[];

    const statements = [];
    // Clear existing items if any
    statements.push(this.db.prepare("DELETE FROM stock_count_items WHERE stock_count_session_id = ?").bind(sessionId));

    for (const balance of typedBalances) {
      statements.push(this.db.prepare(`
        INSERT INTO stock_count_items (
          id, stock_count_session_id, item_id, batch_id, system_quantity, 
          counted_quantity, variance_quantity, base_variance_quantity, unit_cost, variance_value
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        await this.generateId('cnt_item'), sessionId, balance.item_id, balance.batch_id || null, 
        balance.quantity_on_hand, balance.quantity_on_hand, 0, 0, 
        balance.average_unit_cost || 0, 0
      ));
    }

    if (statements.length > 0) {
      await this.db.batch(statements);
    }
  }

  async updateItemCount(itemId: string, countedQty: number, unitId?: number, remarks?: string) {
    const item = await this.db.prepare("SELECT * FROM stock_count_items WHERE id = ?").bind(itemId).first() as StockCountItem;
    if (!item) throw new Error("Item not found");

    const inventoryService = new InventoryService(this.db);
    let baseCounted = countedQty;
    if (unitId) {
      baseCounted = await inventoryService.convertToBaseQuantity(item.item_id, unitId, countedQty);
    }

    const variance = baseCounted - item.system_quantity;
    const varianceValue = variance * (item.unit_cost || 0);

    await this.db.prepare(`
      UPDATE stock_count_items 
      SET counted_quantity = ?, entered_unit_id = ?, base_variance_quantity = ?, 
          variance_quantity = ?, variance_value = ?, remarks = ?
      WHERE id = ?
    `).bind(countedQty, unitId || null, variance, variance, varianceValue, remarks || null, itemId).run();
  }

  async submitSession(sessionId: string, userId: string) {
    const now = new Date().toISOString();
    await this.db.prepare("UPDATE stock_count_sessions SET status = 'submitted', submitted_at = ?, updated_at = ? WHERE id = ?").bind(now, now, sessionId).run();
  }

  async approveSession(sessionId: string, userId: string) {
    const now = new Date().toISOString();
    await this.db.prepare("UPDATE stock_count_sessions SET status = 'approved', approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ?").bind(now, userId, now, sessionId).run();
  }

  async postSession(sessionId: string, userId: string) {
    const session = await this.db.prepare("SELECT * FROM stock_count_sessions WHERE id = ?").bind(sessionId).first() as StockCountSession;
    if (!session || session.status !== 'approved') throw new Error("Session must be approved before posting");

    const { results: items } = await this.db.prepare("SELECT * FROM stock_count_items WHERE stock_count_session_id = ? AND base_variance_quantity != 0").bind(sessionId).all();
    const typedItems = items as StockCountItem[];
    const now = new Date().toISOString();

    if (typedItems.length === 0) {
      await this.db.prepare("UPDATE stock_count_sessions SET status = 'posted', posted_at = ?, updated_at = ? WHERE id = ?").bind(now, now, sessionId).run();
      return;
    }

    // Create a Stock Adjustment to reconcile
    const adjId = await this.generateId('adj');
    const adjNumber = adjId;
    const statements = [];

    statements.push(this.db.prepare(`
      INSERT INTO stock_adjustments (id, adjustment_number, godown_id, adjustment_date, reason, remarks, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
    `).bind(adjId, adjNumber, session.godown_id, now.split('T')[0], 'Inventory Reconciliation', `Reconciliation for session ${session.session_number}`, userId, now, now));

    for (const item of typedItems) {
      const direction = item.base_variance_quantity > 0 ? 'in' : 'out';
      const absQty = Math.abs(item.base_variance_quantity);
      
      statements.push(this.db.prepare(`
        INSERT INTO stock_adjustment_items (
          id, stock_adjustment_id, item_id, batch_id, direction, entered_quantity, 
          entered_unit_id, base_quantity, unit_cost, total_cost, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        await this.generateId('adj_item'), adjId, item.item_id, item.batch_id || null, direction, absQty, 
        item.entered_unit_id || null, absQty, item.unit_cost || 0, Math.abs(item.variance_value || 0), 
        `Reconciliation variance: ${item.base_variance_quantity}`
      ));
    }

    statements.push(this.db.prepare("UPDATE stock_count_sessions SET status = 'posted', posted_at = ?, updated_at = ? WHERE id = ?").bind(now, now, sessionId));

    await this.db.batch(statements);

    // Now post the adjustment using InventoryService
    const inventoryService = new InventoryService(this.db);
    await inventoryService.postAdjustment(adjId, userId);
  }
}
