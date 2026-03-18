import React, { useState, useEffect } from 'react';
import { 
  FileText, Download, Filter, Search, Calendar, 
  ChevronRight, ArrowUpRight, ArrowDownRight, RefreshCw,
  BarChart3, PieChart as PieChartIcon, Table as TableIcon,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type ReportType = 'stock' | 'movements' | 'valuation' | 'wastage' | 'expiry';

export default function Reports() {
  const [activeReport, setActiveReport] = useState<ReportType>('stock');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    godownId: '',
    categoryId: '',
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
    groupBy: 'item'
  });

  const fetchMasters = async () => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    const [gRes, cRes] = await Promise.all([
      fetch('/api/godowns', { headers }),
      fetch('/api/categories', { headers })
    ]);
    setGodowns(await gRes.json());
    setCategories(await cRes.json());
  };

  const fetchReport = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    const queryParams = new URLSearchParams(filters).toString();
    
    let endpoint = '';
    switch(activeReport) {
      case 'stock': endpoint = `/api/reports/current-stock?${queryParams}`; break;
      case 'movements': endpoint = `/api/reports/movements?${queryParams}`; break;
      case 'valuation': endpoint = `/api/reports/valuation?${queryParams}`; break;
      case 'wastage': endpoint = `/api/wastage`; break; // Simple list for now
      case 'expiry': endpoint = `/api/inventory/expiry-alerts?days=30`; break;
    }

    try {
      const res = await fetch(endpoint, { headers });
      setData(await res.json());
    } catch (error) {
      console.error("Report fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMasters();
  }, []);

  useEffect(() => {
    fetchReport();
  }, [activeReport, filters.godownId, filters.categoryId, filters.groupBy]);

  const exportToCSV = () => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => 
      Object.values(row).map(val => `"${val}"`).join(',')
    ).join('\n');
    const csvContent = `data:text/csv;charset=utf-8,${headers}\n${rows}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${activeReport}_report_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Advanced Reporting</h2>
          <p className="text-slate-400 text-sm mt-1">Generate and export detailed warehouse insights.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={fetchReport}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 border border-slate-800 transition-colors"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
          <button 
            onClick={exportToCSV}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
          >
            <Download size={18} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="flex gap-2 p-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-x-auto custom-scrollbar">
        {[
          { id: 'stock', label: 'Current Stock', icon: TableIcon },
          { id: 'movements', label: 'Movements', icon: RefreshCw },
          { id: 'valuation', label: 'Valuation', icon: BarChart3 },
          { id: 'wastage', label: 'Wastage', icon: PieChartIcon },
          { id: 'expiry', label: 'Expiry', icon: Clock }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveReport(tab.id as ReportType)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              activeReport === tab.id 
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" 
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900 border border-slate-800 p-4 rounded-3xl">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Godown</label>
          <select 
            value={filters.godownId}
            onChange={(e) => setFilters({...filters, godownId: e.target.value})}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Godowns</option>
            {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Category</label>
          <select 
            value={filters.categoryId}
            onChange={(e) => setFilters({...filters, categoryId: e.target.value})}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {activeReport === 'movements' && (
          <>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">From</label>
              <input 
                type="date"
                value={filters.from}
                onChange={(e) => setFilters({...filters, from: e.target.value})}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">To</label>
              <input 
                type="date"
                value={filters.to}
                onChange={(e) => setFilters({...filters, to: e.target.value})}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </>
        )}
        {activeReport === 'valuation' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Group By</label>
            <select 
              value={filters.groupBy}
              onChange={(e) => setFilters({...filters, groupBy: e.target.value})}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="item">Item</option>
              <option value="godown">Godown</option>
              <option value="category">Category</option>
            </select>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50">
                {activeReport === 'stock' && (
                  <>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Item</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Godown</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Qty</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Value</th>
                  </>
                )}
                {activeReport === 'movements' && (
                  <>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Item</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Godown</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Qty</th>
                  </>
                )}
                {activeReport === 'valuation' && (
                  <>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Group</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Total Value</th>
                  </>
                )}
                {activeReport === 'wastage' && (
                  <>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Number</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Godown</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Reason</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  </>
                )}
                {activeReport === 'expiry' && (
                  <>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Item</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Batch</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Expiry</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Qty</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <AnimatePresence mode="wait">
                {loading ? (
                  [1,2,3,4,5].map(i => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={6} className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-full" /></td>
                    </tr>
                  ))
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">No data found for the selected filters.</td>
                  </tr>
                ) : data.map((row, i) => (
                  <motion.tr 
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    {activeReport === 'stock' && (
                      <>
                        <td className="px-6 py-4 text-sm text-white font-medium">{row.item_name} <span className="text-slate-500 text-xs ml-1">{row.item_sku}</span></td>
                        <td className="px-6 py-4 text-sm text-slate-400">{row.godown_name}</td>
                        <td className="px-6 py-4 text-sm text-slate-400">{row.category_name}</td>
                        <td className="px-6 py-4 text-sm text-white text-right font-mono">{row.quantity_on_hand}</td>
                        <td className="px-6 py-4 text-sm text-emerald-400 text-right font-mono">${(row.quantity_on_hand * row.average_unit_cost).toLocaleString()}</td>
                      </>
                    )}
                    {activeReport === 'movements' && (
                      <>
                        <td className="px-6 py-4 text-sm text-slate-400">{new Date(row.movement_date).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            row.base_quantity > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                          }`}>
                            {row.movement_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-white font-medium">{row.item_name}</td>
                        <td className="px-6 py-4 text-sm text-slate-400">{row.godown_name}</td>
                        <td className={`px-6 py-4 text-sm text-right font-mono font-bold ${row.base_quantity > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {row.base_quantity > 0 ? `+${row.base_quantity}` : row.base_quantity}
                        </td>
                      </>
                    )}
                    {activeReport === 'valuation' && (
                      <>
                        <td className="px-6 py-4 text-sm text-white font-medium">{row.group_name}</td>
                        <td className="px-6 py-4 text-sm text-emerald-400 text-right font-mono font-bold">${row.total_value.toLocaleString()}</td>
                      </>
                    )}
                    {activeReport === 'wastage' && (
                      <>
                        <td className="px-6 py-4 text-sm text-slate-400">{new Date(row.wastage_date).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm text-white font-medium">{row.wastage_number}</td>
                        <td className="px-6 py-4 text-sm text-slate-400">{row.godown_name}</td>
                        <td className="px-6 py-4 text-sm text-slate-400">{row.reason}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            row.status === 'posted' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </>
                    )}
                    {activeReport === 'expiry' && (
                      <>
                        <td className="px-6 py-4 text-sm text-white font-medium">{row.item_name}</td>
                        <td className="px-6 py-4 text-sm text-slate-400 font-mono">{row.batch_number}</td>
                        <td className="px-6 py-4 text-sm text-rose-400 font-medium">{new Date(row.expiry_date).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm text-white text-right font-mono">{row.current_quantity}</td>
                      </>
                    )}
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
