import { useEffect, useState } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { UserAccess } from '../../lib/types';
import { statusBadge, Badge } from '../../components/ui/Badge';
import { User, Radio, Cpu, Zap, Lock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Account() {
  const { profile } = useAuth();
  const [access, setAccess] = useState<UserAccess[]>([]);

  useEffect(() => {
    supabase.from('user_access').select('*').then(({ data }) => setAccess(data ?? []));
  }, []);

  const signalAccess = access.find(a => a.product_slug === 'signal_mode');
  const hasSignal = signalAccess?.status === 'active';

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Account & EA Access</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Your profile, subscriptions, and product access</p>
      </div>

      <div className="max-w-2xl space-y-5">
        {/* Profile card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
              <User size={18} className="text-zinc-400" />
            </div>
            <div>
              <div className="font-semibold">{profile?.full_name || 'No name set'}</div>
              <div className="text-sm text-zinc-500">{profile?.email}</div>
            </div>
            <Badge variant={profile?.role === 'admin' ? 'orange' : 'blue'} className="ml-auto capitalize">
              {profile?.role}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-zinc-800 rounded-lg px-3 py-2">
              <div className="text-zinc-500 mb-0.5">Joined</div>
              <div className="text-zinc-200">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}</div>
            </div>
            <div className="bg-zinc-800 rounded-lg px-3 py-2">
              <div className="text-zinc-500 mb-0.5">Signal Mode</div>
              <div className={hasSignal ? 'text-emerald-400' : 'text-zinc-400'}>{hasSignal ? 'Active' : 'No access'}</div>
            </div>
          </div>
        </div>

        {/* Product cards */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Your Products</h2>
          <div className="space-y-3">
            {/* Signal Mode */}
            <div className={`rounded-xl border p-5 ${hasSignal ? 'bg-blue-500/5 border-blue-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-600/30 flex items-center justify-center shrink-0">
                    <Radio size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm mb-0.5">Signal Mode</div>
                    <div className="text-xs text-zinc-500 leading-relaxed mb-2">
                      Live scanner-generated signals across 20 markets. Crypto uses Binance public data. Forex uses demo data until a real provider is configured.
                    </div>
                    {signalAccess ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge(signalAccess.status)}
                        {signalAccess.started_at && (
                          <span className="text-xs text-zinc-600">Since {new Date(signalAccess.started_at).toLocaleDateString()}</span>
                        )}
                        {signalAccess.expires_at && (
                          <span className="text-xs text-zinc-600">Expires {new Date(signalAccess.expires_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-500">No active access — contact admin to subscribe.</span>
                    )}
                  </div>
                </div>
                {hasSignal && (
                  <Link to="/app/signals" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 shrink-0">
                    View Signals <ArrowRight size={11} />
                  </Link>
                )}
              </div>
            </div>

            {/* Personal Bot */}
            <div className="rounded-xl border bg-zinc-900 border-zinc-800 p-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                  <Cpu size={16} className="text-zinc-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-semibold text-sm">Personal Bot</span>
                    <Badge variant="gray">Not live yet</Badge>
                    <Lock size={12} className="text-zinc-600" />
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed mb-3">
                    The bot engine is being built and tested internally. When launched, it will connect to your personal MT5 account and execute signals automatically within your risk limits. No real trades are placed yet.
                  </p>
                  <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-500 space-y-1">
                    <div className="font-medium text-zinc-400 mb-1">What's being built:</div>
                    {[
                      'Per-account risk governance (daily loss, drawdown, position limits)',
                      'MT5 terminal bridge for order placement',
                      'EA license system for account-level access control',
                      'Telegram reporting of filled and closed trades',
                    ].map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-500 text-xs shrink-0 mt-0.5">{i + 1}</div>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Prop Bot */}
            <div className="rounded-xl border bg-zinc-900 border-zinc-800 p-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                  <Zap size={16} className="text-zinc-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-semibold text-sm">Prop Bot</span>
                    <Badge variant="gray">Not live yet</Badge>
                    <Lock size={12} className="text-zinc-600" />
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed mb-3">
                    Built specifically for prop firm challenge accounts. Applies conservative scoring thresholds and strict drawdown protection to keep challenge accounts compliant. No real trades are placed yet.
                  </p>
                  <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-500 space-y-1">
                    <div className="font-medium text-zinc-400 mb-1">What makes it different:</div>
                    {[
                      'Higher minimum score threshold — only the cleanest setups qualify',
                      'Strict max drawdown and daily loss limits for challenge compliance',
                      'Consecutive-loss cooldown to protect challenge account status',
                      'Position sizing calculated against declared challenge equity',
                    ].map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-500 text-xs shrink-0 mt-0.5">{i + 1}</div>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-zinc-600 leading-relaxed">
          Personal Bot and Prop Bot are in active development. The trading engine and risk framework are being tested internally. They will be available for early access when ready.
        </p>
      </div>
    </AppLayout>
  );
}
