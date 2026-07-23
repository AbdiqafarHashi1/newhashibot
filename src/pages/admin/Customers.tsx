import { useEffect, useState, useCallback, Fragment } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { CustomerSubscription, Package, PaymentStatus, AccessStatus, TelegramStatus } from '../../lib/types';
import { Users, Plus, Search, RefreshCw, ChevronDown, ChevronUp, CreditCard as Edit3, Check, X, MessageCircle, CreditCard, Clock, UserCheck, UserX, Copy, CalendarPlus } from 'lucide-react';

// ─── Status badge helpers ─────────────────────────────────────────────────────

function paymentBadge(s: PaymentStatus) {
  const map: Record<PaymentStatus, string> = {
    paid: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    failed: 'bg-red-500/15 text-red-400 border-red-500/25',
    expired: 'bg-zinc-500/15 text-zinc-500 border-zinc-600/25',
    cancelled: 'bg-red-500/15 text-red-400 border-red-500/25',
  };
  return <span className={`inline-block text-xs px-1.5 py-0.5 rounded border font-medium capitalize ${map[s] ?? ''}`}>{s}</span>;
}

function accessBadge(s: AccessStatus) {
  const map: Record<AccessStatus, string> = {
    active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    inactive: 'bg-zinc-500/15 text-zinc-500 border-zinc-600/25',
    expired: 'bg-red-500/15 text-red-400 border-red-500/25',
  };
  return <span className={`inline-block text-xs px-1.5 py-0.5 rounded border font-medium capitalize ${map[s] ?? ''}`}>{s}</span>;
}

function telegramBadge(s: TelegramStatus) {
  const map: Record<TelegramStatus, string> = {
    not_invited: 'bg-zinc-500/15 text-zinc-500 border-zinc-600/25',
    invited: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
    joined: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    removed: 'bg-red-500/15 text-red-400 border-red-500/25',
  };
  const labels: Record<TelegramStatus, string> = { not_invited: 'Not Invited', invited: 'Invited', joined: 'Joined', removed: 'Removed' };
  return <span className={`inline-block text-xs px-1.5 py-0.5 rounded border font-medium ${map[s] ?? ''}`}>{labels[s]}</span>;
}

// ─── Edit row component ───────────────────────────────────────────────────────

interface EditRowProps {
  sub: CustomerSubscription;
  packages: Package[];
  onSave: (id: string, patch: Partial<CustomerSubscription>) => Promise<void>;
  onClose: () => void;
}

