import { useEffect, useState, FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, SafeAuthError } from '../../contexts/AuthContext';
import { LOGIN_DEBUG_BUILD_MARKER, getFrontendSupabaseDebugInfo } from '../../lib/supabaseEnv';
import { AuthConnectivityProbeResult, getAuthConnectivityProbeTarget, probeSupabaseAuthConnectivity } from '../../lib/supabase';
import { Zap } from 'lucide-react';

interface LastLoginErrorDetails {
  name: string;
  message: string;
  status: string;
  code: string;
  causeMessage: string;
}

const emptyLoginError: LastLoginErrorDetails = {
  name: 'none',
  message: 'none',
  status: 'none',
  code: 'none',
  causeMessage: 'none',
};

function formatSafeAuthError(error: SafeAuthError): string {
  const details = [
    error.message,
    error.status ? `status=${error.status}` : null,
    error.code ? `code=${error.code}` : null,
    error.causeMessage ? `cause=${error.causeMessage}` : null,
  ].filter(Boolean);

  return details.join(' | ');
}

function toLastLoginErrorDetails(error: SafeAuthError): LastLoginErrorDetails {
  return {
    name: error.name || 'Error',
    message: error.message || 'none',
    status: error.status ? String(error.status) : 'none',
    code: error.code ?? 'none',
    causeMessage: error.causeMessage ?? 'none',
  };
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
  const [lastLoginError, setLastLoginError] = useState<LastLoginErrorDetails>(emptyLoginError);
  const [lastUsedSameSelectedClient, setLastUsedSameSelectedClient] = useState('not-attempted');
  const [authProbe, setAuthProbe] = useState<AuthConnectivityProbeResult>(() => ({
    ...getAuthConnectivityProbeTarget(),
    status: null,
    ok: false,
    errorName: 'not-run',
    errorMessage: 'not-run',
    isFetchFailure: false,
  }));
  const [loading, setLoading] = useState(false);
  const debug = getFrontendSupabaseDebugInfo();
  const envConfigError = debug.errorMessage ?? debug.frontendEnvError;
  const envConfigWarning = debug.warningMessage;

  async function runAuthProbe() {
    const result = await probeSupabaseAuthConnectivity();
    setAuthProbe(result);
    return result;
  }

  useEffect(() => {
    void runAuthProbe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setProfileWarning('');
    setLastLoginError(emptyLoginError);
    setLastUsedSameSelectedClient('not-attempted');
    setLoading(true);

    await runAuthProbe();
    const { error, profileError, usedSameSelectedClient } = await signIn(email, password);
    setLastUsedSameSelectedClient(String(Boolean(usedSameSelectedClient)));
    setLoading(false);

    if (error) {
      setLastLoginError(toLastLoginErrorDetails(error));
      setError(formatSafeAuthError(error));
      return;
    }

    if (profileError) {
      setProfileWarning(`Auth succeeded but profile/admin loading failed: ${profileError}`);
      return;
    }

    nav(from, { replace: true });
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="flex justify-center mb-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <Zap size={18} className="text-white" />
            </div>
            <span className="font-bold text-lg">HashiBot</span>
          </Link>
        </div>

        <LoginDebugPanel
          debug={debug}
          authProbe={authProbe}
          lastLoginError={lastLoginError}
          lastUsedSameSelectedClient={lastUsedSameSelectedClient}
          envConfigError={envConfigError}
          envConfigWarning={envConfigWarning}
        />

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm mx-auto">
          <h1 className="text-xl font-bold mb-1">Welcome back</h1>
          <p className="text-sm text-zinc-500 mb-6">Sign in to your HashiBot account</p>

          {(envConfigError || envConfigWarning) && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg mb-4">
              {envConfigError ?? envConfigWarning}
            </div>
          )}

          {profileWarning && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg mb-4">
              {profileWarning}
            </div>
          )}

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
  debug: ReturnType<typeof getFrontendSupabaseDebugInfo>;
  authProbe: AuthConnectivityProbeResult;
  lastLoginError: LastLoginErrorDetails;
  lastUsedSameSelectedClient: string;
  envConfigError: string | null;
  envConfigWarning: string | null;
}

