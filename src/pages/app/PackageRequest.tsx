import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { AccessRequest, Package } from '../../lib/types';
import { defaultRiskPreset, isBotPackage, normalizePackage, packageStatusLabel, priceLabel, PUBLIC_PACKAGES, signalModeIncluded } from '../../lib/packages';
import { statusBadge, Badge } from '../../components/ui/Badge';
import { CheckCircle, Clock, CreditCard, MessageCircle, Package as PackageIcon, ShieldCheck } from 'lucide-react';

const riskOptions = ['Conservative', 'Balanced', 'Aggressive'];

export default function PackageRequest() {
  const { user, profile } = useAuth();
  const [search] = useSearchParams();
  const requestedSlug = search.get('package') || 'crypto_signal_room';
  const [packages, setPackages] = useState<Package[]>(PUBLIC_PACKAGES);
  const [latestRequest, setLatestRequest] = useState<AccessRequest | null>(null);
  const [selectedSlug, setSelectedSlug] = useState(requestedSlug);
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [chatId, setChatId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mpesa');
  const [paymentReference, setPaymentReference] = useState('');
  const [riskPreset, setRiskPreset] = useState(defaultRiskPreset(requestedSlug));
  const [notes, setNotes] = useState('');
  const [contactPreference, setContactPreference] = useState('WhatsApp');
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
    supabase.from('access_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        const req = data as AccessRequest | null;
        setLatestRequest(req);
        if (req) {
          setSelectedSlug(req.product_slug || requestedSlug);
          setPhone(req.phone || '');
          setTelegram(req.telegram_username || '');
          setChatId(req.telegram_chat_id || '');
          setPaymentMethod(req.payment_method || 'mpesa');
          setPaymentReference(req.payment_reference || '');
          setRiskPreset(req.risk_preset || defaultRiskPreset(req.product_slug));
          setContactPreference(req.contact_preference || 'WhatsApp');
        }
      });
  }, [requestedSlug, user]);

  const selectedPackage = useMemo(() => packages.find(pkg => pkg.slug === selectedSlug) ?? PUBLIC_PACKAGES[1], [packages, selectedSlug]);
  const selectedIsBot = isBotPackage(selectedPackage.slug);
  const propBot = selectedPackage.slug === 'forex_mt5_prop_bot';
  const selectedPrice = priceLabel(selectedPackage);

  useEffect(() => {
    setRiskPreset(current => propBot ? 'Conservative / Prop Safe' : current || defaultRiskPreset(selectedPackage.slug));
  }, [propBot, selectedPackage.slug]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true); setMsg(''); setErr('');
    const status = paymentReference.trim() ? 'pending_admin_approval' : 'pending_payment';
    const payload = {
      user_id: user.id,
      product_slug: selectedPackage.slug,
      full_name: profile?.full_name || '',
      email: profile?.email || user.email || '',
      phone: phone.trim(),
      telegram_username: telegram.replace(/^@/, '').trim(),
      telegram_chat_id: chatId.trim(),
      payment_method: paymentMethod,
      payment_reference: paymentReference.trim(),
      risk_preset: selectedIsBot ? riskPreset : '',
      contact_preference: contactPreference,
      notes: notes.trim(),
      status,
      updated_at: new Date().toISOString(),
    };

    const { error } = latestRequest && ['pending', 'pending_payment', 'pending_admin_approval', 'rejected'].includes(latestRequest.status)
      ? await supabase.from('access_requests').update(payload).eq('id', latestRequest.id)
      : await supabase.from('access_requests').insert(payload);

    setLoading(false);
    if (error) { setErr(error.message); return; }
    setMsg('Package request submitted. Admin will review payment/contact details and activate the correct access manually.');
    const { data } = await supabase.from('access_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setLatestRequest(data as AccessRequest | null);
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Choose package & request access</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Manual payment/admin approval flow. No broker execution or fake Bot controls are enabled here.</p>
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
                const active = selectedSlug === pkg.slug;
                return (
                  <button key={pkg.slug} type="button" onClick={() => setSelectedSlug(pkg.slug)}
                    className={`text-left rounded-lg border p-3 transition-colors ${active ? 'border-sky-500 bg-sky-500/10' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'}`}>
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
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Payment method</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="input-select">
                {['mpesa', 'bank_transfer', 'card', 'crypto_payment', 'manual'].map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <Field label="Payment reference / proof note" value={paymentReference} onChange={setPaymentReference} placeholder="M-Pesa code, receipt ref, or proof note" />
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Preferred contact</label>
              <select value={contactPreference} onChange={e => setContactPreference(e.target.value)} className="input-select">
                {['WhatsApp', 'Telegram', 'Email', 'Phone'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {selectedIsBot && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2"><ShieldCheck size={14} className="text-sky-400" /><span className="text-sm font-semibold">Bot setup preparation</span></div>
              <p className="text-xs text-zinc-500 mb-3">This records setup preference only. Execution is not active until admin configuration is complete; no orders are placed from this flow.</p>
              <label className="block text-xs text-zinc-400 mb-1.5">Risk preset request</label>
              <select value={riskPreset} onChange={e => setRiskPreset(e.target.value)} disabled={propBot} className="input-select">
                {propBot ? <option>Conservative / Prop Safe</option> : riskOptions.map(opt => <option key={opt}>{opt}</option>)}
              </select>
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
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2"><Clock size={14} className="text-yellow-400" /><h2 className="font-semibold text-sm">Latest request</h2></div>
            {latestRequest ? (
              <div className="text-xs text-zinc-500 space-y-2">
                <div>Status: {statusBadge(latestRequest.status)}</div>
                <div>Package: {latestRequest.product_slug.replace(/_/g, ' ')}</div>
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

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1.5">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="input-select" />
    </div>
  );
}
