import {adminPrimaryPages,adminAdvancedPages} from '../../lib/adminNavigation';
import { isOwnerPreview, isAdminPass } from '../../lib/ownerPreview/state';
import { type ReactNode, useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Zap, LayoutDashboard, Users, LogOut, Menu, Activity,
  Send, X,
  User, Settings, ListChecks,
  Shield, ShieldCheck, Cpu, ClipboardList,
  Layers, Radio, ArrowLeftRight, Server,
  SlidersHorizontal, FlaskConical
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePreviewViewer } from '../../contexts/OwnerPreviewContext';

const icons:Record<string,LucideIcon>={Zap,LayoutDashboard,Users,Send,Settings,ListChecks,Shield,ShieldCheck,Cpu,ClipboardList,Layers,Radio,Server,SlidersHorizontal,FlaskConical,Activity};
const adminNav=[...adminPrimaryPages,...adminAdvancedPages];

export function AdminLayout({ children, title, description }: { children: ReactNode; title?: string; description?: string }) {
  const { displayProfile: profile, signOut } = usePreviewViewer();
  const loc = useLocation();
  const nav = useNavigate();
  const [sideOpen, setSideOpen] = useState(false);
  const [advanced,setAdvanced]=useState(adminAdvancedPages.some(p=>p.to===loc.pathname));

  const bottomNav=[adminPrimaryPages[0],adminPrimaryPages[1],adminPrimaryPages[3],adminPrimaryPages[4],adminPrimaryPages[6]].map((p,i)=>({...p,label:['Setup','Scanner','Telegram','Customers','Growth'][i]}));

  const navRef = useRef<HTMLElement>(null);
  const scrollPosRef = useRef(0);

  // Derive active page title
  const currentNav = adminNav.find(item => item.to === loc.pathname) as {to:string;label:string;icon:string}|undefined;
  const currentTitle = currentNav?.label || (loc.pathname.includes('/admin/operator') ? 'Command Center' : 'Operator Console');

  // Preserve sidebar scroll across route changes
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    el.scrollTop = scrollPosRef.current;
    const onScroll = () => { scrollPosRef.current = el.scrollTop; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [loc.pathname]);

  // Close sidebar on route change on mobile
  useEffect(() => {
    setSideOpen(false);
  }, [loc.pathname]);

  async function handleSignOut() {
    await signOut();
    nav('/');
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Sidebar Drawer */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[85vw] max-w-72 bg-zinc-900/98 backdrop-blur-xl border-r border-zinc-800 flex flex-col transition-transform duration-300 ease-out md:w-60 md:max-w-none shadow-2xl md:shadow-none ${sideOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        {/* Drawer Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-zinc-800 shrink-0">
          <Link to="/admin/launch" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-900/40">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-black tracking-tight leading-none text-white">HashiBot</div>
              <div className="text-[10px] font-mono text-blue-400 font-semibold tracking-wider uppercase mt-1">Operator Console</div>
            </div>
          </Link>
          <button
            onClick={() => setSideOpen(false)}
            className="md:hidden p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav ref={navRef} className="flex-1 px-3 py-3 flex flex-col gap-1 overflow-y-auto overscroll-contain scrollbar-thin">
          {adminPrimaryPages.map(item=>{const Icon=icons[item.icon];return <Link key={item.to} to={item.to} title={item.purpose} onClick={()=>setSideOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${loc.pathname===item.to?'bg-blue-600 text-white':'text-zinc-400 hover:bg-zinc-800/70'}`}><Icon size={16}/><span className="truncate">{item.label}</span></Link>})}
          <button aria-expanded={advanced} onClick={()=>setAdvanced(v=>!v)} className="mt-3 rounded border border-zinc-700 px-3 py-2 text-left text-xs text-zinc-400">{advanced?'Hide':'Show'} advanced tools</button>
          {advanced&&<><p className="px-3 text-[10px] text-zinc-500">Research, execution and diagnostics.</p>{adminAdvancedPages.map(item=>{const Icon=icons[item.icon];return <Link key={item.to} to={item.to} title={item.purpose} onClick={()=>setSideOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs ${loc.pathname===item.to?'bg-blue-600 text-white':'text-zinc-400 hover:bg-zinc-800/70'}`}><Icon size={16}/><span className="truncate">{item.label}</span></Link>})}</>}
        </nav>

        {/* Mobile & Desktop User & Switcher Footer */}
        <div className="border-t border-zinc-800/80 p-3 bg-zinc-950/60 shrink-0 space-y-2">
          <Link
            to="/app/dashboard"
            className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 rounded-xl transition-all"
          >
            <span className="flex items-center gap-2">
              <ArrowLeftRight size={13} className="text-blue-400" />
              User Dashboard
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">CLIENT VIEW</span>
          </Link>

          <div className="flex items-center justify-between px-2 pt-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                <User size={13} className="text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-200 truncate">{isOwnerPreview() ? 'Owner Preview visitor' : profile?.full_name || profile?.email || 'Administrator'}</p>
                <p className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {isOwnerPreview() ? "Preview · no authority" : isAdminPass() ? "UI access" : "Operator Active"}
                </p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop for Mobile Drawer */}
      {sideOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden animate-in fade-in duration-200"
          onClick={() => setSideOpen(false)}
        />
      )}

      {/* Main Container */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen min-w-0">
        {/* Top Header Bar */}
        <header className="h-14 sm:h-16 border-b border-zinc-800/80 flex items-center px-3.5 sm:px-6 gap-3 sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-md shrink-0">
          <button
            onClick={() => setSideOpen(true)}
            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/90 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all shadow-sm"
            aria-label="Open Navigation"
          >
            <Menu size={18} />
          </button>

          {/* Current Page Title on Mobile & Tablet */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <h1 className="text-sm font-bold text-zinc-100 truncate tracking-tight">
              {currentTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-mono text-zinc-500 hidden lg:inline">
              {isOwnerPreview() ? "SIMULATED TELEMETRY" : isAdminPass() ? "BACKEND AUTH REQUIRED" : "RECORDED TELEMETRY"}
            </span>
            <Link
              to="/admin/launch"
              className="text-[11px] font-mono text-orange-400 bg-orange-500/10 border border-orange-500/30 px-2.5 py-1 rounded-full font-bold tracking-wide flex items-center gap-1.5 shadow-sm"
            >
              <Shield size={11} className="text-orange-400" />
              <span>{isOwnerPreview() ? "PREVIEW" : isAdminPass() ? "ADMIN PASS" : "ADMIN"}</span>
            </Link>
            <Link
              to="/app/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Open User Client Dashboard"
            >
              <User size={13} className="text-blue-400" />
              <span>Client</span>
            </Link>
            <button
              onClick={handleSignOut}
              className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-red-500/30 hover:text-red-400 transition-colors"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 p-3.5 sm:p-5 md:p-6 pb-28 md:pb-8 min-w-0" key={loc.pathname}>
          {title && <header className="mb-5"><h1 className="text-xl font-bold">{title}</h1>{description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}</header>}{children}
        </main>

        {/* Modern Mobile Bottom Navigation */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-zinc-800/90 bg-zinc-950/95 backdrop-blur-lg pt-1 pb-[max(0.6rem,env(safe-area-inset-bottom))] md:hidden shadow-2xl">
          {bottomNav.map((item) => {
            const active = loc.pathname === item.to;
            const Icon = icons[item.icon];
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative flex min-w-0 flex-col items-center justify-center gap-1 py-1.5 text-[10px] font-medium transition-all ${
                  active ? 'text-blue-400 font-bold scale-105' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {active && (
                  <span className="absolute top-0 w-6 h-0.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500" />
                )}
                <Icon size={17} className={active ? 'text-blue-400' : 'text-zinc-500'} />
                <span className="max-w-full truncate text-[9.5px] leading-none">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
