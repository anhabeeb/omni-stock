import React, { useState, useEffect } from "react";
import { Search, Filter, ArrowUpRight, ArrowDownLeft, RefreshCw, AlertCircle } from "lucide-react";
import { motion } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StockMovement {
  id: string;
  movement_type: string;
  reference_type: string;
  reference_id: string;
  item_id: string;
  item_name: string;
  godown_id: string;
  godown_name: string;
  base_quantity: number;
  movement_date: string;
  created_at: string;
  remarks: string;
}

export default function StockMovementLedger() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchMovements();
  }, []);

  const fetchMovements = async () => {
    try {
      const res = await fetch("/api/stock-movements", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await res.json();
      setMovements(data);
    } catch (err) {
      console.error("Failed to fetch movements", err);
    } finally {
      setLoading(false);
    }
  };

  const getMovementIcon = (type: string) => {
    if (type.includes('receipt') || type.includes('plus') || type.includes('in')) {
      return <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center"><ArrowDownLeft size={16} /></div>;
    }
    return <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center"><ArrowUpRight size={16} /></div>;
  };

  const formatType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const filtered = movements.filter(m => 
    m.item_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.remarks?.toLowerCase().includes(search.toLowerCase()) ||
    m.reference_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Stock Movement Ledger</h2>
          <p className="text-slate-400 mt-1">Audit trail of all inventory transactions.</p>
        </div>
        <button 
          onClick={fetchMovements}
          className="p-2.5 hover:bg-slate-800 rounded-xl text-slate-400 border border-slate-700 transition-colors"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center gap-4 bg-slate-900/50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Search by item, remarks or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all placeholder:text-slate-600"
            />
          </div>
          <button className="p-2.5 hover:bg-slate-800 rounded-xl text-slate-400 border border-slate-700 transition-colors">
            <Filter size={18} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Date & Time</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Item</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Godown</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Quantity</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-32" /></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-40" /></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-24" /></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-24" /></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-16 ml-auto" /></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-48" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No movements found.
                  </td>
                </tr>
              ) : filtered.map((m) => (
                <tr key={m.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-6 py-4 text-sm text-slate-400">
                    <div className="flex flex-col">
                      <span className="text-slate-200">{new Date(m.movement_date).toLocaleDateString()}</span>
                      <span className="text-[10px] uppercase tracking-tighter">{new Date(m.created_at).toLocaleTimeString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {getMovementIcon(m.movement_type)}
                      <span className="text-sm font-medium text-white">{m.item_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-slate-400 bg-slate-800 px-2 py-1 rounded uppercase">
                      {formatType(m.movement_type)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-300">{m.godown_name}</td>
                  <td className={cn(
                    "px-6 py-4 text-sm font-bold text-right",
                    m.base_quantity > 0 ? "text-emerald-400" : "text-rose-400"
                  )}>
                    {m.base_quantity > 0 ? "+" : ""}{m.base_quantity}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 italic max-w-xs truncate">
                    {m.remarks || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
