import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../../components/layout/AdminLayout';
import { useAuth } from '../../../contexts/AuthContext';
import { useAdminLiveState } from '../../../hooks/useAdminLiveState';
import { RUNTIME_PROOF_CONTRACT, runtimeTruth, statusClasses, RuntimeTruthStatus } from '../../../lib/operatorRuntime';
import { supabase } from '../../../lib/supabase';
import { Activity, AlertTriangle, Bell, Bot, Brain, CheckCircle, Cpu, Database, Newspaper, PlayCircle, Radio, RefreshCw, Settings, Shield, Smartphone, Zap } from 'lucide-react';

type Section = 'dashboard' | 'signals' | 'executions' | 'trade-manager' | 'telegram' | 'settings' | 'intelligence' | 'runtime-proof';

const titles: Record<Section, string> = {
  dashboard: 'Dashboard', signals: 'Signals', executions: 'Executions', 'trade-manager': 'Trade Manager', telegram: 'Telegram', settings: 'Settings', intelligence: 'News + Market Intelligence', 'runtime-proof': 'Runtime Proof',
};

function Pill({ status }: { status: RuntimeTruthStatus }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusClasses(status)}`}>{status}</span>;
}
function Card({ title, children, status, icon: Icon = Activity }: { title: string; children: React.ReactNode; status?: RuntimeTruthStatus; icon?: typeof Activity }) {
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-lg shadow-black/10"><div className="mb-3 flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Icon size={16} className="text-blue-300"/><h2 className="font-semibold text-zinc-100">{title}</h2></div>{status && <Pill status={status}/>}</div>{children}</section>;
}
function Row({ k, v }: { k: string; v: React.ReactNode }) { return <div className="flex items-center justify-between gap-4 border-t border-zinc-800/70 py-2 text-sm first:border-t-0"><span className="text-zinc-400">{k}</span><span className="text-right font-mono text-xs text-zinc-100">{v}</span></div>; }
function time(v?: string | null) { return v ? new Date(v).toLocaleString() : '—'; }

export default function OperatorPanel({ section = 'dashboard' }: { section?: Section }) {
  const { session } = useAuth();
  const { state, refresh } = useAdminLiveState(session);
  const [proofRunning, setProofRunning] = useState(false);
  const [proofRows, setProofRows] = useState(RUNTIME_PROOF_CONTRACT);
  const [activePositions, setActivePositions] = useState<number>(0);
  const [executionAttempts, setExecutionAttempts] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    async function loadTruth() {
      const [positions, attempts] = await Promise.all([
        Promise.resolve(supabase.from('exchange_positions').select('id', { count: 'exact', head: true }).in('status', ['open', 'active'])).catch(() => ({ count: 0 })),
        Promise.resolve(supabase.from('provider_execution_attempts').select('*').order('created_at', { ascending: false }).limit(12)).catch(() => ({ data: [] })),
      ]);
      if (!alive) return;
      setActivePositions(positions.count ?? 0);
      setExecutionAttempts((attempts.data ?? []) as Array<Record<string, unknown>>);
    }
    void loadTruth();
    const id = window.setInterval(loadTruth, 5_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const scannerStatus = runtimeTruth({ at: state.latestRun?.started_at, enabled: state.scannerEnabled, error: state.latestRun?.status === 'failed' ? state.latestRun.error_message ?? 'failed' : null, staleAfterMs: 10 * 60_000 });
  const telegramStatus = runtimeTruth({ at: state.latestTelegramDelivery?.created_at, enabled: state.telegramConfigured, error: state.latestTelegramDelivery?.status === 'failed' ? state.latestTelegramDelivery.error_message : null, staleAfterMs: 60 * 60_000 });
  const latestProviderSync = state.providers.map(p => p.last_success_at || p.updated_at).filter(Boolean).sort().slice(-1)[0];
  const managerStatus = runtimeTruth({ at: latestProviderSync, enabled: true, staleAfterMs: 90_000 });
  const byProvider = useMemo(() => ['binance', 'bybit'].map(provider => ({ provider, row: state.providers.find(p => p.provider_name === provider) })), [state.providers]);
  const criticalIssues = [state.runtimeConfigError, state.schedulerQueryError, state.latestTelegramDelivery?.error_message, state.latestRun?.error_message].filter(Boolean).slice(0, 5);

  async function runProof() {
    setProofRunning(true);
    try {
      await refresh();
      setProofRows(RUNTIME_PROOF_CONTRACT.map(item => {
        const provider = item.label.toLowerCase().startsWith('binance') ? 'binance' : item.label.toLowerCase().startsWith('bybit') ? 'bybit' : null;
        const p = provider ? state.providers.find(row => row.provider_name === provider) : null;
        const tgOk = item.label.includes('Telegram') && state.telegramConfigured;
        const ok = Boolean((p && (p.status === 'active')) || tgOk);
        return { ...item, yes: ok, blocker: ok ? null : 'No successful runtime proof row found; live trading remains disabled' };
      }));
    } finally { setProofRunning(false); }
  }

  return <AdminLayout><div className="mx-auto max-w-7xl space-y-5"><div className="sticky top-14 z-10 -mx-4 border-y border-zinc-800 bg-zinc-950/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs uppercase tracking-[0.25em] text-blue-300">HashiBot Rebuild</p><h1 className="text-2xl font-bold">{titles[section]}</h1></div><div className="flex flex-wrap gap-2"><Pill status={scannerStatus}/><Pill status={managerStatus}/><Pill status={telegramStatus}/><button onClick={() => void refresh()} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200"><RefreshCw size={14} className="inline"/> Refresh</button></div></div></div>

  {section === 'dashboard' && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Card title="Bot Status" status={state.cronProven ? 'LIVE' : state.cronStale ? 'STALE' : 'FAILED'} icon={Bot}><Row k="Mode" v="testnet / no live trading"/><Row k="Scheduler" v={state.cronStatusLabel}/><Row k="Last refresh" v={time(state.loadedAt)}/></Card><Card title="Scanner Status" status={scannerStatus} icon={Radio}><Row k="Last scanner run" v={time(state.latestRun?.started_at)}/><Row k="Approved active" v={state.latestApprovedRealSignalCount}/><Row k="Candidates" v={state.latestRealCryptoSignalCount + state.latestRealForexSignalCount}/></Card><Card title="Executions Status" status={executionAttempts.length ? 'LIVE' : 'STALE'} icon={Zap}><Row k="Last execution attempt" v={time(executionAttempts[0]?.created_at as string)}/><Row k="Mode" v="testnet only"/><Row k="Active positions" v={activePositions}/></Card><Card title="Telegram Status" status={telegramStatus} icon={Bell}><Row k="Last message" v={time(state.latestTelegramDelivery?.created_at)}/><Row k="Auto send" v={state.autoSendTelegram ? 'ON' : 'OFF'}/><Row k="Configured" v={state.telegramConfigured ? 'YES' : 'NO'}/></Card><Card title="Latest Critical Issues" icon={AlertTriangle}>{criticalIssues.length ? criticalIssues.map((e,i)=><p key={i} className="mb-2 rounded-xl bg-red-500/10 p-2 text-sm text-red-200">{String(e)}</p>) : <p className="text-sm text-emerald-300">No active critical issue in loaded runtime truth.</p>}</Card><Card title="Provider Health Summary" icon={Database}>{byProvider.map(({provider,row})=><Row key={provider} k={provider.toUpperCase()} v={`${row?.status ?? 'unknown'} / monitor ${row?.status === 'active' ? 'ON' : 'OFF'}`}/>)}</Card></div>}

  {section === 'signals' && <div className="grid gap-4 lg:grid-cols-2"><Card title="Scanner Candidates" status={scannerStatus} icon={Radio}><Row k="Crypto candidates" v={state.latestRealCryptoSignalCount}/><Row k="Forex candidates" v={state.latestRealForexSignalCount}/><Row k="Last scanner run" v={time(state.latestRun?.started_at)}/></Card><Card title="Approvals + Routing" icon={Brain}><Row k="Approved signals" v={state.latestApprovedRealSignalCount}/><Row k="Rejected/research-only" v="See candidate/rejected compatibility pages"/><Row k="VIP/free routing" v={state.autoSendTelegram ? 'enabled' : 'disabled'}/></Card></div>}

  {section === 'executions' && <div className="space-y-4"><Card title="Mirrored Provider Execution Attempts" status={executionAttempts.length ? 'LIVE' : 'STALE'} icon={Cpu}><div className="grid gap-3 md:grid-cols-2">{byProvider.map(({provider,row})=><div key={provider} className="rounded-xl border border-zinc-800 p-3"><h3 className="font-bold uppercase">{provider}</h3><Row k="Result" v={row?.status ?? 'unknown'}/><Row k="Exact blocker" v={row?.error_message ?? '—'}/><Row k="Latest sync" v={time(row?.last_success_at || row?.updated_at)}/><Row k="Protection" v={row?.status === 'active' ? 'monitor enabled' : 'not proven'}/></div>)}</div></Card></div>}

  {section === 'trade-manager' && <div className="grid gap-4 lg:grid-cols-2"><Card title="Trade Manager Core" status={managerStatus} icon={Shield}><Row k="Open positions" v={activePositions}/><Row k="Last trade-manager run" v={time(latestProviderSync)}/><Row k="Repair actions" v="missing SL/TP detection + profit lock contract"/><Row k="Unsafe positions" v="flagged when protection not verified"/></Card><Card title="Provider Protection" icon={CheckCircle}>{byProvider.map(({provider,row})=><Row key={provider} k={provider} v={row?.status === 'active' ? 'monitor/protection ON' : 'protection not proven'}/>)}</Card></div>}

  {section === 'telegram' && <div className="grid gap-4 lg:grid-cols-3">{['admin','vip','free'].map(ch => <Card key={ch} title={`${ch.toUpperCase()} Channel`} status={telegramStatus} icon={Bell}><Row k="Last sent" v={time(state.telegramDeliveryHealth.find(r => r.destination_channel === ch)?.last_success_at)}/><Row k="Failed" v={state.telegramDeliveryHealth.find(r => r.destination_channel === ch)?.failed_count ?? 0}/><Row k="Template" v={ch === 'admin' ? 'failures/protection/summary' : ch === 'vip' ? 'full lifecycle' : 'teaser/education/recap'}/></Card>)}</div>}

  {section === 'settings' && <div className="grid gap-4 lg:grid-cols-2"><Card title="Execution Mode" icon={Settings}><Row k="Live trading" v="OFF (guarded)"/><Row k="Binance" v={byProvider[0].row?.status === 'active' ? 'enabled' : 'disabled'}/><Row k="Bybit" v={byProvider[1].row?.status === 'active' ? 'enabled' : 'disabled'}/><Row k="Risk settings" v="provider-neutral plan contract"/></Card><Card title="Telegram + News Config" icon={Smartphone}><Row k="Telegram" v={state.telegramConfigured ? 'configured' : 'not configured'}/><Row k="News" v={state.intelligenceFeedHealth.length ? 'configured feeds visible' : 'news unavailable'}/><Row k="Symbol universe" v={state.marketMode}/></Card></div>}

  {section === 'intelligence' && <div className="grid gap-4 lg:grid-cols-2"><Card title="Market Intelligence Engine" status={state.latestIntelligenceEvent ? 'LIVE' : 'STALE'} icon={Newspaper}><Row k="Market summary" v={state.latestIntelligenceEvent?.title ?? 'news unavailable'}/><Row k="Opportunity score" v={state.latestIntelligenceEvent?.confidence ?? '—'}/><Row k="Last generated" v={time(state.latestIntelligenceEvent?.created_at)}/></Card><Card title="Inputs" icon={Activity}>{['market trend','volume expansion','top movers','BTC/ETH context','funding/risk','news headlines','volatility regime'].map(x=><Row key={x} k={x} v={state.intelligenceFeedHealth.length ? 'configured/checked' : 'news unavailable'}/>)}</Card></div>}

  {section === 'runtime-proof' && <Card title="Run System Proof" icon={PlayCircle}><button onClick={runProof} disabled={proofRunning} className="mb-4 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50"><PlayCircle size={16} className="inline"/> {proofRunning ? 'Running proof…' : 'Run System Proof'}</button><div className="grid gap-2 md:grid-cols-2">{proofRows.map(row=><div key={row.key} className="rounded-xl border border-zinc-800 p-3"><div className="flex justify-between"><b>{row.label}</b><span className={row.yes ? 'text-emerald-300' : 'text-red-300'}>{row.yes ? 'YES' : 'NO'}</span></div><p className="mt-1 text-sm text-zinc-400">{row.blocker ?? 'Runtime proof found.'}</p></div>)}</div></Card>}
  </div></AdminLayout>;
}
