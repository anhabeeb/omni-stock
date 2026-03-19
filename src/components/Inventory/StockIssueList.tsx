import React, { useState } from 'react';
import { Plus, Search, FileText, CheckCircle, XCircle, Clock, Store } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';
import DocumentPrintModal from '../Common/DocumentPrintModal';

const StockIssueList: React.FC = () => {
  const [search, setSearch] = useState("");
  const [printDoc, setPrintDoc] = useState<any>(null);
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('inventory.view');

  const { data: issues = [], isLoading: loading } = useQuery<any[]>({
    queryKey: ['issues'],
    queryFn: async () => {
      const response = await fetch('/api/issues', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch issues');
      return response.json();
    },
    enabled: canView,
    staleTime: 30000,
  });

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view stock issues.</p>
        </div>
      </div>
    );
  }

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

  const exportColumns = [
    { header: 'Issue Number', key: 'issue_number' },
    { header: 'Outlet', key: 'outlet_id' },
    { header: 'Issue Date', key: 'issue_date' },
    { header: 'Source Godown', key: 'source_godown_id' },
    { header: 'Status', key: 'status' }
  ];

  const handlePrintDoc = async (issue: any) => {
    try {
      const response = await fetch(`/api/issues/${issue.id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch issue details');
      const details = await response.json();
      setPrintDoc(details);
    } catch (error) {
      console.error("Failed to load issue details for printing", error);
    }
  };

  return (
    <div className="space-y-6">
      <PrintHeader title="Stock Issues" filters={search ? `Search: ${search}` : undefined} />
      <div className="flex justify-between items-center no-print">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Stock Issues</h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1">Manage stock distribution to outlets</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton data={filtered} filename="stock-issues" columns={exportColumns} />
          <PrintButton />
          <button className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 font-semibold active:scale-95">
            <Plus size={20} /> New Issue
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-gray-200 dark:border-slate-800 flex items-center gap-4 bg-gray-50 dark:bg-slate-900/50 no-print">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Search issue number, outlet..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500/50 transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500"
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
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right no-print">Actions</th>
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
                  <td className="px-6 py-4 text-right no-print">
                    <button 
                      onClick={() => handlePrintDoc(issue)}
                      className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                      title="Print Document"
                    >
                      <FileText size={18} />
                    </button>
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
          title="Stock Issue Note"
          documentNumber={printDoc.issue_number}
          date={printDoc.issue_date}
          status={printDoc.status}
          details={[
            { label: 'Outlet', value: printDoc.outlet_id },
            { label: 'Source Godown', value: printDoc.source_godown_id },
            { label: 'Remarks', value: printDoc.remarks || 'N/A' },
          ]}
          items={printDoc.items || []}
          itemColumns={[
            { header: 'Item', key: 'item_id' },
            { header: 'Batch', key: 'batch_number' },
            { header: 'Qty', key: 'issued_quantity', align: 'right' },
            { header: 'Unit Cost', key: 'unit_cost', isCurrency: true, align: 'right' },
            { header: 'Total', key: 'total_line_cost', isCurrency: true, align: 'right' },
          ]}
          totals={[
            { label: 'Total Value', value: printDoc.items?.reduce((sum: number, item: any) => sum + (item.total_line_cost || 0), 0) || 0, isCurrency: true }
          ]}
        />
      )}
    </div>
  );
};

export default StockIssueList;
