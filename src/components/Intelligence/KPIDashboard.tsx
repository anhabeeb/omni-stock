import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  Package, 
  Clock, 
  ArrowRight,
  BarChart3,
  PieChart as PieChartIcon,
  Activity
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
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';

interface KPISummary {
  totalInventoryValue: number;
  wastageValue30d: number;
  expiryRiskValue30d: number;
  avgDispatchDays: number;
}

interface TurnoverData {
  cogs: number;
  inventoryValue: number;
  turnoverRatio: number;
  period: string;
}

export const KPIDashboard: React.FC = () => {
  const [summary, setSummary] = useState<KPISummary | null>(null);
  const [turnover, setTurnover] = useState<TurnoverData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [summaryRes, turnoverRes] = await Promise.all([
        fetch('/api/kpi/summary'),
        fetch('/api/kpi/turnover')
      ]);
      
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (turnoverRes.ok) setTurnover(await turnoverRes.json());
    } catch (error) {
      console.error('Error fetching KPI data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading Intelligence Dashboard...</div>;

  const stats = [
    {
      label: 'Total Inventory Value',
      value: `₹${summary?.totalInventoryValue.toLocaleString()}`,
      icon: Package,
      color: 'text-blue-600',
      bg: 'bg-blue-50'
    },
    {
      label: 'Wastage (30d)',
      value: `₹${summary?.wastageValue30d.toLocaleString()}`,
      icon: AlertTriangle,
      color: 'text-orange-600',
      bg: 'bg-orange-50'
    },
    {
      label: 'Expiry Risk (30d)',
      value: `₹${summary?.expiryRiskValue30d.toLocaleString()}`,
      icon: Clock,
      color: 'text-red-600',
      bg: 'bg-red-50'
    },
    {
      label: 'Avg. Dispatch Time',
      value: `${summary?.avgDispatchDays.toFixed(1)} Days`,
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50'
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Warehouse Intelligence</h1>
        <button 
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium"
        >
          <Activity className="w-4 h-4" />
          Refresh Data
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className={`${stat.bg} p-2 rounded-lg`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
              <h3 className="text-2xl font-bold text-gray-900">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock Turnover Chart */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900">Stock Turnover Analysis</h3>
            <div className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-600 rounded">
              Ratio: {turnover?.turnoverRatio.toFixed(2)}x
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'COGS', value: turnover?.cogs },
                { name: 'Avg Inventory', value: turnover?.inventoryValue }
              ]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(value: number) => [`₹${value.toLocaleString()}`, '']}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  <Cell fill="#3b82f6" />
                  <Cell fill="#94a3b8" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-4 text-xs text-gray-500 italic">
            * A higher turnover ratio indicates efficient inventory management and strong sales.
          </p>
        </div>

        {/* Dispatch Performance */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Dispatch Performance Trend</h3>
          <div className="h-64 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Historical trend data will appear as more dispatches are completed.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
