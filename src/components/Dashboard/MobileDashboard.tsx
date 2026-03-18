import React, { useState, useEffect } from 'react';
import { 
  DollarSign, Package, AlertTriangle, Clock, TrendingUp, 
  TrendingDown, Trash2, Warehouse, Filter, RefreshCw,
  AlertCircle, ArrowDownLeft, ArrowUpRight, ScanLine
} from 'lucide-react';
import { motion } from 'motion/react';

export default function MobileDashboard({ user, onTabChange }: { user: any, onTabChange: (tab: string) => void }) {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const res = await fetch('/api/reporting/dashboard-summary', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setSummary(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const QuickStat = ({ icon: Icon, label, value, color }: any) => (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-4">
      <div className={`p-3 rounded-xl bg-${color}-500/10 text-${color}-500`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{label}</p>
        <h3 className="text-lg font-bold text-white leading-tight">{value}</h3>
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-slate-500 text-xs">Warehouse Overview</p>
        </div>
        <button 
          onClick={fetchSummary}
          className="p-2 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <QuickStat icon={Package} label="Total Stock" value={summary?.totalQuantity?.toLocaleString()} color="blue" />
        <QuickStat icon={AlertTriangle} label="Low Stock" value={summary?.lowStockCount} color="amber" />
        <QuickStat icon={Clock} label="Near Expiry" value={summary?.nearExpiryCount} color="orange" />
        <QuickStat icon={Trash2} label="Wastage" value={`$${summary?.wastageValue?.toLocaleString()}`} color="rose" />
      </div>

      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
          <ScanLine size={16} className="text-emerald-500" />
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => onTabChange('grn')}
            className="flex flex-col items-center gap-2 p-4 bg-slate-800/50 rounded-2xl border border-slate-800 hover:bg-slate-800 transition-all"
          >
            <ArrowDownLeft size={24} className="text-emerald-500" />
            <span className="text-xs font-medium">Receive</span>
          </button>
          <button 
            onClick={() => onTabChange('issue')}
            className="flex flex-col items-center gap-2 p-4 bg-slate-800/50 rounded-2xl border border-slate-800 hover:bg-slate-800 transition-all"
          >
            <ArrowUpRight size={24} className="text-blue-500" />
            <span className="text-xs font-medium">Issue</span>
          </button>
        </div>
      </div>

      {/* Alerts Preview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-widest">Recent Alerts</h3>
          <button onClick={() => onTabChange('alerts')} className="text-emerald-500 text-xs font-medium">View All</button>
        </div>
        <div className="space-y-3">
          {summary?.lowStockCount > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center gap-4">
              <AlertTriangle size={20} className="text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-white">{summary.lowStockCount} Items Low on Stock</p>
                <p className="text-xs text-slate-400">Immediate reorder recommended</p>
              </div>
            </div>
          )}
          {summary?.nearExpiryCount > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl flex items-center gap-4">
              <Clock size={20} className="text-orange-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-white">{summary.nearExpiryCount} Batches Near Expiry</p>
                <p className="text-xs text-slate-400">Check expiry reports</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
