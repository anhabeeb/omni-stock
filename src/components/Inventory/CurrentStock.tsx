import React, { useState } from 'react';
import { Search, Package, Warehouse, AlertTriangle, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';

const CurrentStock: React.FC = () => {
  const [search, setSearch] = useState("");
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('inventory.view');

  const { data: stock = [], isLoading } = useQuery<any[]>({
    queryKey: ['inventory', 'current-stock-summary'],
    queryFn: async () => {
      const response = await fetch('/api/stock/current', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch stock');
      return response.json();
    },
    enabled: canView,
    staleTime: 60000, // 60 seconds
  });

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view current stock.</p>
        </div>
      </div>
    );
  }

  const filtered = stock.filter((s: any) => 
    s.item_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.item_sku?.toLowerCase().includes(search.toLowerCase()) ||
    s.godown_name?.toLowerCase().includes(search.toLowerCase())
  );

  const exportColumns = [
    { header: 'Item Name', key: 'item_name' },
    { header: 'SKU', key: 'item_sku' },
    { header: 'Godown', key: 'godown_name' },
    { header: 'Batch Number', key: 'batch_number' },
    { header: 'Expiry Date', key: (row: any) => row.expiry_date ? new Date(row.expiry_date).toLocaleDateString() : '' },
    { header: 'Qty on Hand', key: 'total_quantity' },
    { header: 'Unit', key: 'unit_name' },
    { header: 'Status', key: (row: any) => row.total_quantity <= row.min_stock_level ? 'Low Stock' : 'In Stock' }
  ];

  return (
    <div className="space-y-6">
      <PrintHeader title="Current Stock Report" filters={{ search }} />
      
      <div className="flex justify-between items-center no-print">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Current Stock Levels</h1>
          <p className="text-slate-400 mt-1">Real-time inventory visibility across all godowns</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton data={filtered} filename="current-stock" columns={exportColumns} />
          <PrintButton />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center gap-4 bg-slate-900/50 no-print">
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
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">Loading stock data...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">No stock found</td>
                </tr>
              ) : filtered.map((s: any, i: number) => (
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
