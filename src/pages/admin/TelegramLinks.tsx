import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { statusBadge } from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { MessageCircle, CheckCircle, XCircle } from 'lucide-react';

interface CustomerAccessSummary {
  package_name: string;
  access_status: string;
  payment_status: string;
  expires_at: string | null;
}

interface TelegramLinkRow {
  id: string;
  user_id: string;
  telegram_username: string;
  telegram_chat_id: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
  profile?: { email: string; full_name: string };
  subscription?: CustomerAccessSummary | null;
}

export default function TelegramLinks() {
  const { session } = useAuth();
  const [links, setLinks] = useState<TelegramLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});

  async function load() {
    const [{ data: linkData }, { data: subData }] = await Promise.all([
      supabase.from('telegram_links').select('*, profile:profiles(email, full_name)').order('created_at', { ascending: false }),
      supabase.from('customer_subscriptions').select('user_id, package_name, access_status, payment_status, expires_at'),
    ]);
    const subsByUser = new Map((subData ?? []).map(s => [s.user_id, s]));
    setLinks(((linkData ?? []) as TelegramLinkRow[]).map(link => ({ ...link, subscription: subsByUser.get(link.user_id) ?? null })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function setStatus(id: string, userId: string, status: 'connected' | 'revoked') {
    const note = noteInputs[id] ?? '';
    const { error } = await supabase.from('telegram_links').update({
      status,
      notes: note,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { setMsg(`Error: ${error.message}`); return; }
    await supabase.from('audit_logs').insert({
      actor_user_id: session?.user.id ?? null,
      action: `telegram_link_${status}`,
      entity_type: 'telegram_links',
      entity_id: userId,
      metadata: { notes: note },
    });
    setMsg(`Link ${status}.`);
    setTimeout(() => setMsg(''), 3000);
    await load();
  }

  const pending = links.filter(l => l.status === 'pending');
  const others = links.filter(l => l.status !== 'pending');

  return (
    <AdminLayout>
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Telegram Network & Member Links</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Manage customer subscriptions, VIP channel access approvals, and upgrade inquiries.</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://t.me/Abdihashi1"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-medium transition-colors"
            >
              <MessageCircle size={14} />
              Open @Abdihashi1 Admin DM
            </a>
          </div>
        </div>
      </div>

      {/* Network Channel Topology Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Admin Ops Channel</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">Private Ops</span>
          </div>
          <p className="text-xs text-zinc-400 mb-2">Backend health, system warnings, risk lock alerts, orphan orders, recovery events, and execution truth.</p>
          <div className="text-[11px] font-mono text-zinc-500">Env: TELEGRAM_ADMIN_CHAT_ID</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">VIP Signal Room</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Unified VIP</span>
          </div>
          <p className="text-xs text-zinc-400 mb-2">Real-time Crypto & Forex/Metals signals, exact entries/SL/TP1-3, and live trade management (BE locks & trails).</p>
          <div className="text-[11px] font-mono text-zinc-500">Env: TELEGRAM_CHAT_ID</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Free Discovery Channel</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Public Funnel</span>
          </div>
          <p className="text-xs text-zinc-400 mb-2">Daily macro briefs, 1-2 curated teaser setups, verified win proofs, and conversion CTAs to hashibot.trade/vip or @Abdihashi1.</p>
          <div className="text-[11px] font-mono text-zinc-500">Env: TELEGRAM_FREE_CHAT_ID</div>
        </div>
      </div>

      {msg && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm border bg-blue-500/10 border-blue-500/20 text-blue-300">{msg}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pending section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle size={14} className="text-yellow-400" />
              <span className="text-sm font-semibold">Pending Requests</span>
              {pending.length > 0 && (
                <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">
                  {pending.length}
                </span>
              )}
            </div>
            {pending.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-sm text-zinc-500">
                No pending requests.
              </div>
            ) : (
              <div className="space-y-2">
                {pending.map(link => (
                  <LinkCard key={link.id} link={link} noteInputs={noteInputs} setNoteInputs={setNoteInputs} setStatus={setStatus} />
                ))}
              </div>
            )}
          </div>

          {/* All others */}
          {others.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-3 text-zinc-400">All Other Links</div>
              <div className="space-y-2">
                {others.map(link => (
                  <LinkCard key={link.id} link={link} noteInputs={noteInputs} setNoteInputs={setNoteInputs} setStatus={setStatus} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

function LinkCard({ link, noteInputs, setNoteInputs, setStatus }: {
  link: TelegramLinkRow;
  noteInputs: Record<string, string>;
  setNoteInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setStatus: (id: string, userId: string, status: 'connected' | 'revoked') => Promise<void>;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">{link.profile?.full_name || link.profile?.email || link.user_id.slice(0, 8)}</span>
            {statusBadge(link.status)}
          </div>
          <div className="text-xs text-zinc-500">{link.profile?.email}</div>
          <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
            <div className="text-zinc-500">
              Username: <span className="text-zinc-300">{link.telegram_username || '—'}</span>
            </div>
            <div className="text-zinc-500">
              Chat ID / Link: <span className="text-zinc-300 font-mono">{link.telegram_chat_id || '—'}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
            <div className="text-zinc-500">
              Package: <span className="text-zinc-300">{link.subscription?.package_name || '—'}</span>
            </div>
            <div className="text-zinc-500">
              Access: <span className="text-zinc-300">{link.subscription ? `${link.subscription.access_status} / ${link.subscription.payment_status}` : '—'}</span>
            </div>
          </div>
          <div className="text-xs text-zinc-600 mt-1">
            Submitted {new Date(link.created_at).toLocaleDateString()}
            {link.notes && <span className="ml-2 text-zinc-500 italic">Note: {link.notes}</span>}
          </div>
        </div>

        {link.status !== 'revoked' && (
          <div className="flex flex-col gap-2 shrink-0">
            <input
              type="text"
              placeholder="Admin note (optional)"
              value={noteInputs[link.id] ?? ''}
              onChange={e => setNoteInputs(n => ({ ...n, [link.id]: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 w-48"
            />
            <div className="flex gap-2">
              {link.status !== 'connected' && (
                <button
                  onClick={() => setStatus(link.id, link.user_id, 'connected')}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors">
                  <CheckCircle size={12} /> Mark handled
                </button>
              )}
              <button
                onClick={() => setStatus(link.id, link.user_id, 'revoked')}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg transition-colors">
                <XCircle size={12} /> Revoke
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
