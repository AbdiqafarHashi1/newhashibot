import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, User, X, Zap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/signal-mode', label: 'Signal Mode' },
  { to: '/personal-ea', label: 'Crypto Personal Bot' },
  { to: '/prop-ea', label: 'Forex MT5 Prop Bot' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/results', label: 'Results' },
];

export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const { session, loading, isAdmin, signOut } = useAuth();
  const isLoggedIn = Boolean(session);

  async function handleSignOut() {
    await signOut();
    setOpen(false);
    nav('/');
  }

  const accountLinks = loading ? null : isLoggedIn ? (
    <>
      {isAdmin ? (
        <Link to="/admin/control-room" className="text-sm text-orange-300 hover:text-orange-200 transition-colors px-3 py-1.5 rounded-lg hover:bg-orange-500/10">
          Admin Panel
        </Link>
      ) : (
        <Link to="/app/dashboard" className="text-sm text-zinc-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800/60">
          Dashboard
        </Link>
      )}
      <Link to="/app/account" className="text-sm text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800/60">
        Account
      </Link>
      <button onClick={handleSignOut} className="text-sm text-zinc-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800/60">
        Sign Out
      </button>
    </>
  ) : (
    <>
      <Link to="/login" className="text-sm text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800/60">
        Login
      </Link>
      <Link
        to="/register"
        className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-lg shadow-blue-600/20"
      >
        Get Access
      </Link>
    </>
  );

  const mobileAccountControls = loading ? null : isLoggedIn ? (
    <div className="md:hidden flex items-center gap-1.5">
      {isAdmin ? (
        <Link
          to="/admin/control-room"
          className="inline-flex h-8 items-center rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 text-[11px] font-bold tracking-wide text-orange-300 shadow-lg shadow-orange-950/10"
          aria-label="Open admin panel"
        >
          ADMIN
        </Link>
      ) : (
        <Link
          to="/app/dashboard"
          className="inline-flex h-8 items-center rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 text-[11px] font-semibold text-blue-300"
          aria-label="Open dashboard"
        >
          App
        </Link>
      )}
      <Link
        to="/app/account"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/80 text-zinc-300 shadow-lg shadow-black/10"
        aria-label="Open account"
      >
        <User size={14} />
      </Link>
      <button
        onClick={handleSignOut}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/80 text-zinc-400 hover:border-red-500/30 hover:text-red-300"
        aria-label="Sign out"
      >
        <LogOut size={14} />
      </button>
    </div>
  ) : (
    <div className="md:hidden flex items-center gap-1.5">
      <Link to="/login" className="inline-flex h-8 items-center rounded-full border border-zinc-700/80 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-300">
        Login
      </Link>
      <Link to="/register" className="inline-flex h-8 items-center rounded-full bg-blue-600 px-3 text-xs font-semibold text-white shadow-lg shadow-blue-600/20">
        Join
      </Link>
    </div>
  );

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md shadow-xl shadow-black/20' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Zap size={16} className="text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight leading-none">HashiBot</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(l => (
              <Link
                key={l.to}
                to={l.to}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  loc.pathname === l.to
                    ? 'text-white bg-zinc-800'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {accountLinks}
          </div>

          <div className="md:hidden ml-auto flex items-center gap-2">
            {mobileAccountControls}
            <button
              onClick={() => setOpen(!open)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/80 text-zinc-300 shadow-lg shadow-black/10 hover:border-zinc-700 hover:text-white"
              aria-label="Open navigation menu"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {open && (
          <div className="md:hidden border-t border-zinc-800/80 bg-zinc-950/98 px-4 py-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-600">Navigation</div>
            <div className="flex flex-col gap-1">
            {navLinks.map(l => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className={`text-sm py-2.5 px-3 rounded-lg transition-colors ${
                  loc.pathname === l.to ? 'text-white bg-zinc-800' : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                {l.label}
              </Link>
            ))}
            </div>
          </div>
        )}
      </header>

      <main className="pt-16">{children}</main>

      <footer className="border-t border-zinc-800/60 mt-24 py-12 px-4 bg-zinc-900/20">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-10">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center">
                  <Zap size={13} className="text-white" />
                </div>
                <span className="font-bold">HashiBot</span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed max-w-xs">
                Systematic crypto signals with structure, risk levels, and outcome tracking.
                Rule-based strategies. No guesswork.
              </p>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3 font-medium">Products</div>
              <div className="space-y-2">
                <Link to="/signal-mode" className="block text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Signal Mode</Link>
                <Link to="/personal-ea" className="block text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Crypto Personal Bot</Link>
                <Link to="/prop-ea" className="block text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Forex MT5 Prop Bot</Link>
                <Link to="/pricing" className="block text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Pricing</Link>
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3 font-medium">Resources</div>
              <div className="space-y-2">
                <Link to="/results" className="block text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Results</Link>
                <Link to="/faq" className="block text-sm text-zinc-400 hover:text-zinc-100 transition-colors">FAQ</Link>
                {isLoggedIn ? (
                  <Link to={isAdmin ? '/admin/control-room' : '/app/dashboard'} className="block text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
                    {isAdmin ? 'Admin Panel' : 'Dashboard'}
                  </Link>
                ) : (
                  <Link to="/login" className="block text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Login</Link>
                )}
              </div>
            </div>
          </div>
          <div className="border-t border-zinc-800/60 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-zinc-600">© 2026 HashiBot. All rights reserved.</p>
            <p className="text-xs text-zinc-600 text-center max-w-md">
              Trading signals are for educational and informational purposes only. Past performance does not guarantee future results. Trade responsibly.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
