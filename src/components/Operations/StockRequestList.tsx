import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  XCircle,
  Truck
} from 'lucide-react';
import { StockRequest, Outlet } from '../../types';

interface StockRequestListProps {
  onNewRequest: () => void;
  onViewRequest: (id: string) => void;
}

export const StockRequestList: React.FC<StockRequestListProps> = ({ onNewRequest, onViewRequest }) => {
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [reqRes, outRes] = await Promise.all([
        fetch('/api/requests'),
        fetch('/api/outlets')
      ]);
      if (reqRes.ok) setRequests(await reqRes.json());
      if (outRes.ok) setOutlets(await outRes.json());
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft': return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium flex items-center gap-1"><Clock className="w-3 h-3" /> Draft</span>;
      case 'submitted': return <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded-full text-xs font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Submitted</span>;
      case 'approved': return <span className="px-2 py-1 bg-emerald-100 text-emerald-600 rounded-full text-xs font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Approved</span>;
      case 'partially_fulfilled': return <span className="px-2 py-1 bg-orange-100 text-orange-600 rounded-full text-xs font-medium flex items-center gap-1"><Truck className="w-3 h-3" /> Partial</span>;
      case 'fulfilled': return <span className="px-2 py-1 bg-emerald-100 text-emerald-600 rounded-full text-xs font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Fulfilled</span>;
      case 'cancelled': return <span className="px-2 py-1 bg-red-100 text-red-600 rounded-full text-xs font-medium flex items-center gap-1"><XCircle className="w-3 h-3" /> Cancelled</span>;
      default: return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">{status}</span>;
    }
  };

  const filteredRequests = requests.filter(r => 
    r.request_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    outlets.find(o => o.id === r.outlet_id)?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="p-8 text-center">Loading requests...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Requests</h1>
          <p className="text-sm text-gray-500">Manage outlet stock requests and warehouse dispatches</p>
        </div>
        <button 
          onClick={onNewRequest}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Request
        </button>
      </div>

      <div className="flex gap-4 items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text"
            placeholder="Search by request # or outlet..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium">
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-medium">
              <tr>
                <th className="px-6 py-3">Request #</th>
                <th className="px-6 py-3">Outlet</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Created By</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredRequests.map((req) => (
                <tr 
                  key={req.id} 
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => onViewRequest(req.id)}
                >
                  <td className="px-6 py-4 font-medium text-gray-900">{req.request_number}</td>
                  <td className="px-6 py-4 text-gray-600">
                    {outlets.find(o => o.id === req.outlet_id)?.name || 'Unknown Outlet'}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {new Date(req.requested_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(req.status)}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {req.created_by}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ChevronRight className="w-4 h-4 text-gray-400 inline" />
                  </td>
                </tr>
              ))}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    No stock requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
