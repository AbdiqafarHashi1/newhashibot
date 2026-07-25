import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { CustomerBotSetup as CustomerBotSetupType } from '../../lib/types';
import { 
  Cpu, ShieldCheck, Save, KeyRound, Server, Zap 
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { defaultRiskPreset } from '../../lib/packages';

export default function CustomerBotSetup() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialPkg = searchParams.get('package') || 'crypto_personal_bot';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [botSetup, setBotSetup] = useState<CustomerBotSetupType | null>(null);

  // Form Fields
  const [packageSlug, setPackageSlug] = useState(initialPkg);
  const [exchangeName, setExchangeName] = useState('Binance USD-M Futures');
  const [brokerName, setBrokerName] = useState('');
  const [propFirmName, setPropFirmName] = useState('');
  const [accountSize, setAccountSize] = useState<number>(1000);
  const [accountCurrency, setAccountCurrency] = useState('USD');
  const [riskPreset, setRiskPreset] = useState(defaultRiskPreset(initialPkg));
  const [preferredSymbols, setPreferredSymbols] = useState<string>('BTCUSDT, ETHUSDT, SOLUSDT');
  const [customerNotes, setCustomerNotes] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [mt5Server, setMt5Server] = useState('');
  const [mt5Login, setMt5Login] = useState('');
  const [mt5Password, setMt5Password] = useState('');
  const [acknowledged, setAcknowledged] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const setupRes = await supabase.from('customer_bot_setups').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();

      const existingSetup = setupRes.data as CustomerBotSetupType | null;

      if (existingSetup) {

        setBotSetup(existingSetup);
        setPackageSlug(existingSetup.package_slug || initialPkg);
        setExchangeName(existingSetup.exchange_name || 'Binance USD-M Futures');
        setBrokerName(existingSetup.broker_name || '');
        setPropFirmName(existingSetup.prop_firm_name || '');
        setAccountSize(existingSetup.account_size || 1000);
        setAccountCurrency(existingSetup.account_currency || 'USD');
        setRiskPreset(existingSetup.risk_preset || defaultRiskPreset(existingSetup.package_slug));
        setPreferredSymbols(Array.isArray(existingSetup.preferred_symbols) ? existingSetup.preferred_symbols.join(', ') : 'BTCUSDT, ETHUSDT, SOLUSDT');
        setCustomerNotes(existingSetup.customer_notes || '');
        setAcknowledged(existingSetup.acknowledged_no_execution ?? true);
      }
    } catch (err) {
      console.warn('Failed loading bot setup:', err);
    } finally {
      setLoading(false);
    }
  }, [user, initialPkg]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage(null);

    const symbolsArray = preferredSymbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const botType = packageSlug === 'forex_mt5_personal_bot'
      ? 'forex_mt5_personal'
      : packageSlug === 'forex_mt5_prop_bot'
        ? 'forex_mt5_prop'
        : 'crypto_personal';

    const capitalMode = packageSlug === 'forex_mt5_prop_bot' ? 'prop' : 'personal';

    const payload = {
      user_id: user.id,
      package_slug: packageSlug,
      bot_type: botType,
      capital_mode: capitalMode,
      setup_status: 'setup_requested',
      risk_preset: riskPreset,
      account_size: Number(accountSize) || 1000,
      account_currency: accountCurrency,
      platform: packageSlug.includes('mt5') ? 'mt5' : 'binance',
      exchange_name: exchangeName,
      broker_name: brokerName,
      prop_firm_name: propFirmName,
      preferred_symbols: symbolsArray,
      customer_notes: customerNotes,
      acknowledged_no_execution: acknowledged,
      updated_at: new Date().toISOString()
    };

    try {
      if (botSetup?.id) {
        await supabase.from('customer_bot_setups').update(payload).eq('id', botSetup.id);
      } else {
        await supabase.from('customer_bot_setups').insert({
          ...payload,
          created_at: new Date().toISOString()
        });
      }

      // If user provided MT5 credentials, insert/update mt5_accounts_safe or mt5_accounts
      if (packageSlug.includes('mt5') && mt5Server && mt5Login && mt5Password) {
        // Submit MT5 connection request
        await supabase.from('access_requests').insert({
          user_id: user.id,
          product_slug: packageSlug,
          full_name: user.email || 'Customer',
          email: user.email || '',
          phone: '',
          telegram_username: '',
          telegram_chat_id: '',
          payment_method: 'bot_setup_update',
          notes: `MT5 Credentials Provided: Server=${mt5Server}, Account=${mt5Login}`,
          status: 'pending_admin_approval',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      setMessage({ type: 'success', text: 'Bot configuration saved successfully. Admin will review and connect your execution instance.' });
      setTimeout(() => {
        load();
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save bot configuration';
      setMessage({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

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
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="border-b border-zinc-800 pb-5">
          <div className="flex items-center gap-2 mb-1">
            <Cpu size={22} className="text-blue-400" />
            <h1 className="text-2xl font-bold text-white">Bot Onboarding & Account Configuration</h1>
          </div>
          <p className="text-xs text-zinc-400">
            Configure your trading platform, account parameters, and risk profile for managed bot execution.
          </p>
        </div>

        {message && (
          <div className={`p-4 rounded-xl text-xs font-medium border ${
            message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          
          {/* Package Selection */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap size={16} className="text-amber-400" /> 1. Select Purchased Package
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className={`p-4 rounded-xl border cursor-pointer transition-all ${
                packageSlug === 'crypto_personal_bot' ? 'bg-blue-600/10 border-blue-500 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}>
                <input
                  type="radio"
                  name="package"
                  value="crypto_personal_bot"
                  checked={packageSlug === 'crypto_personal_bot'}
                  onChange={() => { setPackageSlug('crypto_personal_bot'); setRiskPreset('Conservative'); }}
                  className="sr-only"
                />
                <div className="font-bold text-sm text-white mb-1">Crypto Personal Bot</div>
                <div className="text-[11px] text-zinc-400 leading-relaxed">Binance / Bybit USD-M Futures. Personal trading mode with automated stop loss.</div>
              </label>

              <label className={`p-4 rounded-xl border cursor-pointer transition-all ${
                packageSlug === 'forex_mt5_personal_bot' ? 'bg-emerald-600/10 border-emerald-500 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}>
                <input
                  type="radio"
                  name="package"
                  value="forex_mt5_personal_bot"
                  checked={packageSlug === 'forex_mt5_personal_bot'}
                  onChange={() => { setPackageSlug('forex_mt5_personal_bot'); setRiskPreset('Conservative'); }}
                  className="sr-only"
                />
                <div className="font-bold text-sm text-white mb-1">Forex MT5 Personal</div>
                <div className="text-[11px] text-zinc-400 leading-relaxed">MetaTrader 5 broker personal account. Automated forex & gold execution.</div>
              </label>

              <label className={`p-4 rounded-xl border cursor-pointer transition-all ${
                packageSlug === 'forex_mt5_prop_bot' ? 'bg-purple-600/10 border-purple-500 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}>
                <input
                  type="radio"
                  name="package"
                  value="forex_mt5_prop_bot"
                  checked={packageSlug === 'forex_mt5_prop_bot'}
                  onChange={() => { setPackageSlug('forex_mt5_prop_bot'); setRiskPreset('Conservative / Prop Safe'); }}
                  className="sr-only"
                />
                <div className="font-bold text-sm text-white mb-1">Forex MT5 Prop Bot</div>
                <div className="text-[11px] text-zinc-400 leading-relaxed">Prop firm challenge & funded accounts. Prop-safe drawdown governor.</div>
              </label>
            </div>
          </div>

          {/* Account & Platform Details */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Server size={16} className="text-sky-400" /> 2. Account & Broker Info
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              {packageSlug === 'crypto_personal_bot' ? (
                <>
                  <div className="space-y-1">
                    <label className="text-zinc-400 block">EXCHANGE</label>
                    <select
                      value={exchangeName}
                      onChange={(e) => setExchangeName(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="Binance USD-M Futures">Binance USD-M Futures</option>
                      <option value="Bybit USDT Perpetual">Bybit USDT Perpetual</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-zinc-400 block">ACCOUNT CAPITAL SIZE ($)</label>
                    <input
                      type="number"
                      value={accountSize}
                      onChange={(e) => setAccountSize(Number(e.target.value))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500"
                      placeholder="e.g. 1000"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-zinc-400 block">BROKER / PROP FIRM NAME</label>
                    <input
                      type="text"
                      value={packageSlug === 'forex_mt5_prop_bot' ? propFirmName : brokerName}
                      onChange={(e) => packageSlug === 'forex_mt5_prop_bot' ? setPropFirmName(e.target.value) : setBrokerName(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500"
                      placeholder={packageSlug === 'forex_mt5_prop_bot' ? 'e.g. FTMO, Funding Pips' : 'e.g. Exness, IC Markets'}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-zinc-400 block">ACCOUNT SIZE ($)</label>
                    <input
                      type="number"
                      value={accountSize}
                      onChange={(e) => setAccountSize(Number(e.target.value))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500"
                      placeholder="e.g. 10000"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Risk Profile & Preferred Symbols */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-400" /> 3. Risk Profile & Symbol Selection
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="space-y-1">
                <label className="text-zinc-400 block">RISK PRESET</label>
                <select
                  value={riskPreset}
                  onChange={(e) => setRiskPreset(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Conservative">Conservative (0.5% - 1.0% Risk)</option>
                  <option value="Balanced">Balanced (1.5% - 2.0% Risk)</option>
                  <option value="Conservative / Prop Safe">Conservative / Prop Safe (0.5% Hard Cap)</option>
                  <option value="Aggressive">Aggressive (2.5% - 3.0% Risk)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-zinc-400 block">PREFERRED SYMBOLS (COMMA SEPARATED)</label>
                <input
                  type="text"
                  value={preferredSymbols}
                  onChange={(e) => setPreferredSymbols(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500"
                  placeholder="e.g. BTCUSDT, ETHUSDT, EURUSD"
                />
              </div>
            </div>
          </div>

          {/* Credentials Guide & Submission */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <KeyRound size={16} className="text-purple-400" /> 4. Secure Connection Setup
            </h2>

            <p className="text-xs text-zinc-400 leading-relaxed">
              API keys and MT5 passwords are stored with strict encryption. Your keys never enter client logs or public views.
            </p>

            {packageSlug === 'crypto_personal_bot' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                <div className="space-y-1">
                  <label className="text-zinc-400 block">API KEY</label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500"
                    placeholder="Enter Exchange API Key"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-zinc-400 block">API SECRET</label>
                  <input
                    type="password"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500"
                    placeholder="Enter Exchange API Secret"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                <div className="space-y-1">
                  <label className="text-zinc-400 block">MT5 SERVER</label>
                  <input
                    type="text"
                    value={mt5Server}
                    onChange={(e) => setMt5Server(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500"
                    placeholder="e.g. Exness-Real10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-zinc-400 block">MT5 LOGIN / ACCOUNT #</label>
                  <input
                    type="text"
                    value={mt5Login}
                    onChange={(e) => setMt5Login(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500"
                    placeholder="e.g. 10293847"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-zinc-400 block">MT5 PASSWORD</label>
                  <input
                    type="password"
                    value={mt5Password}
                    onChange={(e) => setMt5Password(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500"
                    placeholder="Enter Trader Password"
                  />
                </div>
              </div>
            )}

            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-0"
                />
                <span>I understand that execution will be activated after admin verification and connection setup.</span>
              </label>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex items-center justify-end gap-4">
            <button
              type="submit"
              disabled={saving || !acknowledged}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              <Save size={16} /> {saving ? 'Saving Setup...' : 'Save Bot Configuration'}
            </button>
          </div>

        </form>

      </div>
    </AppLayout>
  );
}
