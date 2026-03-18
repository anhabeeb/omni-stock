import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, Clock, Package, Trash2, 
  ChevronRight, Filter, RefreshCw, AlertCircle,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Alerts() {
  const [alerts, setAlerts] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [selectedGodown, setSelectedGodown] = useState('');

  const fetchAlerts = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/alerts/summary?godownId=${selectedGodown}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setAlerts(await res.json());
    setLoading(false);
  };

  const fetchGodowns = async () => {
    const res = await fetch('/api/godowns', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    setGodowns(await res.json());
  };

  useEffect(() => {
    fetchAlerts();
    fetchGodowns();
  }, [selectedGodown]);

  const AlertSection = ({ title, icon: Icon, data, color, emptyMsg }: any) => (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
      <div className={`px-6 py-4 border-b border-slate-800 bg-${color}-500/5 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl bg-${color}-500/10 text-${color}-500`}>
            <Icon size={20} />
          </div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold bg-${color}-500/10 text-${color}-500`}>
          {data?.length || 0} Issues
        </span>
      </div>
      <div className="divide-y divide-slate-800">
        {data?.length === 0 ? (
          <div className="p-8 text-center text-slate-500 font-medium">{emptyMsg}</div>
        ) : data?.map((item: any, i: number) => (
          <div key={i} className="p-6 hover:bg-slate-800/30 transition-colors flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 group-hover:scale-110 transition-transform">
                <Package size={20} />
              </div>
              <div>
                <p className="font-bold text-white">{item.item_name || item.name}</p>
                <p className="text-xs text-slate-500 uppercase tracking-wider">
                  {item.godown_name} {item.batch_number ? `• Batch: ${item.batch_number}` : ''}
                </p>
              </div>
            </div>
            <div className="text-right">
              {item.reorder_level && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase tracking-widest">Current / Reorder</p>
                  <p className="text-rose-400 font-bold font-mono">{item.total_qty} / {item.reorder_level}</p>
                </div>
              )}
              {item.expiry_date && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase tracking-widest">Expiry Date</p>
                  <p className="text-rose-400 font-bold font-mono">{new Date(item.expiry_date).toLocaleDateString()}</p>
                </div>
              )}
              {item.quantity_on_hand && !item.reorder_level && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase tracking-widest">Dead Stock Qty</p>
                  <p className="text-amber-400 font-bold font-mono">{item.quantity_on_hand}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">System Alerts & Monitoring</h2>
          <p className="text-slate-400 text-sm mt-1">Real-time monitoring of stock levels, expiry, and dead stock.</p>
        </div>
        <div className="flex gap-4">
          <select 
            value={selectedGodown}
            onChange={(e) => setSelectedGodown(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Godowns</option>
            {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button 
            onClick={fetchAlerts}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 border border-slate-800"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <AlertSection 
          title="Low Stock Alerts" 
          icon={AlertTriangle} 
          data={alerts?.lowStock} 
          color="rose" 
          emptyMsg="All items are above reorder levels."
        />
        <AlertSection 
          title="Expiry Alerts (30 Days)" 
          icon={Clock} 
          data={alerts?.nearExpiry} 
          color="amber" 
          emptyMsg="No items expiring in the next 30 days."
        />
        <AlertSection 
          title="Expired Stock" 
          icon={AlertCircle} 
          data={alerts?.expired} 
          color="rose" 
          emptyMsg="No expired stock found."
        />
        <AlertSection 
          title="Dead Stock (90 Days)" 
          icon={Trash2} 
          data={alerts?.deadStock} 
          color="slate" 
          emptyMsg="No dead stock identified."
        />
      </div>
    </div>
  );
}
