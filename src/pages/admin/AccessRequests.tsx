import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { AccessRequest, CustomerBotSetup, Package } from '../../lib/types';
import { statusBadge } from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { ClipboardList, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { defaultRiskPreset, isBotPackage, packageDisplayName } from '../../lib/packages';
import { botSetupStatusLabel } from '../../lib/botSetup';

interface RequestRow extends AccessRequest {
  profile?: { email: string; full_name: string };
  bot_setup?: CustomerBotSetup | null;
}

export default function AccessRequests() {
  const { session } = useAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expiryInputs, setExpiryInputs] = useState<Record<string, string>>({});
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});

  async function load() {
    const [{ data }, pkgRes, setupRes] = await Promise.all([supabase
      .from('access_requests')
      .select('*, profile:profiles(email, full_name)')
      .order('created_at', { ascending: false }),
      supabase.from('packages').select('*').order('sort_order'),
      supabase.from('customer_bot_setups').select('*'),
    ]);
    const setupsByRequest = new Map((setupRes.data ?? []).map(setup => [(setup as CustomerBotSetup).access_request_id, setup as CustomerBotSetup]));
    setRequests(((data ?? []) as RequestRow[]).map(req => ({ ...req, bot_setup: setupsByRequest.get(req.id) ?? null })));
    setPackages((pkgRes.data ?? []) as Package[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function flash(text: string, type: 'ok' | 'err' = 'ok') {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 5000);
  }

  async function updateStatus(req: RequestRow, status: AccessRequest['status'], grantAccess = false) {
    const note = noteInputs[req.id] ?? '';

    if (grantAccess) {
      const expiry = expiryInputs[req.id];
      const startsAt = new Date().toISOString();
      const expiresAt = expiry ? new Date(expiry).toISOString() : null;
      const pkg = packages.find(p => p.slug === req.product_slug);
      const existing = await supabase.from('customer_subscriptions').select('id').eq('user_id', req.user_id).maybeSingle();
      const subscriptionPayload = {
        user_id: req.user_id,
        profile_id: req.user_id,
        email: req.email || req.profile?.email || '',
        full_name: req.full_name || req.profile?.full_name || '',
        package_id: pkg?.id ?? null,
        package_name: pkg?.name ?? packageDisplayName(req.product_slug),
        payment_status: 'paid',
        access_status: 'active',
        amount_paid: pkg?.price_kes ?? pkg?.price ?? null,
        currency: pkg?.currency ?? 'KES',
        payment_reference: req.payment_reference || '',
        payment_method: req.payment_method || 'manual',
        starts_at: startsAt,
        expires_at: expiresAt,
        telegram_username: req.telegram_username || '',
        telegram_chat_id: req.telegram_chat_id || '',
        notes: [req.notes, isBotPackage(req.product_slug) ? `Bot setup status: pending_admin_setup; risk preset: ${req.risk_preset || defaultRiskPreset(req.product_slug)}` : ''].filter(Boolean).join(' | '),
        admin_note: note,
        updated_at: startsAt,
      };
      const subscriptionWrite = existing.data?.id
        ? await supabase.from('customer_subscriptions').update(subscriptionPayload).eq('id', existing.data.id).select('id').single()
        : await supabase.from('customer_subscriptions').insert(subscriptionPayload).select('id').single();

      if (subscriptionWrite.error) { flash(`Package approval blocked because subscription grant failed: ${subscriptionWrite.error.message}`, 'err'); return; }

      if (isBotPackage(req.product_slug)) {
        await supabase.from('customer_bot_setups').update({
          subscription_id: subscriptionWrite.data?.id ?? existing.data?.id ?? null,
          setup_status: 'pending_admin_setup',
          updated_at: startsAt,
        }).eq('access_request_id', req.id);
      }

      const { error: accessErr } = await supabase.from('user_access').upsert({
        user_id: req.user_id,
        product_slug: 'signal_mode',
        status: 'active',
        started_at: startsAt,
        expires_at: expiresAt,
      }, { onConflict: 'user_id,product_slug' });

      if (accessErr) { flash(`Subscription created but legacy access grant failed: ${accessErr.message}`, 'err'); return; }

      // Also create/update telegram link if provided
      if (req.telegram_username || req.telegram_chat_id) {
        await supabase.from('telegram_links').upsert({
          user_id: req.user_id,
          telegram_username: req.telegram_username,
          telegram_chat_id: req.telegram_chat_id,
          phone: req.phone,
          status: 'pending',
        }, { onConflict: 'user_id' });
      }

      const { error: requestErr } = await supabase.from('access_requests').update({
        status,
        admin_note: note,
        updated_at: new Date().toISOString(),
      }).eq('id', req.id);

      if (requestErr) { flash(`Package access granted but request status update failed: ${requestErr.message}`, 'err'); return; }

      await supabase.from('audit_logs').insert({
        actor_user_id: session?.user.id ?? null,
        action: 'access_request_approved_and_granted',
        entity_type: 'access_requests',
        entity_id: req.id,
        metadata: { user_id: req.user_id, product: req.product_slug, subscription_model: 'customer_subscriptions', note },
      });
      flash('Request approved and package access granted.');
    } else {
      const { error } = await supabase.from('access_requests').update({
        status,
        admin_note: note,
        updated_at: new Date().toISOString(),
      }).eq('id', req.id);

      if (error) { flash(`Error: ${error.message}`, 'err'); return; }

      await supabase.from('audit_logs').insert({
        actor_user_id: session?.user.id ?? null,
        action: `access_request_${status}`,
        entity_type: 'access_requests',
        entity_id: req.id,
        metadata: { note },
      });
      flash(`Request ${status}.`);
    }

    await load();
  }

  const pending = requests.filter(r => ['pending', 'pending_payment', 'pending_admin_approval'].includes(r.status));
  const others = requests.filter(r => !['pending', 'pending_payment', 'pending_admin_approval'].includes(r.status));

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Access Requests</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Customer package/payment requests — approve to grant package access</p>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
          msgType === 'err' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        }`}>
          {msg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pending */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList size={14} className="text-yellow-400" />
              <span className="text-sm font-semibold">Pending Requests</span>
              {pending.length > 0 && (
                <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">{pending.length}</span>
              )}
            </div>
            {pending.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-sm text-zinc-500">No pending requests.</div>
            ) : (
              <div className="space-y-2">
                {pending.map(req => (
                  <RequestCard key={req.id} req={req} expanded={expanded} setExpanded={setExpanded}
                    expiryInputs={expiryInputs} setExpiryInputs={setExpiryInputs}
                    noteInputs={noteInputs} setNoteInputs={setNoteInputs}
                    updateStatus={updateStatus} />
                ))}
              </div>
            )}
          </div>

          {others.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-3 text-zinc-400">Processed Requests</div>
              <div className="space-y-2">
                {others.map(req => (
                  <RequestCard key={req.id} req={req} expanded={expanded} setExpanded={setExpanded}
                    expiryInputs={expiryInputs} setExpiryInputs={setExpiryInputs}
                    noteInputs={noteInputs} setNoteInputs={setNoteInputs}
                    updateStatus={updateStatus} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

function RequestCard({ req, expanded, setExpanded, expiryInputs, setExpiryInputs, noteInputs, setNoteInputs, updateStatus }: {
  req: RequestRow;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  expiryInputs: Record<string, string>;
  setExpiryInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  noteInputs: Record<string, string>;
  setNoteInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  updateStatus: (req: RequestRow, status: AccessRequest['status'], grant?: boolean) => Promise<void>;
}) {
  const isOpen = expanded === req.id;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(isOpen ? null : req.id)}
        className="w-full text-left px-4 py-4 flex items-center gap-4 hover:bg-zinc-800/30 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-medium text-sm">{req.full_name || req.profile?.full_name || 'Unknown'}</span>
            {statusBadge(req.status)}
            <span className="text-xs text-zinc-600 capitalize">{req.product_slug.replace(/_/g, ' ')}</span>
          </div>
          <div className="text-xs text-zinc-500">{req.email || req.profile?.email}</div>
          <div className="text-xs text-zinc-600 mt-0.5">
            {new Date(req.created_at).toLocaleDateString()}
            {req.telegram_username && <span className="ml-2">@{req.telegram_username}</span>}
            {req.phone && <span className="ml-2">{req.phone}</span>}
          </div>
        </div>
        {isOpen ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
      </button>

      {isOpen && (
        <div className="border-t border-zinc-800 px-3.5 sm:px-4 py-4 bg-zinc-800/20 space-y-3">
          {/* Request details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {[
              { label: 'Full name', value: req.full_name },
              { label: 'Email', value: req.email },
              { label: 'Phone', value: req.phone || '—' },
              { label: 'Telegram', value: req.telegram_username ? `@${req.telegram_username}` : '—' },
              { label: 'Chat ID', value: req.telegram_chat_id || '—' },
              { label: 'Payment method', value: req.payment_method || '—' },
              { label: 'Payment reference', value: req.payment_reference || '—' },
              { label: 'Risk preset', value: req.risk_preset || '—' },
              { label: 'Preferred contact', value: req.contact_preference || '—' },
            ].map(({ label, value }) => value ? (
              <div key={label} className="bg-zinc-800/50 rounded-lg px-2.5 py-1.5">
                <div className="text-zinc-500 mb-0.5 text-[11px]">{label}</div>
                <div className="text-zinc-200 font-mono break-all">{value}</div>
              </div>
            ) : null)}
          </div>
          {req.notes && (
            <div className="bg-zinc-800/50 rounded-lg px-3 py-2 text-xs">
              <div className="text-zinc-500 mb-0.5 text-[11px]">Customer note</div>
              <div className="text-zinc-200 leading-relaxed">{req.notes}</div>
            </div>
          )}

          {req.bot_setup && (
            <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl px-3.5 py-3 text-xs">
              <div className="text-sky-300 font-semibold mb-2 flex items-center gap-1.5">
                <span>Bot Setup Summary</span>
                <span className="text-[10px] bg-sky-500/20 px-1.5 py-0.5 rounded text-sky-200">No Execution</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { label: 'Setup status', value: botSetupStatusLabel(req.bot_setup.setup_status) },
                  { label: 'Bot type', value: req.bot_setup.bot_type.replace(/_/g, ' ') },
                  { label: 'Capital mode', value: req.bot_setup.capital_mode },
                  { label: 'Risk preset', value: req.bot_setup.risk_preset },
                  { label: 'Account size', value: req.bot_setup.account_size?.toString() || '—' },
                  { label: 'Currency', value: req.bot_setup.account_currency || '—' },
                  { label: 'Broker/exchange/platform', value: req.bot_setup.broker_name || req.bot_setup.exchange_name || req.bot_setup.platform || '—' },
                  { label: 'Prop firm', value: req.bot_setup.prop_firm_name || '—' },
                  { label: 'Preferred symbols', value: Array.isArray(req.bot_setup.preferred_symbols) ? req.bot_setup.preferred_symbols.join(', ') || '—' : '—' },
                  { label: 'No-execution acknowledged', value: req.bot_setup.acknowledged_no_execution ? 'Yes' : 'No' },
                ].map(item => (
                  <div key={item.label} className="bg-zinc-900/70 rounded-lg px-2.5 py-1.5">
                    <div className="text-zinc-500 mb-0.5 text-[11px]">{item.label}</div>
                    <div className="text-zinc-200 capitalize font-medium">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {['pending', 'pending_payment', 'pending_admin_approval'].includes(req.status) && (
            <div className="space-y-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Expiry date (optional)</label>
                  <input
                    type="date"
                    value={expiryInputs[req.id] ?? ''}
                    onChange={e => setExpiryInputs(p => ({ ...p, [req.id]: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Admin note</label>
                  <input
                    type="text"
                    value={noteInputs[req.id] ?? ''}
                    onChange={e => setNoteInputs(p => ({ ...p, [req.id]: e.target.value }))}
                    placeholder="Internal note..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  onClick={() => updateStatus(req, 'converted_to_access', true)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 px-3 py-2.5 rounded-xl transition-colors shadow-sm">
                  <CheckCircle size={14} /> Approve & Grant Package
                </button>
                <button
                  onClick={() => updateStatus(req, 'rejected')}
                  className="flex items-center justify-center gap-1.5 text-xs font-semibold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 px-3 py-2.5 rounded-xl transition-colors">
                  <XCircle size={14} /> Reject
                </button>
              </div>
            </div>
          )}

          {req.admin_note && (
            <div className="text-xs text-zinc-500 italic">Admin note: {req.admin_note}</div>
          )}
        </div>
      )}
    </div>
  );
}
