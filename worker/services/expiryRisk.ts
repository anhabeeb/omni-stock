/// <reference types="@cloudflare/workers-types" />

export class ExpiryRiskService {
  constructor(private db: any) {}

  async getExpiryRiskSummary(godownId?: string) {
    const whereClause = godownId ? `WHERE godown_id = ?` : '';
    const params = godownId ? [godownId] : [];

    // 1. Risk Scoring (Simplified)
    // High Risk: Expiry in < 30 days
    // Medium Risk: Expiry in 30-90 days
    // Low Risk: Expiry in 90-180 days

    const now = new Date().toISOString();
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const oneEightyDays = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

    const riskCounts = await this.db.prepare(`
      SELECT 
        SUM(CASE WHEN expiry_date <= ? THEN 1 ELSE 0 END) as high_risk_count,
        SUM(CASE WHEN expiry_date > ? AND expiry_date <= ? THEN 1 ELSE 0 END) as medium_risk_count,
        SUM(CASE WHEN expiry_date > ? AND expiry_date <= ? THEN 1 ELSE 0 END) as low_risk_count,
        SUM(CASE WHEN expiry_date <= ? THEN current_quantity * initial_cost ELSE 0 END) as high_risk_value,
        SUM(CASE WHEN expiry_date > ? AND expiry_date <= ? THEN current_quantity * initial_cost ELSE 0 END) as medium_risk_value,
        SUM(CASE WHEN expiry_date > ? AND expiry_date <= ? THEN current_quantity * initial_cost ELSE 0 END) as low_risk_value
      FROM stock_batches 
      WHERE status = 'active' AND current_quantity > 0 AND expiry_date IS NOT NULL
      ${godownId ? 'AND godown_id = ?' : ''}
    `).bind(thirtyDays, thirtyDays, ninetyDays, ninetyDays, oneEightyDays, thirtyDays, thirtyDays, ninetyDays, ninetyDays, oneEightyDays, ...params).first();

    // 2. Top At-Risk Items
    const { results: topAtRiskItems } = await this.db.prepare(`
      SELECT i.name as item_name, sb.batch_number, sb.expiry_date, sb.current_quantity, sb.initial_cost, (sb.current_quantity * sb.initial_cost) as total_value
      FROM stock_batches sb
      JOIN items i ON sb.item_id = i.id
      WHERE sb.status = 'active' AND sb.current_quantity > 0 AND sb.expiry_date IS NOT NULL AND sb.expiry_date <= ?
      ${godownId ? 'AND sb.godown_id = ?' : ''}
      ORDER BY sb.expiry_date ASC
      LIMIT 10
    `).bind(ninetyDays, ...params).all();

    return {
      highRiskCount: riskCounts?.high_risk_count || 0,
      mediumRiskCount: riskCounts?.medium_risk_count || 0,
      lowRiskCount: riskCounts?.low_risk_count || 0,
      highRiskValue: riskCounts?.high_risk_value || 0,
      mediumRiskValue: riskCounts?.medium_risk_value || 0,
      lowRiskValue: riskCounts?.low_risk_value || 0,
      topAtRiskItems
    };
  }

  async getPreventionRecommendations(godownId?: string) {
    // Suggest items to be issued or transferred based on expiry
    const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    
    const { results } = await this.db.prepare(`
      SELECT i.name as item_name, sb.batch_number, sb.expiry_date, sb.current_quantity, g.name as godown_name,
             'Prioritize for Issue' as recommendation
      FROM stock_batches sb
      JOIN items i ON sb.item_id = i.id
      JOIN godowns g ON sb.godown_id = g.id
      WHERE sb.status = 'active' AND sb.current_quantity > 0 AND sb.expiry_date IS NOT NULL AND sb.expiry_date <= ?
      ${godownId ? 'AND sb.godown_id = ?' : ''}
      ORDER BY sb.expiry_date ASC
      LIMIT 10
    `).bind(ninetyDays, ...(godownId ? [godownId] : [])).all();

    return results;
  }
}
