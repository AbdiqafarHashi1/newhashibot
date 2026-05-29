import { useState, FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getFrontendSupabaseDebugInfo } from '../../lib/supabaseEnv';
import { Zap } from 'lucide-react';

export default function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: Location })?.from?.pathname || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [lastLoginErrorName, setLastLoginErrorName] = useState('none');
  const [lastLoginErrorMessage, setLastLoginErrorMessage] = useState('none');
  const [loading, setLoading] = useState(false);
  const debug = getFrontendSupabaseDebugInfo();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLastLoginErrorName('none');
    setLastLoginErrorMessage('none');
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setLastLoginErrorName(error.name || 'Error');
      setLastLoginErrorMessage(error.message);
      setError(error.message);
    } else {
      nav(from, { replace: true });
    }
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

        <LoginDebugPanel
          selectedSupabaseUrlHost={debug.selectedSupabaseUrlHost}
          selectedSupabaseUrlOrigin={debug.selectedSupabaseUrlOrigin}
          expectedProjectRef={debug.expectedProjectRef}
          actualProjectRef={debug.actualProjectRef}
          projectRefMatches={debug.projectRefMatches}
          selectedKeySource={debug.selectedFrontendKeySource}
          keyPresent={debug.keyPresent}
          keyTypeGuess={debug.keyTypeGuess}
          browserOrigin={debug.browserOrigin}
          lastLoginErrorName={lastLoginErrorName}
          lastLoginErrorMessage={lastLoginErrorMessage}
          envConfigError={debug.frontendEnvError}
        />

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h1 className="text-xl font-bold mb-1">Welcome back</h1>
          <p className="text-sm text-zinc-500 mb-6">Sign in to your HashiBot account</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg mb-4">
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

interface LoginDebugPanelProps {
  selectedSupabaseUrlHost: string | null;
  selectedSupabaseUrlOrigin: string | null;
  expectedProjectRef: string;
  actualProjectRef: string | null;
  projectRefMatches: boolean;
  selectedKeySource: string;
  keyPresent: boolean;
  keyTypeGuess: string;
  browserOrigin: string;
  lastLoginErrorName: string;
  lastLoginErrorMessage: string;
  envConfigError: string | null;
}

function LoginDebugPanel({
  selectedSupabaseUrlHost,
  selectedSupabaseUrlOrigin,
  expectedProjectRef,
  actualProjectRef,
  projectRefMatches,
  selectedKeySource,
  keyPresent,
  keyTypeGuess,
  browserOrigin,
  lastLoginErrorName,
  lastLoginErrorMessage,
  envConfigError,
}: LoginDebugPanelProps) {
  const rows = [
    ['selected Supabase URL host', selectedSupabaseUrlHost ?? 'missing'],
    ['selected Supabase URL origin', selectedSupabaseUrlOrigin ?? 'missing'],
    ['expected project ref', expectedProjectRef],
    ['actual project ref', actualProjectRef ?? 'missing'],
    ['project ref match', String(projectRefMatches)],
    ['selected key source', selectedKeySource],
    ['key present', String(keyPresent)],
    ['key type guess', keyTypeGuess],
    ['current browser origin', browserOrigin],
    ['last login error name/message', `${lastLoginErrorName}: ${lastLoginErrorMessage}`],
    ['env/config error', envConfigError ?? 'none'],
  ];

  return (
    <div className="bg-zinc-900 border border-blue-500/40 rounded-2xl p-4 mb-4 text-xs text-zinc-300">
      <p className="font-mono text-blue-300 mb-3">LOGIN_DEBUG_BUILD_MARKER: login-env-proof-v1</p>
      <div className="space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[1fr_1.2fr] gap-2">
            <span className="text-zinc-500">{label}</span>
            <span className="font-mono text-zinc-200 break-all">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
