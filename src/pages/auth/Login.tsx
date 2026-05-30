import { useState, FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, SafeAuthError } from '../../contexts/AuthContext';
import { Zap } from 'lucide-react';

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
  const from = (loc.state as { from?: Location })?.from?.pathname || '/dashboard';

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
      setProfileWarning('Signed in, but your profile could not be loaded. Try refreshing.');
      return;
    }

    nav(from, { replace: true });
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
        </div>

        <p className="text-center text-xs text-zinc-600 mt-4">
          Don't have an account?{' '}
          <Link to="/register" className="text-zinc-400 hover:text-white transition-colors">Create one</Link>
        </p>
      </div>
    </div>
  );
}
