import React, { useState } from 'react';
import { Plus, Search, FileText, CheckCircle, XCircle, Clock, Store } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const StockIssueList: React.FC = () => {
  const [search, setSearch] = useState("");

  const { data: issues = [], isLoading: loading } = useQuery<any[]>({
    queryKey: ['issues'],
    queryFn: async () => {
      const response = await fetch('/api/issues', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch issues');
      return response.json();
    },
    staleTime: 30000,
  });

  const filtered = issues.filter((issue: any) => 
    issue.issue_number.toLowerCase().includes(search.toLowerCase()) ||
    issue.outlet_id.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'posted':
        return <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-medium flex items-center gap-1"><CheckCircle size={12} /> Posted</span>;
      case 'cancelled':
        return <span className="px-2 py-1 rounded-full bg-rose-500/10 text-rose-500 text-xs font-medium flex items-center gap-1"><XCircle size={12} /> Cancelled</span>;
      default:
        return <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-500 text-xs font-medium flex items-center gap-1"><Clock size={12} /> Draft</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Stock Issues</h1>
          <p className="text-slate-400 mt-1">Manage stock distribution to outlets</p>
        </div>
        <button className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 font-semibold active:scale-95">
          <Plus size={20} /> New Issue
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center gap-4 bg-slate-900/50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Search issue number, outlet..." 
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
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Issue Number</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Outlet</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Issue Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Source Godown</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">Loading issues...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">No issues found</td>
                </tr>
              ) : filtered.map((issue: any) => (
                <tr key={issue.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-6 py-4 font-mono text-emerald-500 font-bold">{issue.issue_number}</td>
                  <td className="px-6 py-4 text-slate-300">
                    <div className="flex items-center gap-2">
                      <Store size={14} className="text-slate-500" />
                      {issue.outlet_id}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400">{new Date(issue.issue_date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-slate-400">{issue.source_godown_id}</td>
                  <td className="px-6 py-4">{getStatusBadge(issue.status)}</td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
                      <FileText size={18} />
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
};

export default StockIssueList;
