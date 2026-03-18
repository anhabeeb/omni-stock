/// <reference types="@cloudflare/workers-types" />
import { 
  MovementType, 
  ReferenceType, 
  StockMovement, 
  StockBatch, 
  GoodsReceipt, 
  GoodsReceiptItem,
  StockIssue,
  StockIssueItem,
  StockIssueBatchAllocation,
  Transfer,
  TransferItem,
  TransferBatchAllocation,
  StockAdjustment,
  StockAdjustmentItem,
  Item,
  UnitConversion,
  InventoryBalanceSummary
} from "../../src/types";

export class InventoryService {
  constructor(private db: any) {}

  private generateId() {
    return crypto.randomUUID();
  }

  async convertToBaseQuantity(itemId: string, unitId: number, quantity: number): Promise<number> {
    const item = await this.db.prepare("SELECT base_unit_id FROM items WHERE id = ?").bind(itemId).first() as Item;
    if (!item) throw new Error("Item not found");
    if (item.base_unit_id === unitId) return quantity;

    const conversion = await this.db.prepare(`
      SELECT multiplier FROM unit_conversions 
      WHERE item_id = ? AND from_unit_id = ? AND to_unit_id = ?
    `).bind(itemId, unitId, item.base_unit_id).first() as UnitConversion;

    if (!conversion) throw new Error(`No unit conversion found for item ${itemId} from unit ${unitId} to base unit ${item.base_unit_id}`);
    return quantity * conversion.multiplier;
  }

  async getFEFOSuggestions(itemId: string, godownId: string, requiredQuantity: number) {
    const { results: batches } = await this.db.prepare(`
      SELECT * FROM stock_batches 
      WHERE item_id = ? AND godown_id = ? AND current_quantity > 0 AND status = 'active'
      AND (expiry_date IS NULL OR expiry_date > ?)
      ORDER BY expiry_date ASC NULLS LAST, created_at ASC
    `).bind(itemId, godownId, new Date().toISOString()).all();
    const typedBatches = batches as StockBatch[];

    let remaining = requiredQuantity;
    const allocations = [];

    for (const batch of typedBatches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.current_quantity, remaining);
      allocations.push({
        batch_id: batch.id,
        batch_number: batch.batch_number,
        expiry_date: batch.expiry_date,
        available: batch.current_quantity,
        allocated: take
      });
      remaining -= take;
    }

