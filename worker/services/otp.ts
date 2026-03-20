/// <reference types="@cloudflare/workers-types" />
import { IdService } from "./id";

export class OtpService {
  private idService: IdService;

  constructor(private db: any) {
    this.idService = new IdService(db);
  }

  async createOtpTable() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS otp_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        email TEXT NOT NULL,
        purpose TEXT NOT NULL,
        otp_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        attempt_count INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 5,
        is_used INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `).run();
  }

  async generateOtp(userId: string, email: string, purpose: string) {
    await this.createOtpTable();
    
    // Check cooldown
    const { results } = await this.db.prepare(`
      SELECT created_at FROM otp_requests
      WHERE email = ? AND purpose = ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(email, purpose).all();
    
    if (results.length > 0) {
      const lastRequest = results[0] as any;
      if (Date.now() - lastRequest.created_at < 60000) {
        throw new Error("Please wait 60 seconds before requesting another OTP.");
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await this.hashOtp(otp);
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const id = await this.idService.generateId('otp');

    await this.db.prepare(`
      INSERT INTO otp_requests (id, user_id, email, purpose, otp_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, userId, email, purpose, hashedOtp, expiresAt, Date.now()).run();

    return otp;
  }

  async verifyOtp(email: string, purpose: string, otp: string) {
    const { results } = await this.db.prepare(`
      SELECT * FROM otp_requests
      WHERE email = ? AND purpose = ? AND is_used = 0 AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(email, purpose, Date.now()).all();

    if (results.length === 0) throw new Error("OTP expired or invalid.");

    const record = results[0] as any;
    if (record.attempt_count >= record.max_attempts) throw new Error("Too many attempts.");

    const hashedOtp = await this.hashOtp(otp);
    if (record.otp_hash !== hashedOtp) {
      await this.db.prepare(`UPDATE otp_requests SET attempt_count = attempt_count + 1 WHERE id = ?`).bind(record.id).run();
      throw new Error("Invalid OTP.");
    }

    await this.db.prepare(`UPDATE otp_requests SET is_used = 1 WHERE id = ?`).bind(record.id).run();
    return true;
  }

  private async hashOtp(otp: string) {
    const msgUint8 = new TextEncoder().encode(otp);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
