import { IdService } from "./id";
import { OtpService } from "./otp";
import { EmailService } from "./email";

export class ResetService {
  private idService: IdService;
  private otpService: OtpService;

  constructor(private db: any) {
    this.idService = new IdService(db);
    this.otpService = new OtpService(db);
  }

  async requestOtp(userId: string, email: string) {
    const otp = await this.otpService.generateOtp(userId, email, 'system_reset');
    await EmailService.send(
      email,
      "Your OmniStock Verification Code",
      `<h1>Cafe Asiana OmniStock</h1>
       <p>Your verification code is: <strong>${otp}</strong></p>
       <p>This code expires in 10 minutes.</p>`
    );
  }

  async verifyOtp(email: string, otp: string) {
    return await this.otpService.verifyOtp(email, 'system_reset', otp);
  }

  async executeWipe() {
    const tables = [
      'role_permissions', 'user_permission_grants', 'user_permission_denials',
      'users', 'roles', 'permissions', 'settings', 'categories', 'units', 'items',
      'unit_conversions', 'suppliers', 'godowns', 'outlets', 'stock_batches',
      'stock_movements', 'inventory_balance_summary', 'goods_receipts',
      'goods_receipt_items', 'stock_issues', 'stock_issue_items',
      'stock_issue_batch_allocations', 'transfers', 'transfer_items',
      'transfer_batch_allocations', 'stock_adjustments', 'stock_adjustment_items',
      'stock_count_sessions', 'stock_count_items', 'wastage_records',
      'wastage_record_items', 'stock_requests', 'stock_request_items',
      'item_barcodes', 'batch_barcodes', 'sales_documents',
      'sales_document_items', 'smart_alerts', 'attachments', 'notifications',
      'system_bootstrap', 'user_onboarding', 'id_sequences', 'otp_requests'
    ];

    const statements = tables.map(table => this.db.prepare(`DELETE FROM ${table}`));
    await this.db.batch(statements);

    // Re-initialize system_bootstrap
    await this.db.prepare(`INSERT INTO system_bootstrap (id, is_initialized) VALUES (?, 0)`).bind(await this.idService.generateId('boot')).run();
  }
}
