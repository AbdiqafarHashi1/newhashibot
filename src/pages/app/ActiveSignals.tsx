import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { supabase } from '../../lib/supabase';
import { CustomerSubscription, Signal } from '../../lib/types';
import { gradeBadge, directionBadge, statusBadge, Badge } from '../../components/ui/Badge';
import { Radio, ArrowRight, AlertTriangle, Lock, MessageCircle } from 'lucide-react';
import { RiskGuidanceCompact } from '../../components/ui/RiskGuidance';
import { useAuth } from '../../contexts/AuthContext';
import { accessStateDescription, accessStateLabel, getCustomerAccessState, hasFullSignalAccess } from '../../lib/customerAccess';

export default function ActiveSignals() {
  const { user } = useAuth();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [sub, setSub] = useState<CustomerSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('customer_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('signals').select('*').in('status', ['waiting', 'active']).order('created_at', { ascending: false }),
    ]).then(([subRes, sigRes]) => {
      setSub(subRes.data ?? null);
      setSignals(sigRes.data ?? []);
      setLoading(false);
    });
  }, [user]);

  const accessState = getCustomerAccessState(sub);
  const hasAccess = hasFullSignalAccess(sub);

  if (!loading && !hasAccess) return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Active Signals</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Signal Room access is required for full active trade plans.</p>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center max-w-xl mx-auto">
        <Lock size={28} className="text-zinc-700 mx-auto mb-3" />
        <div className="text-sm font-semibold mb-1">{accessStateLabel(accessState)}</div>
        <p className="text-sm text-zinc-500 mb-5">{accessStateDescription(accessState)}</p>
        <div className="flex gap-2 justify-center flex-wrap">
          <Link to="/pricing" className="bg-sky-600 hover:bg-sky-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">Choose Crypto Signal Room</Link>
          <Link to="/app/telegram" className="inline-flex items-center gap-1.5 border border-zinc-700 text-zinc-300 hover:text-white text-sm px-4 py-2 rounded-lg transition-colors"><MessageCircle size={13} /> Submit Telegram</Link>
        </div>
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Active Signals</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{signals.length} signal{signals.length !== 1 ? 's' : ''} currently active or waiting</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : signals.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <Radio size={32} className="text-zinc-700 mx-auto mb-3" />
          <h2 className="font-semibold mb-1">No active signals</h2>
          <p className="text-sm text-zinc-500">The scanner is running. New signals will appear here when setups are detected.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {signals.map(sig => {
            const isRealData = sig.data_source === 'REAL DATA';
            return (
              <Link key={sig.id} to={`/app/signals/${sig.id}`}
                className="block bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-mono font-bold">{sig.symbol}</span>
                      <span className="text-xs text-zinc-600">{sig.timeframe}</span>
                      {directionBadge(sig.direction)}
                      {gradeBadge(sig.grade)}
                      {statusBadge(sig.status)}
                      <Badge variant={isRealData ? 'green' : 'orange'} className="text-xs">
                        {isRealData ? 'REAL DATA' : 'PROVIDER UNVERIFIED'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <div className="text-zinc-600 mb-0.5">Entry</div>
                        <div className="text-zinc-300 font-mono">{Number(sig.entry_low).toFixed(5)}–{Number(sig.entry_high).toFixed(5)}</div>
                      </div>
                      <div>
                        <div className="text-zinc-600 mb-0.5">Stop Loss</div>
                        <div className="text-red-400 font-mono">{Number(sig.stop_loss).toFixed(5)}</div>
                      </div>
                      <div>
                        <div className="text-zinc-600 mb-0.5">TP1 / TP2</div>
                        <div className="text-blue-400 font-mono">{Number(sig.tp1).toFixed(5)} / {Number(sig.tp2).toFixed(5)}</div>
                      </div>
                      <div>
                        <div className="text-zinc-600 mb-0.5">R/R · Confidence</div>
                        <div className="text-zinc-300">{sig.risk_reward}R · {sig.confidence_score}%</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">{sig.strategy_name} · {sig.regime}</div>
                    <RiskGuidanceCompact signal={sig} />
                  </div>
                  <ArrowRight size={16} className="text-zinc-600 shrink-0 mt-1" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex items-start gap-2 text-xs text-zinc-600">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
        <span>Signals are generated by automated strategies. Crypto uses Binance data. Forex uses TwelveData real data when enabled. Always validate before trading.</span>
      </div>
    </AppLayout>
  );
}
