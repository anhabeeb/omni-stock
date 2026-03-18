import React, { useState, useEffect } from 'react';
import { Search, Filter, ArrowUpRight, ArrowDownLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

const MovementLedger: React.FC = () => {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetch('/api/inventory/movements', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(res => res.json())
    .then(data => {
      setMovements(data);
      setLoading(false);
    });
  }, []);

  const filteredMovements = movements.filter(m => 
    m.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.reference_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.movement_type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getMovementIcon = (type: string) => {
    switch (type) {
      case 'grn': return <ArrowDownLeft className="w-5 h-5 text-emerald-500" />;
      case 'issue': return <ArrowUpRight className="w-5 h-5 text-rose-500" />;
      case 'transfer_in': return <ArrowDownLeft className="w-5 h-5 text-blue-500" />;
      case 'transfer_out': return <ArrowUpRight className="w-5 h-5 text-blue-500" />;
      case 'adjustment_plus': return <RefreshCw className="w-5 h-5 text-emerald-500" />;
      case 'adjustment_minus': return <RefreshCw className="w-5 h-5 text-rose-500" />;
      case 'expired_writeoff': return <AlertCircle className="w-5 h-5 text-rose-500" />;
      default: return <RefreshCw className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Stock Movement Ledger</h1>
          <p className="text-slate-400 mt-1">Audit trail of all inventory transactions</p>
        </div>
        
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input 
            type="text"
            placeholder="Search item or reference..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-2xl pl-12 pr-6 py-3 text-white w-full md:w-80 focus:ring-2 focus:ring-emerald-500 transition-all"
          />
        </div>
      </div>

      <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-800/50">
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Date / Time</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Item</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Type</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Godown</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Qty</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Reference</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">Loading audit trail...</td></tr>
            ) : filteredMovements.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">No movements found.</td></tr>
            ) : filteredMovements.map((m, idx) => (
              <motion.tr 
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="hover:bg-slate-800/30 transition-colors"
              >
                <td className="px-6 py-4 text-slate-300 text-sm">
                  {new Date(m.created_at).toLocaleString()}
                </td>
                <td className="px-6 py-4 font-bold text-white">{m.item_name}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-2">
                    {getMovementIcon(m.movement_type)}
                    <span className="text-xs font-bold uppercase text-slate-400">{m.movement_type.replace('_', ' ')}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-300">{m.godown_name}</td>
                <td className={`px-6 py-4 text-right font-bold ${m.quantity > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </td>
                <td className="px-6 py-4">
                  <span className="bg-slate-800 px-2 py-1 rounded text-xs font-mono text-slate-400">
                    {m.reference_type}: {m.reference_id?.slice(0, 8)}...
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-500 text-xs italic">{m.remarks || '-'}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MovementLedger;
