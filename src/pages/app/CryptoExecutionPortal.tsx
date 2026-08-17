import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
  ConnectedExecutionAccount, ExecutionOrder, CustomerSubscription, AccessRequest, CustomerBotSetup 
} from '../../lib/types';
import { 
  Zap, ShieldCheck, RefreshCw, Layers, Cpu, Lock, ArrowRight, Activity, 
  CheckCircle2, Gauge, Settings2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { getCustomerAccessState, accessStateLabel } from '../../lib/customerAccess';

export default function CryptoExecutionPortal() {
  const { user } = useAuth();
  const [sub, setSub] = useState<CustomerSubscription | null>(null);
  const [request, setRequest] = useState<AccessRequest | null>(null);
  const [botSetup, setBotSetup] = useState<CustomerBotSetup | null>(null);
  const [accounts, setAccounts] = useState<ConnectedExecutionAccount[]>([]);
  const [orders, setOrders] = useState<ExecutionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingRisk, setUpdatingRisk] = useState(false);
  const [quickMessage, setQuickMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [subRes, reqRes, setupRes, accRes, ordersRes] = await Promise.all([
        supabase.from('customer_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('access_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('customer_bot_setups').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('connected_execution_accounts').select('*').eq('customer_id', user.id),
        supabase.from('execution_orders').select('*').eq('customer_id', user.id).order('created_at', { ascending: false }).limit(20)
      ]);

      setSub(subRes.data ?? null);
      setRequest(reqRes.data as AccessRequest | null);
      setBotSetup(setupRes.data as CustomerBotSetup | null);
      setAccounts(accRes.data as ConnectedExecutionAccount[] ?? []);
      setOrders(ordersRes.data as ExecutionOrder[] ?? []);
    } catch (err) {
      console.warn('Failed loading crypto execution portal:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleQuickRiskChange = async (newRisk: string) => {
    if (!user || !botSetup?.id) return;
    setUpdatingRisk(true);
    try {
      await supabase.from('customer_bot_setups').update({
        risk_preset: newRisk,
        updated_at: new Date().toISOString()
      }).eq('id', botSetup.id);

      setBotSetup(prev => prev ? { ...prev, risk_preset: newRisk } : null);
      setQuickMessage(`Risk updated to ${newRisk}`);
      setTimeout(() => setQuickMessage(null), 3000);
    } catch (e) {
      console.error('Failed to quick update risk:', e);
    } finally {
      setUpdatingRisk(false);
    }
  };

  const accessState = getCustomerAccessState(sub, request);
  const isActive = accessState === 'active' && (sub?.package_name?.toLowerCase().includes('crypto') || request?.product_slug?.includes('crypto'));

  const preferredList = Array.isArray(botSetup?.preferred_symbols) 
    ? botSetup.preferred_symbols 
    : typeof botSetup?.preferred_symbols === 'string' 
      ? (botSetup.preferred_symbols as string).split(',').map(s => s.trim()) 
      : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="text-amber-400" size={20} />
              <h1 className="text-2xl font-bold text-white">Crypto Automation Portal</h1>
            </div>
            <p className="text-xs text-zinc-400">
              Personal Binance & Bybit execution monitoring, automated risk management, and order status.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { setRefreshing(true); loadData(); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh Sync
            </button>
            <Badge variant={accessState === 'active' ? 'green' : 'yellow'}>
              {accessStateLabel(accessState)}
            </Badge>
          </div>
        </div>

        {quickMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
            <CheckCircle2 size={14} /> {quickMessage}
          </div>
        )}

        {/* Access Control Notice if not active */}
        {!isActive && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 text-zinc-200 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <Lock size={18} /> Crypto Personal Bot Package Required
            </div>
            <p className="text-xs leading-relaxed text-zinc-300">
              Live crypto execution controls and automated trade protection are only enabled for approved <strong>Crypto Personal Bot</strong> subscribers.
            </p>
            <div className="pt-1">
              <Link
                to="/app/package-request?package=crypto_personal_bot"
                className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-xl text-xs transition-colors"
              >
                Request Crypto Personal Bot <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}

        {/* Connected Accounts & Setup Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span>CONNECTED EXCHANGE</span>
              <Cpu size={14} className="text-blue-400" />
            </div>
            {accounts.length > 0 ? (
              accounts.map((acc) => (
                <div key={acc.id} className="space-y-1">
                  <div className="text-lg font-bold text-white uppercase">{acc.provider} ({acc.environment})</div>
                  <div className="text-xs font-mono text-zinc-400">Account ID: {acc.account_id}</div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className={`w-2 h-2 rounded-full ${acc.enabled ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <span className="text-xs text-zinc-300 font-mono">{acc.enabled ? 'Bot Active & Synced' : 'Execution Disabled'}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-white uppercase">
                  {botSetup?.exchange_name || 'Binance USD-M Futures'}
                </div>
                <div className="text-xs font-mono text-zinc-400">Status: {botSetup?.setup_status ? botSetup.setup_status.replace(/_/g, ' ') : 'Ready'}</div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs text-emerald-300 font-mono">Account Configured</span>
                </div>
                <Link to="/app/bot-setup" className="inline-block text-xs text-blue-400 font-bold hover:underline pt-1">
                  Update Credentials →
                </Link>
              </div>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span>RISK & PROTECTION</span>
              <ShieldCheck size={14} className="text-emerald-400" />
            </div>
            <div className="space-y-1">
              <div className="text-lg font-bold text-white">{botSetup?.risk_preset || 'Conservative'}</div>
              <div className="text-xs text-zinc-400">Risk per trade: {botSetup?.risk_preset === 'Aggressive' ? '2.5%' : botSetup?.risk_preset === 'Balanced' ? '1.5%' : '0.5% - 1.0%'}</div>
              <div className="text-xs text-emerald-400 font-mono pt-1">Auto Stop Loss & Break-even Armed</div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span>ACTIVE WHITELIST</span>
              <Activity size={14} className="text-sky-400" />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {preferredList.map((sym: string) => (
                  <span key={sym} className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[11px] font-mono text-zinc-300 font-medium">
                    {sym}
                  </span>
                ))}
              </div>
              <div className="pt-1">
                <Link to="/app/bot-setup" className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 font-mono">
                  <Settings2 size={12} /> Modify Whitelist
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Risk Adjuster Bar */}
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Gauge className="text-blue-400 shrink-0" size={20} />
            <div>
              <div className="text-xs font-bold text-white">Dynamic Risk Presets</div>
              <div className="text-[11px] text-zinc-400">Switch execution sizing in real-time across your active market positions.</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(['Conservative', 'Balanced', 'Aggressive'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={updatingRisk}
                onClick={() => handleQuickRiskChange(preset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all border ${
                  botSetup?.risk_preset === preset
                    ? 'bg-blue-600 border-blue-500 text-white font-bold shadow-lg shadow-blue-600/20'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Active Customer Execution Orders */}
        <div className="border border-zinc-800 rounded-2xl bg-zinc-900/90 overflow-hidden shadow-xl space-y-0">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-blue-400" />
              <h2 className="text-sm font-bold text-white">Customer Execution History & Active Orders</h2>
            </div>
            <span className="text-xs font-mono text-zinc-500">{orders.length} Records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950 text-zinc-500">
                  <th className="p-3">Symbol & Side</th>
                  <th className="p-3">Entry Price</th>
                  <th className="p-3">SL / TP Targets</th>
                  <th className="p-3">Protection Status</th>
                  <th className="p-3">Order Status</th>
                  <th className="p-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {orders.length > 0 ? (
                  orders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-zinc-800/40">
                      <td className="p-3">
                        <div className="font-bold text-white">{ord.symbol}</div>
                        <span className={`text-[10px] uppercase font-bold ${ord.direction?.toLowerCase() === 'long' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {ord.direction}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-white">${ord.entry_price || '—'}</td>
                      <td className="p-3 text-zinc-400">
                        <div>SL: ${ord.stop_loss || '—'}</div>
                        <div className="text-emerald-400/90 text-[10px]">TP1: ${ord.tp1 || '—'}</div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[10px]">
                          {ord.protection_status || 'Protected'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold text-[10px]">
                          {ord.status}
                        </span>
                      </td>
                      <td className="p-3 text-zinc-500 text-[11px]">
                        {new Date(ord.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-500 text-xs">
                      No automated crypto orders recorded yet for your account. Once signals trigger on your whitelisted symbols, trades will populate here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}