function LoginDebugPanel({
  debug,
  authProbe,
  lastLoginError,
  lastUsedSameSelectedClient,
  envConfigError,
  envConfigWarning,
}: LoginDebugPanelProps) {
  const rows = [
    ['selected Supabase URL source', debug.selectedSupabaseUrlSource],
    ['selected Supabase URL origin', debug.selectedSupabaseUrlOrigin ?? 'missing'],
    ['selected Supabase URL host', debug.selectedSupabaseUrlHost ?? 'missing'],
    ['selected project ref', debug.selectedProjectRef ?? 'missing'],
    ['expected project ref', debug.expectedProjectRef],
    ['project ref match', String(debug.projectRefMatches)],
    ['raw VITE_HASHIBOT_SUPABASE_URL present', String(debug.hashibotSupabaseUrlPresent)],
    ['raw VITE_PUBLIC_SUPABASE_URL present', String(debug.publicSupabaseUrlPresent)],
    ['raw VITE_SUPABASE_URL present', String(debug.viteSupabaseUrlPresent)],
    ['raw VITE_SUPABASE_URL project ref if present', debug.viteSupabaseUrlProjectRef ?? 'missing'],
    ['stale VITE_SUPABASE_URL ignored', String(debug.staleViteSupabaseUrlIgnored)],
    ['selected browser key source', debug.selectedFrontendKeySource],
    ['raw VITE_HASHIBOT_SUPABASE_ANON_KEY present', String(debug.rawHashibotSupabaseAnonKeyPresent)],
    ['raw VITE_SUPABASE_ANON_KEY present', String(debug.rawSupabaseAnonKeyPresent)],
    ['raw VITE_SUPABASE_ANON_KEY decoded ref if present', debug.rawSupabaseAnonKeyDecodedKey.ref ?? 'missing'],
    ['stale VITE_SUPABASE_ANON_KEY ignored', String(debug.staleViteSupabaseAnonKeyIgnored)],
    ['raw VITE_PUBLIC_SUPABASE_ANON_KEY present', String(debug.rawPublicSupabaseAnonKeyPresent)],
    ['raw VITE_SUPABASE_PUBLISHABLE_KEY present', String(debug.rawSupabasePublishableKeyPresent)],
    ['raw VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY present', String(debug.rawPublicSupabasePublishableKeyPresent)],
    ['key present', String(debug.keyPresent)],
    ['key type guess only', debug.keyTypeGuess],
    ['decoded key role if JWT', debug.decodedKey.role ?? 'missing'],
    ['selected key decoded ref', debug.decodedKey.ref ?? 'missing'],
    ['selected key decoded iss if available', debug.decodedKey.iss ?? 'missing'],
    ['decoded key exp if JWT', debug.decodedKey.exp ?? 'missing'],
    ['selected key project match', debug.keyProjectMatch],
    ['current browser origin', debug.browserOrigin],
    ['env/config warning if any', envConfigWarning ?? 'none'],
    ['env/config error if any', envConfigError ?? 'none'],
    ['auth probe URL origin/path', `${authProbe.urlOrigin ?? 'missing'}${authProbe.urlPath}`],
    ['auth probe status', authProbe.status === null ? 'none' : String(authProbe.status)],
    ['auth probe ok', String(authProbe.ok)],
    ['auth probe error name/message', `${authProbe.errorName ?? 'none'}: ${authProbe.errorMessage ?? 'none'}`],
    ['auth probe CORS/fetch failure', String(authProbe.isFetchFailure)],
    ['last login error name/message/status/code', `${lastLoginError.name}: ${lastLoginError.message} status=${lastLoginError.status} code=${lastLoginError.code}`],
    ['last login error cause/message', lastLoginError.causeMessage],
    ['whether signInWithPassword used the same selected Supabase client', lastUsedSameSelectedClient],
  ];

  return (
    <div className="bg-zinc-900 border border-blue-500/40 rounded-2xl p-4 mb-4 text-xs text-zinc-300">
      <p className="font-mono text-blue-300 mb-3">LOGIN_DEBUG_BUILD_MARKER: {LOGIN_DEBUG_BUILD_MARKER}</p>
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
