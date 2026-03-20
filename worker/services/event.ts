export type EventType = 
  | 'item.created' | 'item.updated' | 'item.deactivated' | 'item.reactivated' | 'item.deleted'
  | 'supplier.created' | 'supplier.updated' | 'supplier.deactivated' | 'supplier.reactivated' | 'supplier.deleted'
  | 'godown.created' | 'godown.updated' | 'godown.deactivated' | 'godown.reactivated' | 'godown.deleted'
  | 'outlet.created' | 'outlet.updated' | 'outlet.deactivated' | 'outlet.reactivated' | 'outlet.deleted'
  | 'inventory.changed' | 'grn.posted' | 'issue.posted' | 'transfer.dispatched' | 'transfer.received'
  | 'adjustment.posted' | 'stockcount.posted' | 'wastage.posted' | 'request.updated'
  | 'notification.created' | 'settings.updated';

export class EventService {
  constructor(private db: D1Database) {}

  async broadcast(type: EventType, entityType: string, entityId?: string, payload?: any, userId?: string) {
    try {
      await this.db.prepare(`
        INSERT INTO system_events (event_type, entity_type, entity_id, payload, created_by)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        type,
        entityType,
        entityId || null,
        payload ? JSON.stringify(payload) : null,
        userId || null
      ).run();
    } catch (error) {
      console.error("Failed to broadcast event:", error);
    }
  }

  async getEventsSince(timestamp: string) {
    const { results } = await this.db.prepare(`
      SELECT * FROM system_events 
      WHERE created_at > ? 
      ORDER BY created_at ASC
    `).bind(timestamp).all();
    return results;
  }
}
