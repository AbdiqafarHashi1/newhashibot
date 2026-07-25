import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Zap, LayoutDashboard, Radio,
  MessageCircle, LogOut, Menu, Eye, User, ShieldCheck, Package, Server, Award, Sliders
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const userNav = [
  { to: '/app/dashboard',        label: 'Dashboard',             icon: LayoutDashboard },
  { to: '/app/signals',          label: 'Active Signals',         icon: Radio },
  { to: '/app/crypto-execution', label: 'Crypto Automation',      icon: Zap },
  { to: '/app/mt5-personal',     label: 'MT5 Personal Forex',     icon: Server },
  { to: '/app/mt5-prop',         label: 'MT5 Prop Automation',    icon: Award },
  { to: '/app/bot-setup',        label: 'Bot Setup & Account',    icon: Sliders },
  { to: '/app/package-request',  label: 'Packages & M-Pesa',      icon: Package },
  { to: '/app/telegram',         label: 'Telegram Setup',         icon: MessageCircle },
  { to: '/app/watchlist',        label: 'Watchlist',              icon: Eye },
  { to: '/app/account',          label: 'Account Profile',        icon: User },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, signOut, isAdmin } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [sideOpen, setSideOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    nav('/');
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-transform duration-200 ${sideOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="h-16 flex items-center px-5 border-b border-zinc-800">
          <Link to="/app/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="font-bold text-sm">HashiBot</span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
          {userNav.map(({ to, label, icon: Icon }) => {
            const active = loc.pathname === to;
            return (
              <Link key={to} to={to} onClick={() => setSideOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  active ? 'bg-blue-600/20 text-blue-400' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                }`}>
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block border-t border-zinc-800 p-3">
          {isAdmin && (
            <Link to="/admin/control-room"
              className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg mb-1 transition-colors">
              <ShieldCheck size={13} className="text-orange-400" />
              <span>Admin Panel</span>
            </Link>
          )}
          <div className="flex items-center gap-2 px-2 py-1 mb-1">
            <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center">
              <User size={14} className="text-zinc-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{profile?.full_name || profile?.email}</p>
              <p className="text-xs text-zinc-500 capitalize">{profile?.role}</p>
            </div>
          </div>
          <button onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors">
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {sideOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSideOpen(false)} />
      )}

      <div className="flex-1 md:ml-60 flex flex-col min-h-screen">
        <header className="h-14 border-b border-zinc-800 flex items-center px-4 gap-3 sticky top-0 z-20 bg-zinc-950/95 backdrop-blur shrink-0">
          <button onClick={() => setSideOpen(true)} className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:text-white">
            <Menu size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <span className="hidden sm:inline-flex text-xs text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded">Signal Mode MVP</span>
          </div>
          <div className="md:hidden flex items-center gap-1.5">
            {isAdmin && (
              <Link to="/admin/control-room" className="inline-flex h-8 items-center rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 text-[11px] font-bold tracking-wide text-orange-300">
                ADMIN
              </Link>
            )}
            <Link to="/app/account" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/80 text-zinc-300" aria-label="Open account">
              <User size={14} />
            </Link>
            <button onClick={handleSignOut} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/80 text-zinc-400 hover:border-red-500/30 hover:text-red-300" aria-label="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
