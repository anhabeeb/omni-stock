import React, { useState } from 'react';
import { Search, Calendar } from 'lucide-react';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';

const BatchStock: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: stock = [], isLoading } = useQuery<any[]>({
    queryKey: ['inventory', 'current-stock'],
    queryFn: async () => {
      const res = await fetch('/api/inventory/current-stock', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch stock');
      return res.json();
    },
    staleTime: 60000, // 60 seconds
  });

  const filteredStock = stock.filter((s: any) => 
    s.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.batch_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Current Stock by Batch</h1>
          <p className="text-slate-400 mt-1">Real-time inventory levels across all godowns</p>
        </div>
        
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input 
            type="text"
            placeholder="Search items or batches..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-2xl pl-12 pr-6 py-3 text-white w-full md:w-80 focus:ring-2 focus:ring-emerald-500 transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Item / SKU</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Godown</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Batch #</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Expiry</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">On Hand</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Reserved</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Avg Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">Loading inventory data...</td></tr>
              ) : filteredStock.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">No stock found matching your search.</td></tr>
              ) : filteredStock.map((s: any, idx: number) => (
                <motion.tr 
                  key={idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className="hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="font-bold text-white">{s.item_name}</div>
                    <div className="text-xs text-slate-500">{s.item_sku}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-300">{s.godown_name}</td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-800 px-2 py-1 rounded text-xs font-mono text-emerald-400">
                      {s.batch_number || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center text-slate-300">
                      <Calendar className="w-4 h-4 mr-2 text-slate-500" />
                      {s.expiry_date ? new Date(s.expiry_date).toLocaleDateString() : 'No Expiry'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-lg font-bold text-white">{s.quantity_on_hand}</span>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-400">{s.reserved_quantity || 0}</td>
                  <td className="px-6 py-4 text-right text-emerald-400 font-mono">
                    ${(s.average_unit_cost || 0).toFixed(2)}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BatchStock;
