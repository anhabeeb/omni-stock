import React, { useState, useEffect } from 'react';
import { 
  ArrowDownLeft, ArrowUpRight, RefreshCw, Search, Trash2, 
  ChevronRight, ScanLine, Package, Warehouse, MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function MobileOperations({ onAction }: { onAction: (action: string) => void }) {
  const operations = [
    { id: 'grn', label: 'Receive Stock', sub: 'Goods Receipt Note', icon: ArrowDownLeft, color: 'emerald' },
    { id: 'issue', label: 'Issue to Outlet', sub: 'Stock Issue', icon: ArrowUpRight, color: 'blue' },
    { id: 'transfer', label: 'Transfer Stock', sub: 'Godown to Godown', icon: RefreshCw, color: 'violet' },
    { id: 'stock-count', label: 'Stock Count', sub: 'Physical Audit', icon: Search, color: 'amber' },
    { id: 'wastage', label: 'Wastage Entry', sub: 'Record Loss', icon: Trash2, color: 'rose' },
  ];

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Operations</h1>
        <p className="text-slate-500 text-xs">Warehouse Workflows</p>
      </div>

      <div className="space-y-3">
        {operations.map(op => (
          <button
            key={op.id}
            onClick={() => onAction(op.id)}
            className="w-full bg-slate-900 border border-slate-800 p-5 rounded-3xl flex items-center justify-between hover:bg-slate-800 transition-all group"
          >
            <div className="flex items-center gap-5">
              <div className={`p-4 rounded-2xl bg-${op.color}-500/10 text-${op.color}-500 group-hover:scale-110 transition-transform`}>
                <op.icon size={24} />
              </div>
              <div className="text-left">
                <p className="text-base font-bold text-white">{op.label}</p>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">{op.sub}</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-slate-600" />
          </button>
        ))}
      </div>

      {/* Recent Activity Preview */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-widest px-2">Recent Activity</h3>
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-500">
                  <Package size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">GRN-2026-00{i}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Posted 2h ago</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-emerald-500">+$2,450</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Main Godown</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
