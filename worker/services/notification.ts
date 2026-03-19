/// <reference types="@cloudflare/workers-types" />
import { IdService } from "./id";
import { Notification } from "../../src/types";

export class NotificationService {
  private idService: IdService;

  constructor(private db: any) {
    this.idService = new IdService(db);
  }

  private async generateId() {
    return await this.idService.generateId('ntf');
  }

  async createNotification(userId: string, type: string, severity: string, message: string, relatedEntityType?: string, relatedEntityId?: string) {
    const id = await this.generateId();
    const now = new Date().toISOString();

    await this.db.prepare(`
      INSERT INTO notifications (id, user_id, type, severity, message, related_entity_type, related_entity_id, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).bind(id, userId, type, severity, message, relatedEntityType || null, relatedEntityId || null, now).run();

    return id;
  }

  async getUnreadNotifications(userId: string) {
    const { results } = await this.db.prepare(`
      SELECT * FROM notifications 
      WHERE user_id = ? AND is_read = 0 
      ORDER BY created_at DESC
    `).bind(userId).all();
    return results as Notification[];
  }

  async markAsRead(id: string, userId: string) {
    await this.db.prepare(`
      UPDATE notifications SET is_read = 1 
      WHERE id = ? AND user_id = ?
    `).bind(id, userId).run();
  }

  async markAllAsRead(userId: string) {
    await this.db.prepare(`
      UPDATE notifications SET is_read = 1 
      WHERE user_id = ?
    `).bind(userId).run();
  }

  async broadcastToAdmins(type: string, severity: string, message: string, relatedEntityType?: string, relatedEntityId?: string) {
    const { results: admins } = await this.db.prepare(`
      SELECT u.id FROM users u 
      JOIN roles r ON u.role_id = r.id 
      WHERE r.name = 'Admin' OR r.name = 'Warehouse Manager'
    `).all();

    const statements = [];
    for (const admin of admins as any[]) {
      const id = await this.generateId();
      const now = new Date().toISOString();
      statements.push(this.db.prepare(`
        INSERT INTO notifications (id, user_id, type, severity, message, related_entity_type, related_entity_id, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).bind(id, admin.id, type, severity, message, relatedEntityType || null, relatedEntityId || null, now));
    }

    if (statements.length > 0) {
      await this.db.batch(statements);
    }
  }
}
