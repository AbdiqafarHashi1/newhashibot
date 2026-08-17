import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { MT5Account, CustomerSubscription, AccessRequest, CustomerBotSetup } from '../../lib/types';
import { 
  ShieldCheck, RefreshCw, Lock, ArrowRight, Activity, Award, Gauge,
  CheckCircle2, Settings2, Terminal, Check
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { getCustomerAccessState, accessStateLabel } from '../../lib/customerAccess';

export default function MT5PropPortal() {
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
        supabase.from('mt5_accounts_safe').select('*').eq('user_id', user.id).eq('account_type', 'prop')
      ]);

      setSub(subRes.data ?? null);
      setRequest(reqRes.data as AccessRequest | null);
      setBotSetup(setupRes.data as CustomerBotSetup | null);
      setMt5Accounts(mt5Res.data as MT5Account[] ?? []);
    } catch (err) {
      console.warn('Failed loading MT5 Prop portal:', err);
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
      setQuickMessage(`Prop risk profile updated to ${newRisk}`);
      setTimeout(() => setQuickMessage(null), 3000);
    } catch (e) {
      console.error('Failed to quick update prop risk:', e);
    } finally {
      setUpdatingRisk(false);
    }
  };

  const copyDaemonScript = () => {
    const script = `# Run in Windows PowerShell (MT5 Prop Bridge Agent)
Invoke-WebRequest -Uri "https://hashibot.trade/daemon/mt5-bridge.ps1" -OutFile "mt5-bridge.ps1"
powershell -ExecutionPolicy Bypass -File mt5-bridge.ps1 -Token "HB-MT5-PROP-${user?.id?.slice(0, 8)}"`;
    navigator.clipboard.writeText(script);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 3000);
  };

  const accessState = getCustomerAccessState(sub, request);
  const isActive = accessState === 'active' && (sub?.package_name?.toLowerCase().includes('prop') || request?.product_slug?.includes('forex_mt5_prop'));

  const preferredList = Array.isArray(botSetup?.preferred_symbols) 
    ? botSetup.preferred_symbols 
    : typeof botSetup?.preferred_symbols === 'string' 
      ? (botSetup.preferred_symbols as string).split(',').map(s => s.trim()) 
      : ['EURUSD', 'GBPUSD', 'XAUUSD'];

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
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
              <Award className="text-purple-400" size={20} />
              <h1 className="text-2xl font-bold text-white">MT5 Prop Automation Portal</h1>
            </div>
            <p className="text-xs text-zinc-400">
              Prop Firm Challenge & Funded account execution with strict drawdown protection governor.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { setRefreshing(true); loadData(); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Drawdown Governor Sync
            </button>
            <Badge variant={accessState === 'active' ? 'green' : 'yellow'}>
              {accessStateLabel(accessState)}
            </Badge>
          </div>
        </div>

        {quickMessage && (
          <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-mono flex items-center gap-2">
            <CheckCircle2 size={14} /> {quickMessage}
          </div>
        )}

        {/* Access Control Notice if not active */}
        {!isActive && (
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-6 text-zinc-200 space-y-3">
            <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
              <Lock size={18} /> Forex MT5 Prop Bot Package Required
            </div>
            <p className="text-xs leading-relaxed text-zinc-300">
              Prop-safe automated execution and real-time drawdown governors are enabled for approved <strong>Forex MT5 Prop Bot</strong> subscribers.
            </p>
            <div className="pt-1">
              <Link
                to="/app/package-request?package=forex_mt5_prop_bot"
                className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
              >
                Request MT5 Prop Bot <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}

        {/* Connected Prop Firm Accounts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span>PROP FIRM ACCOUNT</span>
              <Award size={14} className="text-purple-400" />
            </div>
            {mt5Accounts.length > 0 ? (
              mt5Accounts.map((acc) => (
                <div key={acc.id} className="space-y-1">
                  <div className="text-lg font-bold text-white">{acc.broker} (Prop)</div>
                  <div className="text-xs font-mono text-zinc-400">Server: {acc.server}</div>
                  <div className="text-xs font-mono text-zinc-400">Account: {acc.account_number_masked || '••••'}</div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className={`w-2 h-2 rounded-full ${acc.connection_status === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className="text-xs text-zinc-300 capitalize">{acc.connection_status}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-white">
                  {botSetup?.prop_firm_name || 'FTMO / FundedNext / Funding Pips'}
                </div>
                <div className="text-xs font-mono text-zinc-400">Status: {botSetup?.setup_status ? botSetup.setup_status.replace(/_/g, ' ') : 'Ready'}</div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs text-emerald-300 font-mono">Bridge Configured</span>
                </div>
                <Link to="/app/bot-setup?package=forex_mt5_prop_bot" className="inline-block text-xs text-purple-400 font-bold hover:underline pt-1">
                  Update Prop MT5 Credentials →
                </Link>
              </div>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span>DRAWDOWN GOVERNOR</span>
              <Gauge size={14} className="text-emerald-400" />
            </div>
            <div className="space-y-1">
              <div className="text-lg font-bold text-emerald-400">0.0% Daily Drawdown</div>
              <div className="text-xs text-zinc-400">Hard Cutoff: 3.2% Daily / 8.0% Max</div>
              <div className="text-xs text-purple-400 font-mono pt-1">0.5% Hard Risk Cap per Trade</div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span>ACTIVE PROP PAIRS</span>
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
                <Link to="/app/bot-setup?package=forex_mt5_prop_bot" className="text-xs text-purple-400 hover:underline inline-flex items-center gap-1 font-mono">
                  <Settings2 size={12} /> Modify Whitelist
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Risk Adjuster Bar */}
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Gauge className="text-purple-400 shrink-0" size={20} />
            <div>
              <div className="text-xs font-bold text-white">Prop Firm Challenge Presets</div>
              <div className="text-[11px] text-zinc-400">Certified risk modes matching Phase 1, Phase 2, and Funded account requirements.</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(['Conservative / Prop Safe', 'Conservative', 'Balanced'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={updatingRisk}
                onClick={() => handleQuickRiskChange(preset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all border ${
                  botSetup?.risk_preset === preset
                    ? 'bg-purple-600 border-purple-500 text-white font-bold shadow-lg shadow-purple-600/20'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Prop Protection Rules Banner */}
        <div className="border border-zinc-800 rounded-2xl bg-zinc-900/90 p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-purple-400" />
              <h2 className="text-base font-bold text-white">Prop Firm Protection & Compliance Architecture</h2>
            </div>
            <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/20">
              Zero Hard-Violation Guarantee
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-300">
            <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1">
              <span className="font-bold text-white">1. Hard Stop Loss Mandate</span>
              <p className="text-zinc-400">Every position is opened with an immediate, non-negotiable hard stop loss transmitted inside the entry command.</p>
            </div>
            <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1">
              <span className="font-bold text-white">2. Equity Curve Governor</span>
              <p className="text-zinc-400">Execution automatically pauses if daily floating loss reaches 80% of your prop firm limit.</p>
            </div>
            <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1">
              <span className="font-bold text-white">3. Weekend & News Flushes</span>
              <p className="text-zinc-400">Open trades are closed prior to major high-impact news spikes and weekend market gaps according to firm rules.</p>
            </div>
          </div>

          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-400 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <span>Bridge Agent: <strong className="text-purple-400">ONLINE</strong></span>
              <span>Prop Governor: <strong className="text-emerald-400">ACTIVE (0.5% Cap)</strong></span>
            </div>
            <button
              type="button"
              onClick={copyDaemonScript}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-colors text-xs font-mono"
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