function EditRow({ sub, packages, onSave, onClose }: EditRowProps) {
  const [draft, setDraft] = useState<Partial<CustomerSubscription>>({
    package_id: sub.package_id ?? '',
    package_name: sub.package_name,
    payment_status: sub.payment_status,
    access_status: sub.access_status,
    amount_paid: sub.amount_paid ?? undefined,
    payment_reference: sub.payment_reference,
    payment_method: sub.payment_method,
    starts_at: sub.starts_at ? sub.starts_at.slice(0, 16) : '',
    expires_at: sub.expires_at ? sub.expires_at.slice(0, 16) : '',
    telegram_status: sub.telegram_status,
    telegram_username: sub.telegram_username,
    notes: sub.notes,
    admin_note: sub.admin_note,
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof CustomerSubscription>(k: K, v: CustomerSubscription[K]) {
    setDraft(p => ({ ...p, [k]: v }));
  }

  function onPackageChange(pkgId: string) {
    const pkg = packages.find(p => p.id === pkgId);
    setDraft(p => ({ ...p, package_id: pkgId, package_name: pkg?.name ?? '' }));
  }

  async function save() {
    setSaving(true);
    const patch: Partial<CustomerSubscription> = {
      ...draft,
      starts_at: draft.starts_at ? new Date(draft.starts_at as string).toISOString() : null,
      expires_at: draft.expires_at ? new Date(draft.expires_at as string).toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    await onSave(sub.id, patch);
    setSaving(false);
    onClose();
  }

  const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500";
  const selectCls = "w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500";
  const labelCls = "block text-xs text-zinc-500 mb-1";

  return (
    <tr className="bg-zinc-800/60 border-b border-zinc-700">
      <td colSpan={9} className="px-5 py-4">
        <div className="text-xs font-medium text-zinc-300 mb-3">Editing: {sub.email}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
          <div>
            <label className={labelCls}>Package</label>
            <select value={draft.package_id ?? ''} onChange={e => onPackageChange(e.target.value)} className={selectCls}>
              <option value="">— none —</option>
              {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Payment Status</label>
            <select value={draft.payment_status} onChange={e => set('payment_status', e.target.value as PaymentStatus)} className={selectCls}>
              {(['pending', 'paid', 'failed', 'expired', 'cancelled'] as PaymentStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Access Status</label>
            <select value={draft.access_status} onChange={e => set('access_status', e.target.value as AccessStatus)} className={selectCls}>
              {(['active', 'inactive', 'expired'] as AccessStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Telegram Status</label>
            <select value={draft.telegram_status} onChange={e => set('telegram_status', e.target.value as TelegramStatus)} className={selectCls}>
              {(['not_invited', 'invited', 'joined', 'removed'] as TelegramStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Starts At</label>
            <input type="datetime-local" value={(draft.starts_at as string) ?? ''} onChange={e => set('starts_at', e.target.value as unknown as string)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Expires At</label>
            <input type="datetime-local" value={(draft.expires_at as string) ?? ''} onChange={e => set('expires_at', e.target.value as unknown as string)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Amount Paid</label>
            <input type="number" step="0.01" value={draft.amount_paid ?? ''} onChange={e => set('amount_paid', parseFloat(e.target.value) as unknown as null)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Payment Reference</label>
            <input type="text" value={draft.payment_reference as string} onChange={e => set('payment_reference', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Payment Method</label>
            <select value={draft.payment_method as string} onChange={e => set('payment_method', e.target.value)} className={selectCls}>
              {['manual', 'mpesa', 'card', 'bank_transfer', 'crypto_payment'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Telegram Username</label>
            <input type="text" value={draft.telegram_username as string} onChange={e => set('telegram_username', e.target.value)} placeholder="@username" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Admin Note</label>
            <input type="text" value={draft.admin_note as string} onChange={e => set('admin_note', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <input type="text" value={draft.notes as string} onChange={e => set('notes', e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors">
            {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />} Save
          </button>
          <button onClick={onClose} className="flex items-center gap-1.5 border border-zinc-700 text-zinc-400 hover:text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
            <X size={11} /> Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── New customer form ────────────────────────────────────────────────────────

interface NewCustomerFormProps {
  packages: Package[];
  onSaved: () => void;
  onClose: () => void;
}

function NewCustomerForm({ packages, onSaved, onClose }: NewCustomerFormProps) {
  const [form, setForm] = useState({
    email: '', full_name: '', package_id: '', payment_status: 'pending' as PaymentStatus,
    access_status: 'inactive' as AccessStatus, payment_method: 'manual',
    starts_at: '', expires_at: '', telegram_username: '', notes: '', admin_note: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!form.email.trim()) { setErr('Email is required'); return; }
    setSaving(true); setErr('');
    const pkg = packages.find(p => p.id === form.package_id);
    const { error } = await supabase.from('customer_subscriptions').insert({
      email: form.email.trim(),
      full_name: form.full_name.trim(),
      package_id: form.package_id || null,
      package_name: pkg?.name ?? '',
      payment_status: form.payment_status,
      access_status: form.access_status,
      payment_method: form.payment_method,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      telegram_username: form.telegram_username.trim(),
      notes: form.notes.trim(),
      admin_note: form.admin_note.trim(),
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500";
  const selectCls = "w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500";
  const labelCls = "block text-xs text-zinc-400 mb-1";

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 mb-5">
      <div className="text-sm font-semibold mb-4 flex items-center justify-between">
        <span>New Customer</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={14} /></button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div>
          <label className={labelCls}>Email *</label>
          <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="customer@email.com" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Full Name</label>
          <input type="text" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Name" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Package</label>
          <select value={form.package_id} onChange={e => setForm(p => ({ ...p, package_id: e.target.value }))} className={selectCls}>
            <option value="">— select package —</option>
            {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Payment Status</label>
          <select value={form.payment_status} onChange={e => setForm(p => ({ ...p, payment_status: e.target.value as PaymentStatus }))} className={selectCls}>
            {(['pending', 'paid', 'failed', 'expired', 'cancelled'] as PaymentStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Access Status</label>
          <select value={form.access_status} onChange={e => setForm(p => ({ ...p, access_status: e.target.value as AccessStatus }))} className={selectCls}>
            {(['active', 'inactive', 'expired'] as AccessStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Payment Method</label>
          <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))} className={selectCls}>
            {['manual', 'mpesa', 'card', 'bank_transfer', 'crypto_payment'].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Starts At</label>
          <input type="datetime-local" value={form.starts_at} onChange={e => setForm(p => ({ ...p, starts_at: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Expires At</label>
          <input type="datetime-local" value={form.expires_at} onChange={e => setForm(p => ({ ...p, expires_at: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Telegram Username</label>
          <input type="text" value={form.telegram_username} onChange={e => setForm(p => ({ ...p, telegram_username: e.target.value }))} placeholder="@username" className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Admin Note</label>
          <input type="text" value={form.admin_note} onChange={e => setForm(p => ({ ...p, admin_note: e.target.value }))} placeholder="Internal note" className={inputCls} />
        </div>
      </div>
      {err && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">{err}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors">
          {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />} Save Customer
        </button>
        <button onClick={onClose} className="border border-zinc-700 text-zinc-400 hover:text-white text-sm px-4 py-2 rounded-lg transition-colors">Cancel</button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Customers() {
  const [subs, setSubs] = useState<CustomerSubscription[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAccess, setFilterAccess] = useState<AccessStatus | 'all'>('all');
  const [filterPayment, setFilterPayment] = useState<PaymentStatus | 'all'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [subRes, pkgRes] = await Promise.all([
      supabase.from('customer_subscriptions').select('*').order('created_at', { ascending: false }),
      supabase.from('packages').select('*').order('sort_order'),
    ]);
    setSubs((subRes.data ?? []) as CustomerSubscription[]);
    setPackages((pkgRes.data ?? []) as Package[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(id: string, patch: Partial<CustomerSubscription>) {
    const { error } = await supabase.from('customer_subscriptions').update(patch).eq('id', id);
    if (!error) await load();
  }

  const filtered = subs.filter(s => {
    const q = search.toLowerCase();
    const matchesSearch = !q || s.email.toLowerCase().includes(q) || s.full_name.toLowerCase().includes(q) || s.package_name.toLowerCase().includes(q) || s.telegram_username.toLowerCase().includes(q);
    const matchesAccess = filterAccess === 'all' || s.access_status === filterAccess;
    const matchesPayment = filterPayment === 'all' || s.payment_status === filterPayment;
    return matchesSearch && matchesAccess && matchesPayment;
  });


  function copyText(value: string) {
    if (!value) return;
    void navigator.clipboard?.writeText(value);
  }

  function extendBy30Days(s: CustomerSubscription) {
    const base = s.expires_at && new Date(s.expires_at).getTime() > Date.now() ? new Date(s.expires_at) : new Date();
    base.setDate(base.getDate() + 30);
    return handleSave(s.id, { expires_at: base.toISOString(), access_status: 'active', payment_status: 'paid', updated_at: new Date().toISOString() });
  }

  const stats = {
    total: subs.length,
    active: subs.filter(s => s.access_status === 'active').length,
    paid: subs.filter(s => s.payment_status === 'paid').length,
    pending: subs.filter(s => s.payment_status === 'pending').length,
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users size={22} className="text-zinc-500" /> Customer Management
        </h1>
        <p className="text-sm text-zinc-500 mt-0.5">Manage subscriptions, payments, access, and Telegram invites</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Customers', value: stats.total, color: 'text-zinc-100' },
          { label: 'Active Access', value: stats.active, color: 'text-emerald-400' },
          { label: 'Paid', value: stats.paid, color: 'text-sky-400' },
          { label: 'Pending Payment', value: stats.pending, color: 'text-yellow-400' },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
            <div className="text-xs text-zinc-500 mb-1">{s.label}</div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Search email, name, package…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500" />
        </div>
        <select value={filterAccess} onChange={e => setFilterAccess(e.target.value as AccessStatus | 'all')}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400 focus:outline-none focus:border-sky-500">
          <option value="all">All Access</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="expired">Expired</option>
        </select>
        <select value={filterPayment} onChange={e => setFilterPayment(e.target.value as PaymentStatus | 'all')}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400 focus:outline-none focus:border-sky-500">
          <option value="all">All Payments</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button onClick={load} className="flex items-center gap-1.5 border border-zinc-700 text-zinc-400 hover:text-white px-3 py-2 rounded-lg text-sm transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <button onClick={() => { setShowNew(true); setEditingId(null); }}
          className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={13} /> Add Customer
        </button>
      </div>

      {/* New customer form */}
      {showNew && (
        <NewCustomerForm packages={packages} onSaved={() => { setShowNew(false); load(); }} onClose={() => setShowNew(false)} />
      )}

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={22} className="animate-spin text-zinc-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-600 text-sm">
            {subs.length === 0 ? 'No customers yet — add the first one above.' : 'No customers match the current filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Access</th>
                  <th className="px-4 py-3">Telegram</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Created / Last login</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <Fragment key={s.id}>
                    <tr className="border-b border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-200">{s.full_name || <span className="text-zinc-600 italic">—</span>}</div>
                        <div className="text-zinc-500 mt-0.5">{s.email}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{s.package_name || <span className="text-zinc-600">—</span>}</td>
                      <td className="px-4 py-3">{paymentBadge(s.payment_status)}</td>
                      <td className="px-4 py-3">{accessBadge(s.access_status)}</td>
                      <td className="px-4 py-3">{telegramBadge(s.telegram_status)}</td>
                      <td className="px-4 py-3 text-zinc-500">
                        {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : <span className="text-zinc-700">—</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-600"><div>{new Date(s.created_at).toLocaleDateString()}</div><div className="text-zinc-700">Last login unavailable</div></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 transition-colors" title="View details">
                            {expandedId === s.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                          <button onClick={() => setEditingId(editingId === s.id ? null : s.id)}
                            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-sky-400 transition-colors" title="Edit">
                            <Edit3 size={13} />
                          </button>
                          <button
                            onClick={() => handleSave(s.id, { access_status: 'active', payment_status: 'paid', updated_at: new Date().toISOString() })}
                            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-emerald-400 transition-colors" title="Grant access">
                            <UserCheck size={13} />
                          </button>
                          <button
                            onClick={() => extendBy30Days(s)}
                            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-sky-400 transition-colors" title="Extend by 30 days">
                            <CalendarPlus size={13} />
                          </button>
                          <button
                            onClick={() => handleSave(s.id, { access_status: 'expired', payment_status: 'expired', expires_at: new Date().toISOString(), updated_at: new Date().toISOString() })}
                            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors" title="Expire access">
                            <UserX size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {expandedId === s.id && (
                      <tr key={`${s.id}-detail`} className="bg-zinc-800/30 border-b border-zinc-800">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs mb-3">
                            <div>
                              <div className="text-zinc-600 mb-0.5">Telegram Username</div>
                              <div className="text-zinc-300 flex items-center gap-1.5">{s.telegram_username || '—'}{s.telegram_username && <button onClick={() => copyText(s.telegram_username)} className="text-zinc-600 hover:text-zinc-300" title="Copy Telegram"><Copy size={10} /></button>}</div>
                            </div>
                            <div>
                              <div className="text-zinc-600 mb-0.5">Amount Paid</div>
                              <div className="text-zinc-300">{s.amount_paid != null ? `${s.currency} ${s.amount_paid}` : '—'}</div>
                            </div>
                            <div>
                              <div className="text-zinc-600 mb-0.5">Payment Method</div>
                              <div className="text-zinc-300 capitalize">{s.payment_method || '—'}</div>
                            </div>
                            <div>
                              <div className="text-zinc-600 mb-0.5">Payment Ref</div>
                              <div className="text-zinc-300 font-mono">{s.payment_reference || '—'}</div>
                            </div>
                            <div>
                              <div className="text-zinc-600 mb-0.5">Starts At</div>
                              <div className="text-zinc-300">{s.starts_at ? new Date(s.starts_at).toLocaleString() : '—'}</div>
                            </div>
                            <div>
                              <div className="text-zinc-600 mb-0.5">Expires At</div>
                              <div className="text-zinc-300">{s.expires_at ? new Date(s.expires_at).toLocaleString() : '—'}</div>
                            </div>
                            <div>
                              <div className="text-zinc-600 mb-0.5">Notes</div>
                              <div className="text-zinc-300">{s.notes || '—'}</div>
                            </div>
                            <div>
                              <div className="text-zinc-600 mb-0.5">Admin Note</div>
                              <div className="text-zinc-300">{s.admin_note || '—'}</div>
                            </div>
                          </div>

                          {/* Telegram invite workflow */}
                          <div className="bg-sky-500/5 border border-sky-500/15 rounded-lg px-4 py-3">
                            <div className="flex items-center gap-2 mb-2">
                              <MessageCircle size={12} className="text-sky-400" />
                              <span className="text-xs font-medium text-sky-300">Telegram Access Workflow</span>
                            </div>
                            <div className="text-xs text-zinc-500 space-y-1">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${s.payment_status === 'paid' ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                                <span>1. Customer pays &rarr; admin marks Payment Status = paid</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${s.access_status === 'active' ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                                <span>2. Admin grants access (Access Status = active)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${['invited', 'joined'].includes(s.telegram_status) ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                                <span>3. Admin sends Telegram invite link manually &rarr; set Telegram Status = invited</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${s.telegram_status === 'joined' ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                                <span>4. Customer joins group/channel &rarr; set Telegram Status = joined</span>
                              </div>
                            </div>
                            <div className="flex gap-2 mt-3">
                              {s.telegram_status === 'not_invited' && s.access_status === 'active' && (
                                <button onClick={() => handleSave(s.id, { telegram_status: 'invited', updated_at: new Date().toISOString() })}
                                  className="flex items-center gap-1 bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/25 text-sky-300 text-xs px-2.5 py-1.5 rounded-lg transition-colors">
                                  <MessageCircle size={11} /> Mark Invited
                                </button>
                              )}
                              {s.telegram_status === 'invited' && (
                                <button onClick={() => handleSave(s.id, { telegram_status: 'joined', updated_at: new Date().toISOString() })}
                                  className="flex items-center gap-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/25 text-emerald-300 text-xs px-2.5 py-1.5 rounded-lg transition-colors">
                                  <Check size={11} /> Mark Joined
                                </button>
                              )}
                              {s.telegram_status === 'joined' && (
                                <button onClick={() => handleSave(s.id, { telegram_status: 'removed', updated_at: new Date().toISOString() })}
                                  className="flex items-center gap-1 bg-red-600/15 hover:bg-red-600/25 border border-red-500/20 text-red-400 text-xs px-2.5 py-1.5 rounded-lg transition-colors">
                                  <X size={11} /> Remove from Telegram
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Edit row */}
                    {editingId === s.id && (
                      <EditRow key={`${s.id}-edit`} sub={s} packages={packages} onSave={handleSave} onClose={() => setEditingId(null)} />
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Packages reference */}
      <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
          <CreditCard size={13} className="text-zinc-500" /> Available Packages
        </div>
        <div className="divide-y divide-zinc-800">
          {packages.map(p => (
            <div key={p.id} className="flex items-center justify-between px-5 py-3 gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-200">{p.name}</span>
                  {!p.active && <span className="text-xs bg-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">Inactive</span>}
                  {p.telegram_access_required && <span className="text-xs bg-sky-500/15 text-sky-400 border border-sky-500/25 px-1.5 py-0.5 rounded">Telegram</span>}
                </div>
                <div className="text-xs text-zinc-600 mt-0.5">{p.description}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-zinc-100">{p.price > 0 ? `${p.currency} ${p.price}` : 'Free'}</div>
                <div className="text-xs text-zinc-600">{p.duration_days ? `${p.duration_days}d` : 'Lifetime'}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 text-xs text-zinc-500">
                <Clock size={11} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
