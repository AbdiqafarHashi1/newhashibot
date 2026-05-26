import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { Profile, UserAccess } from '../../lib/types';
import { statusBadge, Badge } from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { Users, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface TelegramLink {
  id: string;
  user_id: string;
  telegram_username: string;
  telegram_chat_id: string;
  status: string;
}

interface UserRow {
  profile: Profile;
  access: UserAccess[];
  telegram: TelegramLink | null;
}

export default function UsersAccess() {
  const { session } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    const [profRes, accRes, tgRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('user_access').select('*'),
      supabase.from('telegram_links').select('*'),
    ]);
    const profiles: Profile[] = profRes.data ?? [];
    const access: UserAccess[] = accRes.data ?? [];
    const tgLinks: TelegramLink[] = (tgRes.data ?? []) as TelegramLink[];
    setUsers(profiles.map(p => ({
      profile: p,
      access: access.filter(a => a.user_id === p.id),
      telegram: tgLinks.find(t => t.user_id === p.id) ?? null,
    })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function flash(text: string, type: 'ok' | 'err' = 'ok') {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 4000);
  }

  async function logAction(action: string, userId: string, meta: Record<string, unknown> = {}) {
    await supabase.from('audit_logs').insert({
      actor_user_id: session?.user.id ?? null,
      action,
      entity_type: 'user_access',
      entity_id: userId,
      metadata: meta,
    });
  }

  async function grantAccess(userId: string, days: number | null) {
    const expiresAt = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
    const { error } = await supabase.from('user_access').upsert({
      user_id: userId,
      product_slug: 'signal_mode',
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: 'user_id,product_slug' });
    if (error) { flash(`Error: ${error.message}`, 'err'); return; }
    await logAction('grant_signal_access', userId, { days });
    flash(days ? `Signal Mode granted for ${days} days.` : 'Lifetime Signal Mode granted.');
    await load();
  }

  async function revokeAccess(accessId: string, userId: string) {
    const { error } = await supabase.from('user_access').update({ status: 'inactive' }).eq('id', accessId);
    if (error) { flash(`Error: ${error.message}`, 'err'); return; }
    await logAction('revoke_signal_access', userId);
    flash('Signal Mode access revoked.');
    await load();
  }

  async function setRole(userId: string, role: 'user' | 'admin') {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
    if (error) { flash(`Error: ${error.message}`, 'err'); return; }
    await logAction(`set_role_${role}`, userId);
    flash(`Role updated to ${role}.`);
    await load();
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Users / Subscribers</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{users.length} registered account{users.length !== 1 ? 's' : ''}</p>
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
      ) : users.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-sm text-zinc-500">
          <Users size={24} className="text-zinc-700 mx-auto mb-2" />
          No users registered yet.
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(({ profile, access, telegram }) => {
            const signalAccess = access.find(a => a.product_slug === 'signal_mode');
            const hasActive = signalAccess?.status === 'active';
            const isOpen = expanded === profile.id;

            return (
              <div key={profile.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : profile.id)}
                  className="w-full text-left px-4 py-4 flex items-center gap-4 hover:bg-zinc-800/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-medium text-sm">{profile.full_name || 'No name'}</span>
                      <Badge variant={profile.role === 'admin' ? 'orange' : 'gray'}>{profile.role}</Badge>
                      {signalAccess ? statusBadge(signalAccess.status) : <Badge variant="gray">No access</Badge>}
                      {telegram && (
                        <Badge variant={telegram.status === 'connected' ? 'green' : telegram.status === 'pending' ? 'yellow' : 'gray'}>
                          <MessageCircle size={10} className="mr-1" />
                          TG {telegram.status}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500">{profile.email}</div>
                    <div className="text-xs text-zinc-600 mt-0.5">
                      Joined {new Date(profile.created_at).toLocaleDateString()}
                      {signalAccess?.expires_at && ` · Expires ${new Date(signalAccess.expires_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
                </button>

                {isOpen && (
                  <div className="border-t border-zinc-800 px-4 py-4 bg-zinc-800/20">
                    <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Actions</div>
                    <div className="flex flex-wrap gap-2">
                      {!hasActive ? (
                        <>
                          <button onClick={() => grantAccess(profile.id, 30)}
                            className="text-xs px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg transition-colors">
                            Grant 30 Days
                          </button>
                          <button onClick={() => grantAccess(profile.id, null)}
                            className="text-xs px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg transition-colors">
                            Grant Lifetime (Dev)
                          </button>
                        </>
                      ) : (
                        <button onClick={() => revokeAccess(signalAccess!.id, profile.id)}
                          className="text-xs px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-colors">
                          Revoke Signal Access
                        </button>
                      )}
                      {profile.role === 'user' ? (
                        <button onClick={() => setRole(profile.id, 'admin')}
                          className="text-xs px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-lg transition-colors">
                          Make Admin
                        </button>
                      ) : (
                        <button onClick={() => setRole(profile.id, 'user')}
                          className="text-xs px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-400 border border-zinc-600 rounded-lg transition-colors">
                          Remove Admin
                        </button>
                      )}
                    </div>

                    {/* Telegram info */}
                    {telegram && (
                      <div className="mt-3 pt-3 border-t border-zinc-700/50">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Telegram Connection</div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-zinc-400">Username: <span className="text-zinc-200">{telegram.telegram_username || '—'}</span></span>
                          <span className="text-zinc-400">Chat ID: <span className="text-zinc-200">{telegram.telegram_chat_id || '—'}</span></span>
                          <Badge variant={telegram.status === 'connected' ? 'green' : telegram.status === 'pending' ? 'yellow' : 'gray'}>
                            {telegram.status}
                          </Badge>
                        </div>
                      </div>
                    )}

                    {/* Access details */}
                    {access.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-zinc-700/50">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Access Records</div>
                        <div className="space-y-1">
                          {access.map(a => (
                            <div key={a.id} className="flex items-center gap-3 text-xs">
                              <span className="text-zinc-400 capitalize">{a.product_slug.replace(/_/g, ' ')}</span>
                              {statusBadge(a.status)}
                              {a.started_at && <span className="text-zinc-600">Started {new Date(a.started_at).toLocaleDateString()}</span>}
                              {a.expires_at && <span className="text-zinc-600">Expires {new Date(a.expires_at).toLocaleDateString()}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
