import React, { useState, useEffect } from 'react';
import { Search, Package, Warehouse, AlertTriangle, Clock } from 'lucide-react';

const CurrentStock: React.FC = () => {
  const [stock, setStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchStock();
  }, []);

  const fetchStock = async () => {
    try {
      const response = await fetch('/api/stock/current', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      setStock(data);
    } catch (error) {
      console.error('Error fetching stock:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = stock.filter(s => 
    s.item_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.item_sku?.toLowerCase().includes(search.toLowerCase()) ||
    s.godown_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Current Stock Levels</h1>
          <p className="text-slate-400 mt-1">Real-time inventory visibility across all godowns</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center gap-4 bg-slate-900/50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Search by item name, SKU or godown..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Item Details</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Godown</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Batch Info</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Qty on Hand</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">Loading stock data...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">No stock found</td>
                </tr>
              ) : filtered.map((s, i) => (
                <tr key={i} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                        <Package size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{s.item_name}</p>
                        <p className="text-xs text-slate-500 font-mono uppercase">{s.item_sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-300 text-sm">
                      <Warehouse size={14} className="text-slate-500" />
                      {s.godown_name}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {s.batch_number ? (
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-emerald-500">#{s.batch_number}</span>
                        {s.expiry_date && (
                          <span className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Clock size={10} /> Exp: {new Date(s.expiry_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600 italic">No Batch</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-bold text-white">{s.quantity_on_hand.toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {s.quantity_on_hand <= 10 ? (
                      <span className="px-2 py-1 rounded-full bg-rose-500/10 text-rose-500 text-[10px] font-bold border border-rose-500/20 flex items-center gap-1 justify-center w-fit mx-auto">
                        <AlertTriangle size={10} /> LOW STOCK
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20 w-fit mx-auto block">
                        HEALTHY
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CurrentStock;
