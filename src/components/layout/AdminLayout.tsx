import { ReactNode, useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Zap, LayoutDashboard, Users, LogOut, Menu, Activity,
  Database, Send, FileText, CheckCircle, AlertTriangle,
  User, Settings, ListChecks,
  Radio, ShieldCheck, Brain, Cpu, Target,
  Trash2, HardDrive, Cable, AlertCircle
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

type NavItem =
  | { section: string }
  | { to: string; label: string; icon: LucideIcon };

const adminNav: NavItem[] = [
  { section: 'Operator Panel' },
  { to: '/admin/operator', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/operator/signals', label: 'Signals', icon: Radio },
  { to: '/admin/operator/executions', label: 'Executions', icon: Cpu },
  { to: '/admin/operator/trade-manager', label: 'Trade Manager', icon: ShieldCheck },
  { to: '/admin/operator/telegram', label: 'Telegram', icon: Send },
  { to: '/admin/operator/settings', label: 'Settings', icon: Settings },
  { to: '/admin/operator/intelligence', label: 'News Brain', icon: Brain },
  { to: '/admin/operator/runtime-proof', label: 'Runtime Proof', icon: ListChecks },
  { section: 'Business' },
  { to: '/admin/customers', label: 'Customers', icon: ShieldCheck },
  { to: '/admin/users', label: 'Users / Subscribers', icon: Users },
  { to: '/admin/access-requests', label: 'Access Requests', icon: FileText },
  { to: '/admin/audit', label: 'Audit Logs', icon: FileText },
  { section: 'Signals' },
  { to: '/admin/signals', label: 'Signals Manager', icon: Radio },
  { to: '/admin/signals/new', label: 'Manual Signal', icon: Radio },
  { to: '/admin/candidates', label: 'Candidate Setups', icon: CheckCircle },
  { to: '/admin/rejected', label: 'Rejected Setups', icon: AlertTriangle },
  { to: '/admin/outcomes', label: 'Outcome Tracking', icon: Activity },
  { section: 'Execution' },
  { to: '/admin/execution', label: 'Execution Monitor', icon: Cpu },
  { to: '/admin/trading-brain', label: 'Trading Brain', icon: Brain },
  { to: '/admin/modes', label: 'Mode Config', icon: Settings },
  { to: '/admin/strategy-config', label: 'Strategy Config', icon: Settings },
  { to: '/admin/scanner-config', label: 'Scanner Config', icon: Settings },
  { section: 'Providers' },
  { to: '/admin/providers/binance', label: 'Binance Monitor', icon: Activity },
  { to: '/admin/providers/bybit', label: 'Bybit Operations', icon: ShieldCheck },
  { to: '/admin/providers', label: 'Provider Health', icon: Database },
  { to: '/admin/provider-comparison', label: 'Provider Comparison', icon: Database },
  { to: '/admin/prop', label: 'Prop Accounts', icon: Target },
  { section: 'Monitoring' },
  { to: '/admin/scanner', label: 'Scanner Logs', icon: Activity },
  { to: '/admin/performance', label: 'Performance', icon: Activity },
  { to: '/admin/telegram', label: 'Telegram Logs', icon: FileText },
  { to: '/admin/telegram-links', label: 'Telegram Links', icon: Send },
  { to: '/admin/telegram-test', label: 'Telegram Test', icon: Send },
  { section: 'Retention' },
  { to: '/admin/retention', label: 'Retention Policies', icon: Trash2 },
  { to: '/admin/storage', label: 'Storage Status', icon: HardDrive },
  { section: 'MT5 / HashiBridge' },
  { to: '/admin/mt5-bridge', label: 'Bridge Registry', icon: Cable },
  { to: '/admin/providers/mt5-personal', label: 'MT5 Personal', icon: Cpu },
  { to: '/admin/providers/mt5-prop', label: 'MT5 Prop', icon: Cpu },
  { section: 'Advanced / Debug' },
  { to: '/admin/backtest-lab', label: 'Backtest Lab', icon: FileText },
  { to: '/admin/scheduler', label: 'Scheduler Guide', icon: ListChecks },
  { to: '/admin/checklist', label: 'Setup Checklist', icon: CheckCircle },
  { to: '/admin/handoff', label: 'Handoff', icon: AlertCircle },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [sideOpen, setSideOpen] = useState(false);
  const bottomNav = [
    { to: '/admin/operator', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/operator/signals', label: 'Signals', icon: Radio },
    { to: '/admin/operator/trade-manager', label: 'Trades', icon: ShieldCheck },
    { to: '/admin/operator/intelligence', label: 'Intel', icon: Brain },
    { to: '/admin/operator/settings', label: 'Config', icon: Settings },
    { to: '/admin/operator/runtime-proof', label: 'Runtime', icon: ListChecks },
  ];
  const navRef = useRef<HTMLElement>(null);
  const scrollPosRef = useRef(0);

  // Preserve sidebar scroll across route changes
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    el.scrollTop = scrollPosRef.current;
    const onScroll = () => { scrollPosRef.current = el.scrollTop; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [loc.pathname]);

  async function handleSignOut() {
    await signOut();
    nav('/');
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex overflow-x-hidden">
      <aside className={`fixed inset-y-0 left-0 z-40 w-[82vw] max-w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-transform duration-200 md:w-60 md:max-w-none ${sideOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <Link to="/admin/operator" className="h-14 flex items-center px-5 border-b border-zinc-800 gap-2 shrink-0 hover:bg-zinc-800/40 transition-colors">
          <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold leading-none">HashiBot</div>
            <div className="text-xs text-zinc-500 leading-none mt-0.5">Operator Panel</div>
          </div>
        </Link>

        <nav ref={navRef} className="flex-1 px-3 py-3 flex flex-col gap-1 overflow-y-auto">
          {adminNav.map((item, i) => {
            if ('section' in item) {
              return (
                <div key={`section-${i}`} className="text-xs text-zinc-600 uppercase tracking-wider px-3 pt-4 pb-1 first:pt-1">
                  {item.section}
                </div>
              );
            }
            const active = loc.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} onClick={() => setSideOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  active ? 'bg-blue-600/20 text-blue-400' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                }`}>
                <Icon size={14} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block border-t border-zinc-800 p-3 shrink-0">
          <Link to="/app/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg mb-1 transition-colors">
            <ShieldCheck size={13} />
            User Dashboard
          </Link>
          <div className="flex items-center gap-2 px-2 py-1 mb-1">
            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
              <User size={12} className="text-zinc-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{profile?.full_name || profile?.email}</p>
              <p className="text-xs text-blue-400">Admin</p>
            </div>
          </div>
          <button onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors">
            <LogOut size={13} />
            Sign Out
          </button>
        </div>
      </aside>

      {sideOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSideOpen(false)} />
      )}

      <div className="flex-1 md:ml-60 flex flex-col min-h-screen min-w-0">
        <header className="h-14 border-b border-zinc-800 flex items-center px-4 gap-3 sticky top-0 z-20 bg-zinc-950/95 backdrop-blur shrink-0">
          <button onClick={() => setSideOpen(true)} className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:text-white">
            <Menu size={18} />
          </button>
          <div className="flex-1 min-w-0" />
          <span className="text-xs text-zinc-400 hidden sm:block">Runtime Truth</span>
          <Link to="/admin/operator" className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 rounded-full font-bold tracking-wide">ADMIN</Link>
          <Link to="/app/dashboard" className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/80 text-zinc-300" aria-label="Open user dashboard">
            <User size={14} />
          </Link>
          <button onClick={handleSignOut} className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/80 text-zinc-400 hover:border-red-500/30 hover:text-red-300" aria-label="Sign out">
            <LogOut size={14} />
          </button>
        </header>
        <main className="flex-1 p-4 pb-24 md:p-6 min-w-0 overflow-x-hidden" key={loc.pathname}>{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur md:hidden">
          {bottomNav.map((item) => {
            const active = loc.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} className={`flex min-w-0 flex-col items-center gap-1 px-1 py-2 text-[10px] ${active ? 'text-blue-300' : 'text-zinc-500'}`}>
                <Icon size={15} />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
