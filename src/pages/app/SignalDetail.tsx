import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { supabase } from '../../lib/supabase';
import { AccessRequest, CustomerSubscription, Signal } from '../../lib/types';
import { gradeBadge, directionBadge, statusBadge, Badge } from '../../components/ui/Badge';
import { ArrowLeft, AlertTriangle, Lock, MessageCircle } from 'lucide-react';
import { RiskGuidanceDetail } from '../../components/ui/RiskGuidance';
import { useAuth } from '../../contexts/AuthContext';
import { accessStateDescription, accessStateLabel, getCustomerAccessState, hasFullSignalAccess } from '../../lib/customerAccess';

export default function SignalDetail() {
  const { id } = useParams();
  const { user } = useAuth();
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
  const hasAccess = hasFullSignalAccess(sub);

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
          <ArrowLeft size={14} /> Back to Signals
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold font-mono">{signal.symbol}</h1>
          {directionBadge(signal.direction)}
          {gradeBadge(signal.grade)}
          {statusBadge(signal.status)}
          <Badge variant={isRealData ? 'green' : 'orange'}>{isRealData ? 'REAL DATA' : 'PROVIDER UNVERIFIED'}</Badge>
        </div>
        {!isRealData && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-400/80">
            <AlertTriangle size={11} />
            This signal is not marked REAL DATA. Forex signals must come from the verified provider path before they are actionable.
          </div>
        )}
      </div>

      <div className="max-w-2xl space-y-4">
        {/* Price levels */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Trade Plan</div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-zinc-800">
            <div className="p-5">
              <div className="text-xs text-zinc-500 mb-1">Entry Zone</div>
              <div className="font-mono text-sm text-zinc-100">{Number(signal.entry_low).toFixed(5)}</div>
              <div className="text-xs text-zinc-600">to</div>
              <div className="font-mono text-sm text-zinc-100">{Number(signal.entry_high).toFixed(5)}</div>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <div className="text-xs text-zinc-500 mb-0.5">Stop Loss</div>
                <div className="font-mono text-sm text-red-400">{Number(signal.stop_loss).toFixed(5)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-0.5">TP1</div>
                <div className="font-mono text-sm text-blue-400">{Number(signal.tp1).toFixed(5)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-0.5">TP2</div>
                <div className="font-mono text-sm text-blue-400">{Number(signal.tp2).toFixed(5)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-0.5">Risk / Reward</div>
                <div className="text-sm text-zinc-200">{signal.risk_reward}R</div>
              </div>
            </div>
          </div>
        </div>

        <RiskGuidanceDetail signal={signal} />

        {/* Signal details */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Signal Details</div>
          </div>
          <div className="divide-y divide-zinc-800">
            {[
              { label: 'Symbol',      value: <span className="font-mono font-bold">{signal.symbol}</span> },
              { label: 'Market',      value: signal.market_type.toUpperCase() },
              { label: 'Timeframe',   value: signal.timeframe },
              { label: 'Direction',   value: directionBadge(signal.direction) },
              { label: 'Grade',       value: gradeBadge(signal.grade) },
              { label: 'Status',      value: statusBadge(signal.status) },
              { label: 'Strategy',    value: signal.strategy_name },
              { label: 'Regime',      value: signal.regime },
              { label: 'Confidence',  value: `${signal.confidence_score}%` },
              { label: 'Source',      value: signal.source },
              { label: 'Data Source', value: <Badge variant={isRealData ? 'green' : 'orange'}>{isRealData ? 'REAL DATA' : 'PROVIDER UNVERIFIED'}</Badge> },
              { label: 'Created',     value: new Date(signal.created_at).toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="text-xs text-zinc-500 w-28 shrink-0">{label}</div>
                <div className="text-sm text-zinc-200 text-right">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Reason + Invalidation */}
        {(signal.reason || signal.invalidation) && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="border-b border-zinc-800 px-5 py-3">
              <div className="text-xs text-zinc-500 uppercase tracking-wider">Analysis</div>
            </div>
            {signal.reason && (
              <div className="px-5 py-4 border-b border-zinc-800/50">
                <div className="text-xs text-zinc-500 mb-1">Reason</div>
                <div className="text-sm text-zinc-300 leading-relaxed">{signal.reason}</div>
              </div>
            )}
            {signal.invalidation && (
              <div className="px-5 py-4">
                <div className="text-xs text-zinc-500 mb-1">Invalidation</div>
                <div className="text-sm text-zinc-300 leading-relaxed">{signal.invalidation}</div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-zinc-600">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>Signals are generated by automated rule-based strategies. Always validate independently before executing any trade.</span>
        </div>
      </div>
    </AppLayout>
  );
}
