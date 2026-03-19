import React, { useState } from "react";
import { Plus, Search, Filter, MoreVertical, AlertCircle, CheckCircle2, Clock, Printer } from "lucide-react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';
import DocumentPrintModal from '../Common/DocumentPrintModal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StockAdjustment {
  id: string;
  adjustment_number: string;
  godown_id: string;
  adjustment_date: string;
  reason: string;
  status: string;
  created_at: string;
}

export default function StockAdjustmentList() {
  const [search, setSearch] = useState("");
  const [printDoc, setPrintDoc] = useState<any>(null);
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('inventory.view');

  const { data: adjustments = [], isLoading: loading } = useQuery<StockAdjustment[]>({
    queryKey: ['adjustments'],
    queryFn: async () => {
      const res = await fetch("/api/adjustments", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) throw new Error('Failed to fetch adjustments');
      return res.json();
    },
    enabled: canView,
    staleTime: 30000,
  });

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view stock adjustments.</p>
        </div>
      </div>
    );
  }

  const handlePrintDoc = async (adj: any) => {
    try {
      const res = await fetch(`/api/adjustments/${adj.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch adjustment details');
      const data = await res.json();
      setPrintDoc(data);
    } catch (error) {
      console.error('Error fetching adjustment details:', error);
      alert('Failed to load adjustment details for printing.');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "posted":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-bold border border-emerald-500/20">
            <CheckCircle2 size={12} />
            POSTED
          </span>
        );
      case "draft":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-xs font-bold border border-blue-500/20">
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

  const filtered = adjustments.filter(adj => 
    adj.adjustment_number.toLowerCase().includes(search.toLowerCase()) ||
    adj.reason.toLowerCase().includes(search.toLowerCase())
  );

  const exportColumns = [
    { header: 'Adjustment #', key: 'adjustment_number' },
    { header: 'Date', key: 'adjustment_date' },
    { header: 'Reason', key: 'reason' },
    { header: 'Status', key: 'status' }
  ];

  return (
    <div className="space-y-6">
      <PrintHeader title="Stock Adjustments" filters={search ? `Search: ${search}` : undefined} />
      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Stock Adjustments</h2>
          <p className="text-gray-500 dark:text-slate-400 mt-1">Manage inventory corrections and write-offs.</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton data={filtered} filename="stock-adjustments" columns={exportColumns} />
          <PrintButton />
          <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 font-semibold active:scale-95">
            <Plus size={18} />
            <span>New Adjustment</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-gray-200 dark:border-slate-800 flex items-center gap-4 bg-gray-50 dark:bg-slate-900/50 no-print">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Search by number or reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-600"
            />
          </div>
          <button className="p-2.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700 transition-colors">
            <Filter size={18} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Adjustment No</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Godown</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Reason</th>
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
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-32" /></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-40" /></td>
                    <td className="px-6 py-4 flex justify-center"><div className="h-6 bg-slate-800 rounded-full w-20" /></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-8 ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No adjustments found.
                  </td>
                </tr>
              ) : filtered.map((adj) => (
                <tr key={adj.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-6 py-4 text-sm font-bold text-white">{adj.adjustment_number}</td>
                  <td className="px-6 py-4 text-sm text-slate-300">{new Date(adj.adjustment_date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-300">{adj.godown_id}</td>
                  <td className="px-6 py-4 text-sm text-slate-300">{adj.reason}</td>
                  <td className="px-6 py-4 text-center">{getStatusBadge(adj.status)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handlePrintDoc(adj); }}
                        className="p-2 hover:bg-slate-700 rounded-lg text-slate-500 hover:text-white transition-colors"
                        title="Print Adjustment"
                      >
                        <Printer size={16} />
                      </button>
                      <button className="p-2 hover:bg-slate-700 rounded-lg text-slate-500 hover:text-white transition-colors">
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {printDoc && (
        <DocumentPrintModal
          isOpen={!!printDoc}
          onClose={() => setPrintDoc(null)}
          title="Stock Adjustment"
          documentNumber={printDoc.adjustment_number}
          date={printDoc.adjustment_date}
          status={printDoc.status}
          details={[
            { label: 'Godown', value: printDoc.godown_name },
            { label: 'Reason', value: printDoc.reason },
            { label: 'Created By', value: printDoc.created_by_name }
          ]}
          itemColumns={[
            { header: 'Item', key: 'item_name' },
            { header: 'Batch', key: 'batch_number' },
            { header: 'Type', key: 'adjustment_type' },
            { header: 'Qty', key: 'quantity', align: 'right' },
            { header: 'Unit Cost', key: 'unit_cost', align: 'right', isCurrency: true },
            { header: 'Total', key: 'total_cost', align: 'right', isCurrency: true }
          ]}
          items={printDoc.items}
          totals={[
            { label: 'Total Value', value: printDoc.total_value, isCurrency: true }
          ]}
          signatures={[
            'Prepared By',
            'Authorized By'
          ]}
        />
      )}
    </div>
  );
}
