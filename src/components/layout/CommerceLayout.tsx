import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';

export function CommerceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100 selection:bg-blue-500 selection:text-white">
      <header className="border-b border-zinc-800/80 bg-zinc-950/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-black tracking-tight text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-lg shadow-blue-900/40"><Zap size={17} /></span>
            Hashi<span className="-ml-2 text-blue-400">Bot</span>
          </Link>
          <div className="flex items-center gap-4 text-xs font-semibold text-zinc-400">
            <Link to="/results" className="hover:text-white">Results</Link>
            <Link to="/free" className="hover:text-white">Free</Link>
            <Link to="/vip" className="text-blue-400 hover:text-blue-300">VIP</Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
