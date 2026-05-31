import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { Signal } from '../../lib/types';
import { gradeBadge, directionBadge, statusBadge, Badge } from '../../components/ui/Badge';
import { RiskGuidanceDetail } from '../../components/ui/RiskGuidance';
import { useAuth } from '../../contexts/AuthContext';
import { Send, RefreshCw, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { getFrontendSupabaseUrl } from '../../lib/supabaseEnv';

interface TelegramDelivery {
  id: string;
  signal_id: string;
  delivery_type: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  telegram_message_id: string;
  error_message: string;
  created_at: string;
}

const FILTER_OPTIONS = [
  { key: 'real_crypto', label: 'Real Crypto' },
  { key: 'active', label: 'Active / Waiting' },
  { key: 'all', label: 'All' },
  { key: 'real_data', label: 'Real Data Only' },
  { key: 'real_forex', label: 'Real Forex' },
  { key: 'historical_demo', label: 'Historical Demo' },
  { key: 'disabled_forex', label: 'Historical / Disabled Forex' },
  { key: 'sent_tg', label: 'Sent to TG' },
  { key: 'tp1_hit', label: 'TP1 Hit' },
  { key: 'tp2_hit', label: 'TP2 Hit' },
  { key: 'sl_hit', label: 'SL Hit' },
  { key: 'expired', label: 'Expired' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function SignalsManager() {
  const { session } = useAuth();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [deliveries, setDeliveries] = useState<TelegramDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('real_crypto');
  const [sending, setSending] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');
  const [allowDemoTg, setAllowDemoTg] = useState(false);
  const [autoSendTg, setAutoSendTg] = useState(false);
  const [minAutoSendGrade, setMinAutoSendGrade] = useState('A');
  const [telegramConfigPresent, setTelegramConfigPresent] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const [cfgRes, delivRes] = await Promise.all([
      supabase.from('scanner_config').select('allow_demo_telegram_sending,auto_send_telegram,min_auto_send_grade,min_signal_grade').eq('id', 1).maybeSingle(),
      supabase.from('telegram_deliveries').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    setAllowDemoTg(cfgRes.data?.allow_demo_telegram_sending ?? false);
    setAutoSendTg(cfgRes.data?.auto_send_telegram ?? false);
    setMinAutoSendGrade(cfgRes.data?.min_auto_send_grade ?? cfgRes.data?.min_signal_grade ?? 'A');
    setDeliveries(delivRes.data ?? []);
    try {
      const runtimeRes = await fetch(`${getFrontendSupabaseUrl()}/functions/v1/market-scanner`, {
        method: 'POST',
        headers: { ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify({ debug_provider_config: true }),
      });
      const runtimeJson = await runtimeRes.json();
      setTelegramConfigPresent(Boolean(runtimeJson.telegram_enabled && runtimeJson.enable_signal_mode_output && runtimeJson.telegram_bot_token_set && (runtimeJson.telegram_default_channel_id_set || runtimeJson.telegram_chat_id_set)));
    } catch {
      setTelegramConfigPresent(null);
    }

    let q = supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(150);
    if (filter === 'active') q = q.in('status', ['waiting', 'active']).eq('market_type', 'crypto').eq('data_source', 'REAL DATA');
    else if (filter === 'real_data') q = q.eq('data_source', 'REAL DATA');
    else if (filter === 'real_forex') q = q.eq('data_source', 'REAL DATA').eq('market_type', 'forex');
    else if (filter === 'real_crypto') q = q.eq('data_source', 'REAL DATA').eq('market_type', 'crypto').in('status', ['waiting', 'active', 'tp1_hit']);
    else if (filter === 'historical_demo') q = q.neq('data_source', 'REAL DATA');
    else if (filter === 'disabled_forex') q = q.eq('market_type', 'forex');
    else if (filter === 'sent_tg') { /* will filter by delivery below */ }
    else if (filter !== 'all') q = q.eq('status', filter);

    const sigRes = await q;
    let sigs = sigRes.data ?? [];

    if (filter === 'sent_tg') {
      const sentIds = new Set((delivRes.data ?? []).filter(d => d.status === 'sent').map(d => d.signal_id));
      sigs = sigs.filter(s => sentIds.has(s.id));
    }

    setSignals(sigs as Signal[]);
    setLoading(false);
  }, [filter, session]);

  useEffect(() => { load(); }, [load]);

  function flash(text: string, type: 'ok' | 'err' = 'ok') {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 6000);
  }

  function getDeliveryStatusForSignal(sigId: string, kind: 'initial' | 'outcome' = 'initial'): { sent: boolean; failed: boolean; skipped: boolean; error?: string; created_at?: string; reason?: string; delivery_type?: string } {
    const matches = deliveries.filter(d => d.signal_id === sigId && (kind === 'outcome' ? d.delivery_type.startsWith('outcome_') : !d.delivery_type.startsWith('outcome_')));
    const sent = matches.find(d => d.status === 'sent');
    if (sent) return { sent: true, failed: false, skipped: false, created_at: sent.created_at, delivery_type: sent.delivery_type };
    const failed = matches.find(d => d.status === 'failed');
    if (failed) return { sent: false, failed: true, skipped: false, error: failed.error_message, created_at: failed.created_at, delivery_type: failed.delivery_type };
    const skipped = matches.find(d => d.status === 'skipped');
    if (skipped) return { sent: false, failed: false, skipped: true, reason: skipped.error_message, created_at: skipped.created_at, delivery_type: skipped.delivery_type };
    return { sent: false, failed: false, skipped: false };
  }

  const gradeRank: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };

  function hasValidRiskFields(sig: Signal) {
    return Boolean(sig.symbol && sig.direction && Number.isFinite(Number(sig.entry_low)) && Number.isFinite(Number(sig.stop_loss)) && Number.isFinite(Number(sig.tp1)));
  }

  function canSendToTelegram(sig: Signal, alreadySent = false): { allowed: boolean; reason: string } {
    const isRealData = (sig.data_source ?? '').toUpperCase() === 'REAL DATA';
    const arb = sig.arbitrator_decision as Record<string, unknown> | null;
    const isApproved = !arb || arb.final_decision === 'approved';
    const grade = String(sig.grade ?? '').toUpperCase();
    const minGrade = String(minAutoSendGrade || 'A').toUpperCase();

    if (alreadySent) return { allowed: false, reason: 'already_sent' };
    if (!autoSendTg) return { allowed: false, reason: 'auto_telegram_off' };
    if (telegramConfigPresent === false) return { allowed: false, reason: 'missing_telegram_config' };
    if (!isRealData && !allowDemoTg) return { allowed: false, reason: 'not_real_data' };
    if (!isApproved) return { allowed: false, reason: 'not_approved' };
    if ((gradeRank[grade] ?? -1) < (gradeRank[minGrade] ?? gradeRank.A)) return { allowed: false, reason: 'low_grade' };
    if (!hasValidRiskFields(sig)) return { allowed: false, reason: 'invalid_trade_fields' };
    if (['sl_hit', 'tp2_hit', 'expired', 'cancelled'].includes(sig.status)) return { allowed: false, reason: `terminal_status_${sig.status}` };
    return { allowed: true, reason: '' };
  }

  function sendBlockReasonLabel(reason: string) {
    const labels: Record<string, string> = {
      already_sent: 'duplicate / already sent',
      auto_telegram_off: 'auto Telegram off',
      missing_telegram_config: 'missing Telegram config',
      not_approved: 'not approved',
      low_grade: 'below grade',
      invalid_trade_fields: 'invalid risk fields',
      not_real_data: 'not real data',
      forex_disabled_for_mvp: 'forex disabled',
      forex_disabled: 'forex disabled',
    };
    return labels[reason] ?? reason.replace(/_/g, ' ');
  }

  async function sendToTelegram(sig: Signal) {
    if (!session) return;
    const check = canSendToTelegram(sig);
    if (!check.allowed) { flash(check.reason, 'err'); return; }
    setSending(sig.id);
    try {
      const res = await fetch(`${getFrontendSupabaseUrl()}/functions/v1/telegram-send`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_id: sig.id }),
      });
      const data = await res.json();
      if (data.success) {
        flash('Signal sent to Telegram.');
        await load();
      } else if (data.skipped) {
        flash(`Telegram skipped: ${data.reason ?? 'not sendable'}`, 'err');
        await load();
      } else {
        flash(`Send failed: ${data.error ?? 'unknown'}`, 'err');
      }
    } catch (e) {
      flash(`Error: ${e instanceof Error ? e.message : 'unknown'}`, 'err');
    }
    setSending(null);
  }

  async function updateStatus(sig: Signal, newStatus: string) {
    const { error } = await supabase.from('signals').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', sig.id);
    if (!error) {
      await supabase.from('audit_logs').insert({
        actor_user_id: session?.user.id ?? null,
        action: 'signal_status_updated',
        entity_type: 'signals',
        entity_id: sig.id,
        metadata: { from: sig.status, to: newStatus },
      });
      await load();
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold">Signals Manager</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Central pipeline — view, approve, update, and send signals to Telegram</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link to="/admin/signals/new"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            + Create Signal
          </Link>
        </div>
      </div>

      {/* Config status banners */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${autoSendTg ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${autoSendTg ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
          Auto Telegram: {autoSendTg ? 'ON' : 'OFF'}
        </span>
        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${allowDemoTg ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}>
          Demo Telegram: {allowDemoTg ? 'ALLOWED' : 'BLOCKED'}
        </span>
        <Link to="/admin/scanner-config" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors">
          Configure
        </Link>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm border flex items-center gap-2 ${
          msgType === 'err' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        }`}>
          {msgType === 'err' ? <AlertTriangle size={13} className="shrink-0" /> : <CheckCircle size={13} className="shrink-0" />}
          {msg}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTER_OPTIONS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f.key ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : signals.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-sm text-zinc-500">
          No signals found for this filter. Run the scanner or create a signal manually.
        </div>
      ) : (
        <div className="space-y-2">
          {signals.map(sig => {
            const isRealData = (sig.data_source ?? '').toUpperCase() === 'REAL DATA';
            const isHistoricalDemoForex = sig.market_type === 'forex' && !isRealData;
            const arb = sig.arbitrator_decision as Record<string, unknown> | null;
            const arbApproved = !arb || arb.final_decision === 'approved';
            const tgStatus = getDeliveryStatusForSignal(sig.id, 'initial');
            const outcomeStatus = getDeliveryStatusForSignal(sig.id, 'outcome');
            const sendCheck = canSendToTelegram(sig, tgStatus.sent);
            const isOpen = expanded[sig.id] ?? false;

            return (
              <div key={sig.id} className={`bg-zinc-900 border rounded-xl overflow-hidden transition-colors ${
                isHistoricalDemoForex ? 'border-orange-500/20' : isRealData ? 'border-zinc-800' : 'border-zinc-800'
              }`}>
                <div className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Header badges */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        <span className="font-mono font-bold text-sm text-zinc-100 break-all">{sig.symbol}</span>
                        <span className="text-xs text-zinc-600">{sig.timeframe}</span>
                        {directionBadge(sig.direction)}
                        {gradeBadge(sig.grade)}
                        {statusBadge(sig.status)}
                        {/* Data source badge */}
                        {isRealData ? (
                          <Badge variant="green">REAL DATA</Badge>
                        ) : isHistoricalDemoForex ? (
                          <Badge variant="orange">HISTORICAL DEMO FOREX</Badge>
                        ) : (
                          <Badge variant="orange">PROVIDER UNVERIFIED</Badge>
                        )}
                        {/* Market type */}
                        <Badge variant={sig.market_type === 'crypto' ? 'blue' : 'cyan'}>
                          {sig.market_type.toUpperCase()}
                        </Badge>
                        {/* Telegram status */}
                        {tgStatus.sent && (
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                            <CheckCircle size={10} /> TG sent
                          </span>
                        )}
                        {tgStatus.skipped && (
                          <span className="inline-flex items-center gap-1 text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded">
                            <XCircle size={10} /> TG skipped
                          </span>
                        )}
                        {tgStatus.failed && (
                          <span className="inline-flex items-center gap-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">
                            <XCircle size={10} /> TG failed
                          </span>
                        )}
                        {outcomeStatus.sent && (
                          <span className="inline-flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                            <CheckCircle size={10} /> Outcome TG sent
                          </span>
                        )}
                        {outcomeStatus.skipped && (
                          <span className="inline-flex items-center gap-1 text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded">
                            <XCircle size={10} /> Outcome TG skipped
                          </span>
                        )}
                        {outcomeStatus.failed && (
                          <span className="inline-flex items-center gap-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">
                            <XCircle size={10} /> Outcome TG failed
                          </span>
                        )}
                        {/* Arbitrator */}
                        {arb && (
                          <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${
                            arbApproved
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            {arbApproved ? <CheckCircle size={10} /> : <XCircle size={10} />}
                            {String(arb.final_decision ?? 'unknown').replace(/_/g, ' ')}
                          </span>
                        )}
                        {sig.source === 'manual' && <Badge variant="cyan">MANUAL</Badge>}
                      </div>

                      {/* Price levels */}
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs mb-1.5 min-w-0">
                        <div><span className="text-zinc-600">Entry:</span> <span className="font-mono text-zinc-300 break-all">{Number(sig.entry_low).toFixed(5)}–{Number(sig.entry_high).toFixed(5)}</span></div>
                        <div><span className="text-zinc-600">SL:</span> <span className="font-mono text-red-400 break-all">{Number(sig.stop_loss).toFixed(5)}</span></div>
                        <div><span className="text-zinc-600">TP1:</span> <span className="font-mono text-cyan-400 break-all">{Number(sig.tp1).toFixed(5)}</span></div>
                        <div><span className="text-zinc-600">TP2:</span> <span className="font-mono text-emerald-400 break-all">{Number(sig.tp2).toFixed(5)}</span></div>
                        <div><span className="text-zinc-600">R/R:</span> <span className="text-zinc-300">{sig.risk_reward}R · {sig.confidence_score}%</span></div>
                      </div>
                      <div className="text-xs text-zinc-600">
                        {sig.strategy_name} · {sig.regime} · {new Date(sig.created_at).toLocaleString()}
                      </div>

                      {/* Telegram block reason */}
                      {!sendCheck.allowed && !tgStatus.sent && (
                        <div className="mt-1.5 text-xs text-zinc-600 flex items-center gap-1">
                          <XCircle size={10} className="text-zinc-700" />
                          Initial TG blocked: {sendBlockReasonLabel(sendCheck.reason)}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex sm:flex-col gap-1.5 shrink-0 flex-wrap">
                      <button
                        onClick={() => sendToTelegram(sig)}
                        disabled={sending === sig.id || !sendCheck.allowed || tgStatus.sent}
                        title={!sendCheck.allowed ? sendBlockReasonLabel(sendCheck.reason) : 'Send to Telegram'}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                          tgStatus.sent
                            ? 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-default'
                            : sendCheck.allowed
                              ? 'bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-600/30'
                              : 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed'
                        } disabled:opacity-50`}>
                        {sending === sig.id
                          ? <RefreshCw size={11} className="animate-spin" />
                          : tgStatus.sent
                            ? <CheckCircle size={11} />
                            : <Send size={11} />}
                        {tgStatus.sent ? 'TG sent' : 'Send TG'}
                      </button>
                      <select
                        value={sig.status}
                        onChange={e => updateStatus(sig, e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500">
                        {['waiting', 'active', 'tp1_hit', 'tp2_hit', 'sl_hit', 'expired', 'cancelled'].map(s => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => toggleExpand(sig.id)}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 border border-zinc-700 transition-colors">
                        {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        Detail
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-zinc-800 grid sm:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="text-zinc-500 font-medium mb-1">Signal Info</div>
                        <div><span className="text-zinc-600">ID:</span> <span className="font-mono text-zinc-400">{sig.id.slice(0, 16)}…</span></div>
                        <div><span className="text-zinc-600">Mode:</span> <span className="text-zinc-300">{sig.mode_slug ?? '—'}</span></div>
                        <div><span className="text-zinc-600">Source:</span> <span className="text-zinc-300">{sig.source}</span></div>
                        <div><span className="text-zinc-600">Data source:</span> <span className={isRealData ? 'text-emerald-400' : 'text-orange-400'}>{sig.data_source ?? 'unknown'}</span></div>
                        <div><span className="text-zinc-600">Reason:</span> <span className="text-zinc-400">{sig.reason || '—'}</span></div>
                        <div><span className="text-zinc-600">Invalidation:</span> <span className="text-zinc-400">{sig.invalidation || '—'}</span></div>
                        <div><span className="text-zinc-600">Updated:</span> <span className="text-zinc-400">{new Date(sig.updated_at).toLocaleString()}</span></div>
                      </div>
                      <div className="sm:col-span-2">
                        <RiskGuidanceDetail signal={sig} admin />
                      </div>
                      {arb && (
                        <div className="space-y-1">
                          <div className="text-zinc-500 font-medium mb-1">Arbitrator Decision</div>
                          <div><span className="text-zinc-600">Mode:</span> <span className="text-zinc-300">{String(arb.selected_mode ?? '—')}</span></div>
                          <div><span className="text-zinc-600">Decision:</span> <span className={arbApproved ? 'text-emerald-400' : 'text-red-400'}>{String(arb.final_decision ?? '—')}</span></div>
                          <div><span className="text-zinc-600">Risk passed:</span> <span className={arb.risk_check_passed ? 'text-emerald-400' : 'text-red-400'}>{String(arb.risk_check_passed)}</span></div>
                          {Boolean(arb.risk_rejection_reason) && <div><span className="text-zinc-600">Rejection:</span> <span className="text-red-400">{String(arb.risk_rejection_reason)}</span></div>}
                          <div><span className="text-zinc-600">Score threshold:</span> <span className="text-zinc-300">{String(arb.score_threshold_used ?? '—')}</span></div>
                          <div><span className="text-zinc-600">Min R/R:</span> <span className="text-zinc-300">{String(arb.min_rr_used ?? '—')}</span></div>
                          <div><span className="text-zinc-600">Reason:</span> <span className="text-zinc-400">{String(arb.decision_reason ?? '—')}</span></div>
                        </div>
                      )}
                      {/* Telegram delivery detail */}
                      {(tgStatus.sent || tgStatus.failed || tgStatus.skipped || outcomeStatus.sent || outcomeStatus.failed || outcomeStatus.skipped) && (
                        <div className="sm:col-span-2 space-y-1">
                          <div className="text-zinc-500 font-medium mb-1">Telegram Delivery</div>
                          {tgStatus.sent && (
                            <div className="text-emerald-400 flex items-center gap-1"><CheckCircle size={11} /> Initial signal delivered{tgStatus.created_at ? ` at ${new Date(tgStatus.created_at).toLocaleString()}` : ''}</div>
                          )}
                          {tgStatus.skipped && (
                            <div className="text-yellow-400 flex items-center gap-1"><XCircle size={11} /> Initial signal skipped: {tgStatus.reason || 'not sent'}{tgStatus.created_at ? ` at ${new Date(tgStatus.created_at).toLocaleString()}` : ''}</div>
                          )}
                          {tgStatus.failed && (
                            <div className="text-red-400 flex items-center gap-1"><XCircle size={11} /> Initial signal failed: {tgStatus.error}{tgStatus.created_at ? ` at ${new Date(tgStatus.created_at).toLocaleString()}` : ''}</div>
                          )}
                          {outcomeStatus.sent && (
                            <div className="text-emerald-400 flex items-center gap-1"><CheckCircle size={11} /> Outcome update delivered ({outcomeStatus.delivery_type}){outcomeStatus.created_at ? ` at ${new Date(outcomeStatus.created_at).toLocaleString()}` : ''}</div>
                          )}
                          {outcomeStatus.skipped && (
                            <div className="text-yellow-400 flex items-center gap-1"><XCircle size={11} /> Outcome update skipped: {outcomeStatus.reason || 'not sent'}{outcomeStatus.created_at ? ` at ${new Date(outcomeStatus.created_at).toLocaleString()}` : ''}</div>
                          )}
                          {outcomeStatus.failed && (
                            <div className="text-red-400 flex items-center gap-1"><XCircle size={11} /> Outcome update failed: {outcomeStatus.error}{outcomeStatus.created_at ? ` at ${new Date(outcomeStatus.created_at).toLocaleString()}` : ''}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
