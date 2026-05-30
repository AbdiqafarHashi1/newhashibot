import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Zap } from 'lucide-react';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/signal-mode', label: 'Signal Mode' },
  { to: '/personal-ea', label: 'Personal Mode' },
  { to: '/prop-ea', label: 'Prop Mode' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/results', label: 'Results' },
];

export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md shadow-xl shadow-black/20' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Zap size={16} className="text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">HashiBot</span>
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
            <Link to="/login" className="text-sm text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800/60">
              Login
            </Link>
            <Link
              to="/register"
              className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-lg shadow-blue-600/20"
            >
              Get Access
            </Link>
          </div>

          <button onClick={() => setOpen(!open)} className="md:hidden text-zinc-400 hover:text-white p-1">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {open && (
          <div className="md:hidden border-t border-zinc-800 bg-zinc-950 px-4 py-4 flex flex-col gap-1">
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
            <div className="pt-3 mt-1 border-t border-zinc-800 flex flex-col gap-2">
              <Link to="/login" onClick={() => setOpen(false)} className="text-sm text-zinc-400 hover:text-white py-2 px-3 rounded-lg hover:bg-zinc-800/60 transition-colors">
                Login
              </Link>
              <Link
                to="/register"
                onClick={() => setOpen(false)}
                className="text-sm bg-blue-600 text-white px-4 py-2.5 rounded-lg text-center font-medium"
              >
                Get Access
              </Link>
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
                <Link to="/personal-ea" className="block text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Personal Mode</Link>
                <Link to="/prop-ea" className="block text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Prop Mode</Link>
                <Link to="/pricing" className="block text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Pricing</Link>
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3 font-medium">Resources</div>
              <div className="space-y-2">
                <Link to="/results" className="block text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Results</Link>
                <Link to="/faq" className="block text-sm text-zinc-400 hover:text-zinc-100 transition-colors">FAQ</Link>
                <Link to="/login" className="block text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Login</Link>
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
