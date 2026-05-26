import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Zap, AlertTriangle, CheckCircle, Lock, Terminal } from 'lucide-react';

export default function AdminSetup() {
  const { user, profile, profileError, loading: authLoading, refreshProfile } = useAuth();
  const nav = useNavigate();
  const [noAdmin, setNoAdmin] = useState<boolean | null>(null);
  const [adminCount, setAdminCount] = useState<number | null>(null);
  const [checking, setChecking] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function checkAdmins() {
      // Use the SECURITY DEFINER helper to safely check without recursion
      const { data, error: rpcErr } = await supabase.rpc('no_admin_exists');
      if (rpcErr) {
        // Fallback: direct count query (works pre-claim when no RLS blocks it)
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'admin');
        setAdminCount(count ?? 0);
        setNoAdmin((count ?? 0) === 0);
      } else {
        setNoAdmin(data as boolean);
        if (!data) {
          // Some admin exists — get count for display
          const { count } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('role', 'admin');
          setAdminCount(count ?? 1);
        } else {
          setAdminCount(0);
        }
      }
      setChecking(false);
    }
    checkAdmins();
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-sm text-center space-y-3">
          <Lock size={24} className="text-zinc-600 mx-auto" />
          <p className="text-zinc-300 font-medium">Login required</p>
          <p className="text-sm text-zinc-500">You must be logged in to claim admin.</p>
          <Link to="/login" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  async function claimAdmin() {
    if (!user) return;
    setClaiming(true);
    setError('');
    setMessage('');

    // Re-check via helper — prevents race condition
    const { data: stillNoAdmin, error: rpcErr } = await supabase.rpc('no_admin_exists');
    if (rpcErr || !stillNoAdmin) {
      setError('An admin account already exists or the check failed. This action is locked.');
      setClaiming(false);
      return;
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ role: 'admin', updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateErr) {
      setError(`Failed to claim admin: ${updateErr.message}`);
      setClaiming(false);
      return;
    }

    await supabase.from('audit_logs').insert({
      actor_user_id: user.id,
      action: 'admin_claimed_bootstrap',
      entity_type: 'profiles',
      entity_id: user.id,
      metadata: { note: 'First admin claim via /admin/setup bootstrap page' },
    });

    setAdminCount(1);
    setNoAdmin(false);
    setMessage('Admin role claimed. Refreshing session and redirecting...');
    await refreshProfile();
    setTimeout(() => nav('/admin/control-room'), 1500);
    setClaiming(false);
  }

  const alreadyAdmin = noAdmin === false && adminCount !== null && adminCount > 0;
  const isMeAdmin = profile?.role === 'admin';

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <Zap size={18} className="text-white" />
            </div>
            <span className="font-bold text-lg">HashiBot</span>
          </Link>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 mb-4">
          <h1 className="text-2xl font-bold mb-1 text-center">Claim First Admin</h1>
          <p className="text-sm text-zinc-500 text-center mb-6">Owner bootstrap — development use only</p>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-6 flex gap-3">
            <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />
            <div className="text-sm text-yellow-300/90">
              <strong>Development bootstrap only.</strong> Lock or remove this page before public launch. Once an admin exists, this action cannot be used again.
            </div>
          </div>

          {checking ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-2 mb-6">
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-0.5">Logged in as</div>
                  <div className="text-sm text-zinc-200">{user.email}</div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Current role</div>
                    <div className="text-sm text-zinc-200 capitalize">{profile?.role ?? '(profile not loaded)'}</div>
                  </div>
                  {isMeAdmin && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <CheckCircle size={13} /> Admin
                    </div>
                  )}
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Admin status</div>
                    <div className="text-sm text-zinc-200">
                      {adminCount === 0 ? 'No admins yet — you can claim' : `${adminCount} admin(s) exist`}
                    </div>
                  </div>
                  {alreadyAdmin && <Lock size={14} className="text-zinc-500" />}
                </div>
              </div>

              {profileError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
                  Profile load error: {profileError}
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
                  {error}
                </div>
              )}

              {message && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
                  <CheckCircle size={14} /> {message}
                </div>
              )}

              {isMeAdmin ? (
                <div className="text-center space-y-3">
                  <p className="text-sm text-emerald-400">You are already an admin.</p>
                  <Link to="/admin/control-room"
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
                    Go to Control Room
                  </Link>
                </div>
              ) : alreadyAdmin ? (
                <div className="text-center">
                  <p className="text-sm text-zinc-500">An admin already exists. Bootstrap locked.</p>
                  <p className="text-xs text-zinc-600 mt-1">Contact the existing admin to grant you access.</p>
                </div>
              ) : (
                <button
                  onClick={claimAdmin}
                  disabled={claiming}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white py-2.5 rounded-lg font-medium transition-colors">
                  {claiming ? 'Claiming admin...' : 'Claim First Admin'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Debug panel */}
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3 text-xs text-zinc-500">
            <Terminal size={12} /> Debug info
          </div>
          <div className="space-y-1 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-600">auth.user.id</span>
              <span className="text-zinc-400 truncate ml-4 max-w-[260px]">{user.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">auth.user.email</span>
              <span className="text-zinc-400">{user.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">profile.id</span>
              <span className="text-zinc-400 truncate ml-4 max-w-[260px]">{profile?.id ?? 'null'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">profile.role</span>
              <span className={`${profile?.role === 'admin' ? 'text-emerald-400' : 'text-zinc-400'}`}>{profile?.role ?? 'null'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">no_admin_exists()</span>
              <span className={`${noAdmin ? 'text-yellow-400' : 'text-zinc-400'}`}>{noAdmin === null ? 'checking...' : String(noAdmin)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">profile_error</span>
              <span className="text-red-400">{profileError ?? 'none'}</span>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-4">
          After setup → <Link to="/admin/control-room" className="text-zinc-400 hover:text-white">/admin/control-room</Link>
        </p>
      </div>
    </div>
  );
}
