/// <reference types="@cloudflare/workers-types" />

export interface Settings {
  id: number;
  system_name: string;
  company_name: string;
  default_currency: string;
  currency_symbol: string;
  currency_position: string;
  decimal_places: number;
  date_format: string;
  timezone: string;
  allow_negative_stock: number;
  default_fefo_behavior: number;
  expiry_warning_threshold_days: number;
  low_stock_threshold_percent: number;
  stock_count_approval_required: number;
  wastage_approval_required: number;
  dark_mode_enabled: number;
  light_mode_enabled: number;
  default_theme: string;
  user_theme_override_allowed: number;
  notification_threshold_high: number;
  enable_expiry_alerts: number;
  enable_low_stock_alerts: number;
  enable_wastage_alerts: number;
  updated_at: string;
}

export class SettingsService {
  constructor(private db: any) {}

  async getSettings(): Promise<Settings | null> {
    try {
      const settings = await this.db.prepare("SELECT * FROM settings WHERE id = 1").first() as Settings;
      return settings || null;
    } catch (e) {
      console.error("Failed to fetch settings:", e);
      return null;
    }
  }

  async updateSettings(settings: Partial<Settings>): Promise<void> {
    const keys = Object.keys(settings).filter(k => k !== 'id' && k !== 'updated_at');
    if (keys.length === 0) return;

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => settings[k as keyof Settings]);

    await this.db.prepare(`
      UPDATE settings 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = 1
    `).bind(...values).run();
  }

  async getPublicSettings(): Promise<Partial<Settings>> {
    const settings = await this.getSettings();
    if (!settings) {
      return {
        system_name: 'OmniStock',
        default_theme: 'dark',
        dark_mode_enabled: 1,
        light_mode_enabled: 1
      };
    }
    return {
      system_name: settings.system_name,
      company_name: settings.company_name,
      default_currency: settings.default_currency,
      currency_symbol: settings.currency_symbol,
      currency_position: settings.currency_position,
      decimal_places: settings.decimal_places,
      date_format: settings.date_format,
      default_theme: settings.default_theme,
      dark_mode_enabled: settings.dark_mode_enabled,
      light_mode_enabled: settings.light_mode_enabled,
      user_theme_override_allowed: settings.user_theme_override_allowed
    };
  }
}
