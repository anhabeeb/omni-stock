import React, { useState, useEffect, Suspense, lazy } from "react";
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate, 
  Link, 
  useLocation, 
  useNavigate 
} from "react-router-dom";
import { useQuery, useQueryClient, QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { SettingsProvider, useSettings } from "./contexts/SettingsContext";
import UsersPage from "./components/Admin/UsersPage";
import SettingsPage from "./components/Admin/SettingsPage";
import { 
  LayoutDashboard, 
  Package, 
  Truck, 
  Warehouse, 
  Store, 
  Users, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  ChevronRight,
  AlertTriangle,
  Clock,
  DollarSign,
  BarChart3,
  Search,
  Filter,
  Plus,
  MoreVertical,
  ArrowRightLeft,
  ClipboardList,
  History,
  AlertCircle,
  PlusCircle,
  FileText,
  Settings2,
  Trash2,
  Moon,
  Sun
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// --- Components ---
const GRNForm = lazy(() => import("./components/Inventory/GRNForm"));
const StockIssueForm = lazy(() => import("./components/Inventory/StockIssueForm"));
const TransferForm = lazy(() => import("./components/Inventory/TransferForm"));
const AdjustmentForm = lazy(() => import("./components/Inventory/AdjustmentForm"));
const BatchStock = lazy(() => import("./components/Inventory/BatchStock"));
const ExpiryAlerts = lazy(() => import("./components/Inventory/ExpiryAlerts"));
const MovementLedger = lazy(() => import("./components/Inventory/MovementLedger"));
const AnalyticsDashboard = lazy(() => import("./components/Dashboard/AnalyticsDashboard"));
const Reports = lazy(() => import("./components/Dashboard/Reports"));
const StockCount = lazy(() => import("./components/Inventory/StockCount"));
const Wastage = lazy(() => import("./components/Inventory/Wastage"));
const Alerts = lazy(() => import("./components/Inventory/Alerts"));
const MobileLayout = lazy(() => import("./components/Layout/MobileLayout"));
const MobileDashboard = lazy(() => import("./components/Dashboard/MobileDashboard"));
const MobileInventory = lazy(() => import("./components/Inventory/MobileInventory"));
const MobileOperations = lazy(() => import("./components/Operations/MobileOperations"));
const SmartAlertsCenter = lazy(() => import("./components/Alerts/SmartAlertsCenter"));
const FinanceDashboard = lazy(() => import("./components/Finance/FinanceDashboard"));

// --- Phase 5 Components ---
const KPIDashboard = lazy(() => import("./components/Intelligence/KPIDashboard").then(m => ({ default: m.KPIDashboard })));
const WastageAnalytics = lazy(() => import("./components/Intelligence/WastageAnalytics").then(m => ({ default: m.WastageAnalytics })));
const ExpiryRiskDashboard = lazy(() => import("./components/Intelligence/ExpiryRiskDashboard").then(m => ({ default: m.ExpiryRiskDashboard })));
const DiscrepancyAnalytics = lazy(() => import("./components/Intelligence/DiscrepancyAnalytics").then(m => ({ default: m.DiscrepancyAnalytics })));
const StockRequestList = lazy(() => import("./components/Operations/StockRequestList").then(m => ({ default: m.StockRequestList })));
const StockRequestForm = lazy(() => import("./components/Operations/StockRequestForm").then(m => ({ default: m.StockRequestForm })));
const NotificationCenter = lazy(() => import("./components/Layout/NotificationCenter").then(m => ({ default: m.NotificationCenter })));

import { LoadingSkeleton, TableSkeleton } from "./components/Common/LoadingSkeleton";

// --- Utils ---
function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowSize;
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface User {
  id: string;
  username: string;
  role: string;
  fullName: string;
}

// --- Components ---

const SidebarItem = ({ icon: Icon, label, to, active }: { icon: any, label: string, to: string, active?: boolean }) => (
  <Link 
    to={to}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
      active 
        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" 
        : "text-slate-400 hover:bg-slate-800 hover:text-white"
    )}
  >
    <Icon size={20} className={cn("transition-transform duration-200", active ? "scale-110" : "group-hover:scale-110")} />
    <span className="font-medium">{label}</span>
    {active && <motion.div layoutId="active-pill" className="ml-auto w-1.5 h-1.5 rounded-full bg-white" />}
  </Link>
);

