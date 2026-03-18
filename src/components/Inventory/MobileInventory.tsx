import React, { useState, useEffect } from 'react';
import { 
  Search, Package, Warehouse, Filter, RefreshCw, 
  ChevronRight, ScanLine, AlertTriangle, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import BarcodeScanner from '../Common/BarcodeScanner';

export default function MobileInventory() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const fetchItems = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const res = await fetch('/api/items', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setItems(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleScan = async (code: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/items/lookup-by-code?code=${code}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setSelectedItem(data);
    } else {
      alert("Item not found");
    }
  };

  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase()) || 
    i.sku.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedItem) {
    return (
      <div className="p-4 space-y-6">
        <button 
          onClick={() => setSelectedItem(null)}
          className="flex items-center gap-2 text-slate-400 text-sm font-medium"
        >
          <ChevronRight className="rotate-180" size={18} />
          Back to list
        </button>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400">
              <Package size={32} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">{selectedItem.name}</h2>
              <p className="text-slate-500 text-sm font-medium uppercase tracking-widest">{selectedItem.sku}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Stock Level</p>
              <p className="text-lg font-bold text-white">1,240 <span className="text-xs text-slate-500">units</span></p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Reorder Level</p>
              <p className="text-lg font-bold text-white">{selectedItem.reorder_level} <span className="text-xs text-slate-500">units</span></p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">Batches</h3>
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="bg-slate-800/50 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">BATCH-00{i}</p>
                    <p className="text-xs text-slate-500">Exp: 2026-12-31</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-500">620 units</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">Main Godown</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Inventory</h1>
          <p className="text-slate-500 text-xs">Stock Lookup</p>
        </div>
        <button 
          onClick={() => setShowScanner(true)}
          className="p-3 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-600/20 text-white"
        >
          <ScanLine size={20} />
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input 
          type="text"
          placeholder="Search items or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-12 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
        />
      </div>

      <div className="space-y-3">
        {loading ? (
          [1,2,3,4,5].map(i => <div key={i} className="h-20 bg-slate-900 rounded-2xl animate-pulse" />)
        ) : filteredItems.map(item => (
          <button 
            key={item.id}
            onClick={() => setSelectedItem(item)}
            className="w-full bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between hover:bg-slate-800 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-slate-400">
                <Package size={20} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white">{item.name}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">{item.sku}</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-600" />
          </button>
        ))}
      </div>

      {showScanner && (
        <BarcodeScanner 
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
