export const LOGIN_DEBUG_BUILD_MARKER = 'login-env-proof-v3-no-blank-screen';
export const EXPECTED_SUPABASE_PROJECT_REF = 'uqiwbzfcntlcyyeewafc';
export const EXPECTED_SUPABASE_ORIGIN = `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;

export type FrontendSupabaseUrlSource =
  | 'VITE_SUPABASE_URL'
  | 'safe_public_fallback';

export type FrontendSupabaseKeySource =
  | 'VITE_SUPABASE_ANON_KEY'
  | 'VITE_SUPABASE_PUBLISHABLE_KEY'
  | 'missing';

export type FrontendSupabaseKeyTypeGuess = 'jwt_anon' | 'publishable' | 'unknown';

export interface FrontendSupabaseDebugInfo {
  marker: typeof LOGIN_DEBUG_BUILD_MARKER;
  isValid: boolean;
  errorMessage: string | null;
  selectedUrl: string | null;
  selectedUrlOrigin: string | null;
  selectedUrlHost: string | null;
  selectedProjectRef: string | null;
  expectedProjectRef: string;
  projectRefMatch: boolean;
  selectedKeySource: FrontendSupabaseKeySource;
  keyPresent: boolean;
  keyTypeGuess: FrontendSupabaseKeyTypeGuess;
  selectedSupabaseUrlSource: FrontendSupabaseUrlSource;
  viteSupabaseUrlPresent: boolean;
  fallbackSupabaseUrlUsed: boolean;
  browserOrigin: string;

  // Backward-compatible debug aliases used by existing pages.
  selectedFrontendEnvSource: FrontendSupabaseUrlSource;
  selectedFrontendKeySource: FrontendSupabaseKeySource;
  selectedSupabaseUrlHost: string | null;
  selectedSupabaseUrlOrigin: string | null;
  frontendSupabaseUrlHost: string | null;
  managedSupabaseFallbackIgnored: boolean;
  expectedSupabaseOrigin: string;
  actualProjectRef: string | null;
  projectRefMatches: boolean;
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

function parseSupabaseUrl(url: string): {
  host: string | null;
  origin: string | null;
  projectRef: string | null;
  error: string | null;
} {
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
        : `project ref mismatch: expected ${EXPECTED_SUPABASE_PROJECT_REF}, got ${projectRef ?? 'unknown'}`,
    };
  } catch {
    return {
      host: null,
      origin: null,
      projectRef: null,
      error: 'invalid VITE_SUPABASE_URL',
    };
  }
}

function formatConfigError(reason: string | null): string | null {
  return reason ? `Supabase frontend config invalid: ${reason}` : null;
}

export function getFrontendSupabaseConfig(): FrontendSupabaseConfig {
  // Browser/Vite code intentionally reads only VITE_* variables. The legacy anon JWT
  // is preferred for browser auth; the publishable key is used only if the anon key is absent.
  // URL priority: VITE_SUPABASE_URL first when present; otherwise the known safe public fallback.
  const viteSupabaseUrl = nonEmpty(import.meta.env.VITE_SUPABASE_URL);
  const selectedUrlSource: FrontendSupabaseUrlSource = viteSupabaseUrl
    ? 'VITE_SUPABASE_URL'
    : 'safe_public_fallback';
  const selectedUrl = viteSupabaseUrl ?? EXPECTED_SUPABASE_ORIGIN;
  const anonKey = nonEmpty(import.meta.env.VITE_SUPABASE_ANON_KEY);
  const publishableKey = nonEmpty(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

  const selectedKeySource: FrontendSupabaseKeySource = anonKey
    ? 'VITE_SUPABASE_ANON_KEY'
    : publishableKey
      ? 'VITE_SUPABASE_PUBLISHABLE_KEY'
      : 'missing';
  const supabaseKey = anonKey ?? publishableKey ?? '';
  const parsed = parseSupabaseUrl(selectedUrl);
  const keyError = supabaseKey
    ? null
    : 'missing VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY';
  const rawError = parsed.error ?? keyError;
  const errorMessage = formatConfigError(rawError);
  const selectedProjectRef = parsed.projectRef;
  const projectRefMatch = selectedProjectRef === EXPECTED_SUPABASE_PROJECT_REF;
  const isValid = errorMessage === null;

  return {
    marker: LOGIN_DEBUG_BUILD_MARKER,
    isValid,
    errorMessage,
    selectedUrl,
    selectedUrlOrigin: parsed.origin,
    selectedUrlHost: parsed.host,
    selectedProjectRef,
    expectedProjectRef: EXPECTED_SUPABASE_PROJECT_REF,
    projectRefMatch,
    selectedKeySource,
    keyPresent: Boolean(supabaseKey),
    keyTypeGuess: guessKeyType(supabaseKey),
    selectedSupabaseUrlSource: selectedUrlSource,
    viteSupabaseUrlPresent: Boolean(viteSupabaseUrl),
    fallbackSupabaseUrlUsed: !viteSupabaseUrl,
    browserOrigin: getBrowserOrigin(),

    selectedFrontendEnvSource: selectedUrlSource,
    selectedFrontendKeySource: selectedKeySource,
    selectedSupabaseUrlHost: parsed.host,
    selectedSupabaseUrlOrigin: parsed.origin,
    frontendSupabaseUrlHost: parsed.host,
    managedSupabaseFallbackIgnored: true,
    expectedSupabaseOrigin: EXPECTED_SUPABASE_ORIGIN,
    actualProjectRef: selectedProjectRef,
    projectRefMatches: projectRefMatch,
    frontendEnvError: errorMessage,
    supabaseUrl: parsed.origin ?? EXPECTED_SUPABASE_ORIGIN,
    supabaseKey,
    hasValidConfig: isValid,
  };
}

export function getFrontendSupabaseDebugInfo(): FrontendSupabaseDebugInfo {
  const config = getFrontendSupabaseConfig();
  return {
    marker: config.marker,
    isValid: config.isValid,
    errorMessage: config.errorMessage,
    selectedUrl: config.selectedUrl,
    selectedUrlOrigin: config.selectedUrlOrigin,
    selectedUrlHost: config.selectedUrlHost,
    selectedProjectRef: config.selectedProjectRef,
    expectedProjectRef: config.expectedProjectRef,
    projectRefMatch: config.projectRefMatch,
    selectedKeySource: config.selectedKeySource,
    keyPresent: config.keyPresent,
    keyTypeGuess: config.keyTypeGuess,
    selectedSupabaseUrlSource: config.selectedSupabaseUrlSource,
    viteSupabaseUrlPresent: config.viteSupabaseUrlPresent,
    fallbackSupabaseUrlUsed: config.fallbackSupabaseUrlUsed,
    browserOrigin: config.browserOrigin,
    selectedFrontendEnvSource: config.selectedFrontendEnvSource,
    selectedFrontendKeySource: config.selectedFrontendKeySource,
    selectedSupabaseUrlHost: config.selectedSupabaseUrlHost,
    selectedSupabaseUrlOrigin: config.selectedSupabaseUrlOrigin,
    frontendSupabaseUrlHost: config.frontendSupabaseUrlHost,
    managedSupabaseFallbackIgnored: config.managedSupabaseFallbackIgnored,
    expectedSupabaseOrigin: config.expectedSupabaseOrigin,
    actualProjectRef: config.actualProjectRef,
    projectRefMatches: config.projectRefMatches,
    frontendEnvError: config.frontendEnvError,
  };
}

export function getFrontendSupabaseUrl(): string {
  const config = getFrontendSupabaseConfig();
  return config.supabaseUrl;
}

export function getSupabaseClientConfig(): FrontendSupabaseConfig {
  return getFrontendSupabaseConfig();
}
