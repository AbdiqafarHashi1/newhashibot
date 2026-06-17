import { useEffect, useMemo, useState } from 'react';
import { BarChart3, ShieldCheck, Zap } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { Badge } from '../../components/ui/Badge';
import { supabase } from '../../lib/supabase';

type ParityRow = {
  id: string;
  signal_id: string | null;
  execution_group_id: string | null;
  event_type: string;
  symbol: string;
  direction: string | null;
  binance_status: string | null;
  bybit_status: string | null;
  fill_price_diff: number | null;
  slippage_diff: number | null;
  binance_protection_verified: boolean | null;
  bybit_protection_verified: boolean | null;
  binance_recovery_success: boolean | null;
  bybit_recovery_success: boolean | null;
  binance_profit_lock_success: boolean | null;
  bybit_profit_lock_success: boolean | null;
  best_provider: string | null;
  fastest_provider: string | null;
  most_reliable_provider: string | null;
  safest_provider: string | null;
  lowest_slippage_provider: string | null;
  highest_profit_provider: string | null;
  parity_status: string;
  created_at: string;
};

type ProviderPerformance = {
  provider_name: string;
  executions: number;
  wins: number;
  losses: number;
  execution_failures: number;
  protected_count: number;
  protection_failures: number;
  profit_lock_successes: number;
  avg_slippage: number | null;
  avg_hold_minutes: number | null;
};

function pct(numerator: number, denominator: number): string {
  return denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : '—';
}

export default function ProviderComparison() {
  const [rows, setRows] = useState<ParityRow[]>([]);
  const [performance, setPerformance] = useState<ProviderPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      const [parityRes, performanceRes] = await Promise.all([
        supabase.from('provider_parity_audit').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('provider_execution_performance').select('*').order('provider_name'),
      ]);
      if (cancelled) return;
      if (parityRes.error || performanceRes.error) setError(parityRes.error?.message ?? performanceRes.error?.message ?? 'Unable to load provider comparison data');
      setRows((parityRes.data ?? []) as ParityRow[]);
      const perfRows = (performanceRes.data ?? []) as ProviderPerformance[];
      const byProvider = new Map(perfRows.map((row) => [row.provider_name, row]));
      setPerformance(['binance', 'bybit', 'mt5'].map((provider_name) => byProvider.get(provider_name) ?? { provider_name, executions: 0, wins: 0, losses: 0, execution_failures: 0, protected_count: 0, protection_failures: 0, profit_lock_successes: 0, avg_slippage: null, avg_hold_minutes: null }));
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const rankings = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const value of [row.best_provider, row.fastest_provider, row.most_reliable_provider, row.safest_provider, row.lowest_slippage_provider, row.highest_profit_provider]) {
        if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 size={22} className="text-blue-400" />Provider Comparison Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Analytics-only comparison of provider execution quality. Operational controls and execution buttons live in provider workspaces.</p>
      </div>

      {error && <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

      <div className="mb-6 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-200">Provider comparison is analytics only. It compares execution quality from provider truth records and does not expose operational controls.</div>

      <section className="grid md:grid-cols-3 gap-4 mb-6">
        {performance.map((provider) => (
          <div key={provider.provider_name} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="font-semibold uppercase text-sm">{provider.provider_name}</h2>
              <Badge variant={provider.provider_name === 'binance' ? 'green' : provider.provider_name === 'bybit' ? 'blue' : 'gray'}>{provider.executions} executions</Badge>
            </div>
            {provider.executions === 0 && <div className="mb-3 text-xs text-zinc-500">{provider.provider_name === 'bybit' ? 'No Bybit executions yet' : provider.provider_name === 'mt5' ? 'MT5 placeholder only' : 'No Binance executions yet'}</div>}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><div className="text-zinc-500">Win Rate</div><div className="font-mono text-zinc-100">{pct(provider.wins, provider.wins + provider.losses)}</div></div>
              <div><div className="text-zinc-500">Execution Failure</div><div className="font-mono text-zinc-100">{pct(provider.execution_failures, provider.executions)}</div></div>
              <div><div className="text-zinc-500">Protection Reliability</div><div className="font-mono text-zinc-100">{pct(provider.protected_count, provider.executions)}</div></div>
              <div><div className="text-zinc-500">Recovery Issues</div><div className="font-mono text-zinc-100">{provider.protection_failures}</div></div>
              <div><div className="text-zinc-500">Profit Lock Success</div><div className="font-mono text-zinc-100">{provider.profit_lock_successes}</div></div>
              <div><div className="text-zinc-500">Avg Slippage</div><div className="font-mono text-zinc-100">{provider.avg_slippage ?? '—'}</div></div>
              <div className="col-span-2"><div className="text-zinc-500">Avg Hold</div><div className="font-mono text-zinc-100">{provider.avg_hold_minutes ? `${provider.avg_hold_minutes.toFixed(1)}m` : '—'}</div></div>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 mb-6">
        <h2 className="font-semibold text-sm flex items-center gap-2 mb-3"><Zap size={16} className="text-yellow-400" />Automatic Provider Rankings</h2>
        {rankings.length === 0 ? <p className="text-sm text-zinc-500">No provider parity tests have been executed yet.</p> : (
          <div className="flex flex-wrap gap-2">{rankings.map(([provider, count]) => <Badge key={provider} variant="purple">{provider}: {count}</Badge>)}</div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-400" /><h2 className="font-semibold text-sm">Per-Signal Provider Parity</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950 text-zinc-500 text-xs uppercase">
              <tr><th className="px-3 py-2 text-left">Signal</th><th className="px-3 py-2 text-left">Symbol</th><th className="px-3 py-2 text-left">Event</th><th className="px-3 py-2 text-left">Binance</th><th className="px-3 py-2 text-left">Bybit</th><th className="px-3 py-2 text-left">Fill Diff</th><th className="px-3 py-2 text-left">Protection</th><th className="px-3 py-2 text-left">Recovery</th><th className="px-3 py-2 text-left">Profit Lock</th><th className="px-3 py-2 text-left">Best</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loading ? <tr><td className="px-3 py-4 text-zinc-500" colSpan={10}>Loading…</td></tr> : rows.length === 0 ? <tr><td className="px-3 py-4 text-zinc-500" colSpan={10}>No provider parity tests have been executed yet.</td></tr> : rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-800/40">
                  <td className="px-3 py-2 font-mono text-xs text-zinc-400">{row.signal_id ?? row.execution_group_id ?? '—'}</td>
                  <td className="px-3 py-2"><div className="font-medium">{row.symbol}</div><div className="text-xs text-zinc-500">{row.direction ?? '—'}</div></td>
                  <td className="px-3 py-2"><Badge variant="cyan">{row.event_type}</Badge></td>
                  <td className="px-3 py-2 text-xs text-zinc-300">{row.binance_status ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-zinc-300">{row.bybit_status ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-zinc-300">price {row.fill_price_diff ?? '—'} · slip {row.slippage_diff ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">B:{String(row.binance_protection_verified ?? '—')} / Y:{String(row.bybit_protection_verified ?? '—')}</td>
                  <td className="px-3 py-2 text-xs">B:{String(row.binance_recovery_success ?? '—')} / Y:{String(row.bybit_recovery_success ?? '—')}</td>
                  <td className="px-3 py-2 text-xs">B:{String(row.binance_profit_lock_success ?? '—')} / Y:{String(row.bybit_profit_lock_success ?? '—')}</td>
                  <td className="px-3 py-2 text-xs"><div>{row.best_provider ?? '—'}</div><div className="text-zinc-500">fast {row.fastest_provider ?? '—'}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}
