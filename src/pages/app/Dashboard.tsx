import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Signal, UserAccess, AccessRequest, TelegramLink } from '../../lib/types';
import { StatCard } from '../../components/ui/StatCard';
import { gradeBadge, directionBadge, statusBadge, Badge } from '../../components/ui/Badge';
import { Radio, ArrowRight, Lock, MessageCircle, AlertTriangle, History, CheckCircle, Send } from 'lucide-react';

type RequestFormState = {
  phone: string;
  telegram_username: string;
  telegram_chat_id: string;
  payment_method: string;
  notes: string;
};

export default function Dashboard() {
  const { profile, user } = useAuth();
  const [access, setAccess] = useState<UserAccess | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [tgLink, setTgLink] = useState<TelegramLink | null>(null);
  const [accessRequest, setAccessRequest] = useState<AccessRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [form, setForm] = useState<RequestFormState>({
    phone: '', telegram_username: '', telegram_chat_id: '', payment_method: 'manual', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  async function load() {
    const [accessRes, sigRes, tgRes, reqRes] = await Promise.all([
      supabase.from('user_access').select('*').eq('product_slug', 'signal_mode').maybeSingle(),
      supabase.from('signals').select('*').in('status', ['waiting', 'active']).order('created_at', { ascending: false }).limit(5),
      supabase.from('telegram_links').select('*').maybeSingle(),
      supabase.from('access_requests').select('*').eq('product_slug', 'signal_mode').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setAccess(accessRes.data ?? null);
    setSignals(sigRes.data ?? []);
    setTgLink((tgRes.data as TelegramLink | null));
    setAccessRequest((reqRes.data as AccessRequest | null));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const hasAccess = access?.status === 'active';

  async function submitAccessRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;
    setSubmitting(true);
    setSubmitMsg('');
    const { error } = await supabase.from('access_requests').insert({
      user_id: user.id,
      product_slug: 'signal_mode',
      full_name: profile.full_name,
      email: profile.email,
      phone: form.phone,
      telegram_username: form.telegram_username,
      telegram_chat_id: form.telegram_chat_id,
      payment_method: form.payment_method,
      notes: form.notes,
    });
    if (error) {
      setSubmitMsg(`Error: ${error.message}`);
    } else {
      setSubmitMsg('Request submitted. An admin will review and activate your access.');
      setShowRequestForm(false);
      await load();
    }
    setSubmitting(false);
  }

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Welcome back, {profile?.full_name || profile?.email}</p>
      </div>

      {/* Status cards */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Signal Mode"
          value={hasAccess ? 'Active' : 'No Access'}
          color={hasAccess ? 'green' : 'gray'}
          icon={<Radio size={16} />}
          sub={access?.expires_at ? `Expires ${new Date(access.expires_at).toLocaleDateString()}` : hasAccess ? 'No expiry set' : 'Contact admin for access'}
        />
        <StatCard
          label="Active Signals"
          value={signals.length}
          color="blue"
          icon={<Radio size={16} />}
          sub="Waiting or active setups"
        />
        <StatCard
          label="Telegram"
          value={tgLink ? tgLink.status.charAt(0).toUpperCase() + tgLink.status.slice(1) : 'Not set up'}
          color={tgLink?.status === 'connected' ? 'green' : tgLink?.status === 'pending' ? 'yellow' : 'gray'}
          icon={<MessageCircle size={16} />}
          sub={tgLink?.telegram_username ? `@${tgLink.telegram_username}` : 'Set up Telegram for alerts'}
        />
      </div>

      {/* No access state */}
      {!hasAccess && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <Lock size={24} className="text-zinc-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="font-semibold mb-1">Signal Mode access required</h2>
              <p className="text-sm text-zinc-500 mb-3">
                You do not have active Signal Mode access. Submit a request below and an admin will activate your account.
                Automated payments are coming in a future update.
              </p>

              {accessRequest ? (
                <div className={`rounded-lg border p-3 flex items-start gap-2 ${
                  accessRequest.status === 'pending' ? 'bg-yellow-500/10 border-yellow-500/20'
                  : accessRequest.status === 'approved' || accessRequest.status === 'converted_to_access' ? 'bg-emerald-500/10 border-emerald-500/20'
                  : 'bg-red-500/10 border-red-500/20'
                }`}>
                  {accessRequest.status === 'pending'
                    ? <CheckCircle size={14} className="text-yellow-400 mt-0.5 shrink-0" />
                    : <CheckCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />}
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      Access Request {statusBadge(accessRequest.status)}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Submitted {new Date(accessRequest.created_at).toLocaleDateString()}
                      {accessRequest.admin_note && <span className="ml-2 italic">Admin: {accessRequest.admin_note}</span>}
                    </div>
                    {accessRequest.status === 'rejected' && (
                      <button onClick={() => setShowRequestForm(true)} className="text-xs text-blue-400 hover:text-blue-300 mt-1">
                        Submit a new request
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() => setShowRequestForm(!showRequestForm)}
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    <Send size={14} /> Request Signal Access
                  </button>
                  <Link to="/app/telegram"
                    className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors">
                    <MessageCircle size={14} /> Submit Telegram Details
                  </Link>
                </div>
              )}

              {submitMsg && (
                <div className={`mt-3 text-xs px-3 py-2 rounded-lg border ${
                  submitMsg.startsWith('Error') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                }`}>
                  {submitMsg}
                </div>
              )}

              {/* Access request form */}
              {showRequestForm && !accessRequest && (
                <form onSubmit={submitAccessRequest} className="mt-4 space-y-3 bg-zinc-800/30 rounded-xl p-4 border border-zinc-700/50">
                  <div className="text-sm font-medium mb-2">Signal Mode Access Request</div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Phone (optional)</label>
                      <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="+254 712 345 678"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Telegram Username (optional)</label>
                      <input type="text" value={form.telegram_username} onChange={e => setForm(f => ({ ...f, telegram_username: e.target.value }))}
                        placeholder="@yourusername"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Payment Method</label>
                      <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500">
                        <option value="manual">Manual / Admin approval</option>
                        <option value="mpesa">M-Pesa</option>
                        <option value="card_future">Card (coming soon)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Notes (optional)</label>
                      <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Any info for admin..."
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={submitting}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      {submitting ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send size={14} />}
                      Submit Request
                    </button>
                    <button type="button" onClick={() => setShowRequestForm(false)}
                      className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-100 border border-zinc-700 hover:border-zinc-500 transition-colors">
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active signals (gated) */}
      {hasAccess && (
        <>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Recent Active Signals</h2>
              <Link to="/app/signals" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            </div>

            {signals.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center mb-4">
                <Radio size={24} className="text-zinc-700 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No active signals right now.</p>
                <p className="text-xs text-zinc-600 mt-1">The scanner is watching the markets.</p>
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {signals.map(sig => (
                  <Link key={sig.id} to={`/app/signals/${sig.id}`}
                    className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono font-semibold text-sm">{sig.symbol}</span>
                        <span className="text-xs text-zinc-600">{sig.timeframe}</span>
                        {directionBadge(sig.direction)}
                        {gradeBadge(sig.grade)}
                        {statusBadge(sig.status)}
                        <Badge variant={sig.market_type === 'crypto' ? 'blue' : 'orange'} className="text-xs">
                          {sig.market_type === 'crypto' ? 'REAL DATA' : 'DEMO DATA'}
                        </Badge>
                      </div>
                      <div className="text-xs text-zinc-500">{sig.strategy_name} · {sig.regime}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-zinc-400">{sig.risk_reward}R</div>
                      <div className="text-xs text-zinc-600">{sig.confidence_score}%</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Shortcuts */}
          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            <Link to="/app/history" className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex items-center gap-3 transition-colors group">
              <History size={16} className="text-zinc-500 group-hover:text-blue-400 transition-colors" />
              <div>
                <div className="text-sm font-medium">Signal History</div>
                <div className="text-xs text-zinc-600">Completed &amp; closed signals</div>
              </div>
            </Link>
            <Link to="/app/telegram" className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex items-center gap-3 transition-colors group">
              <MessageCircle size={16} className="text-zinc-500 group-hover:text-blue-400 transition-colors" />
              <div>
                <div className="text-sm font-medium">Telegram Setup</div>
                <div className="text-xs text-zinc-600">{tgLink?.status === 'connected' ? 'Connected' : 'Not connected yet'}</div>
              </div>
            </Link>
            <Link to="/app/account" className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex items-center gap-3 transition-colors group">
              <Radio size={16} className="text-zinc-500 group-hover:text-blue-400 transition-colors" />
              <div>
                <div className="text-sm font-medium">Account &amp; EA</div>
                <div className="text-xs text-zinc-600">Access, EA status, account info</div>
              </div>
            </Link>
          </div>
        </>
      )}

      {/* Risk disclaimer */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle size={14} className="text-zinc-600 mt-0.5 shrink-0" />
        <p className="text-xs text-zinc-600 leading-relaxed">
          Signals are generated by automated rule-based strategies and must be independently validated before live trading.
          Crypto signals use Binance public market data. Forex signals use demo data and are not real market prices.
          Past setups do not guarantee future results. Trade responsibly.
        </p>
      </div>
    </AppLayout>
  );
}
