import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { supabase } from '../../lib/supabase';
import { AccessRequest, CustomerSubscription, Signal } from '../../lib/types';
import { gradeBadge, directionBadge, statusBadge, Badge } from '../../components/ui/Badge';
import {
  Radio, ArrowRight, AlertTriangle, Lock, MessageCircle, Clock,
  Volume2, RefreshCw
} from 'lucide-react';
import { RiskGuidanceCompact } from '../../components/ui/RiskGuidance';
import { usePreviewViewer } from '../../contexts/OwnerPreviewContext';
import { accessStateDescription, accessStateLabel, getCustomerAccessState, hasFullSignalAccess } from '../../lib/customerAccess';
import { formatEATTime, formatRelativeTime, getSignalFreshness } from '../../lib/timeUtils';
import { signalSound } from '../../lib/signalSound';

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

export default function ActiveSignals() {
  const { subject: user } = usePreviewViewer();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [sub, setSub] = useState<CustomerSubscription | null>(null);
  const [latestRequest, setLatestRequest] = useState<AccessRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [soundEnabled, setSoundEnabled] = useState(signalSound.isEnabled());

  const fetchSignals = useCallback(() => {
    if (!user) return;
    Promise.all([
      supabase.from('customer_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('access_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('signals').select('*').in('status', ['waiting', 'active']).order('created_at', { ascending: false }),
    ]).then(([subRes, reqRes, sigRes]) => {
      setSub(subRes.data ?? null);
      setLatestRequest(reqRes.data as AccessRequest | null);
      setSignals(sigRes.data ?? []);
      setLoading(false);
      setLastRefreshed(new Date());
    });
  }, [user]);

  useEffect(() => {
    fetchSignals();

    // Subscribe to live signal insertions in real-time
    const channel = supabase
      .channel('active_signals_page_feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signals' }, () => {
        fetchSignals();
      })
      .subscribe();

    // Auto-refresh timestamps every 30 seconds
    const interval = setInterval(() => {
      setLastRefreshed(new Date());
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchSignals]);

  const accessState = getCustomerAccessState(sub, latestRequest);
  const hasAccess = hasFullSignalAccess(sub, latestRequest);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    signalSound.setEnabled(next);
    if (next) signalSound.playTestChime();
  };

  if (!loading && !hasAccess) return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Active Signals</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Package access is required for full active trade plans.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center max-w-xl mx-auto">
        <Lock size={28} className="text-zinc-700 mx-auto mb-3" />
        <div className="text-sm font-semibold mb-1">{accessStateLabel(accessState)}</div>
        <p className="text-sm text-zinc-500 mb-5">{accessStateDescription(accessState, sub?.package_name ?? latestRequest?.product_slug)}</p>
        <div className="flex gap-2 justify-center flex-wrap">
          <Link to="/app/package-request" className="bg-sky-600 hover:bg-sky-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">Choose / request package</Link>
          <Link to="/app/telegram" className="inline-flex items-center gap-1.5 border border-zinc-700 text-zinc-300 hover:text-white text-sm px-4 py-2 rounded-lg transition-colors"><MessageCircle size={13} /> Submit Telegram</Link>
        </div>
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      {/* Live Scanner Banner & Sound Controls */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 sm:p-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white">Live VIP Signals Feed</h1>
            <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              REAL-TIME
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            {signals.length} active trade plan{signals.length !== 1 ? 's' : ''} currently in execution window · Auto-refreshed {formatRelativeTime(lastRefreshed.toISOString())}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={toggleSound}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              soundEnabled
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/50 shadow-sm'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Volume2 size={13} className={soundEnabled ? 'text-emerald-400' : 'text-zinc-500'} />
            <span>{soundEnabled ? 'Chimes Active' : 'Sound Muted'}</span>
          </button>

          <button
            onClick={() => fetchSignals()}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Execution Guidance Notice for Signal Mode Users */}
      <div className="mb-6 bg-blue-950/20 border border-blue-500/20 rounded-xl p-3.5 flex items-start gap-3 text-xs text-zinc-300">
        <Clock size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-blue-300">Timing & Execution Window: </span>
          Signals are optimized for immediate execution. Always check the <strong className="text-white font-mono">Timestamp & Freshness Badge</strong> before placing market orders to avoid chasing price slippage.
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : signals.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <Radio size={36} className="text-zinc-700 mx-auto mb-3" />
          <h2 className="font-bold text-lg text-white mb-1">No active signals in execution window</h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
            The institutional scanner is analyzing market structure across Gold (XAUUSD), Majors, and Crypto. Keep this tab open—chimes will alert you immediately when a new setup triggers.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {signals.map(sig => {
            const isRealData = sig.data_source === 'REAL DATA';
            const freshness = getSignalFreshness(sig.created_at);

            return (
              <Link
                key={sig.id}
                to={`/app/signals/${sig.id}`}
                className="block bg-zinc-900/90 border border-zinc-800 hover:border-blue-500/60 rounded-2xl p-4 sm:p-5 transition-all group hover:bg-zinc-900"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Top Badges & Timestamps */}
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <span className="font-mono font-extrabold text-base sm:text-lg text-white tracking-wide">
                        {sig.symbol}
                      </span>
                      <span className="text-xs text-zinc-500 font-mono bg-zinc-800 px-2 py-0.5 rounded">
                        {sig.timeframe}
                      </span>
                      {directionBadge(sig.direction)}
                      {gradeBadge(sig.grade)}
                      {statusBadge(sig.status)}
                      <Badge variant={isRealData ? 'green' : 'orange'} className="text-[10px]">
                        {isRealData ? 'REAL DATA' : 'PROVIDER UNVERIFIED'}
                      </Badge>

                      {/* Freshness Badge */}
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${freshness.badgeClass}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${freshness.dotColor}`} />
                        <span>{freshness.label}</span>
                      </span>

                      {/* Detailed East Africa Time & Relative Time */}
                      <div className="ml-auto text-xs text-zinc-400 flex items-center gap-2 font-mono">
                        <Clock size={12} className="text-zinc-500" />
                        <span className="text-zinc-300 font-bold">{formatRelativeTime(sig.created_at)}</span>
                        <span className="hidden sm:inline text-zinc-500">({formatEATTime(sig.created_at)})</span>
                      </div>
                    </div>

                    {/* Numerical Trade Parameters */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80 mb-3">
                      <div>
                        <div className="text-zinc-500 text-[10px] uppercase font-semibold mb-0.5">Entry Zone</div>
                        <div className="text-zinc-200 font-mono font-bold">
                          {fmtSignalPrice(sig, sig.entry_low)} – {fmtSignalPrice(sig, sig.entry_high)}
                        </div>
                      </div>
                      <div>
                        <div className="text-red-400/80 text-[10px] uppercase font-semibold mb-0.5">Stop Loss</div>
                        <div className="text-red-400 font-mono font-bold">
                          {fmtSignalPrice(sig, sig.stop_loss)}
                        </div>
                      </div>
                      <div>
                        <div className="text-emerald-400/80 text-[10px] uppercase font-semibold mb-0.5">Take Profit 1 / 2</div>
                        <div className="text-emerald-400 font-mono font-bold">
                          {fmtSignalPrice(sig, sig.tp1)} / {fmtSignalPrice(sig, sig.tp2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-500 text-[10px] uppercase font-semibold mb-0.5">R/R · Confidence</div>
                        <div className="text-zinc-300 font-medium">
                          {sig.risk_reward}R · <span className="text-emerald-400 font-bold">{sig.confidence_score}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                      <div>
                        <span className="text-zinc-300 font-semibold">{sig.strategy_name}</span> · <span className="text-zinc-500">{sig.regime}</span>
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {freshness.subtext}
                      </div>
                    </div>

                    <div className="mt-2.5">
                      <RiskGuidanceCompact signal={sig} />
                    </div>
                  </div>

                  <div className="flex items-center justify-end sm:justify-center shrink-0">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:bg-blue-600 transition-all">
                      <ArrowRight size={16} />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500/80" />
        <span>
          <strong>Execution Notice:</strong> Signals are generated algorithmically with institutional liquidity verification. For best outcomes, execute within the first 15 minutes of issuance. Do not chase trades if price has already reached TP1.
        </span>
      </div>
    </AppLayout>
  );
}
