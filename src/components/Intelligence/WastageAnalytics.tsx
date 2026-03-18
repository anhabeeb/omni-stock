import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  TrendingDown, 
  Repeat, 
  DollarSign,
  ChevronRight,
  Filter,
  Download
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

interface WastageAnalyticsData {
  totalWastage: number;
  recordCount: number;
  byReason: { reason: string; total_value: number; count: number }[];
  highValueAlerts: { wastage_number: string; wastage_date: string; total_value: number; reason: string }[];
  recurringWastage: { item_name: string; wastage_frequency: number; total_loss: number }[];
}

export const WastageAnalytics: React.FC = () => {
  const [data, setData] = useState<WastageAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/wastage/analytics');
      if (res.ok) setData(await res.json());
    } catch (error) {
      console.error('Error fetching wastage analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading Wastage Analytics...</div>;

  const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wastage & Spoilage Control</h1>
          <p className="text-sm text-gray-500">Loss prevention and operational efficiency analytics</p>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-red-50 p-2 rounded-lg">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Total Loss (30d)</p>
              <h3 className="text-2xl font-bold text-gray-900">₹{data?.totalWastage.toLocaleString()}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-orange-50 p-2 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Wastage Incidents</p>
              <h3 className="text-2xl font-bold text-gray-900">{data?.recordCount}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-blue-50 p-2 rounded-lg">
              <Repeat className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Recurring Issues</p>
              <h3 className="text-2xl font-bold text-gray-900">{data?.recurringWastage.length} Items</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Wastage by Reason */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Wastage by Reason</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.byReason}
                  dataKey="total_value"
                  nameKey="reason"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {data?.byReason.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                   formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Value']}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recurring Wastage */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Recurring Wastage (High Frequency)</h3>
          <div className="space-y-4">
            {data?.recurringWastage.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="bg-white p-2 rounded border border-gray-200">
                    <Repeat className="w-4 h-4 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{item.item_name}</p>
                    <p className="text-xs text-gray-500">{item.wastage_frequency} incidents in 30 days</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-600">₹{item.total_loss.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">Total Loss</p>
                </div>
              </div>
            ))}
            {data?.recurringWastage.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                No recurring wastage patterns detected.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* High Value Alerts */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">High-Value Wastage Alerts</h3>
          <p className="text-sm text-gray-500">Individual incidents exceeding ₹500 threshold</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-medium">
              <tr>
                <th className="px-6 py-3">Wastage #</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Reason</th>
                <th className="px-6 py-3 text-right">Loss Value</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {data?.highValueAlerts.map((alert, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{alert.wastage_number}</td>
                  <td className="px-6 py-4 text-gray-500">{new Date(alert.wastage_date).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-orange-50 text-orange-600 rounded-full text-xs font-medium">
                      {alert.reason}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-red-600">₹{alert.total_value.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-blue-600 hover:text-blue-800 font-medium">Investigate</button>
                  </td>
                </tr>
              ))}
              {data?.highValueAlerts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                    No high-value wastage incidents detected.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
