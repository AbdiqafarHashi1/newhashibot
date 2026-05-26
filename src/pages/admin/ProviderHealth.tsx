import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ProviderStatus, Symbol } from '../../lib/types';
import { statusBadge, Badge } from '../../components/ui/Badge';
import { Database, AlertTriangle, Info, CheckCircle, RefreshCw, Wifi } from 'lucide-react';

interface ForexTestResult {
  ok: boolean;
  provider: string;
  symbol?: string;
  timeframe?: string;
  candle_time?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  data_source?: string;
  error?: string;
  fallback_used?: boolean;
}

export default function ProviderHealth() {
  const { session } = useAuth();
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingBinance, setTestingBinance] = useState(false);
  const [testingForex, setTestingForex] = useState(false);
  const [binanceResult, setBinanceResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [forexResult, setForexResult] = useState<ForexTestResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    const [p, s] = await Promise.all([
      supabase.from('provider_status').select('*'),
      supabase.from('symbols').select('*').order('market_type').order('symbol'),
    ]);
    setProviders(p.data ?? []);
    setSymbols(s.data ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  async function testBinance() {
    setTestingBinance(true);
    setBinanceResult(null);
    try {
      const r = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=2');
      if (r.ok) {
        const data = await r.json() as unknown[][];
        const last = data[data.length - 1];
        const ts = new Date(last[0] as number).toLocaleString();
        setBinanceResult({ ok: true, msg: `Binance OK. Latest BTCUSDT 15m candle: ${ts} — Close: ${parseFloat(last[4] as string).toLocaleString()}` });
      } else {
        setBinanceResult({ ok: false, msg: `Binance returned HTTP ${r.status}` });
      }
    } catch (e) {
      setBinanceResult({ ok: false, msg: `Binance unreachable: ${e instanceof Error ? e.message : 'unknown'}` });
    } finally {
      setTestingBinance(false);
    }
  }

  async function testForexProvider() {
    if (!session) return;
    setTestingForex(true);
    setForexResult(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-scanner`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test_forex_only: true }),
      });
      const json = await res.json();
      if (json.forex_test) {
        setForexResult(json.forex_test as ForexTestResult);
      } else if (json.success) {
        // Full scan ran — extract forex info from response
        setForexResult({
          ok: json.forex_real_data === true,
          provider: json.forex_provider ?? 'unknown',
          data_source: json.forex_real_data ? 'REAL DATA' : 'DEMO DATA',
          fallback_used: json.forex_demo_fallback_used,
        });
        await load();
      } else {
        setForexResult({ ok: false, provider: 'unknown', error: json.error ?? 'Scanner returned error' });
      }
    } catch (e) {
      setForexResult({ ok: false, provider: 'unknown', error: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setTestingForex(false);
    }
  }

  // Identify forex provider from provider_status table
  const forexProvider = providers.find(p => p.market_type === 'forex');
  const cryptoProvider = providers.find(p => p.provider_name === 'binance');
  const isForexReal = forexProvider?.data_source_label === 'REAL DATA';
  const forexProviderName = forexProvider?.provider_name ?? 'demo';

  return (
    <AdminLayout>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Provider Health</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Market data provider status — shows what is real vs demo</p>
        </div>
        <button onClick={load} disabled={refreshing}
          className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50">
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Status cards */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className={`rounded-xl p-4 flex gap-3 border ${cryptoProvider?.status === 'active' ? 'bg-emerald-500/8 border-emerald-500/15' : 'bg-zinc-900 border-zinc-800'}`}>
          <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-zinc-200 mb-1">Crypto — Binance API</div>
            <div className="text-xs text-zinc-400 leading-relaxed">
              Public REST API — no key required.
              {cryptoProvider?.status === 'active'
                ? <span className="text-emerald-400 font-medium"> REAL DATA when reachable.</span>
                : <span className="text-zinc-500"> Not yet confirmed. Run a scan or test below.</span>}
            </div>
            {cryptoProvider?.last_success_at && (
              <div className="text-xs text-zinc-600 mt-1">Last success: {new Date(cryptoProvider.last_success_at).toLocaleString()}</div>
            )}
          </div>
        </div>
        <div className={`rounded-xl p-4 flex gap-3 border ${isForexReal ? 'bg-emerald-500/8 border-emerald-500/15' : 'bg-orange-500/8 border-orange-500/15'}`}>
          <Info size={16} className={`mt-0.5 shrink-0 ${isForexReal ? 'text-emerald-400' : 'text-orange-400'}`} />
          <div>
            <div className="text-sm font-semibold text-zinc-200 mb-1">
              Forex — {forexProviderName === 'demo' ? 'Demo Mode' : forexProviderName === 'twelvedata' ? 'Twelve Data' : forexProviderName}
            </div>
            <div className="text-xs text-zinc-400 leading-relaxed">
              Controlled by <code className="bg-zinc-800 px-1 rounded font-mono">FOREX_DATA_PROVIDER</code> secret.
              Current:{' '}
              <strong className={isForexReal ? 'text-emerald-400' : 'text-orange-400'}>
                {forexProviderName}
              </strong>
              {forexProvider?.data_source_label && (
                <span className={`ml-1.5 font-medium ${forexProvider.data_source_label === 'REAL DATA' ? 'text-emerald-400' : 'text-orange-400'}`}>
                  ({forexProvider.data_source_label})
                </span>
              )}
            </div>
            {forexProvider?.last_success_at && (
              <div className="text-xs text-zinc-600 mt-1">Last success: {new Date(forexProvider.last_success_at).toLocaleString()}</div>
            )}
            {forexProvider?.error_message && (
              <div className="text-xs text-red-400 mt-1 line-clamp-2">{forexProvider.error_message}</div>
            )}
          </div>
        </div>
      </div>

      {/* Provider configuration guide */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="text-yellow-400 mt-0.5 shrink-0" />
          <div className="text-xs space-y-1.5 text-zinc-400">
            <div className="font-medium text-zinc-200 mb-2">Forex Provider Configuration</div>
            <div><code className="font-mono text-yellow-400">FOREX_DATA_PROVIDER=demo</code> — Seeded candles. No key needed. <span className="text-yellow-400 font-medium">DEMO DATA</span> label.</div>
            <div><code className="font-mono text-emerald-400">FOREX_DATA_PROVIDER=twelvedata</code> + <code className="font-mono">TWELVEDATA_API_KEY=your_key</code> → <span className="text-emerald-400 font-medium">REAL DATA</span></div>
            <div><code className="font-mono text-blue-400">FOREX_DATA_PROVIDER=mt5_bridge</code> — Broker-matched candles via local Python bridge. <span className="text-blue-400 font-medium">REAL DATA</span></div>
            <div><code className="font-mono text-zinc-500">FOREX_DEMO_FALLBACK=false</code> — Skip symbol on provider failure instead of using demo silently.</div>
            <div className="text-zinc-500 italic mt-1">Set secrets in Supabase Dashboard → Edge Functions → Secrets, then run a scan to verify.</div>
          </div>
        </div>
      </div>

      {/* Test buttons */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-sm font-semibold mb-1">Test Binance Connection</div>
          <p className="text-xs text-zinc-500 mb-3">Fetches 2 BTCUSDT 15m candles directly from Binance public API.</p>
          <button onClick={testBinance} disabled={testingBinance}
            className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
            {testingBinance ? <RefreshCw size={13} className="animate-spin" /> : <Wifi size={13} />}
            Test Binance
          </button>
          {binanceResult && (
            <div className={`mt-3 px-3 py-2.5 rounded-lg text-xs border ${binanceResult.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
              {binanceResult.msg}
            </div>
          )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-sm font-semibold mb-1">Test Forex Provider</div>
          <p className="text-xs text-zinc-500 mb-3">Triggers a scan and reports forex provider result (real vs demo, errors).</p>
          <button onClick={testForexProvider} disabled={testingForex || !session}
            className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
            {testingForex ? <RefreshCw size={13} className="animate-spin" /> : <Database size={13} />}
            Test Forex Provider
          </button>
          {forexResult && (
            <div className={`mt-3 px-3 py-2.5 rounded-lg text-xs border ${forexResult.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-orange-500/10 border-orange-500/20 text-orange-300'}`}>
              {forexResult.ok ? (
                <div className="space-y-0.5">
                  <div>Provider: <strong>{forexResult.provider}</strong></div>
                  <div>Data source: <strong className="text-emerald-300">{forexResult.data_source}</strong></div>
                  {forexResult.candle_time && <div>Latest candle: {forexResult.candle_time}</div>}
                  {forexResult.close && <div>EUR/USD close: {forexResult.close}</div>}
                </div>
              ) : (
                <div className="space-y-0.5">
                  <div>Provider: <strong>{forexResult.provider}</strong></div>
                  {forexResult.data_source && <div>Data source: <strong className="text-orange-300">{forexResult.data_source}</strong></div>}
                  {forexResult.fallback_used && <div className="text-yellow-400">Demo fallback was used</div>}
                  {forexResult.error && <div className="text-red-300">{forexResult.error}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Provider status cards from DB */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          {providers.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-sm text-zinc-600">
              No provider status rows yet. Run a scan to populate.
            </div>
          ) : (
            providers.map(p => (
              <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <Database size={16} className="text-zinc-500" />
                    <div>
                      <div className="font-medium capitalize flex items-center gap-2">
                        {p.provider_name}
                        {p.provider_name === 'demo' && (
                          <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded">DEMO</span>
                        )}
                        {(p as unknown as Record<string,unknown>).data_source_label === 'REAL DATA' && (
                          <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded">REAL DATA</span>
                        )}
                        {(p as unknown as Record<string,unknown>).data_source_label === 'DEMO DATA' && p.provider_name !== 'demo' && (
                          <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded">DEMO FALLBACK</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 capitalize">{p.market_type}</div>
                    </div>
                  </div>
                  {statusBadge(p.status)}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-zinc-800">
                  {[
                    { label: 'Status', value: p.status },
                    { label: 'Last Success', value: p.last_success_at ? new Date(p.last_success_at).toLocaleString() : 'Never' },
                    { label: 'Last Error', value: p.last_error_at ? new Date(p.last_error_at).toLocaleString() : 'None' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-zinc-900 px-4 py-3">
                      <div className="text-xs text-zinc-500 mb-0.5">{label}</div>
                      <div className="text-xs text-zinc-300">{value}</div>
                    </div>
                  ))}
                </div>
                {p.error_message && (
                  <div className={`px-5 py-3 border-t ${p.provider_name === 'demo' ? 'bg-orange-500/5 border-orange-500/10' : 'bg-yellow-500/5 border-yellow-500/10'}`}>
                    <div className={`text-xs ${p.provider_name === 'demo' ? 'text-orange-400' : 'text-yellow-400'}`}>{p.error_message}</div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Symbol data source table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Configured Symbols</div>
          <div className="text-xs text-zinc-500">Provider and data source per symbol</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="text-left px-5 py-2.5">Symbol</th>
                <th className="text-left px-5 py-2.5">Display Name</th>
                <th className="text-left px-5 py-2.5">Market</th>
                <th className="text-left px-5 py-2.5">Provider</th>
                <th className="text-left px-5 py-2.5">Expected Data Source</th>
                <th className="text-left px-5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {symbols.map(s => (
                <tr key={s.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-5 py-2.5 font-mono font-semibold text-zinc-100">{s.symbol}</td>
                  <td className="px-5 py-2.5 text-zinc-400">{s.display_name}</td>
                  <td className="px-5 py-2.5">
                    <Badge variant={s.market_type === 'crypto' ? 'blue' : 'cyan'}>{s.market_type}</Badge>
                  </td>
                  <td className="px-5 py-2.5 text-zinc-400 capitalize">
                    {s.market_type === 'crypto' ? 'binance' : forexProviderName}
                  </td>
                  <td className="px-5 py-2.5">
                    {s.market_type === 'crypto' ? (
                      <span className="text-xs text-emerald-400">REAL DATA (Binance API)</span>
                    ) : isForexReal ? (
                      <span className="text-xs text-emerald-400">REAL DATA ({forexProviderName})</span>
                    ) : (
                      <span className="text-xs text-orange-400">DEMO DATA (set FOREX_DATA_PROVIDER)</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5">
                    <Badge variant={s.is_active ? 'green' : 'gray'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
