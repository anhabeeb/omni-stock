/// <reference types="@cloudflare/workers-types" />

export class FinanceService {
  constructor(private db: D1Database) {}

  async getFinanceSummary(filters: { from?: string; to?: string; outletId?: string }) {
    const { from, to, outletId } = filters;

    let salesWhere = "WHERE status = 'posted'";
    const salesParams: any[] = [];
    if (from) { salesWhere += " AND sale_date >= ?"; salesParams.push(from); }
    if (to) { salesWhere += " AND sale_date <= ?"; salesParams.push(to); }
    if (outletId) { salesWhere += " AND outlet_id = ?"; salesParams.push(outletId); }

    // Total Sales Revenue
    const revenueRes = await this.db.prepare(`
      SELECT SUM(total_sales_value) as total FROM sales_documents
      ${salesWhere}
    `).bind(...salesParams).first() as any;
    const revenue = revenueRes?.total || 0;

    // COGS (Interim: issues to outlet in period)
    let cogsWhere = "WHERE movement_type = 'issue_to_outlet'";
    const cogsParams: any[] = [];
    if (from) { cogsWhere += " AND movement_date >= ?"; cogsParams.push(from); }
    if (to) { cogsWhere += " AND movement_date <= ?"; cogsParams.push(to); }
    if (outletId) { cogsWhere += " AND destination_outlet_id = ?"; cogsParams.push(outletId); }

    const cogsRes = await this.db.prepare(`
      SELECT SUM(total_value) as total FROM stock_movements
      ${cogsWhere}
    `).bind(...cogsParams).first() as any;
    const cogs = cogsRes?.total || 0;

    // Wastage Loss
    let wastageWhere = "WHERE movement_type = 'wastage'";
    const wastageParams: any[] = [];
    if (from) { wastageWhere += " AND movement_date >= ?"; wastageParams.push(from); }
    if (to) { wastageWhere += " AND movement_date <= ?"; wastageParams.push(to); }
    if (outletId) { wastageWhere += " AND outlet_id = ?"; wastageParams.push(outletId); }

    const wastageRes = await this.db.prepare(`
      SELECT SUM(total_value) as total FROM stock_movements
      ${wastageWhere}
    `).bind(...wastageParams).first() as any;
    const wastageLoss = wastageRes?.total || 0;

    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - wastageLoss;
    const marginPercentage = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    return {
      revenue,
      cogs,
      wastageLoss,
      grossProfit,
      netProfit,
      marginPercentage,
      period: `${from || 'Start'} to ${to || 'Now'}`
    };
  }

  async getOutletMarginReport(from?: string, to?: string) {
    // Get all outlets and their respective revenue and COGS
    const outlets = await this.db.prepare("SELECT id, name FROM outlets WHERE is_active = 1").all();
    const report = [];

    for (const outlet of outlets.results as any[]) {
      const summary = await this.getFinanceSummary({ from, to, outletId: outlet.id });
      report.push({
        outletId: outlet.id,
        outletName: outlet.name,
        ...summary
      });
    }

    return report;
  }

  async getSalesTrend(from?: string, to?: string) {
    let where = "WHERE status = 'posted'";
    const params: any[] = [];
    if (from) { where += " AND sale_date >= ?"; params.push(from); }
    if (to) { where += " AND sale_date <= ?"; params.push(to); }

    const { results } = await this.db.prepare(`
      SELECT sale_date as date, SUM(total_sales_value) as revenue
      FROM sales_documents
      ${where}
      GROUP BY sale_date
      ORDER BY sale_date ASC
    `).bind(...params).all();

    return results;
  }
}
