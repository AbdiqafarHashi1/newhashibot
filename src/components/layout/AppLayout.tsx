import { isOwnerPreview } from '../../lib/ownerPreview/state';
import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Zap, LayoutDashboard, Radio, MessageCircle, LogOut, Menu,
  Eye, User, ShieldCheck, Package, Server, Award, Sliders, Cpu
} from 'lucide-react';
import { usePreviewViewer } from '../../contexts/OwnerPreviewContext';
import { LiveSignalNotifier } from '../signals/LiveSignalNotifier';

export function AppLayout({ children }: { children: ReactNode }) {
  const { displayProfile: profile, signOut, isAdmin } = usePreviewViewer();
  const loc = useLocation();
  const nav = useNavigate();
  const [sideOpen, setSideOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    nav('/');
  }

  const isCurrent = (path: string) => loc.pathname === path || (path !== '/app/dashboard' && loc.pathname.startsWith(path));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-transform duration-200 ${sideOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="h-16 flex items-center justify-between px-5 border-b border-zinc-800">
          <Link to="/app/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-600/30">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight text-white">HashiBot VIP</span>
              <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Analysis & Membership</span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-5 overflow-y-auto"><Link to="/app/onboarding" className="rounded border border-cyan-800 px-3 py-2 text-sm text-cyan-300">My onboarding</Link><Link to="/app/billing" className="px-3 text-sm text-zinc-300">Billing &amp; access</Link>
          {/* Section 1: Signals & Market Stream */}
          <div>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
              <span>VIP Signals Stream</span>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-zinc-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-500"></span>
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Link
                to="/app/dashboard"
                onClick={() => setSideOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  loc.pathname === '/app/dashboard' || loc.pathname === '/app'
                    ? 'bg-blue-600/20 text-blue-400 font-bold'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                }`}
              >
                <LayoutDashboard size={15} />
                <span>Command Overview</span>
              </Link>

              <Link
                to="/app/signals"
                onClick={() => setSideOpen(false)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  isCurrent('/app/signals')
                    ? 'bg-emerald-600/20 text-emerald-400 font-bold border border-emerald-500/20'
                    : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Radio size={15} className="text-emerald-400 animate-pulse" />
                  <span>Active Signals</span>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold font-mono">
                  LIVE
                </span>
              </Link>

              <Link
                to="/app/watchlist"
                onClick={() => setSideOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  isCurrent('/app/watchlist')
                    ? 'bg-blue-600/20 text-blue-400 font-bold'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                }`}
              >
                <Eye size={15} />
                <span>Asset Watchlist</span>
              </Link>
            </div>
          </div>

          {/* Section 2: Execution Automation (Auto-Bots) */}
          <details>
            <summary className="px-3 text-xs text-zinc-400 cursor-pointer">Execution accounts · advanced</summary>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
              <span>Separate account setup</span>
              <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.2 rounded font-mono">AUTO</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Link
                to="/app/crypto-execution"
                onClick={() => setSideOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  isCurrent('/app/crypto-execution')
                    ? 'bg-blue-600/20 text-blue-400 font-bold'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                }`}
              >
                <Zap size={15} className="text-amber-400" />
                <span>Crypto Execution</span>
              </Link>

              <Link
                to="/app/bridge"
                onClick={() => setSideOpen(false)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  isCurrent('/app/bridge')
                    ? 'bg-cyan-600/20 text-cyan-400 font-bold border border-cyan-500/20'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Cpu size={15} className="text-cyan-400" />
                  <span>MT5 Visual Bridge</span>
                </div>
                <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded font-mono font-bold">
                  NEW
                </span>
              </Link>

              <Link
                to="/app/mt5-personal"
                onClick={() => setSideOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  isCurrent('/app/mt5-personal')
                    ? 'bg-blue-600/20 text-blue-400 font-bold'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                }`}
              >
                <Server size={15} className="text-blue-400" />
                <span>MT5 Personal Forex</span>
              </Link>

              <Link
                to="/app/mt5-prop"
                onClick={() => setSideOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  isCurrent('/app/mt5-prop')
                    ? 'bg-blue-600/20 text-blue-400 font-bold'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                }`}
              >
                <Award size={15} className="text-amber-400" />
                <span>MT5 Prop Challenge</span>
              </Link>

              <Link
                to="/app/bot-setup"
                onClick={() => setSideOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  isCurrent('/app/bot-setup')
                    ? 'bg-blue-600/20 text-blue-400 font-bold'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                }`}
              >
                <Sliders size={15} />
                <span>Bot Setup & API Keys</span>
              </Link>
            </div>
          </details>

          {/* Section 3: Membership, Telegram & Billing */}
          <div>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              <span>Account & Channels</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Link
                to="/vip"
                onClick={() => setSideOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  isCurrent('/app/package-request')
                    ? 'bg-blue-600/20 text-blue-400 font-bold'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                }`}
              >
                <Package size={15} className="text-emerald-400" />
                <span>Upgrade to VIP</span>
              </Link>

              <Link
                to="/app/telegram"
                onClick={() => setSideOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  isCurrent('/app/telegram')
                    ? 'bg-blue-600/20 text-blue-400 font-bold'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                }`}
              >
                <MessageCircle size={15} className="text-sky-400" />
                <span>Telegram Setup</span>
              </Link>

              <Link
                to="/app/account"
                onClick={() => setSideOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  isCurrent('/app/account')
                    ? 'bg-blue-600/20 text-blue-400 font-bold'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                }`}
              >
                <User size={15} />
                <span>Profile & Security</span>
              </Link>
            </div>
          </div>
        </nav>

        {/* Footer info & Logout */}
        <div className="hidden md:block border-t border-zinc-800 p-3 bg-zinc-950/40">
          {isAdmin && (
            <Link
              to="/admin/launch"
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 rounded-xl mb-2 transition-colors border border-orange-500/20"
            >
              <ShieldCheck size={14} />
              <span>Admin setup & launch</span>
            </Link>
          )}

          <div className="flex items-center gap-2 px-2 py-1.5 mb-1 bg-zinc-900 rounded-xl border border-zinc-800">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs">
              {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{profile?.full_name || profile?.email}</p>
              <p className="text-[10px] text-zinc-500 font-mono capitalize">{profile?.role || 'Customer'}</p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {sideOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setSideOpen(false)} />
      )}

      {/* Main Header & Body */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen min-w-0">
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20 bg-zinc-950/95 backdrop-blur shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSideOpen(true)}
              className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white"
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-zinc-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-500"></span>
              </span>
              <span className="text-xs font-bold font-mono text-zinc-300">
                {isOwnerPreview() ? "SIMULATED SCANNER" : "ACCOUNT WORKSPACE"}
              </span>
              <span className="hidden sm:inline-flex text-[10px] text-zinc-500 font-mono bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
                EAT (UTC+3)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Audio Chime & Push Alert Controls in Top Nav */}
            {isOwnerPreview() ? <span className="text-xs text-amber-300">Demo alerts</span> : <LiveSignalNotifier />}

            {isAdmin && (
              <Link
                to="/admin/launch"
                className="hidden sm:inline-flex items-center gap-1 h-8 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 text-xs font-bold text-orange-300 hover:bg-orange-500/20"
              >
                ADMIN
              </Link>
            )}

            <div className="md:hidden flex items-center gap-1.5">
              <Link to="/app/account" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300">
                <User size={14} />
              </Link>
              <button onClick={handleSignOut} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-red-400">
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto min-w-0 overflow-x-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
