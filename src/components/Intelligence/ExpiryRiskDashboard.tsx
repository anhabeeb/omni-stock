import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  AlertCircle, 
  ShieldCheck, 
  ChevronRight,
  Filter,
  Download,
  ArrowRight
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  Legend
} from 'recharts';

interface ExpiryRiskData {
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  highRiskValue: number;
  mediumRiskValue: number;
  lowRiskValue: number;
  topAtRiskItems: { item_name: string; batch_number: string; expiry_date: string; current_quantity: number; initial_cost: number; total_value: number }[];
}

export const ExpiryRiskDashboard: React.FC = () => {
  const [data, setData] = useState<ExpiryRiskData | null>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [riskRes, recRes] = await Promise.all([
        fetch('/api/expiry/risk'),
        fetch('/api/expiry/recommendations')
      ]);
      
      if (riskRes.ok) setData(await riskRes.json());
      if (recRes.ok) setRecommendations(await recRes.json());
    } catch (error) {
      console.error('Error fetching expiry risk analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading Expiry Risk Dashboard...</div>;

  const riskStats = [
    { label: 'High Risk (<30d)', count: data?.highRiskCount, value: data?.highRiskValue, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Medium Risk (30-90d)', count: data?.mediumRiskCount, value: data?.mediumRiskValue, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Low Risk (90-180d)', count: data?.lowRiskCount, value: data?.lowRiskValue, color: 'text-blue-600', bg: 'bg-blue-50' }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expiry Risk Forecasting</h1>
          <p className="text-sm text-gray-500">Predictive analysis and prevention recommendations</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium">
            <Filter className="w-4 h-4" />
            Filter
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {/* Risk Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {riskStats.map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className={`${stat.bg} p-2 rounded-lg`}>
                <Clock className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
                <h3 className="text-2xl font-bold text-gray-900">₹{stat.value?.toLocaleString()}</h3>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">{stat.count} Batches at risk</span>
              <span className={`font-medium ${stat.color}`}>
                {((stat.value || 0) / ( (data?.highRiskValue || 0) + (data?.mediumRiskValue || 0) + (data?.lowRiskValue || 0) || 1 ) * 100).toFixed(1)}% of total risk
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top At-Risk Items */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Top At-Risk Batches</h3>
          <div className="space-y-4">
            {data?.topAtRiskItems.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="bg-white p-2 rounded border border-gray-200">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{item.item_name}</p>
                    <p className="text-xs text-gray-500">Batch: {item.batch_number} | Exp: {new Date(item.expiry_date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-600">₹{item.total_value.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">Qty: {item.current_quantity}</p>
                </div>
              </div>
            ))}
            {data?.topAtRiskItems.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                No batches at immediate risk of expiry.
              </div>
            )}
          </div>
        </div>

        {/* Prevention Recommendations */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Prevention Recommendations</h3>
          <div className="space-y-4">
            {recommendations.map((rec, idx) => (
              <div key={idx} className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-bold text-emerald-900">{rec.recommendation}</span>
                  </div>
                  <span className="text-xs font-medium text-emerald-600 bg-white px-2 py-1 rounded border border-emerald-100">
                    Priority: High
                  </span>
                </div>
                <p className="text-sm text-emerald-800 mb-3">
                  Item <span className="font-bold">{rec.item_name}</span> in <span className="font-bold">{rec.godown_name}</span> is expiring on {new Date(rec.expiry_date).toLocaleDateString()}.
                </p>
                <div className="flex gap-2">
                  <button className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700">
                    Create Issue <ArrowRight className="w-3 h-3" />
                  </button>
                  <button className="flex items-center gap-1 px-3 py-1.5 bg-white text-emerald-600 border border-emerald-200 text-xs font-medium rounded hover:bg-emerald-50">
                    Transfer Stock
                  </button>
                </div>
              </div>
            ))}
            {recommendations.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                No immediate prevention actions required.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
