import React, { useState } from "react";
import { Plus, Search, Filter, MoreVertical, AlertCircle, CheckCircle2, Clock, Truck, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Transfer {
  id: string;
  transfer_number: string;
  source_godown_id: string;
  destination_godown_id: string;
  transfer_date: string;
  status: string;
  created_at: string;
}

export default function TransferList() {
  const [search, setSearch] = useState("");

  const { data: transfers = [], isLoading: loading } = useQuery<any[]>({
    queryKey: ['transfers'],
    queryFn: async () => {
      const res = await fetch("/api/transfers", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) throw new Error('Failed to fetch transfers');
      return res.json();
    },
    staleTime: 30000,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "received":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-bold border border-emerald-500/20">
            <CheckCircle2 size={12} />
            RECEIVED
          </span>
        );
      case "dispatched":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-xs font-bold border border-blue-500/20">
            <Truck size={12} />
            DISPATCHED
          </span>
        );
      case "draft":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-500/10 text-slate-500 text-xs font-bold border border-slate-500/20">
            <Clock size={12} />
            DRAFT
          </span>
        );
      case "cancelled":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-500 text-xs font-bold border border-rose-500/20">
            <AlertCircle size={12} />
            CANCELLED
          </span>
        );
      default:
        return null;
    }
  };

  const filtered = transfers.filter(t => 
    t.transfer_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Inter-Godown Transfers</h2>
          <p className="text-slate-400 mt-1">Manage stock movement between warehouses.</p>
        </div>
        <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 font-semibold active:scale-95">
          <Plus size={18} />
          <span>New Transfer</span>
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center gap-4 bg-slate-900/50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Search by transfer number..."
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
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Transfer No</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Route</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-24" /></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-20" /></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-48" /></td>
                    <td className="px-6 py-4 flex justify-center"><div className="h-6 bg-slate-800 rounded-full w-20" /></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-8 ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No transfers found.
                  </td>
                </tr>
              ) : filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-6 py-4 text-sm font-bold text-white">{t.transfer_number}</td>
                  <td className="px-6 py-4 text-sm text-slate-300">{new Date(t.transfer_date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-blue-400">{t.source_godown_id}</span>
                      <ArrowRight size={14} className="text-slate-600" />
                      <span className="font-medium text-emerald-400">{t.destination_godown_id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">{getStatusBadge(t.status)}</td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-slate-700 rounded-lg text-slate-500 hover:text-white transition-colors">
                      <MoreVertical size={16} />
                    </button>
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
