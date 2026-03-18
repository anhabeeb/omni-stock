/// <reference types="@cloudflare/workers-types" />
import { Attachment } from "../../src/types";

export class AttachmentService {
  constructor(private db: any, private bucket: any) {}

  private generateId() {
    return crypto.randomUUID();
  }

  async uploadAttachment(userId: string, entityType: string, entityId: string, file: File) {
    // Security: Validate file size (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      throw new Error("File size exceeds 5MB limit");
    }

    // Security: Validate file type
    const ALLOWED_TYPES = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'application/zip'
    ];
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error("File type not allowed");
    }

    const id = this.generateId();
    const now = new Date().toISOString();
    const key = `attachments/${entityType}/${entityId}/${id}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    // Upload to R2
    await this.bucket.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        uploadedBy: userId,
        entityType,
        entityId,
        originalName: file.name
      }
    });

    const fileUrl = `/api/attachments/download/${key}`;

    await this.db.prepare(`
      INSERT INTO attachments (id, entity_type, entity_id, file_url, file_name, file_type, file_size, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, entityType, entityId, fileUrl, file.name, file.type, file.size, userId, now).run();

    return { id, fileUrl };
  }

  async getAttachments(entityType: string, entityId: string) {
    const { results } = await this.db.prepare(`
      SELECT * FROM attachments 
      WHERE entity_type = ? AND entity_id = ? 
      ORDER BY created_at DESC
    `).bind(entityType, entityId).all();
    return results as Attachment[];
  }

  async deleteAttachment(id: string, userId: string) {
    const attachment = await this.db.prepare("SELECT * FROM attachments WHERE id = ?").bind(id).first() as Attachment;
    if (!attachment) throw new Error("Attachment not found");

    // Extract key from URL
    const key = attachment.file_url.replace('/api/attachments/download/', '');

    // Delete from R2
    await this.bucket.delete(key);

    // Delete from DB
    await this.db.prepare("DELETE FROM attachments WHERE id = ?").bind(id).run();
  }

  async getFile(key: string) {
    const object = await this.bucket.get(key);
    if (!object) return null;

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    return {
      body: object.body,
      headers
    };
  }
}
