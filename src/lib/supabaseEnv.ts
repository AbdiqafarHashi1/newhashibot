export const LOGIN_DEBUG_BUILD_MARKER = 'login-env-proof-v4-env-source-trace';
export const EXPECTED_SUPABASE_PROJECT_REF = 'uqiwbzfcntlcyyeewafc';
export const EXPECTED_SUPABASE_ORIGIN = `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;

export type FrontendSupabaseUrlSource =
  | 'VITE_HASHIBOT_SUPABASE_URL'
  | 'VITE_SUPABASE_URL'
  | 'safe_public_fallback';

export type FrontendSupabaseKeySource =
  | 'VITE_SUPABASE_ANON_KEY'
  | 'VITE_SUPABASE_PUBLISHABLE_KEY'
  | 'missing';

export type FrontendSupabaseKeyTypeGuess = 'jwt_anon' | 'publishable' | 'unknown';

interface SupabaseUrlParts {
  host: string | null;
  origin: string | null;
  projectRef: string | null;
  isExpectedProjectRef: boolean;
  parseError: string | null;
}

export interface FrontendSupabaseDebugInfo {
  marker: typeof LOGIN_DEBUG_BUILD_MARKER;
  isValid: boolean;
  errorMessage: string | null;
  warningMessage: string | null;
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
  hashibotSupabaseUrlPresent: boolean;
  hashibotSupabaseUrlHost: string | null;
  hashibotSupabaseUrlProjectRef: string | null;
  viteSupabaseUrlPresent: boolean;
  viteSupabaseUrlHost: string | null;
  viteSupabaseUrlProjectRef: string | null;
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

function parseSupabaseUrl(url: string | null): SupabaseUrlParts {
  if (!url) {
    return {
      host: null,
      origin: null,
      projectRef: null,
      isExpectedProjectRef: false,
      parseError: null,
    };
  }

  try {
    const parsed = new URL(url);
    const projectRef = parsed.hostname.endsWith('.supabase.co')
      ? parsed.hostname.slice(0, -'.supabase.co'.length)
      : parsed.hostname.split('.')[0] || null;

    return {
      host: parsed.host,
      origin: parsed.origin,
      projectRef,
      isExpectedProjectRef: projectRef === EXPECTED_SUPABASE_PROJECT_REF,
      parseError: null,
    };
  } catch {
    return {
      host: null,
      origin: null,
      projectRef: null,
      isExpectedProjectRef: false,
      parseError: 'invalid Supabase URL',
    };
  }
}

function formatConfigError(reason: string | null): string | null {
  return reason ? `Supabase frontend config invalid: ${reason}` : null;
}

function getWrongProjectWarning(source: string, projectRef: string | null): string {
  return `${source} is present but points to wrong project ref ${projectRef ?? 'unknown'}; selected VITE_HASHIBOT_SUPABASE_URL or safe fallback instead.`;
}

export function toSupabaseEnvProofLog(debug: FrontendSupabaseDebugInfo) {
  return {
    marker: debug.marker,
    rawHashibotUrlPresent: debug.hashibotSupabaseUrlPresent,
    rawHashibotUrlHost: debug.hashibotSupabaseUrlHost,
    rawHashibotUrlProjectRef: debug.hashibotSupabaseUrlProjectRef,
    rawViteUrlPresent: debug.viteSupabaseUrlPresent,
    rawViteUrlHost: debug.viteSupabaseUrlHost,
    rawViteUrlProjectRef: debug.viteSupabaseUrlProjectRef,
    selectedUrlSource: debug.selectedSupabaseUrlSource,
    selectedUrlOrigin: debug.selectedUrlOrigin,
    selectedUrlHost: debug.selectedUrlHost,
    selectedProjectRef: debug.selectedProjectRef,
    expectedProjectRef: debug.expectedProjectRef,
    projectRefMatch: debug.projectRefMatch,
    keySource: debug.selectedKeySource,
    keyPresent: debug.keyPresent,
    keyTypeGuess: debug.keyTypeGuess,
  };
}

export function logSupabaseEnvProof(debug = getFrontendSupabaseDebugInfo()): void {
  console.info('[HashiBot Supabase Env Proof]', toSupabaseEnvProofLog(debug));
}

export function getFrontendSupabaseConfig(): FrontendSupabaseConfig {
  // Browser/Vite code intentionally reads only VITE_* variables. The legacy anon JWT
  // is preferred for browser auth; the publishable key is used only if the anon key is absent.
  // URL priority: VITE_HASHIBOT_SUPABASE_URL, then a matching VITE_SUPABASE_URL, then the
  // known safe public fallback for the expected project.
  const hashibotSupabaseUrl = nonEmpty(import.meta.env.VITE_HASHIBOT_SUPABASE_URL);
  const viteSupabaseUrl = nonEmpty(import.meta.env.VITE_SUPABASE_URL);
  const hashibotParsed = parseSupabaseUrl(hashibotSupabaseUrl);
  const viteParsed = parseSupabaseUrl(viteSupabaseUrl);

  const hashibotUrlAllowed = Boolean(hashibotSupabaseUrl && hashibotParsed.isExpectedProjectRef);
  const viteUrlAllowed = Boolean(viteSupabaseUrl && viteParsed.isExpectedProjectRef);
  const selectedUrlSource: FrontendSupabaseUrlSource = hashibotUrlAllowed
    ? 'VITE_HASHIBOT_SUPABASE_URL'
    : viteUrlAllowed
      ? 'VITE_SUPABASE_URL'
      : 'safe_public_fallback';
  const selectedUrl = hashibotUrlAllowed
    ? hashibotSupabaseUrl
    : viteUrlAllowed
      ? viteSupabaseUrl
      : EXPECTED_SUPABASE_ORIGIN;
  const selectedParsed = parseSupabaseUrl(selectedUrl);

  const anonKey = nonEmpty(import.meta.env.VITE_SUPABASE_ANON_KEY);
  const publishableKey = nonEmpty(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

  const selectedKeySource: FrontendSupabaseKeySource = anonKey
    ? 'VITE_SUPABASE_ANON_KEY'
    : publishableKey
      ? 'VITE_SUPABASE_PUBLISHABLE_KEY'
      : 'missing';
  const supabaseKey = anonKey ?? publishableKey ?? '';
  const keyError = supabaseKey
    ? null
    : 'missing VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY';
  const selectedUrlError = selectedParsed.isExpectedProjectRef
    ? null
    : `selected Supabase URL project ref mismatch: expected ${EXPECTED_SUPABASE_PROJECT_REF}, got ${selectedParsed.projectRef ?? 'unknown'}`;
  const rawError = selectedParsed.parseError ?? selectedUrlError ?? keyError;
  const errorMessage = formatConfigError(rawError);
  const selectedProjectRef = selectedParsed.projectRef;
  const projectRefMatch = selectedProjectRef === EXPECTED_SUPABASE_PROJECT_REF;
  const isValid = errorMessage === null;
  const viteWrongProject = Boolean(viteSupabaseUrl && !viteParsed.isExpectedProjectRef && !viteParsed.parseError);
  const hashibotWrongProject = Boolean(hashibotSupabaseUrl && !hashibotParsed.isExpectedProjectRef && !hashibotParsed.parseError);
  const warningMessage = viteWrongProject
    ? getWrongProjectWarning('VITE_SUPABASE_URL', viteParsed.projectRef)
    : hashibotWrongProject
      ? getWrongProjectWarning('VITE_HASHIBOT_SUPABASE_URL', hashibotParsed.projectRef)
      : null;

  return {
    marker: LOGIN_DEBUG_BUILD_MARKER,
    isValid,
    errorMessage,
    warningMessage,
    selectedUrl,
    selectedUrlOrigin: selectedParsed.origin,
    selectedUrlHost: selectedParsed.host,
    selectedProjectRef,
    expectedProjectRef: EXPECTED_SUPABASE_PROJECT_REF,
    projectRefMatch,
    selectedKeySource,
    keyPresent: Boolean(supabaseKey),
    keyTypeGuess: guessKeyType(supabaseKey),
    selectedSupabaseUrlSource: selectedUrlSource,
    hashibotSupabaseUrlPresent: Boolean(hashibotSupabaseUrl),
    hashibotSupabaseUrlHost: hashibotParsed.host,
    hashibotSupabaseUrlProjectRef: hashibotParsed.projectRef,
    viteSupabaseUrlPresent: Boolean(viteSupabaseUrl),
    viteSupabaseUrlHost: viteParsed.host,
    viteSupabaseUrlProjectRef: viteParsed.projectRef,
    fallbackSupabaseUrlUsed: selectedUrlSource === 'safe_public_fallback',
    browserOrigin: getBrowserOrigin(),

    selectedFrontendEnvSource: selectedUrlSource,
    selectedFrontendKeySource: selectedKeySource,
    selectedSupabaseUrlHost: selectedParsed.host,
    selectedSupabaseUrlOrigin: selectedParsed.origin,
    frontendSupabaseUrlHost: selectedParsed.host,
    managedSupabaseFallbackIgnored: true,
    expectedSupabaseOrigin: EXPECTED_SUPABASE_ORIGIN,
    actualProjectRef: selectedProjectRef,
    projectRefMatches: projectRefMatch,
    frontendEnvError: errorMessage,
    supabaseUrl: selectedParsed.origin ?? EXPECTED_SUPABASE_ORIGIN,
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
    warningMessage: config.warningMessage,
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
    hashibotSupabaseUrlPresent: config.hashibotSupabaseUrlPresent,
    hashibotSupabaseUrlHost: config.hashibotSupabaseUrlHost,
    hashibotSupabaseUrlProjectRef: config.hashibotSupabaseUrlProjectRef,
    viteSupabaseUrlPresent: config.viteSupabaseUrlPresent,
    viteSupabaseUrlHost: config.viteSupabaseUrlHost,
    viteSupabaseUrlProjectRef: config.viteSupabaseUrlProjectRef,
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
