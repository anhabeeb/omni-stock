/// <reference types="@cloudflare/workers-types" />

export class DiscrepancyService {
  constructor(private db: any) {}

  async getDiscrepancySummary(godownId?: string) {
    const whereClause = godownId ? `WHERE scs.godown_id = ?` : '';
    const params = godownId ? [godownId] : [];

    // 1. Total Variance Value (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const varianceValue = await this.db.prepare(`
      SELECT SUM(ABS(variance_value)) as total_variance, 
             SUM(CASE WHEN variance_quantity < 0 THEN ABS(variance_value) ELSE 0 END) as shrinkage_value,
             SUM(CASE WHEN variance_quantity > 0 THEN variance_value ELSE 0 END) as overage_value
      FROM stock_count_items sci
      JOIN stock_count_sessions scs ON sci.stock_count_session_id = scs.id
      WHERE scs.status = 'approved' AND scs.count_date >= ?
      ${godownId ? 'AND scs.godown_id = ?' : ''}
    `).bind(thirtyDaysAgo, ...params).first();

    // 2. High Variance Items
    const { results: highVarianceItems } = await this.db.prepare(`
      SELECT i.name as item_name, SUM(ABS(sci.variance_value)) as total_item_variance, 
             SUM(ABS(sci.variance_quantity)) as total_item_variance_qty
      FROM stock_count_items sci
      JOIN items i ON sci.item_id = i.id
      JOIN stock_count_sessions scs ON sci.stock_count_session_id = scs.id
      WHERE scs.status = 'approved' AND scs.count_date >= ?
      ${godownId ? 'AND scs.godown_id = ?' : ''}
      GROUP BY sci.item_id
      HAVING total_item_variance > 100 -- Threshold
      ORDER BY total_item_variance DESC
      LIMIT 10
    `).bind(thirtyDaysAgo, ...params).all();

    return {
      totalVariance: varianceValue?.total_variance || 0,
      shrinkageValue: varianceValue?.shrinkage_value || 0,
      overageValue: varianceValue?.overage_value || 0,
      highVarianceItems
    };
  }

  async getShrinkageTrends(period: 'month' | 'quarter' = 'month') {
    const days = period === 'month' ? 30 : 90;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { results } = await this.db.prepare(`
      SELECT strftime('%Y-%m-%d', scs.count_date) as date, 
             SUM(CASE WHEN sci.variance_quantity < 0 THEN ABS(sci.variance_value) ELSE 0 END) as shrinkage
      FROM stock_count_items sci
      JOIN stock_count_sessions scs ON sci.stock_count_session_id = scs.id
      WHERE scs.status = 'approved' AND scs.count_date >= ?
      GROUP BY date
      ORDER BY date ASC
    `).bind(startDate).all();

    return results;
  }
}
