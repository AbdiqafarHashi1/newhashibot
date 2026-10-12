import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { usePreviewViewer } from '../../contexts/OwnerPreviewContext';
import { supabase } from '../../lib/supabase';
import { AccessRequest, CustomerBotSetup, Package } from '../../lib/types';
import { isBotPackage, normalizePackage, packageStatusLabel, priceLabel, PUBLIC_PACKAGES, signalModeIncluded } from '../../lib/packages';
import { statusBadge, Badge } from '../../components/ui/Badge';
import { AlertTriangle, CheckCircle, Clock, CreditCard, MessageCircle, Package as PackageIcon, ShieldCheck } from 'lucide-react';
import {
  botSetupStatusLabel,
  botTypeFromPackage,
  capitalModeFromPackage,
  defaultBotRiskPreset,
  riskOptionsForPackage,
  RISK_PRESET_HELP,
  splitSymbols,
  symbolsToText,
} from '../../lib/botSetup';

export default function PackageRequest() {
  const { subject: user, displayProfile: profile } = usePreviewViewer();
  const [search] = useSearchParams();
  const requestedSlug = search.get('package') || 'crypto_signal_room';
  const [packages, setPackages] = useState<Package[]>(PUBLIC_PACKAGES);
  const [latestRequest, setLatestRequest] = useState<AccessRequest | null>(null);
  const [botSetup, setBotSetup] = useState<CustomerBotSetup | null>(null);
  const [selectedSlug, setSelectedSlug] = useState(requestedSlug);
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [chatId, setChatId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mpesa');
  const [paymentReference, setPaymentReference] = useState('');
  const [riskPreset, setRiskPreset] = useState<string>(defaultBotRiskPreset(requestedSlug));
  const [notes, setNotes] = useState('');
  const [contactPreference, setContactPreference] = useState('WhatsApp');
  const [accountSize, setAccountSize] = useState('');
  const [accountCurrency, setAccountCurrency] = useState('USD');
  const [maxRiskPerTrade, setMaxRiskPerTrade] = useState('');
  const [maxDailyLoss, setMaxDailyLoss] = useState('');
  const [symbols, setSymbols] = useState('');
  const [platform, setPlatform] = useState('');
  const [accountType, setAccountType] = useState('demo/sandbox');
  const [leverageProfile, setLeverageProfile] = useState('Low');
  const [brokerName, setBrokerName] = useState('');
  const [exchangeName, setExchangeName] = useState('');
  const [propFirmName, setPropFirmName] = useState('');
  const [drawdownLimit, setDrawdownLimit] = useState('');
  const [minTradingDays, setMinTradingDays] = useState('');
  const [acknowledgedNoExecution, setAcknowledgedNoExecution] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase.from('packages').select('*').order('sort_order').then(({ data }) => {
      if (data?.length) setPackages(data.map(p => normalizePackage(p as Package)).filter(p => PUBLIC_PACKAGES.some(pub => pub.slug === p.slug)));
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('access_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('customer_bot_setups').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ]).then(([reqRes, setupRes]) => {
      const req = reqRes.data as AccessRequest | null;
      const setup = setupRes.data as CustomerBotSetup | null;
      setLatestRequest(req);
      setBotSetup(setup);
      if (req) {
        setSelectedSlug(req.product_slug || requestedSlug);
        setPhone(req.phone || '');
        setTelegram(req.telegram_username || '');
        setChatId(req.telegram_chat_id || '');
        setPaymentMethod(req.payment_method || 'mpesa');
        setPaymentReference(req.payment_reference || '');
        setRiskPreset(req.risk_preset || setup?.risk_preset || defaultBotRiskPreset(req.product_slug));
        setContactPreference(req.contact_preference || 'WhatsApp');
        setNotes(req.notes || '');
      }
      if (setup) {
        setAccountSize(setup.account_size?.toString() ?? '');
        setAccountCurrency(setup.account_currency || 'USD');
        setMaxRiskPerTrade(setup.max_risk_per_trade_pct?.toString() ?? '');
        setMaxDailyLoss(setup.max_daily_loss_pct?.toString() ?? '');
        setSymbols(symbolsToText(setup.preferred_symbols));
        setPlatform(setup.platform || '');
        setAccountType(setup.account_type || 'demo/sandbox');
        setLeverageProfile(setup.leverage_profile || 'Low');
        setBrokerName(setup.broker_name || '');
        setExchangeName(setup.exchange_name || '');
        setPropFirmName(setup.prop_firm_name || '');
        setDrawdownLimit(setup.drawdown_limit_pct?.toString() ?? '');
        setMinTradingDays(setup.min_trading_days?.toString() ?? '');
        setAcknowledgedNoExecution(setup.acknowledged_no_execution);
      }
    });
  }, [requestedSlug, user]);

  const selectedPackage = useMemo(() => packages.find(pkg => pkg.slug === selectedSlug) ?? PUBLIC_PACKAGES[1], [packages, selectedSlug]);
  const selectedIsBot = isBotPackage(selectedPackage.slug);
  const propBot = selectedPackage.slug.includes('prop_bot');
  const cryptoBot = selectedPackage.slug.startsWith('crypto_') && selectedIsBot;
  const forexBot = selectedPackage.slug === 'forex_mt5_personal_bot' || selectedPackage.slug === 'forex_mt5_prop_bot';
  const selectedPrice = priceLabel(selectedPackage);
  const riskOptions = riskOptionsForPackage(selectedPackage.slug);

  useEffect(() => {
    setRiskPreset(current => riskOptions.includes(current as (typeof riskOptions)[number]) ? current : defaultBotRiskPreset(selectedPackage.slug));
    setAccountType(propBot ? 'challenge/funded stage' : cryptoBot ? 'demo/sandbox' : 'demo');
  }, [cryptoBot, propBot, riskOptions, selectedPackage.slug]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (selectedIsBot && !acknowledgedNoExecution) {
      setErr('Please acknowledge that this is setup only and no orders are placed yet.');
      return;
    }
    if (selectedIsBot && propBot && riskPreset === 'Aggressive') {
      setErr('Aggressive risk is not available for Forex MT5 Prop Bot.');
      return;
    }

    setLoading(true); setMsg(''); setErr('');
    const intent = selectedIsBot ? (cryptoBot ? "CRYPTO" : "FOREX") : "SIGNALS";
    const { data: onboarding, error: onboardingError } = await supabase.functions.invoke("customer-provisioning", { body: { action:"submit", intent, account_type:selectedIsBot ? (propBot ? "PROP" : "PERSONAL") : undefined, package_slug:selectedPackage.slug, payment_reference:paymentReference.trim(), payment_phone:phone.trim(), provider:cryptoBot ? (exchangeName || platform) : forexBot ? "MT5" : null, risk_style:selectedIsBot ? riskPreset : "Conservative", symbols:splitSymbols(symbols), notes:notes.trim() } });
    if (onboardingError || !onboarding?.request?.id) { setLoading(false); setErr(onboardingError?.message ?? "Onboarding submission failed"); return; }
    const request = { id:onboarding.request.id, user_id:user.id, product_slug:selectedPackage.slug, full_name:profile?.full_name||"",email:profile?.email||user.email||"",phone:phone.trim(),telegram_username:telegram.replace(/^@/, '').trim(),telegram_chat_id:chatId.trim(),payment_method:"mpesa",payment_reference:paymentReference.trim(),risk_preset:selectedIsBot?riskPreset:"",contact_preference:contactPreference,notes:notes.trim(),status:"pending_admin_approval",admin_note:"",created_at:onboarding.request.created_at,updated_at:onboarding.request.created_at } as AccessRequest;

    if (selectedIsBot) {
      const botType = botTypeFromPackage(selectedPackage.slug);
      const setupPayload = {
        user_id: user.id,
        package_slug: selectedPackage.slug,
        access_request_id: request.id,
        bot_type: botType,
        capital_mode: capitalModeFromPackage(selectedPackage.slug),
        setup_status: 'setup_requested',
        risk_preset: propBot && riskPreset === 'Aggressive' ? defaultBotRiskPreset(selectedPackage.slug) : riskPreset,
        account_size: accountSize ? Number(accountSize) : null,
        account_currency: accountCurrency.trim() || 'USD',
        platform: cryptoBot ? platform.trim() : '',
        broker_name: forexBot ? brokerName.trim() : '',
        exchange_name: cryptoBot ? exchangeName.trim() : '',
        prop_firm_name: propBot ? propFirmName.trim() : '',
        account_type: accountType.trim(),
        preferred_symbols: splitSymbols(symbols),
        max_risk_per_trade_pct: maxRiskPerTrade ? Number(maxRiskPerTrade) : null,
        max_daily_loss_pct: maxDailyLoss ? Number(maxDailyLoss) : null,
        drawdown_limit_pct: propBot && drawdownLimit ? Number(drawdownLimit) : null,
        min_trading_days: propBot && minTradingDays ? Number(minTradingDays) : null,
        leverage_profile: cryptoBot ? leverageProfile : '',
        customer_notes: notes.trim(),
        acknowledged_no_execution: acknowledgedNoExecution,
        updated_at: new Date().toISOString(),
      };
      const setupWrite = await supabase.from('customer_bot_setups').upsert(setupPayload, { onConflict: 'user_id,package_slug' }).select('*').single();
      if (setupWrite.error) { setLoading(false); setErr(`Package request saved, but Bot setup details failed to save: ${setupWrite.error.message}`); return; }
      setBotSetup(setupWrite.data as CustomerBotSetup);
    }

    setLoading(false);
    setMsg(selectedIsBot
      ? 'Package request and Bot setup details submitted. Admin will review payment and setup details. No execution is active.'
      : 'Package request submitted. Admin will review payment/contact details and activate Signal Mode manually.');
    setLatestRequest(request);
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Choose package & request access</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Manual payment/admin approval flow. Bot packages collect setup details only; no broker execution or fake Bot controls are enabled here.</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_22rem] gap-5 max-w-5xl">
        <form onSubmit={submit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5">
          {msg && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm px-3 py-2 rounded-lg flex items-center gap-2"><CheckCircle size={14} />{msg}</div>}
          {err && <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-3 py-2 rounded-lg">{err}</div>}

          <div>
            <label className="block text-xs text-zinc-400 mb-2">Package</label>
            <div className="grid sm:grid-cols-2 gap-2">
              {packages.map(pkg => {
                const p = priceLabel(pkg);
                const active = selectedPackage.slug === pkg.slug;
                return (
                  <button key={pkg.slug} type="button" onClick={() => setSelectedSlug(pkg.slug)} className={`text-left border rounded-lg px-3 py-3 transition-colors ${active ? 'border-sky-500 bg-sky-500/10' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">{pkg.name}</span>
                      <Badge variant={pkg.slug === 'crypto_signal_room' ? 'green' : isBotPackage(pkg.slug) ? 'blue' : 'gray'}>{packageStatusLabel(pkg)}</Badge>
                    </div>
                    <div className="text-xs text-zinc-500">{p.main} {p.period}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Phone / WhatsApp" value={phone} onChange={setPhone} placeholder="+254..." />
            <Field label="Telegram username" value={telegram} onChange={setTelegram} placeholder="@username" />
            <Field label="Telegram Chat ID (optional)" value={chatId} onChange={setChatId} placeholder="Optional" />
            <Select label="Payment method" value={paymentMethod} onChange={setPaymentMethod} options={['mpesa', 'bank_transfer', 'card', 'crypto_payment', 'manual']} />
            <Field label="Payment reference / proof note" value={paymentReference} onChange={setPaymentReference} placeholder="M-Pesa code, receipt ref, or proof note" />
            <Select label="Preferred contact" value={contactPreference} onChange={setContactPreference} options={['WhatsApp', 'Telegram', 'Email', 'Phone']} />
          </div>

          {selectedIsBot && (
            <div className="bg-zinc-950 border border-sky-500/20 rounded-xl p-4 space-y-4">
              <div className="flex items-start gap-2">
                <ShieldCheck size={15} className="text-sky-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold">Bot setup details</div>
                  <p className="text-xs text-zinc-500 mt-0.5">Setup request only. Execution is not active until admin configuration and demo connector are completed. No orders are placed from this dashboard yet.</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <ReadOnly label="Selected Bot package" value={selectedPackage.name} />
                <ReadOnly label="Capital mode" value={propBot ? 'prop' : 'personal'} />
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Risk preset</label>
                  <select value={riskPreset} onChange={e => setRiskPreset(e.target.value)} className="input-select">
                    {riskOptions.map(opt => <option key={opt}>{opt}</option>)}
                  </select>
                  <p className="text-xs text-zinc-600 mt-1">{RISK_PRESET_HELP[riskPreset as keyof typeof RISK_PRESET_HELP]}</p>
                </div>
                <Field label="Starting capital / account size" value={accountSize} onChange={setAccountSize} placeholder="1000" type="number" />
                <Field label="Preferred max risk per trade (%)" value={maxRiskPerTrade} onChange={setMaxRiskPerTrade} placeholder="1" type="number" />
                <Field label="Preferred max daily loss (%)" value={maxDailyLoss} onChange={setMaxDailyLoss} placeholder={propBot ? 'Based on prop rule' : '3'} type="number" />
                <Field label="Preferred symbols / pairs" value={symbols} onChange={setSymbols} placeholder={cryptoBot ? 'BTCUSDT, ETHUSDT' : 'EURUSD, GBPUSD'} />
                <Field label="Account currency" value={accountCurrency} onChange={setAccountCurrency} placeholder="USD" />
              </div>

              {cryptoBot && (
                <div className="grid sm:grid-cols-2 gap-4 border-t border-zinc-800 pt-4">
                  <Field label="Exchange/platform preference" value={platform} onChange={setPlatform} placeholder="Binance, Bybit, Coinbase..." />
                  <Field label="Exchange name" value={exchangeName} onChange={setExchangeName} placeholder="Preferred exchange" />
                  <Select label="Crypto account type" value={accountType} onChange={setAccountType} options={['demo/sandbox', 'live later']} />
                  <Select label="Preferred leverage profile" value={leverageProfile} onChange={setLeverageProfile} options={['Low', 'Medium', 'Higher-risk']} />
                </div>
              )}

              {forexBot && (
                <div className="grid sm:grid-cols-2 gap-4 border-t border-zinc-800 pt-4">
                  <Field label="MT5 broker name" value={brokerName} onChange={setBrokerName} placeholder="Broker name" />
                  <Select label="MT5 account type" value={accountType} onChange={setAccountType} options={propBot ? ['challenge/funded stage', 'live funded later'] : ['demo', 'live later']} />
                  {propBot && <Field label="Prop firm name" value={propFirmName} onChange={setPropFirmName} placeholder="FTMO, FundedNext..." />}
                  {propBot && <Field label="Max total drawdown rule (%)" value={drawdownLimit} onChange={setDrawdownLimit} placeholder="10" type="number" />}
                  {propBot && <Field label="Minimum trading days (if any)" value={minTradingDays} onChange={setMinTradingDays} placeholder="5" type="number" />}
                </div>
              )}

              <label className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-3 text-xs text-amber-100">
                <input type="checkbox" checked={acknowledgedNoExecution} onChange={e => setAcknowledgedNoExecution(e.target.checked)} className="mt-0.5" />
                <span>I understand this is setup only. No orders are placed until admin configuration and demo connector phases are complete.</span>
              </label>
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Notes to admin</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Package/payment notes, setup questions, preferred onboarding time..." className="input-select resize-none" />
          </div>

          <button disabled={loading} className="bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
            {loading ? 'Submitting…' : 'Submit request for admin approval'}
          </button>
        </form>

        <aside className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3"><PackageIcon size={15} className="text-sky-400" /><h2 className="font-semibold">Selected package</h2></div>
            <div className="text-lg font-bold">{selectedPackage.name}</div>
            <div className="text-sm text-zinc-500 mb-3">{selectedPrice.main} {selectedPrice.period}</div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">{selectedPackage.description}</p>
            <ul className="space-y-1.5 text-xs text-zinc-400">
              {selectedPackage.features.map(feature => <li key={feature} className="flex gap-2"><CheckCircle size={11} className="text-emerald-400 mt-0.5 shrink-0" />{feature}</li>)}
            </ul>
            {signalModeIncluded(selectedPackage.slug) && <div className="mt-3 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1.5">Signal Mode is included.</div>}
            {selectedIsBot && <div className="mt-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5 flex gap-2"><AlertTriangle size={12} className="shrink-0 mt-0.5" />Setup request only — no Start/Stop/Connect controls.</div>}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2"><Clock size={14} className="text-yellow-400" /><h2 className="font-semibold text-sm">Latest request</h2></div>
            {latestRequest ? (
              <div className="text-xs text-zinc-500 space-y-2">
                <div>Status: {statusBadge(latestRequest.status)}</div>
                <div>Package: {latestRequest.product_slug.replace(/_/g, ' ')}</div>
                {isBotPackage(latestRequest.product_slug) && <div>Bot setup: <span className="capitalize text-zinc-300">{botSetupStatusLabel(botSetup?.setup_status)}</span></div>}
                <div>Submitted: {new Date(latestRequest.created_at).toLocaleString()}</div>
                {latestRequest.admin_note && <div>Admin note: {latestRequest.admin_note}</div>}
              </div>
            ) : <p className="text-xs text-zinc-500">No request submitted yet.</p>}
          </div>

          <Link to="/app/telegram" className="flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300"><MessageCircle size={14} /> Manage Telegram details</Link>
          <Link to="/pricing" className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white"><CreditCard size={14} /> Back to pricing</Link>
        </aside>
      </div>
    </AppLayout>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="input-select" />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1.5">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="input-select">
        {options.map(option => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
      </select>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
      <div className="text-xs text-zinc-500 mb-0.5">{label}</div>
      <div className="text-sm text-zinc-200 capitalize">{value}</div>
    </div>
  );
}
