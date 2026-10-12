import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { supabase } from '../../lib/supabase';
import { AccessRequest, CustomerSubscription, Signal } from '../../lib/types';
import { gradeBadge, directionBadge, statusBadge, Badge } from '../../components/ui/Badge';
import { ArrowLeft, AlertTriangle, Lock, MessageCircle, Clock } from 'lucide-react';
import { RiskGuidanceDetail } from '../../components/ui/RiskGuidance';
import { usePreviewViewer } from '../../contexts/OwnerPreviewContext';
import { accessStateDescription, accessStateLabel, getCustomerAccessState, hasFullSignalAccess } from '../../lib/customerAccess';
import { formatEATTime, formatRelativeTime, formatUtcTime, getSignalFreshness } from '../../lib/timeUtils';

function priceDecimals(signal: Signal) {
  if (signal.market_type === 'forex') {
    return signal.symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase().endsWith('JPY') ? 3 : 5;
  }
  const price = Number(signal.entry_high ?? signal.entry_low ?? signal.tp1);
  return Number.isFinite(price) && price >= 100 ? 2 : 5;
}

function fmtSignalPrice(signal: Signal, value: number | null | undefined) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(priceDecimals(signal)) : '—';
}

export default function SignalDetail() {
  const { id } = useParams();
  const { subject: user } = usePreviewViewer();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [sub, setSub] = useState<CustomerSubscription | null>(null);
  const [latestRequest, setLatestRequest] = useState<AccessRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !user) return;
    Promise.all([
      supabase.from('signals').select('*').eq('id', id).maybeSingle(),
      supabase.from('customer_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('access_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]).then(([signalRes, subRes, reqRes]) => {
      setSignal(signalRes.data);
      setSub(subRes.data ?? null);
      setLatestRequest(reqRes.data as AccessRequest | null);
      setLoading(false);
    });
  }, [id, user]);

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </AppLayout>
  );

  if (!signal) return (
    <AppLayout>
      <div className="text-center py-20 text-zinc-500">Signal not found.</div>
    </AppLayout>
  );

  const isRealData = signal.data_source === 'REAL DATA';
  const accessState = getCustomerAccessState(sub, latestRequest);
  const hasAccess = hasFullSignalAccess(sub, latestRequest);
  const freshness = getSignalFreshness(signal.created_at);

  if (!hasAccess) return (
    <AppLayout>
      <div className="mb-6">
        <Link to="/app/signals" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-100 mb-4 transition-colors">
          <ArrowLeft size={14} /> Back to Signals
        </Link>
        <h1 className="text-2xl font-bold">Signal details locked</h1>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center max-w-xl">
        <Lock size={28} className="text-zinc-700 mx-auto mb-3" />
        <div className="flex items-center gap-2 justify-center mb-2">
          <span className="font-mono font-semibold">{signal.symbol}</span>
          {directionBadge(signal.direction)}
          {gradeBadge(signal.grade)}
          {statusBadge(signal.status)}
        </div>
        <div className="text-sm font-semibold mb-1">{accessStateLabel(accessState)}</div>
        <p className="text-sm text-zinc-500 mb-5">{accessStateDescription(accessState, sub?.package_name ?? latestRequest?.product_slug)}</p>
        <div className="flex gap-2 justify-center flex-wrap">
          <Link to="/pricing" className="bg-sky-600 hover:bg-sky-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">Renew / Choose package</Link>
          <Link to="/app/telegram" className="inline-flex items-center gap-1.5 border border-zinc-700 text-zinc-300 hover:text-white text-sm px-4 py-2 rounded-lg transition-colors"><MessageCircle size={13} /> Submit Telegram</Link>
        </div>
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="mb-6">
        <Link to="/app/signals" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-100 mb-4 transition-colors">
          <ArrowLeft size={14} /> Back to Live Signals
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold font-mono text-white">{signal.symbol}</h1>
            {directionBadge(signal.direction)}
            {gradeBadge(signal.grade)}
            {statusBadge(signal.status)}
            <Badge variant={isRealData ? 'green' : 'orange'}>{isRealData ? 'REAL DATA' : 'PROVIDER UNVERIFIED'}</Badge>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 ${freshness.badgeClass}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${freshness.dotColor}`} />
              <span>{freshness.label}</span>
            </span>
          </div>
        </div>

        {!isRealData && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-400/80">
            <AlertTriangle size={11} />
            This signal is not marked REAL DATA. Forex signals must come from the verified provider path before they are actionable.
          </div>
        )}
      </div>

      <div className="max-w-3xl space-y-5">
        {/* Signal Execution Timing Banner */}
        <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          freshness.level === 'fresh'
            ? 'bg-emerald-950/25 border-emerald-500/30 text-emerald-300'
            : freshness.level === 'active'
            ? 'bg-blue-950/25 border-blue-500/30 text-blue-300'
            : 'bg-amber-950/25 border-amber-500/30 text-amber-300'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
              <Clock size={16} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Signal Issuance Timing</div>
              <div className="text-sm font-bold text-white flex items-center gap-2 font-mono">
                <span>Issued {formatRelativeTime(signal.created_at)}</span>
                <span className="text-zinc-400">({formatEATTime(signal.created_at)})</span>
              </div>
            </div>
          </div>
          <div className="text-xs font-medium text-zinc-300">
            {freshness.subtext}
          </div>
        </div>

        {/* Price levels */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="border-b border-zinc-800 px-5 py-3.5 flex items-center justify-between">
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Institutional Trade Plan</div>
            <div className="text-xs font-mono text-zinc-500">{signal.timeframe} · {signal.market_type.toUpperCase()}</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800">
            <div className="p-6 flex flex-col justify-center">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Entry Execution Zone</div>
              <div className="font-mono text-2xl font-extrabold text-white">
                {fmtSignalPrice(signal, signal.entry_low)}
              </div>
              <div className="text-xs text-zinc-500 my-1 font-mono">to target range</div>
              <div className="font-mono text-xl font-bold text-zinc-300">
                {fmtSignalPrice(signal, signal.entry_high)}
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-red-400/80 mb-0.5">Stop Loss Level</div>
                <div className="font-mono text-lg font-extrabold text-red-400">{fmtSignalPrice(signal, signal.stop_loss)}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-400/80 mb-0.5">Take Profit 1</div>
                  <div className="font-mono text-base font-bold text-emerald-400">{fmtSignalPrice(signal, signal.tp1)}</div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-400/80 mb-0.5">Take Profit 2</div>
                  <div className="font-mono text-base font-bold text-emerald-400">{fmtSignalPrice(signal, signal.tp2)}</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-0.5">Calculated Risk / Reward</div>
                <div className="text-sm font-bold text-zinc-200 font-mono">{signal.risk_reward}R ({signal.confidence_score}% Engine Confidence)</div>
              </div>
            </div>
          </div>
        </div>

        <RiskGuidanceDetail signal={signal} />

        {/* Signal details table */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3.5">
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Engine Verification Details</div>
          </div>

          <div className="divide-y divide-zinc-800/80">
            {[
              { label: 'Symbol',          value: <span className="font-mono font-bold">{signal.symbol}</span> },
              { label: 'Market Type',     value: signal.market_type.toUpperCase() },
              { label: 'Timeframe',       value: signal.timeframe },
              { label: 'Direction',       value: directionBadge(signal.direction) },
              { label: 'Quality Grade',   value: gradeBadge(signal.grade) },
              { label: 'Current Status',  value: statusBadge(signal.status) },
              { label: 'Strategy Engine', value: signal.strategy_name },
              { label: 'Market Regime',   value: signal.regime },
              { label: 'Confidence Score', value: `${signal.confidence_score}%` },
              { label: 'Data Source',     value: <Badge variant={isRealData ? 'green' : 'orange'}>{isRealData ? 'REAL DATA' : 'PROVIDER UNVERIFIED'}</Badge> },
              { label: 'Created (EAT)',   value: `${formatEATTime(signal.created_at)} (${formatRelativeTime(signal.created_at)})` },
              { label: 'Created (UTC)',   value: formatUtcTime(signal.created_at) },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="text-xs text-zinc-500 w-32 shrink-0 font-medium">{label}</div>
                <div className="text-xs sm:text-sm text-zinc-200 text-right font-mono">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Reason + Invalidation */}
        {(signal.reason || signal.invalidation) && (
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="border-b border-zinc-800 px-5 py-3.5">
              <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Technical Thesis & Market Structure</div>
            </div>

            {signal.reason && (
              <div className="px-5 py-4 border-b border-zinc-800/50">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Confluence Breakdown</div>
                <div className="text-xs sm:text-sm text-zinc-300 leading-relaxed">{signal.reason}</div>
              </div>
            )}

            {signal.invalidation && (
              <div className="px-5 py-4">
                <div className="text-xs font-bold text-red-400/80 uppercase tracking-wider mb-1">Hard Invalidation Condition</div>
                <div className="text-xs sm:text-sm text-zinc-300 leading-relaxed">{signal.invalidation}</div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
          <span>
            <strong>Trading Reminder:</strong> Maintain strict risk management per trade (1-2% maximum balance allocation). Move stop loss to break-even once Take Profit 1 is triggered.
          </span>
        </div>
      </div>
    </AppLayout>
  );
}
