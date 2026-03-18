import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ClipboardList, Plus, Search, Filter, 
  ChevronRight, CheckCircle2, XCircle, 
  Clock, AlertCircle, Save, Send, Check,
  RefreshCw, Scan
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import BarcodeScanModal from '../Common/BarcodeScanModal';
import { AttachmentManager } from '../Common/AttachmentManager';

export default function StockCount() {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newSession, setNewSession] = useState({ godown_id: '', remarks: '' });
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<any[]>({
    queryKey: ["stock-counts"],
    queryFn: async () => {
      const res = await fetch('/api/stock-counts', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return res.json();
    }
  });

  const { data: godowns = [] } = useQuery<any[]>({
    queryKey: ["master-data", "godowns"],
    queryFn: async () => {
      const res = await fetch('/api/godowns', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });

  const { data: activeSession, isLoading: sessionLoading } = useQuery<any>({
    queryKey: ["stock-counts", activeSessionId],
    queryFn: async () => {
      const res = await fetch(`/api/stock-counts/${activeSessionId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return res.json();
    },
    enabled: !!activeSessionId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/stock-counts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data)
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      setShowNewModal(false);
      setActiveSessionId(data.id);
    }
  });

  const loadStockMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/stock-counts/${id}/load-system-stock`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts", activeSessionId] });
    }
  });

  const updateCountMutation = useMutation({
    mutationFn: async ({ itemId, qty }: { itemId: string, qty: number }) => {
      await fetch(`/api/stock-counts/items/${itemId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ counted_quantity: qty })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts", activeSessionId] });
    }
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/stock-counts/${id}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts", activeSessionId] });
    }
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/stock-counts/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts", activeSessionId] });
    }
  });

  const postMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/stock-counts/${id}/post`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) {
        const data = await res.json() as any;
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts", activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["recent-movements"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (error: any) => {
      alert(error.message);
    }
  });

  const handleBarcodeScan = async (code: string) => {
    if (!activeSession) return;
    const item = activeSession.items.find((i: any) => i.item_sku === code || i.barcode === code);
    if (item) {
      setSearchQuery(item.item_sku);
      const element = document.getElementById(`item-${item.id}`);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      alert("Item not found in this count session. Ensure it has stock in this godown.");
    }
  };

  if (activeSessionId && activeSession) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => { setActiveSessionId(null); queryClient.invalidateQueries({ queryKey: ["stock-counts"] }); }} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400">
              <ChevronRight className="rotate-180" size={24} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">{activeSession.session_number}</h2>
              <p className="text-slate-400 text-sm">{activeSession.godown_name} • {new Date(activeSession.count_date).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex gap-3">
            {activeSession.status === 'draft' && (
              <>
                <button 
                  onClick={() => setIsScanModalOpen(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl border border-slate-700 transition-colors flex items-center gap-2"
                >
                  <Scan size={18} />
                  <span>Scan Item</span>
                </button>
                <button 
                  onClick={() => loadStockMutation.mutate(activeSession.id)} 
                  disabled={loadStockMutation.isPending}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl border border-slate-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw size={18} className={loadStockMutation.isPending ? "animate-spin" : ""} />
                  <span>{loadStockMutation.isPending ? "Loading..." : "Load System Stock"}</span>
                </button>
                <button 
                  onClick={() => submitMutation.mutate(activeSession.id)} 
                  disabled={submitMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <Send size={18} />
                  <span>{submitMutation.isPending ? "Submitting..." : "Submit for Approval"}</span>
                </button>
              </>
            )}
            {activeSession.status === 'submitted' && (
              <button 
                onClick={() => approveMutation.mutate(activeSession.id)} 
                disabled={approveMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Check size={18} />
                <span>{approveMutation.isPending ? "Approving..." : "Approve Session"}</span>
              </button>
            )}
            {activeSession.status === 'approved' && (
              <button 
                onClick={() => postMutation.mutate(activeSession.id)} 
                disabled={postMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Save size={18} />
                <span>{postMutation.isPending ? "Posting..." : "Post Reconciliation"}</span>
              </button>
            )}
            <span className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider flex items-center gap-2 ${
              activeSession.status === 'posted' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
            }`}>
              {activeSession.status === 'posted' ? <CheckCircle2 size={18} /> : <Clock size={18} />}
              {activeSession.status}
            </span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
          <AttachmentManager entityType="stock_count" entityId={activeSession.id} />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-slate-800 bg-slate-800/20">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                type="text"
                placeholder="Search items in session..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Item</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Batch</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">System Qty</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Counted Qty</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Variance</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Variance Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {activeSession.items
                .filter((item: any) => 
                  item.item_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  item.item_sku.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((item: any, i: number) => (
                <tr key={i} id={`item-${item.id}`} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 text-sm text-white font-medium">{item.item_name} <span className="text-slate-500 text-xs ml-1">{item.item_sku}</span></td>
                  <td className="px-6 py-4 text-sm text-slate-400 font-mono">{item.batch_number || 'N/A'}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 text-right font-mono">{item.system_quantity}</td>
                  <td className="px-6 py-4 text-right">
                    <input 
                      type="number"
                      defaultValue={item.counted_quantity}
                      disabled={activeSession.status !== 'draft' && activeSession.status !== 'in_progress'}
                      onBlur={(e) => updateCountMutation.mutate({ itemId: item.id, qty: parseFloat(e.target.value) })}
                      className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-right text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                    />
                  </td>
                  <td className={`px-6 py-4 text-sm text-right font-mono font-bold ${
                    item.variance_quantity > 0 ? 'text-emerald-400' : item.variance_quantity < 0 ? 'text-rose-400' : 'text-slate-500'
                  }`}>
                    {item.variance_quantity > 0 ? `+${item.variance_quantity}` : item.variance_quantity}
                  </td>
                  <td className={`px-6 py-4 text-sm text-right font-mono font-bold ${
                    item.variance_value > 0 ? 'text-emerald-400' : item.variance_value < 0 ? 'text-rose-400' : 'text-slate-500'
                  }`}>
                    ${item.variance_value?.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <BarcodeScanModal 
          isOpen={isScanModalOpen}
          onClose={() => setIsScanModalOpen(false)}
          onScan={handleBarcodeScan}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Stock Counts & Reconciliation</h2>
          <p className="text-slate-400 text-sm mt-1">Manage inventory audits and reconcile variances.</p>
        </div>
        <button 
          onClick={() => setShowNewModal(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
        >
          <Plus size={18} />
          <span>New Count Session</span>
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Session #</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Godown</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Created By</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sessionsLoading ? (
                [1,2,3].map(i => <tr key={i} className="animate-pulse"><td colSpan={6} className="px-6 py-8"><div className="h-4 bg-slate-800 rounded w-full" /></td></tr>)
              ) : sessions.map((s: any, i: number) => (
                <tr key={i} className="hover:bg-slate-800/30 transition-colors group cursor-pointer" onClick={() => setActiveSessionId(s.id)}>
                  <td className="px-6 py-4 text-sm text-white font-bold">{s.session_number}</td>
                  <td className="px-6 py-4 text-sm text-slate-300">{s.godown_name}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">{new Date(s.count_date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      s.status === 'posted' ? 'bg-emerald-500/10 text-emerald-500' : 
                      s.status === 'cancelled' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">{s.creator_name}</td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-slate-700 rounded-lg text-slate-500 hover:text-white transition-colors">
                      <ChevronRight size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Session Modal */}
      <AnimatePresence>
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-white mb-6">New Stock Count Session</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Select Godown</label>
                  <select 
                    value={newSession.godown_id}
                    onChange={(e) => setNewSession({...newSession, godown_id: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select Godown...</option>
                    {godowns.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Remarks</label>
                  <textarea 
                    value={newSession.remarks}
                    onChange={(e) => setNewSession({...newSession, remarks: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 h-24 resize-none"
                    placeholder="Optional remarks..."
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setShowNewModal(false)} className="flex-1 px-4 py-3 rounded-xl border border-slate-700 text-slate-400 font-bold hover:bg-slate-800 transition-colors">Cancel</button>
                  <button 
                    onClick={() => createMutation.mutate(newSession)} 
                    disabled={createMutation.isPending}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                  >
                    {createMutation.isPending ? "Starting..." : "Start Session"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
