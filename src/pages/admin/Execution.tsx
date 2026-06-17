import { Link } from 'react-router-dom';
import { Activity, BarChart2, Cpu, Server, Shield } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';

const cards = [
  { title: 'Binance', to: '/admin/providers/binance', icon: Server, copy: 'Binance status, API health, symbol cache, orders, protection, recovery, and settings.' },
  { title: 'Bybit', to: '/admin/providers/bybit', icon: Shield, copy: 'Bybit operations with restriction visibility and provider-specific execution records.' },
  { title: 'MT5 Personal', to: '/admin/providers/mt5-personal', icon: Cpu, copy: 'Personal MT5 account health, broker details, open trades, and personal-mode metrics.' },
  { title: 'MT5 Prop', to: '/admin/providers/mt5-prop', icon: Activity, copy: 'Prop-only MT5 workspace with drawdown, compliance, exposure, and rule-violation panels.' },
  { title: 'Comparison', to: '/admin/providers/comparison', icon: BarChart2, copy: 'Analytics-only provider execution quality comparison. No operational controls.' },
];

export default function Execution() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-400">Admin / Providers</p>
          <h1 className="text-2xl font-bold">Provider Operations Center</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Execution has been deprecated as the primary operational page. Choose a dedicated provider workspace for controls,
            provider truth, recovery, and settings, or open Comparison for analytics-only parity review.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ title, to, icon: Icon, copy }) => (
            <Link key={to} to={to} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 transition hover:border-emerald-500/50 hover:bg-zinc-900">
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-emerald-300"><Icon size={20} /></div>
                <span className="text-xs text-zinc-500">Open workspace →</span>
              </div>
              <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{copy}</p>
            </Link>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