    return {
      allocations,
      fulfilled: remaining <= 0,
      remaining
    };
  }

  public prepareUpdateBalance(itemId: string, godownId: string, batchId: string | null, delta: number, unitCost?: number): any {
    const now = new Date().toISOString();
    return this.db.prepare(`
      INSERT INTO inventory_balance_summary (
        id, item_id, godown_id, batch_id, quantity_on_hand, average_unit_cost, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(item_id, godown_id, batch_id) DO UPDATE SET
        average_unit_cost = CASE 
          WHEN EXCLUDED.quantity_on_hand > 0 AND EXCLUDED.average_unit_cost IS NOT NULL
          THEN ( (quantity_on_hand * IFNULL(average_unit_cost, 0)) + (EXCLUDED.quantity_on_hand * EXCLUDED.average_unit_cost) ) / (quantity_on_hand + EXCLUDED.quantity_on_hand)
          ELSE average_unit_cost
        END,
        quantity_on_hand = quantity_on_hand + EXCLUDED.quantity_on_hand,
        updated_at = EXCLUDED.updated_at
    `).bind(this.generateId(), itemId, godownId, batchId, delta, unitCost ?? null, now);
  }

  async postGRN(grnId: string, userId: string) {
    const grn = await this.db.prepare("SELECT * FROM goods_receipts WHERE id = ?").bind(grnId).first() as GoodsReceipt;
    if (!grn || grn.status !== 'draft') throw new Error("Invalid GRN or already posted");

    const { results: items } = await this.db.prepare("SELECT * FROM goods_receipt_items WHERE goods_receipt_id = ?").bind(grnId).all();
    const typedItems = items as GoodsReceiptItem[];
    const now = new Date().toISOString();

    const statements: any[] = [];

    for (const item of typedItems) {
      const itemMaster = await this.db.prepare("SELECT is_perishable FROM items WHERE id = ?").bind(item.item_id).first() as Item;
      if (itemMaster?.is_perishable && !item.expiry_date) {
        throw new Error(`Expiry date is required for perishable item ${item.item_id}`);
      }

      const batchId = this.generateId();

      statements.push(this.db.prepare(`
        INSERT INTO stock_batches (
          id, item_id, godown_id, batch_number, manufacture_date, expiry_date, 
          received_quantity, current_quantity, initial_cost, current_cost, status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        batchId, item.item_id, grn.godown_id, item.batch_number || 'DEFAULT', 
        item.manufacture_date || null, item.expiry_date || null, 
        item.base_quantity, item.base_quantity, item.unit_cost, item.unit_cost, 
        'active', now
      ));

      statements.push(this.db.prepare(`
        INSERT INTO stock_movements (
          id, movement_type, reference_type, reference_id, item_id, batch_id, 
          godown_id, entered_quantity, entered_unit_id, base_quantity, unit_cost, 
          total_value, movement_date, created_by, created_at, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        this.generateId(), 'purchase_receipt', 'goods_receipt', grnId, 
        item.item_id, batchId, grn.godown_id, item.entered_quantity, 
        item.entered_unit_id, item.base_quantity, item.unit_cost, 
        item.total_line_cost, grn.received_date, userId, now, grn.remarks
      ));

      statements.push(this.prepareUpdateBalance(item.item_id, grn.godown_id, batchId, item.base_quantity, item.unit_cost));
    }

    statements.push(this.db.prepare(`
      UPDATE goods_receipts SET status = 'posted', posted_at = ?, approved_by = ? WHERE id = ?
    `).bind(now, userId, grnId));

    await this.db.batch(statements);
  }

  async postIssue(issueId: string, userId: string) {
    const issue = await this.db.prepare("SELECT * FROM stock_issues WHERE id = ?").bind(issueId).first() as StockIssue;
    if (!issue || issue.status !== 'draft') throw new Error("Invalid Issue or already posted");

    const { results: items } = await this.db.prepare("SELECT * FROM stock_issue_items WHERE stock_issue_id = ?").bind(issueId).all();
    const typedItems = items as StockIssueItem[];
    const now = new Date().toISOString();

    const statements: any[] = [];

    for (const item of typedItems) {
      const { results: allocations } = await this.db.prepare("SELECT * FROM stock_issue_batch_allocations WHERE stock_issue_item_id = ?").bind(item.id).all();
      const typedAllocations = allocations as StockIssueBatchAllocation[];
      
      if (typedAllocations.length === 0) throw new Error(`No batch allocations for item ${item.item_id}`);

      for (const alloc of typedAllocations) {
        const batch = await this.db.prepare("SELECT expiry_date, current_cost FROM stock_batches WHERE id = ?").bind(alloc.batch_id).first() as StockBatch;
        if (batch?.expiry_date && new Date(batch.expiry_date) < new Date()) {
          throw new Error(`Cannot issue expired stock from batch ${alloc.batch_id}`);
        }

        statements.push(this.db.prepare(`
          UPDATE stock_batches 
          SET current_quantity = current_quantity - ?, 
              status = CASE WHEN current_quantity - ? <= 0 THEN 'depleted' ELSE 'active' END,
              updated_at = ?
          WHERE id = ? AND current_quantity >= ?
        `).bind(alloc.allocated_base_quantity, alloc.allocated_base_quantity, now, alloc.batch_id, alloc.allocated_base_quantity));

        statements.push(this.db.prepare(`
          INSERT INTO stock_movements (
            id, movement_type, reference_type, reference_id, item_id, batch_id, 
            godown_id, destination_outlet_id, entered_quantity, entered_unit_id, 
            base_quantity, unit_cost, total_value, movement_date, created_by, created_at, remarks
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          this.generateId(), 'issue_to_outlet', 'stock_issue', issueId, 
          item.item_id, alloc.batch_id, issue.source_godown_id, issue.outlet_id, 
          alloc.allocated_quantity, item.entered_unit_id, alloc.allocated_base_quantity, 
          batch?.current_cost || 0, (batch?.current_cost || 0) * alloc.allocated_base_quantity, 
          issue.issue_date, userId, now, issue.remarks
        ));

        statements.push(this.prepareUpdateBalance(item.item_id, issue.source_godown_id, alloc.batch_id, -alloc.allocated_base_quantity));
      }
    }

    statements.push(this.db.prepare(`
      UPDATE stock_issues SET status = 'posted', posted_at = ?, approved_by = ? WHERE id = ?
    `).bind(now, userId, issueId));

    await this.db.batch(statements);
  }

  async dispatchTransfer(transferId: string, userId: string) {
    const transfer = await this.db.prepare("SELECT * FROM transfers WHERE id = ?").bind(transferId).first() as Transfer;
    if (!transfer || transfer.status !== 'draft') throw new Error("Invalid Transfer or already dispatched");

    const { results: items } = await this.db.prepare("SELECT * FROM transfer_items WHERE transfer_id = ?").bind(transferId).all();
    const typedItems = items as TransferItem[];
    const now = new Date().toISOString();

    const statements: any[] = [];

    for (const item of typedItems) {
      const { results: allocations } = await this.db.prepare("SELECT * FROM transfer_batch_allocations WHERE transfer_item_id = ?").bind(item.id).all();
      const typedAllocations = allocations as TransferBatchAllocation[];
      if (typedAllocations.length === 0) throw new Error(`No batch allocations for item ${item.item_id}`);

      for (const alloc of typedAllocations) {
        const batch = await this.db.prepare("SELECT expiry_date, current_cost FROM stock_batches WHERE id = ?").bind(alloc.batch_id).first() as StockBatch;
        if (batch?.expiry_date && new Date(batch.expiry_date) < new Date()) {
          throw new Error(`Cannot transfer expired stock from batch ${alloc.batch_id}`);
        }

        statements.push(this.db.prepare(`
          UPDATE stock_batches 
          SET current_quantity = current_quantity - ?, 
              status = CASE WHEN current_quantity - ? <= 0 THEN 'depleted' ELSE 'active' END,
              updated_at = ?
          WHERE id = ? AND current_quantity >= ?
        `).bind(alloc.allocated_base_quantity, alloc.allocated_base_quantity, now, alloc.batch_id, alloc.allocated_base_quantity));

        statements.push(this.db.prepare(`
          INSERT INTO stock_movements (
            id, movement_type, reference_type, reference_id, item_id, batch_id, 
            godown_id, source_godown_id, destination_godown_id, entered_quantity, entered_unit_id, 
            base_quantity, unit_cost, total_value, movement_date, created_by, created_at, remarks
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          this.generateId(), 'transfer_out', 'transfer', transferId, 
          item.item_id, alloc.batch_id, transfer.source_godown_id, transfer.source_godown_id, transfer.destination_godown_id,
          alloc.allocated_quantity, item.entered_unit_id, alloc.allocated_base_quantity, 
          batch?.current_cost || 0, (batch?.current_cost || 0) * alloc.allocated_base_quantity,
          transfer.transfer_date, userId, now, transfer.remarks
        ));

        statements.push(this.prepareUpdateBalance(item.item_id, transfer.source_godown_id, alloc.batch_id, -alloc.allocated_base_quantity));
      }
    }

    statements.push(this.db.prepare(`
      UPDATE transfers SET status = 'dispatched', dispatched_at = ?, dispatched_by = ? WHERE id = ?
    `).bind(now, userId, transferId));

    await this.db.batch(statements);
  }

  async receiveTransfer(transferId: string, userId: string) {
    const transfer = await this.db.prepare("SELECT * FROM transfers WHERE id = ?").bind(transferId).first() as Transfer;
    if (!transfer || transfer.status !== 'dispatched') throw new Error("Transfer not in dispatched state");

    const { results: items } = await this.db.prepare("SELECT * FROM transfer_items WHERE transfer_id = ?").bind(transferId).all();
    const typedItems = items as TransferItem[];
    const now = new Date().toISOString();

    const statements: any[] = [];

    for (const item of typedItems) {
      const { results: allocations } = await this.db.prepare("SELECT * FROM transfer_batch_allocations WHERE transfer_item_id = ?").bind(item.id).all();
      const typedAllocations = allocations as TransferBatchAllocation[];
      
      for (const alloc of typedAllocations) {
        const sourceBatch = await this.db.prepare("SELECT * FROM stock_batches WHERE id = ?").bind(alloc.batch_id).first() as StockBatch;
        if (!sourceBatch) throw new Error("Source batch not found");

        const destBatchId = this.generateId();
        statements.push(this.db.prepare(`
          INSERT INTO stock_batches (
            id, item_id, godown_id, batch_number, manufacture_date, expiry_date, 
            received_quantity, current_quantity, initial_cost, current_cost, status, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          destBatchId, item.item_id, transfer.destination_godown_id, sourceBatch.batch_number, 
          sourceBatch.manufacture_date, sourceBatch.expiry_date, 
          alloc.allocated_base_quantity, alloc.allocated_base_quantity, 
          sourceBatch.initial_cost, sourceBatch.current_cost, 'active', now
        ));

        statements.push(this.db.prepare(`
          INSERT INTO stock_movements (
            id, movement_type, reference_type, reference_id, item_id, batch_id, 
            godown_id, source_godown_id, destination_godown_id, entered_quantity, entered_unit_id, 
            base_quantity, unit_cost, total_value, movement_date, created_by, created_at, remarks
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          this.generateId(), 'transfer_in', 'transfer', transferId, 
          item.item_id, destBatchId, transfer.destination_godown_id, transfer.source_godown_id, transfer.destination_godown_id,
          alloc.allocated_quantity, item.entered_unit_id, alloc.allocated_base_quantity, 
          sourceBatch.current_cost, (sourceBatch.current_cost * alloc.allocated_base_quantity),
          now, userId, now, `Received from ${transfer.source_godown_id}`
        ));

        statements.push(this.prepareUpdateBalance(item.item_id, transfer.destination_godown_id, destBatchId, alloc.allocated_base_quantity, sourceBatch.current_cost));
      }
    }

    statements.push(this.db.prepare(`
      UPDATE transfers SET status = 'received', received_at = ?, received_by = ? WHERE id = ?
    `).bind(now, userId, transferId));

    await this.db.batch(statements);
  }

  async postAdjustment(adjustmentId: string, userId: string) {
    const adj = await this.db.prepare("SELECT * FROM stock_adjustments WHERE id = ?").bind(adjustmentId).first() as StockAdjustment;
    if (!adj || adj.status !== 'draft') throw new Error("Invalid Adjustment or already posted");

    const { results: items } = await this.db.prepare("SELECT * FROM stock_adjustment_items WHERE stock_adjustment_id = ?").bind(adjustmentId).all();
    const typedItems = items as StockAdjustmentItem[];
    const now = new Date().toISOString();

    const statements: any[] = [];

    for (const item of items) {
      const movementType = item.direction === 'in' ? 'adjustment_plus' : 'adjustment_minus';
      const qtyDelta = item.direction === 'in' ? item.base_quantity : -item.base_quantity;

      if (item.batch_id) {
        statements.push(this.db.prepare(`
          UPDATE stock_batches 
          SET current_quantity = current_quantity + ?, 
              status = CASE WHEN current_quantity + ? <= 0 THEN 'depleted' ELSE 'active' END,
              updated_at = ?
          WHERE id = ? AND (current_quantity + ?) >= 0
        `).bind(qtyDelta, qtyDelta, now, item.batch_id, qtyDelta));
      }

      statements.push(this.db.prepare(`
        INSERT INTO stock_movements (
          id, movement_type, reference_type, reference_id, item_id, batch_id, 
          godown_id, entered_quantity, entered_unit_id, base_quantity, 
          unit_cost, total_value, movement_date, created_by, created_at, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        this.generateId(), movementType, 'stock_adjustment', adjustmentId, 
        item.item_id, item.batch_id, adj.godown_id, 
        item.entered_quantity, item.entered_unit_id, item.base_quantity, 
        item.unit_cost, item.total_cost, adj.adjustment_date, userId, now, item.remarks || adj.reason
      ));

      statements.push(this.prepareUpdateBalance(item.item_id, adj.godown_id, item.batch_id, qtyDelta, item.unit_cost));
    }

    statements.push(this.db.prepare(`
      UPDATE stock_adjustments SET status = 'posted', posted_at = ?, approved_by = ? WHERE id = ?
    `).bind(now, userId, adjustmentId));

    await this.db.batch(statements);
  }

  async cancelDocument(type: ReferenceType, id: string, userId: string) {
    const now = new Date().toISOString();
    const statements: any[] = [];

    if (type === 'goods_receipt') {
      const grn = await this.db.prepare("SELECT * FROM goods_receipts WHERE id = ?").bind(id).first() as GoodsReceipt;
      if (!grn || grn.status !== 'posted') throw new Error("Only posted GRNs can be cancelled");
      
      const { results: movements } = await this.db.prepare("SELECT * FROM stock_movements WHERE reference_type = 'goods_receipt' AND reference_id = ?").bind(id).all();
      const typedMovements = movements as StockMovement[];
      
      for (const move of typedMovements) {
        statements.push(this.db.prepare(`
          UPDATE stock_batches SET current_quantity = current_quantity - ?, status = 'blocked', updated_at = ? WHERE id = ?
        `).bind(move.base_quantity, now, move.batch_id));
        
        statements.push(this.prepareUpdateBalance(move.item_id, move.godown_id!, move.batch_id!, -move.base_quantity));
        
        statements.push(this.db.prepare(`
          INSERT INTO stock_movements (
            id, movement_type, reference_type, reference_id, item_id, batch_id, 
            godown_id, entered_quantity, entered_unit_id, base_quantity, 
            unit_cost, total_value, movement_date, created_by, created_at, remarks
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          this.generateId(), 'adjustment_minus', 'goods_receipt', id, 
          move.item_id, move.batch_id, move.godown_id, 
          move.entered_quantity, move.entered_unit_id, move.base_quantity, 
          move.unit_cost, move.total_value, now, userId, now, `GRN Cancellation Reversal`
        ));
      }
      statements.push(this.db.prepare("UPDATE goods_receipts SET status = 'cancelled', cancelled_at = ? WHERE id = ?").bind(now, id));
    }

    if (statements.length > 0) {
      await this.db.batch(statements);
    }
  }
}
