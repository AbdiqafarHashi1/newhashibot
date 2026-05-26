import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Zap } from 'lucide-react';

const navLinks = [
  { to: '/signal-mode', label: 'Signal Mode' },
  { to: '/personal-ea', label: 'Personal EA' },
  { to: '/prop-ea', label: 'Prop EA' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/results', label: 'Results' },
  { to: '/faq', label: 'FAQ' },
];

export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">HashiBot</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map(l => (
              <Link
                key={l.to}
                to={l.to}
                className={`text-sm transition-colors ${loc.pathname === l.to ? 'text-white' : 'text-zinc-400 hover:text-zinc-100'}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">Log In</Link>
            <Link to="/register" className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors font-medium">
              Get Started
            </Link>
          </div>

          <button onClick={() => setOpen(!open)} className="md:hidden text-zinc-400 hover:text-white">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {open && (
          <div className="md:hidden border-t border-zinc-800 bg-zinc-950 px-4 py-4 flex flex-col gap-3">
            {navLinks.map(l => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)}
                className="text-sm text-zinc-300 hover:text-white py-1">{l.label}</Link>
            ))}
            <div className="pt-2 border-t border-zinc-800 flex flex-col gap-2">
              <Link to="/login" onClick={() => setOpen(false)} className="text-sm text-zinc-400 hover:text-white">Log In</Link>
              <Link to="/register" onClick={() => setOpen(false)} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg text-center">Get Started</Link>
            </div>
          </div>
        )}
      </header>

      <main className="pt-16">{children}</main>

      <footer className="border-t border-zinc-800 mt-20 py-10 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center">
              <Zap size={12} className="text-white" />
            </div>
            <span className="text-sm font-semibold">HashiBot</span>
          </div>
          <p className="text-xs text-zinc-600">Trading signals for educational purposes. Past performance does not guarantee future results.</p>
          <div className="flex gap-4 text-xs text-zinc-600">
            <Link to="/faq" className="hover:text-zinc-400">FAQ</Link>
            <Link to="/signal-mode" className="hover:text-zinc-400">Signal Mode</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
