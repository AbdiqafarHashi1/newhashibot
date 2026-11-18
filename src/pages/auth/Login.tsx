import { enterOwnerPreview } from '../../lib/ownerPreview/state';
import { useState, FormEvent } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth, SafeAuthError } from '../../contexts/AuthContext';
import { Zap, KeyRound, Download } from 'lucide-react';

function friendlyError(error: SafeAuthError): string {
  const msg = (error.message ?? '').toLowerCase();
  if (msg.includes('invalid login') || msg.includes('invalid credentials') || error.status === 400) {
    return 'Invalid email or password.';
  }
  if (msg.includes('email not confirmed')) return 'Please confirm your email before signing in.';
  if (msg.includes('too many requests') || error.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (error.status === 0 || msg.includes('fetch') || msg.includes('network')) return 'Network error — please check your connection.';
  return error.message || 'Sign in failed. Please try again.';
}

export default function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [search] = useSearchParams();
  const requestedReturn = search.get('returnTo');
  const stateFrom = (loc.state as { from?: Location })?.from;
  const from = requestedReturn?.startsWith('/') && !requestedReturn.startsWith('//') ? requestedReturn : stateFrom?.pathname ? stateFrom.pathname + (stateFrom.search || '') + (stateFrom.hash || '') : '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [profileWarning, setProfileWarning] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setProfileWarning('');
    setLoading(true);

    const { error, profileError } = await signIn(email, password);
    setLoading(false);

    if (error) {
      setError(friendlyError(error));
      return;
    }

    if (profileError) {
      console.warn('Profile warning on login:', profileError);
    }

    nav(from, { replace: true });
  }

  function handleOwnerPreview() {
    enterOwnerPreview();
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <Zap size={18} className="text-white" />
            </div>
            <span className="font-bold text-lg">HashiBot</span>
          </Link>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h1 className="text-xl font-bold mb-1">Welcome back</h1>
          <p className="text-sm text-zinc-500 mb-6">Sign in to your HashiBot account</p>

          {profileWarning && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm px-3 py-2.5 rounded-lg mb-4">
              {profileWarning}
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2.5 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="••••••••"
              />
            </div>
          <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
          </button>
          </form>

          {/* Admin Pass Button */}
          <div className="mt-6 pt-5 border-t border-zinc-800/80 space-y-2">
            <button
              type="button"
              onClick={handleOwnerPreview}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-mono text-xs transition-colors"
            >
              <KeyRound size={13} />
              <span>Admin Pass — simulated UI</span>
            </button>
            <Link
              to="/app/visual-bridge"
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 font-mono text-[11px] transition-colors"
            >
              <Download size={12} />
              <span>Download MT5 Visual Bridge directly</span>
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-4">
          Don't have an account?{' '}
          <Link to={requestedReturn ? `/register?returnTo=${encodeURIComponent(requestedReturn)}` : '/register'} className="text-zinc-400 hover:text-white transition-colors">Create one</Link>
        </p>
      </div>
    </div>
  );
}
