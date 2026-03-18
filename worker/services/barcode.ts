/// <reference types="@cloudflare/workers-types" />

export class BarcodeService {
  constructor(private db: D1Database) {}

  async lookupItemByCode(code: string) {
    // Search in items (SKU) and item_barcodes
    const item = await this.db.prepare(`
      SELECT i.* FROM items i
      LEFT JOIN item_barcodes ib ON i.id = ib.item_id
      WHERE i.sku = ? OR ib.barcode = ?
      LIMIT 1
    `).bind(code, code).first();

    return item;
  }

  async lookupBatchByCode(code: string) {
    // Search in stock_batches (batch_number) and batch_barcodes
    const batch = await this.db.prepare(`
      SELECT b.*, i.name as item_name, i.sku as item_sku 
      FROM stock_batches b
      JOIN items i ON b.item_id = i.id
      LEFT JOIN batch_barcodes bb ON b.id = bb.batch_id
      WHERE b.batch_number = ? OR bb.barcode = ?
      LIMIT 1
    `).bind(code, code).first();

    return batch;
  }

  async addItemBarcode(itemId: string, barcode: string, type: string = 'primary') {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.prepare(`
      INSERT INTO item_barcodes (id, item_id, barcode, barcode_type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, itemId, barcode, type, now).run();
    return { id };
  }

  async deleteBarcode(barcodeId: string) {
    await this.db.prepare("DELETE FROM item_barcodes WHERE id = ?").bind(barcodeId).run();
  }

  async getItemBarcodes(itemId: string) {
    const { results } = await this.db.prepare("SELECT * FROM item_barcodes WHERE item_id = ?").bind(itemId).all();
    return results;
  }
}
