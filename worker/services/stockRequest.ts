/// <reference types="@cloudflare/workers-types" />
import { StockRequest, StockRequestItem } from "../../src/types";

export class StockRequestService {
  constructor(private db: any) {}

  private generateId() {
    return crypto.randomUUID();
  }

  async createRequest(body: any, userId: string) {
    const id = this.generateId();
    const requestNumber = `REQ-${Date.now()}`;
    const now = new Date().toISOString();

    const statements = [];
    statements.push(this.db.prepare(`
      INSERT INTO stock_requests (id, request_number, outlet_id, requested_date, status, remarks, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)
    `).bind(id, requestNumber, body.outlet_id, body.requested_date, body.remarks || null, userId, now, now));

    for (const item of body.items) {
      statements.push(this.db.prepare(`
        INSERT INTO stock_request_items (id, stock_request_id, item_id, requested_quantity, remarks)
        VALUES (?, ?, ?, ?, ?)
      `).bind(this.generateId(), id, item.item_id, item.requested_quantity, item.remarks || null));
    }

    await this.db.batch(statements);
    return { id, requestNumber };
  }

  async updateRequest(id: string, body: any) {
    const now = new Date().toISOString();
    const statements = [];
    
    statements.push(this.db.prepare(`
      UPDATE stock_requests SET remarks = ?, updated_at = ? WHERE id = ? AND status = 'draft'
    `).bind(body.remarks || null, now, id));

    // For simplicity, we delete and recreate items if in draft
    statements.push(this.db.prepare("DELETE FROM stock_request_items WHERE stock_request_id = ?").bind(id));
    
    for (const item of body.items) {
      statements.push(this.db.prepare(`
        INSERT INTO stock_request_items (id, stock_request_id, item_id, requested_quantity, remarks)
        VALUES (?, ?, ?, ?, ?)
      `).bind(this.generateId(), id, item.item_id, item.requested_quantity, item.remarks || null));
    }

    await this.db.batch(statements);
  }

  async submitRequest(id: string) {
    const now = new Date().toISOString();
    await this.db.prepare("UPDATE stock_requests SET status = 'submitted', updated_at = ? WHERE id = ? AND status = 'draft'").bind(now, id).run();
  }

  async approveRequest(id: string, userId: string, items: any[]) {
    const now = new Date().toISOString();
    const statements = [];

    statements.push(this.db.prepare(`
      UPDATE stock_requests SET status = 'approved', approved_by = ?, updated_at = ? WHERE id = ? AND status = 'submitted'
    `).bind(userId, now, id));

    for (const item of items) {
      statements.push(this.db.prepare(`
        UPDATE stock_request_items SET approved_quantity = ? WHERE id = ?
      `).bind(item.approved_quantity, item.id));
    }

    await this.db.batch(statements);
  }

  async fulfillRequest(id: string, fulfillmentItems: any[]) {
    const now = new Date().toISOString();
    const statements = [];

    for (const item of fulfillmentItems) {
      statements.push(this.db.prepare(`
        UPDATE stock_request_items SET fulfilled_quantity = fulfilled_quantity + ? WHERE id = ?
      `).bind(item.quantity, item.id));
    }

    // Check if fully fulfilled
    const { results: allItems } = await this.db.prepare("SELECT approved_quantity, fulfilled_quantity FROM stock_request_items WHERE stock_request_id = ?").bind(id).all();
    const isFullyFulfilled = (allItems as any[]).every(i => i.fulfilled_quantity >= i.approved_quantity);
    
    const newStatus = isFullyFulfilled ? 'fulfilled' : 'partially_fulfilled';
    statements.push(this.db.prepare("UPDATE stock_requests SET status = ?, updated_at = ? WHERE id = ?").bind(newStatus, now, id));

    await this.db.batch(statements);
  }

  async cancelRequest(id: string) {
    const now = new Date().toISOString();
    await this.db.prepare("UPDATE stock_requests SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(now, id).run();
  }
}
