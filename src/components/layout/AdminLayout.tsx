import { ReactNode, useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Zap, LayoutDashboard, Users, LogOut, Menu, Activity,
  Database, Send, FileText, CheckCircle, AlertTriangle,
  PlusCircle, User, Settings, Clock, BarChart2, ListChecks,
  Radio, Link2, ShieldCheck, ClipboardList, Brain, Cpu, Layers, FlaskConical, PackageCheck, TrendingUp
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

type NavItem =
  | { section: string }
  | { to: string; label: string; icon: LucideIcon };

const adminNav: NavItem[] = [
  { section: 'Operations' },
  { to: '/admin/control-room',    label: 'Control Room',        icon: LayoutDashboard },
  { to: '/admin/scanner-config',  label: 'Scanner Config',      icon: Settings },
  { to: '/admin/providers',       label: 'Provider Health',     icon: Database },
  { to: '/admin/scanner',         label: 'Scanner Logs',        icon: Activity },
  { to: '/admin/scheduler',       label: 'Scheduler Guide',     icon: Clock },
  { section: 'Trading Brain' },
  { to: '/admin/trading-brain',   label: 'Brain Diagnostics',   icon: Brain },
  { to: '/admin/strategy-config', label: 'Strategy Config',     icon: Settings },
  { to: '/admin/modes',           label: 'Mode Control',        icon: Layers },
  { to: '/admin/execution',       label: 'Execution Overview',   icon: Cpu },
  { to: '/admin/provider-comparison', label: 'Provider Comparison', icon: BarChart2 },
  { to: '/admin/backtest-lab',    label: 'Backtest Lab',        icon: FlaskConical },
  { section: 'Signals' },
  { to: '/admin/signals',         label: 'Signals Manager',     icon: Radio },
  { to: '/admin/signals/new',     label: 'Create Signal',       icon: PlusCircle },
  { to: '/admin/candidates',      label: 'Candidate Setups',    icon: CheckCircle },
  { to: '/admin/rejected',        label: 'Rejected Setups',     icon: AlertTriangle },
  { to: '/admin/outcomes',        label: 'Outcome Tracking',    icon: BarChart2 },
  { to: '/admin/performance',     label: 'Performance Stats',   icon: TrendingUp },
  { section: 'Telegram' },
  { to: '/admin/telegram-test',   label: 'Telegram Verify',     icon: Send },
  { to: '/admin/telegram-links',  label: 'Telegram Links',      icon: Link2 },
  { to: '/admin/telegram',        label: 'Telegram Logs',       icon: FileText },
  { section: 'Admin' },
  { to: '/admin/customers',       label: 'Customers',           icon: ShieldCheck },
  { to: '/admin/users',           label: 'Users / Subscribers', icon: Users },
  { to: '/admin/access-requests', label: 'Access Requests',     icon: ClipboardList },
  { to: '/admin/audit',           label: 'Audit Logs',          icon: FileText },
  { to: '/admin/checklist',       label: 'MVP Test Checklist',  icon: ListChecks },
  { to: '/admin/handoff',         label: 'Handoff & Readiness', icon: PackageCheck },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [sideOpen, setSideOpen] = useState(false);
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
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-transform duration-200 ${sideOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <Link to="/admin/control-room" className="h-14 flex items-center px-5 border-b border-zinc-800 gap-2 shrink-0 hover:bg-zinc-800/40 transition-colors">
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
                {item.label}
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
          <span className="text-xs text-zinc-400 hidden sm:block">Signal Mode MVP</span>
          <Link to="/admin/control-room" className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 rounded-full font-bold tracking-wide">ADMIN</Link>
          <Link to="/app/dashboard" className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/80 text-zinc-300" aria-label="Open user dashboard">
            <User size={14} />
          </Link>
          <button onClick={handleSignOut} className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/80 text-zinc-400 hover:border-red-500/30 hover:text-red-300" aria-label="Sign out">
            <LogOut size={14} />
          </button>
        </header>
        <main className="flex-1 p-4 md:p-6 min-w-0 overflow-x-hidden" key={loc.pathname}>{children}</main>
      </div>
    </div>
  );
}
