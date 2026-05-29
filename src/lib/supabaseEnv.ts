export const LOGIN_DEBUG_BUILD_MARKER = 'login-env-proof-v1';
export const EXPECTED_SUPABASE_PROJECT_REF = 'uqiwbzfcntlcyyeewafc';
export const EXPECTED_SUPABASE_ORIGIN = `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;

export type FrontendSupabaseEnvSource =
  | 'VITE_SUPABASE_URL'
  | 'missing';

export type FrontendSupabaseKeySource =
  | 'VITE_SUPABASE_ANON_KEY'
  | 'VITE_SUPABASE_PUBLISHABLE_KEY'
  | 'missing';

export type FrontendSupabaseKeyTypeGuess = 'jwt_anon' | 'publishable' | 'unknown';

export interface FrontendSupabaseDebugInfo {
  marker: typeof LOGIN_DEBUG_BUILD_MARKER;
  selectedFrontendEnvSource: FrontendSupabaseEnvSource;
  selectedFrontendKeySource: FrontendSupabaseKeySource;
  selectedSupabaseUrlHost: string | null;
  selectedSupabaseUrlOrigin: string | null;
  frontendSupabaseUrlHost: string | null;
  managedSupabaseFallbackIgnored: boolean;
  expectedProjectRef: string;
  expectedSupabaseOrigin: string;
  actualProjectRef: string | null;
  projectRefMatches: boolean;
  keyPresent: boolean;
  keyTypeGuess: FrontendSupabaseKeyTypeGuess;
  browserOrigin: string;
  frontendEnvError: string | null;
}

export interface FrontendSupabaseConfig extends FrontendSupabaseDebugInfo {
  supabaseUrl: string;
  supabaseKey: string;
  hasValidConfig: boolean;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getBrowserOrigin(): string {
  return typeof window === 'undefined' ? 'server-render-or-build' : window.location.origin;
}

function getBase64UrlJsonPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split('.');
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    if (typeof atob !== 'function') return null;
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function guessKeyType(key: string): FrontendSupabaseKeyTypeGuess {
  if (!key) return 'unknown';
  if (key.startsWith('sb_publishable_')) return 'publishable';

  const payload = getBase64UrlJsonPayload(key);
  if (payload?.role === 'anon') return 'jwt_anon';

  return 'unknown';
}

function parseSupabaseUrl(url: string | null): {
  host: string | null;
  origin: string | null;
  projectRef: string | null;
  error: string | null;
} {
  if (!url) {
    return {
      host: null,
      origin: null,
      projectRef: null,
      error: 'Missing VITE_SUPABASE_URL',
    };
  }

  try {
    const parsed = new URL(url);
    const projectRef = parsed.hostname.endsWith('.supabase.co')
      ? parsed.hostname.slice(0, -'.supabase.co'.length)
      : parsed.hostname.split('.')[0] || null;
    const projectRefMatches = projectRef === EXPECTED_SUPABASE_PROJECT_REF;

    return {
      host: parsed.host,
      origin: parsed.origin,
      projectRef,
      error: projectRefMatches
        ? null
        : `Frontend Supabase project mismatch: expected ${EXPECTED_SUPABASE_PROJECT_REF}, got ${projectRef ?? 'unknown'}`,
    };
  } catch {
    return {
      host: null,
      origin: null,
      projectRef: null,
      error: 'Invalid Supabase URL',
    };
  }
}

export function getFrontendSupabaseConfig(): FrontendSupabaseConfig {
  // Browser/Vite code intentionally reads only VITE_* variables. The legacy anon JWT
  // is preferred for browser auth; the publishable key is used only if the anon key is absent.
  const viteSupabaseUrl = nonEmpty(import.meta.env.VITE_SUPABASE_URL);
  const anonKey = nonEmpty(import.meta.env.VITE_SUPABASE_ANON_KEY);
  const publishableKey = nonEmpty(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

  const selectedKeySource: FrontendSupabaseKeySource = anonKey
    ? 'VITE_SUPABASE_ANON_KEY'
    : publishableKey
      ? 'VITE_SUPABASE_PUBLISHABLE_KEY'
      : 'missing';
  const supabaseKey = anonKey ?? publishableKey ?? '';
  const parsed = parseSupabaseUrl(viteSupabaseUrl);
  const keyError = supabaseKey
    ? null
    : 'Missing VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY';
  const frontendEnvError = parsed.error ?? keyError;
  const actualProjectRef = parsed.projectRef;
  const projectRefMatches = actualProjectRef === EXPECTED_SUPABASE_PROJECT_REF;

  return {
    marker: LOGIN_DEBUG_BUILD_MARKER,
    selectedFrontendEnvSource: viteSupabaseUrl ? 'VITE_SUPABASE_URL' : 'missing',
    selectedFrontendKeySource: selectedKeySource,
    selectedSupabaseUrlHost: parsed.host,
    selectedSupabaseUrlOrigin: parsed.origin,
    frontendSupabaseUrlHost: parsed.host,
    managedSupabaseFallbackIgnored: true,
    expectedProjectRef: EXPECTED_SUPABASE_PROJECT_REF,
    expectedSupabaseOrigin: EXPECTED_SUPABASE_ORIGIN,
    actualProjectRef,
    projectRefMatches,
    keyPresent: Boolean(supabaseKey),
    keyTypeGuess: guessKeyType(supabaseKey),
    browserOrigin: getBrowserOrigin(),
    frontendEnvError,
    supabaseUrl: parsed.origin ?? viteSupabaseUrl ?? '',
    supabaseKey,
    hasValidConfig: frontendEnvError === null,
  };
}

export function getFrontendSupabaseDebugInfo(): FrontendSupabaseDebugInfo {
  const config = getFrontendSupabaseConfig();
  return {
    marker: config.marker,
    selectedFrontendEnvSource: config.selectedFrontendEnvSource,
    selectedFrontendKeySource: config.selectedFrontendKeySource,
    selectedSupabaseUrlHost: config.selectedSupabaseUrlHost,
    selectedSupabaseUrlOrigin: config.selectedSupabaseUrlOrigin,
    frontendSupabaseUrlHost: config.frontendSupabaseUrlHost,
    managedSupabaseFallbackIgnored: config.managedSupabaseFallbackIgnored,
    expectedProjectRef: config.expectedProjectRef,
    expectedSupabaseOrigin: config.expectedSupabaseOrigin,
    actualProjectRef: config.actualProjectRef,
    projectRefMatches: config.projectRefMatches,
    keyPresent: config.keyPresent,
    keyTypeGuess: config.keyTypeGuess,
    browserOrigin: config.browserOrigin,
    frontendEnvError: config.frontendEnvError,
  };
}

export function getFrontendSupabaseUrl(): string {
  const config = getFrontendSupabaseConfig();
  if (config.frontendEnvError) {
    throw new Error(config.frontendEnvError);
  }
  return config.supabaseUrl;
}

export function getSupabaseClientConfig(): FrontendSupabaseConfig {
  return getFrontendSupabaseConfig();
}
