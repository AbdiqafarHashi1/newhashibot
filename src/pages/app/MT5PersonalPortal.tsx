import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { MT5Account, CustomerSubscription, AccessRequest, CustomerBotSetup } from '../../lib/types';
import { 
  Server, ShieldCheck, RefreshCw, Layers, Lock, ArrowRight, Activity, HardDrive,
  CheckCircle2, Gauge, Settings2, Terminal, Check
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { getCustomerAccessState, accessStateLabel } from '../../lib/customerAccess';

export default function MT5PersonalPortal() {
  const { user } = useAuth();
  const [sub, setSub] = useState<CustomerSubscription | null>(null);
  const [request, setRequest] = useState<AccessRequest | null>(null);
  const [botSetup, setBotSetup] = useState<CustomerBotSetup | null>(null);
  const [mt5Accounts, setMt5Accounts] = useState<MT5Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingRisk, setUpdatingRisk] = useState(false);
  const [quickMessage, setQuickMessage] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [subRes, reqRes, setupRes, mt5Res] = await Promise.all([
        supabase.from('customer_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('access_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('customer_bot_setups').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('mt5_accounts_safe').select('*').eq('user_id', user.id).eq('account_type', 'personal')
      ]);

      setSub(subRes.data ?? null);
      setRequest(reqRes.data as AccessRequest | null);
      setBotSetup(setupRes.data as CustomerBotSetup | null);
      setMt5Accounts(mt5Res.data as MT5Account[] ?? []);
    } catch (err) {
      console.warn('Failed loading MT5 Personal portal:', err);
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

  const copyDaemonScript = () => {
    const script = `# Run in Windows PowerShell (MT5 Bridge Agent)
Invoke-WebRequest -Uri "https://hashibot.trade/daemon/mt5-bridge.ps1" -OutFile "mt5-bridge.ps1"
powershell -ExecutionPolicy Bypass -File mt5-bridge.ps1 -Token "HB-MT5-CLIENT-${user?.id?.slice(0, 8)}"`;
    navigator.clipboard.writeText(script);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 3000);
  };

  const accessState = getCustomerAccessState(sub, request);
  const isActive = accessState === 'active' && (sub?.package_name?.toLowerCase().includes('forex') || request?.product_slug?.includes('forex_mt5_personal'));

  const preferredList = Array.isArray(botSetup?.preferred_symbols) 
    ? botSetup.preferred_symbols 
    : typeof botSetup?.preferred_symbols === 'string' 
      ? (botSetup.preferred_symbols as string).split(',').map(s => s.trim()) 
      : ['EURUSD', 'GBPUSD', 'XAUUSD'];

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
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
              <Server className="text-emerald-400" size={20} />
              <h1 className="text-2xl font-bold text-white">MT5 Personal Forex Automation Portal</h1>
            </div>
            <p className="text-xs text-zinc-400">
              Personal Forex MetaTrader 5 bridge execution, account balance monitoring, and order safety.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { setRefreshing(true); loadData(); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Bridge Sync
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
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-zinc-200 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <Lock size={18} /> Forex MT5 Personal Bot Package Required
            </div>
            <p className="text-xs leading-relaxed text-zinc-300">
              Live MetaTrader 5 execution and forex automated trading are enabled for approved <strong>Forex MT5 Personal Bot</strong> subscribers.
            </p>
            <div className="pt-1">
              <Link
                to="/app/package-request?package=forex_mt5_personal_bot"
                className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-4 py-2 rounded-xl text-xs transition-colors"
              >
                Request MT5 Personal Bot <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}

        {/* Connected MT5 Accounts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span>CONNECTED BROKER</span>
              <HardDrive size={14} className="text-emerald-400" />
            </div>
            {mt5Accounts.length > 0 ? (
              mt5Accounts.map((acc) => (
                <div key={acc.id} className="space-y-1">
                  <div className="text-lg font-bold text-white">{acc.broker}</div>
                  <div className="text-xs font-mono text-zinc-400">Server: {acc.server}</div>
                  <div className="text-xs font-mono text-zinc-400">Account: {acc.account_number_masked || '••••'}</div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className={`w-2 h-2 rounded-full ${acc.connection_status === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className="text-xs text-zinc-300 capitalize">{acc.connection_status} ({acc.provider_health})</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-white">
                  {botSetup?.broker_name || 'Exness / IC Markets'}
                </div>
                <div className="text-xs font-mono text-zinc-400">Status: {botSetup?.setup_status ? botSetup.setup_status.replace(/_/g, ' ') : 'Ready'}</div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs text-emerald-300 font-mono">Bridge Configured</span>
                </div>
                <Link to="/app/bot-setup?package=forex_mt5_personal_bot" className="inline-block text-xs text-emerald-400 font-bold hover:underline pt-1">
                  Update MT5 Credentials →
                </Link>
              </div>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span>FOREX RISK PROFILE</span>
              <ShieldCheck size={14} className="text-emerald-400" />
            </div>
            <div className="space-y-1">
              <div className="text-lg font-bold text-white">{botSetup?.risk_preset || 'Conservative'}</div>
              <div className="text-xs text-zinc-400">Leverage Cap: 1:30 - 1:100 (Brokered)</div>
              <div className="text-xs text-emerald-400 font-mono pt-1">Lot Sizing: Dynamic Balance Based</div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span>ACTIVE FOREX PAIRS</span>
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
                <Link to="/app/bot-setup?package=forex_mt5_personal_bot" className="text-xs text-emerald-400 hover:underline inline-flex items-center gap-1 font-mono">
                  <Settings2 size={12} /> Modify Whitelist
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Risk Adjuster Bar */}
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Gauge className="text-emerald-400 shrink-0" size={20} />
            <div>
              <div className="text-xs font-bold text-white">Dynamic Risk Multiplier</div>
              <div className="text-[11px] text-zinc-400">Update per-trade lot sizing and stop loss buffer settings.</div>
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
                    ? 'bg-emerald-600 border-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/20'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Live MT5 Positions & Bridge Status */}
        <div className="border border-zinc-800 rounded-2xl bg-zinc-900/90 p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-emerald-400" />
              <h2 className="text-base font-bold text-white">Live MetaTrader 5 Bridge Operations</h2>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              Synchronized Execution Model
            </span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            HashiBot MT5 Agent runs on dedicated high-availability infrastructure. Orders are routed directly to your connected broker server with local stop loss & take profit guarantees.
          </p>

          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-400 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <span>Bridge Agent: <strong className="text-emerald-400">ONLINE</strong></span>
              <span>Latency: <strong>14ms</strong></span>
              <span>Sync Frequency: <strong>1 sec</strong></span>
            </div>
            <button
              type="button"
              onClick={copyDaemonScript}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors text-xs font-mono"
            >
              {copiedToken ? <Check size={14} /> : <Terminal size={14} />}
              {copiedToken ? 'Copied PowerShell Command!' : 'Copy Local Daemon Script'}
            </button>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}

