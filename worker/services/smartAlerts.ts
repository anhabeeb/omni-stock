/// <reference types="@cloudflare/workers-types" />

export class SmartAlertsService {
  constructor(private db: D1Database) {}

  async getLowStockForecast(daysThreshold = 7) {
    // Calculate average daily issue rate for last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { results: usageRates } = await this.db.prepare(`
      SELECT item_id, SUM(base_quantity) / 30.0 as avg_daily_usage
      FROM stock_movements
      WHERE movement_type = 'issue_to_outlet' AND movement_date >= ?
      GROUP BY item_id
    `).bind(thirtyDaysAgo).all();

    const alerts = [];
    for (const rate of usageRates as any[]) {
      const currentStock = await this.db.prepare(`
        SELECT SUM(quantity_on_hand) as total_qty FROM inventory_balance_summary
        WHERE item_id = ?
      `).bind(rate.item_id).first() as any;

      const totalQty = currentStock?.total_qty || 0;
      const daysRemaining = rate.avg_daily_usage > 0 ? totalQty / rate.avg_daily_usage : Infinity;

      if (daysRemaining <= daysThreshold) {
        const item = await this.db.prepare("SELECT name FROM items WHERE id = ?").bind(rate.item_id).first() as any;
        const alertId = `low_stock_${rate.item_id}`;
        alerts.push({
          id: alertId,
          type: 'low_stock_forecast',
          severity: daysRemaining <= 2 ? 'critical' : 'high',
          affected_id: rate.item_id,
          affected_name: item?.name || 'Unknown',
          reason: `Stock predicted to run out in ${Math.round(daysRemaining)} days based on 30-day usage rate.`,
          supporting_data: { daysRemaining, avgDailyUsage: rate.avg_daily_usage, currentStock: totalQty },
          suggested_action: 'Place a purchase order immediately.',
          generated_at: new Date().toISOString()
        });
      }
    }
    return alerts;
  }

  async getExpiryRisk(daysThreshold = 30) {
    // Identify batches expiring soon where current usage rate suggests they won't be used in time
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const expiryThreshold = new Date(Date.now() + daysThreshold * 24 * 60 * 60 * 1000).toISOString();

    const { results: batches } = await this.db.prepare(`
      SELECT b.*, i.name as item_name, 
             (SELECT SUM(base_quantity) / 30.0 FROM stock_movements m 
              WHERE m.item_id = b.item_id AND m.movement_type = 'issue_to_outlet' AND m.movement_date >= ?) as avg_daily_usage
      FROM stock_batches b
      JOIN items i ON b.item_id = i.id
      WHERE b.expiry_date IS NOT NULL AND b.expiry_date <= ? AND b.current_quantity > 0
    `).bind(thirtyDaysAgo, expiryThreshold).all();

    const alerts = [];
    for (const batch of batches as any[]) {
      const daysToExpiry = (new Date(batch.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      const predictedUsage = (batch.avg_daily_usage || 0) * daysToExpiry;
      const riskQty = batch.current_quantity - predictedUsage;

      if (riskQty > 0) {
        const alertId = `expiry_risk_${batch.id}`;
        alerts.push({
          id: alertId,
          type: 'expiry_risk',
          severity: daysToExpiry <= 7 ? 'critical' : 'medium',
          affected_id: batch.item_id,
          affected_name: `${batch.item_name} (Batch: ${batch.batch_number})`,
          reason: `Predicted wastage of ${Math.round(riskQty)} units. Expiry in ${Math.round(daysToExpiry)} days, but usage rate is too low.`,
          supporting_data: { riskQty, daysToExpiry, currentQty: batch.current_quantity, avgDailyUsage: batch.avg_daily_usage },
          suggested_action: 'Prioritize issue of this batch or run a promotion.',
          generated_at: new Date().toISOString()
        });
      }
    }
    return alerts;
  }

  async getUnusualIssueVolume(thresholdPercent = 50) {
    // Compare last 7 days vs previous 30 days average
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { results: recentUsage } = await this.db.prepare(`
      SELECT item_id, SUM(base_quantity) / 7.0 as recent_daily_avg
      FROM stock_movements
      WHERE movement_type = 'issue_to_outlet' AND movement_date >= ?
      GROUP BY item_id
    `).bind(sevenDaysAgo).all();

    const alerts = [];
    for (const recent of recentUsage as any[]) {
      const historical = await this.db.prepare(`
        SELECT SUM(base_quantity) / 30.0 as hist_daily_avg
        FROM stock_movements
        WHERE movement_type = 'issue_to_outlet' AND movement_date >= ? AND movement_date < ?
        AND item_id = ?
      `).bind(thirtyDaysAgo, sevenDaysAgo, recent.item_id).first() as any;

      const histAvg = historical?.hist_daily_avg || 0;
      if (histAvg > 0 && recent.recent_daily_avg > histAvg * (1 + thresholdPercent / 100)) {
        const item = await this.db.prepare("SELECT name FROM items WHERE id = ?").bind(recent.item_id).first() as any;
        const alertId = `unusual_issue_${recent.item_id}`;
        alerts.push({
          id: alertId,
          type: 'unusual_issue',
          severity: 'medium',
          affected_id: recent.item_id,
          affected_name: item?.name || 'Unknown',
          reason: `Issue volume spiked by ${Math.round((recent.recent_daily_avg / histAvg - 1) * 100)}% compared to historical average.`,
          supporting_data: { recentAvg: recent.recent_daily_avg, histAvg },
          suggested_action: 'Verify outlet consumption and check for potential leakage.',
          generated_at: new Date().toISOString()
        });
      }
    }
    return alerts;
  }

  async getWastageAnomalies() {
    // Flag if wastage this month is > 20% higher than last month
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString();

    const thisMonth = await this.db.prepare(`
      SELECT SUM(total_cost) as total FROM wastage_record_items i
      JOIN wastage_records r ON i.wastage_record_id = r.id
      WHERE r.status = 'posted' AND r.wastage_date >= ?
    `).bind(thisMonthStart).first() as any;

    const lastMonth = await this.db.prepare(`
      SELECT SUM(total_cost) as total FROM wastage_record_items i
      JOIN wastage_records r ON i.wastage_record_id = r.id
      WHERE r.status = 'posted' AND r.wastage_date >= ? AND r.wastage_date < ?
    `).bind(lastMonthStart, thisMonthStart).first() as any;

    const current = thisMonth?.total || 0;
    const previous = lastMonth?.total || 0;

    if (previous > 0 && current > previous * 1.2) {
      const alertId = `high_wastage_${thisMonthStart.slice(0, 7)}`;
      return [{
        id: alertId,
        type: 'high_wastage',
        severity: 'high',
        affected_id: 'all',
        affected_name: 'Global Inventory',
        reason: `Wastage value this month ($${current.toLocaleString()}) is significantly higher than last month ($${previous.toLocaleString()}).`,
        supporting_data: { current, previous },
        suggested_action: 'Review wastage reasons and implement better storage practices.',
        generated_at: new Date().toISOString()
      }];
    }
    return [];
  }

  async getDeadStockAlerts(daysThreshold = 60) {
    const thresholdDate = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000).toISOString();
    
    // Items with stock but no movements since thresholdDate
    const { results: deadStock } = await this.db.prepare(`
      SELECT i.id, i.name, i.sku, SUM(s.quantity_on_hand) as total_qty
      FROM items i
      JOIN inventory_balance_summary s ON i.id = s.item_id
      WHERE s.quantity_on_hand > 0
      AND i.id NOT IN (
        SELECT DISTINCT item_id FROM stock_movements WHERE movement_date >= ?
      )
      GROUP BY i.id
    `).bind(thresholdDate).all();

    const alerts = [];
    for (const item of deadStock as any[]) {
      const alertId = `dead_stock_${item.id}`;
      alerts.push({
        id: alertId,
        type: 'dead_stock',
        severity: 'low',
        affected_id: item.id,
        affected_name: item.name,
        reason: `No movement recorded for ${daysThreshold} days. Current stock: ${item.total_qty} units.`,
        supporting_data: { totalQty: item.total_qty, daysThreshold },
        suggested_action: 'Consider liquidation or transfer to a higher-demand outlet.',
        generated_at: new Date().toISOString()
      });
    }
    return alerts;
  }

  async getAllAlerts(userId?: string) {
    const lowStock = await this.getLowStockForecast();
    const expiry = await this.getExpiryRisk();
    const unusual = await this.getUnusualIssueVolume();
    const wastage = await this.getWastageAnomalies();
    const deadStock = await this.getDeadStockAlerts();
    
    let all = [...lowStock, ...expiry, ...unusual, ...wastage, ...deadStock];

    if (userId) {
      const { results: acknowledged } = await this.db.prepare("SELECT alert_id FROM acknowledged_alerts WHERE user_id = ?").bind(userId).all();
      const ackIds = new Set(acknowledged.map((a: any) => a.alert_id));
      all = all.filter(a => !ackIds.has(a.id));
    }

    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return all.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  async acknowledgeAlert(alertId: string, userId: string) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.prepare(`
      INSERT OR IGNORE INTO acknowledged_alerts (id, alert_id, user_id, acknowledged_at)
      VALUES (?, ?, ?, ?)
    `).bind(id, alertId, userId, now).run();
  }
}