const Layout = ({ children, user, onLogout }: { children: React.ReactNode, user: User, onLogout: () => void }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const { theme, setTheme } = useSettings();

  return (
    <div className={cn("flex h-screen overflow-hidden font-sans", theme === 'dark' ? "bg-slate-950 text-slate-200" : "bg-slate-50 text-slate-800")}>
      {/* Sidebar */}
      <aside className={cn(
        "transition-all duration-300 flex flex-col border-r",
        theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200",
        isSidebarOpen ? "w-64" : "w-20"
      )}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
            <Warehouse size={24} />
          </div>
          {isSidebarOpen && (
            <motion.span 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn("text-xl font-bold tracking-tight", theme === 'dark' ? "text-white" : "text-slate-900")}
            >
              OmniStock
            </motion.span>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
          <div className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">General</div>
          <SidebarItem icon={LayoutDashboard} label="Dashboard" to="/" active={location.pathname === "/"} />
          
          <div className="px-4 py-2 mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reports & Analytics</div>
          <SidebarItem icon={BarChart3} label="Analytics" to="/analytics" active={location.pathname === "/analytics"} />
          {(user.role === 'super_admin' || user.role === 'warehouse_manager') && (
            <SidebarItem icon={DollarSign} label="Finance & Profit" to="/finance" active={location.pathname === "/finance"} />
          )}
          <SidebarItem icon={AlertCircle} label="Smart Alerts" to="/smart-alerts" active={location.pathname === "/smart-alerts"} />
          <SidebarItem icon={FileText} label="Advanced Reports" to="/reports" active={location.pathname === "/reports"} />
          <SidebarItem icon={AlertTriangle} label="System Alerts" to="/alerts" active={location.pathname === "/alerts"} />
          <SidebarItem icon={History} label="Movement Ledger" to="/ledger" active={location.pathname === "/ledger"} />

          <div className="px-4 py-2 mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Warehouse Intelligence</div>
          <SidebarItem icon={BarChart3} label="Warehouse KPIs" to="/intelligence/kpis" active={location.pathname === "/intelligence/kpis"} />
          <SidebarItem icon={Trash2} label="Wastage Analytics" to="/intelligence/wastage" active={location.pathname === "/intelligence/wastage"} />
          <SidebarItem icon={Clock} label="Expiry Risk" to="/intelligence/expiry" active={location.pathname === "/intelligence/expiry"} />
          <SidebarItem icon={AlertTriangle} label="Shrinkage Analytics" to="/intelligence/shrinkage" active={location.pathname === "/intelligence/shrinkage"} />

          <div className="px-4 py-2 mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Warehouse Control</div>
          <SidebarItem icon={Truck} label="Stock Requests" to="/requests" active={location.pathname === "/requests"} />

          <div className="px-4 py-2 mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Inventory Ops</div>
          <SidebarItem icon={PlusCircle} label="New GRN" to="/grn/new" active={location.pathname === "/grn/new"} />
          <SidebarItem icon={FileText} label="New Issue" to="/issues/new" active={location.pathname === "/issues/new"} />
          <SidebarItem icon={ArrowRightLeft} label="New Transfer" to="/transfers/new" active={location.pathname === "/transfers/new"} />
          <SidebarItem icon={Settings2} label="New Adjustment" to="/adjustments/new" active={location.pathname === "/adjustments/new"} />
          <SidebarItem icon={ClipboardList} label="Stock Count" to="/stock-count" active={location.pathname === "/stock-count"} />
          <SidebarItem icon={Trash2} label="Wastage" to="/wastage" active={location.pathname === "/wastage"} />

          <div className="px-4 py-2 mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Master Data</div>
          <SidebarItem icon={Package} label="Items" to="/items" active={location.pathname === "/items"} />
          <SidebarItem icon={Truck} label="Suppliers" to="/suppliers" active={location.pathname === "/suppliers"} />
          <SidebarItem icon={Warehouse} label="Godowns" to="/godowns" active={location.pathname === "/godowns"} />
          <SidebarItem icon={Store} label="Outlets" to="/outlets" active={location.pathname === "/outlets"} />
          
          <div className="pt-4 pb-2 px-4">
            <div className={cn("h-px", theme === 'dark' ? "bg-slate-800" : "bg-slate-200")} />
          </div>
          <SidebarItem icon={Users} label="Users" to="/users" active={location.pathname === "/users"} />
          <SidebarItem icon={Settings} label="Settings" to="/settings" active={location.pathname === "/settings"} />
        </nav>

        <div className={cn("p-4 border-t", theme === 'dark' ? "border-slate-800" : "border-slate-200")}>
          <div className="flex gap-2 mb-2">
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={cn(
                "flex-1 flex items-center justify-center py-2 rounded-xl transition-all",
                theme === 'dark' ? "bg-slate-800 text-slate-400 hover:text-white" : "bg-slate-100 text-slate-500 hover:text-slate-900"
              )}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
          <button 
            onClick={onLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-500 transition-colors group"
          >
            <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
            {isSidebarOpen && <span className="font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className={cn(
          "h-16 border-b backdrop-blur-xl flex items-center justify-between px-8",
          theme === 'dark' ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white/50"
        )}>
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <h1 className={cn("text-lg font-semibold", theme === 'dark' ? "text-white" : "text-slate-900")}>
              {location.pathname === "/" ? "Dashboard Overview" : 
               location.pathname.slice(1).split('/')[0].charAt(0).toUpperCase() + location.pathname.slice(1).split('/')[0].slice(1)}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <NotificationCenter />
            <div className="flex flex-col items-end">
              <span className={cn("text-sm font-medium", theme === 'dark' ? "text-white" : "text-slate-900")}>{user.fullName}</span>
              <span className="text-xs text-slate-400 uppercase tracking-wider">{user.role.replace("_", " ")}</span>
            </div>
            <div className={cn("w-10 h-10 rounded-full border flex items-center justify-center font-bold", theme === 'dark' ? "bg-slate-800 border-slate-700 text-emerald-400" : "bg-slate-100 border-slate-200 text-emerald-600")}>
              {user.fullName.charAt(0)}
            </div>
          </div>
        </header>

        <div className={cn("flex-1 overflow-y-auto p-8", theme === 'dark' ? "bg-slate-950/50" : "bg-slate-50")}>
          <Suspense fallback={<LoadingSkeleton />}>
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/analytics" element={<AnalyticsDashboard />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/smart-alerts" element={<SmartAlertsCenter />} />
                  <Route path="/finance" element={<FinanceDashboard />} />
                  <Route path="/stock-count" element={<StockCount />} />
                  <Route path="/wastage" element={<Wastage />} />
                  <Route path="/grn/new" element={<GRNForm />} />
                  <Route path="/issues/new" element={<StockIssueForm />} />
                  <Route path="/transfers/new" element={<TransferForm />} />
                  <Route path="/adjustments/new" element={<AdjustmentForm />} />
                  <Route path="/stock" element={<BatchStock />} />
                  <Route path="/expiry" element={<ExpiryAlerts />} />
                  <Route path="/ledger" element={<MovementLedger />} />
                  
                  {/* Phase 5 Routes */}
                  <Route path="/intelligence/kpis" element={<KPIDashboard />} />
                  <Route path="/intelligence/wastage" element={<WastageAnalytics />} />
                  <Route path="/intelligence/expiry" element={<ExpiryRiskDashboard />} />
                  <Route path="/intelligence/shrinkage" element={<DiscrepancyAnalytics />} />
                  <Route path="/requests" element={<StockRequestList onNewRequest={() => window.location.href = '/requests/new'} onViewRequest={(id) => window.location.href = `/requests/${id}`} />} />
                  <Route path="/requests/new" element={<StockRequestForm onClose={() => window.location.href = '/requests'} onSuccess={() => window.location.href = '/requests'} />} />
                  <Route path="/requests/:id" element={<StockRequestForm requestId={window.location.pathname.split('/').pop()} onClose={() => window.location.href = '/requests'} onSuccess={() => window.location.href = '/requests'} />} />

                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/settings" element={<SettingsPage />} />

                  <Route path="/items" element={
                    <MasterListPage 
                      title="Items Master" 
                      endpoint="items" 
                      columns={[
                        { key: "sku", label: "SKU" },
                        { key: "name", label: "Item Name" },
                        { key: "reorder_level", label: "Reorder Level" }
                      ]} 
                    />
                  } />
                  <Route path="/suppliers" element={
                    <MasterListPage 
                      title="Suppliers" 
                      endpoint="suppliers" 
                      columns={[
                        { key: "code", label: "Code" },
                        { key: "name", label: "Supplier Name" },
                        { key: "phone", label: "Phone" }
                      ]} 
                    />
                  } />
                  <Route path="/godowns" element={
                    <MasterListPage 
                      title="Godowns" 
                      endpoint="godowns" 
                      columns={[
                        { key: "code", label: "Code" },
                        { key: "name", label: "Godown Name" }
                      ]} 
                    />
                  } />
                  <Route path="/outlets" element={
                    <MasterListPage 
                      title="Outlets" 
                      endpoint="outlets" 
                      columns={[
                        { key: "code", label: "Code" },
                        { key: "name", label: "Outlet Name" }
                      ]} 
                    />
                  } />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </div>
      </main>
    </div>
  );
};

// --- Pages ---

const LoginPage = ({ onLogin }: { onLogin: (user: User, token: string) => void }) => {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("password");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json() as any;
      if (res.ok) {
        onLogin(data.user, data.token);
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/20 mb-4">
            <Warehouse size={32} />
          </div>
          <h2 className="text-2xl font-bold text-white">OmniStock</h2>
          <p className="text-slate-400 mt-1">Warehouse Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              placeholder="Enter your username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              placeholder="Enter your password"
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const DashboardPage = () => {
  const { format } = useSettings();
  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalStockValue: number;
    totalItems: number;
    lowStockCount: number;
    nearExpiryCount: number;
  }>({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/dashboard/summary", { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      if (!res.ok) throw new Error("Failed to fetch dashboard summary");
      return res.json();
    },
    staleTime: 60000, // 60 seconds
    gcTime: 1000 * 60 * 10, // 10 minutes
  });

  const { data: recentMovements = [], isLoading: movementsLoading } = useQuery<any[]>({
    queryKey: ["recent-movements"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/inventory/movements", { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      if (!res.ok) throw new Error("Failed to fetch movements");
      const data = await res.json();
      return Array.isArray(data) ? data.slice(0, 5) : [];
    },
    staleTime: 60000, // 60 seconds
    gcTime: 1000 * 60 * 10, // 10 minutes
  });

  if (statsLoading || movementsLoading) return (
    <div className="animate-pulse space-y-8">
      <div className="h-12 bg-slate-900 rounded-xl w-1/3" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-slate-900 rounded-3xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 h-96 bg-slate-900 rounded-3xl" />
        <div className="h-96 bg-slate-900 rounded-3xl" />
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Welcome back, Admin</h2>
          <p className="text-slate-400 mt-1">Here's what's happening in your warehouses today.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/inventory/ledger" className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl border border-slate-700 transition-colors flex items-center gap-2">
            <Clock size={18} />
            <span>History</span>
          </Link>
          <Link to="/inventory/grn/new" className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2">
            <Plus size={18} />
            <span>New Receipt</span>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={DollarSign} label="Stock Value" value={format(stats?.totalStockValue || 0)} color="emerald" />
        <StatCard icon={Package} label="Total Items" value={stats?.totalItems || 0} color="blue" />
        <StatCard icon={AlertTriangle} label="Low Stock" value={stats?.lowStockCount || 0} color="amber" />
        <StatCard icon={Clock} label="Near Expiry" value={stats?.nearExpiryCount || 0} color="rose" />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">Recent Movements</h3>
            <Link to="/inventory/ledger" className="text-emerald-400 text-sm font-medium hover:underline">View All</Link>
          </div>
          <div className="space-y-4">
            {recentMovements.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No recent movements found.</p>
            ) : recentMovements.map((m, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700/50 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.quantity > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                    <Package size={20} />
                  </div>
                  <div>
                    <p className="font-medium text-white">{m.item_name}</p>
                    <p className="text-xs text-slate-400 uppercase tracking-wider">{m.movement_type.replace('_', ' ')} • {m.godown_name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${m.quantity > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </p>
                  <p className="text-xs text-slate-500">{new Date(m.created_at).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <h3 className="text-xl font-bold text-white mb-6">Warehouse Status</h3>
          <div className="space-y-6">
            {["Main Central", "Cold Storage"].map((name, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">{name}</span>
                  <span className="text-slate-400">{75 + i * 10}% Capacity</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${75 + i * 10}%` }}
                    className={cn("h-full rounded-full", i === 0 ? "bg-emerald-500" : "bg-blue-500")} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, color }: { icon: any, label: string, value: any, color: string }) => {
  const colors: any = {
    emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    amber: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    rose: "bg-rose-500/10 text-rose-500 border-rose-500/20"
  };

  return (
    <div className={cn("p-6 rounded-3xl border bg-slate-900/50 backdrop-blur-sm", colors[color])}>
      <div className="flex items-center justify-between mb-4">
        <div className={cn("p-2 rounded-xl", colors[color].split(" ")[0])}>
          <Icon size={24} />
        </div>
        <BarChart3 size={20} className="opacity-20" />
      </div>
      <p className="text-slate-400 text-sm font-medium">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
    </div>
  );
};

const MasterListPage = ({ title, endpoint, columns }: { title: string, endpoint: string, columns: any[] }) => {
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ["master-data", endpoint],
    queryFn: async () => {
      const res = await fetch(`/api/${endpoint}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) throw new Error(`Failed to fetch ${endpoint}`);
      return res.json();
    },
    staleTime: 1000 * 60 * 15, // 15 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  });

  if (isLoading) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">{title}</h2>
        <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2">
          <Plus size={18} />
          <span>Add New</span>
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center gap-4 bg-slate-900/50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder={`Search ${title.toLowerCase()}...`}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            />
          </div>
          <button className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 border border-slate-700">
            <Filter size={18} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50">
                {columns.map(col => (
                  <th key={col.key} className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {col.label}
                  </th>
                ))}
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i} className="animate-pulse">
                    {columns.map(col => (
                      <td key={col.key} className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-24" /></td>
                    ))}
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-8 ml-auto" /></td>
                  </tr>
                ))
              ) : data.map((item: any, i: number) => (
                <tr key={i} className="hover:bg-slate-800/30 transition-colors group">
                  {columns.map(col => (
                    <td key={col.key} className="px-6 py-4 text-sm text-slate-300">
                      {item[col.key]}
                    </td>
                  ))}
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
};

// --- Main App ---

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const [mobileTab, setMobileTab] = useState('dashboard');

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
    }
    setIsReady(true);
  }, []);

  const handleLogin = (user: User, token: string) => {
    setUser(user);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("token", token);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
  };

  if (!isReady) return null;

  if (user && isMobile) {
    return (
      <Router>
        <Suspense fallback={<LoadingSkeleton />}>
          <MobileLayout 
            user={user} 
            activeTab={mobileTab} 
            onTabChange={setMobileTab}
            onLogout={handleLogout}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={mobileTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                {mobileTab === 'dashboard' && <MobileDashboard user={user} onTabChange={setMobileTab} />}
                {mobileTab === 'inventory' && <MobileInventory />}
                {mobileTab === 'operations' && <MobileOperations onAction={setMobileTab} />}
                {mobileTab === 'alerts' && <SmartAlertsCenter />}
                {mobileTab === 'smart-alerts' && <SmartAlertsCenter />}
                {mobileTab === 'grn' && <GRNForm />}
                {mobileTab === 'issue' && <StockIssueForm />}
                {mobileTab === 'transfer' && <TransferForm />}
                {mobileTab === 'stock-count' && <StockCount />}
                {mobileTab === 'wastage' && <Wastage />}
                {mobileTab === 'finance' && <FinanceDashboard />}
              </motion.div>
            </AnimatePresence>
          </MobileLayout>
        </Suspense>
      </Router>
    );
  }

  return (
    <Router>
      {!user ? (
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      ) : (
        <Layout user={user} onLogout={handleLogout}>
          <div /> 
        </Layout>
      )}
    </Router>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <AppContent />
      </SettingsProvider>
    </QueryClientProvider>
  );
}
