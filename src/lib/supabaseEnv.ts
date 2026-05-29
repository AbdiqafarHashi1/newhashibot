export const LOGIN_DEBUG_BUILD_MARKER = 'login-auth-final-proof-v1';
export const EXPECTED_SUPABASE_PROJECT_REF = 'uqiwbzfcntlcyyeewafc';
export const EXPECTED_SUPABASE_ORIGIN = `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;

export type FrontendSupabaseUrlSource =
  | 'VITE_HASHIBOT_SUPABASE_URL'
  | 'VITE_PUBLIC_SUPABASE_URL'
  | 'VITE_SUPABASE_URL'
  | 'safe_public_fallback';

export type FrontendSupabaseKeySource =
  | 'VITE_HASHIBOT_SUPABASE_ANON_KEY'
  | 'VITE_SUPABASE_ANON_KEY'
  | 'VITE_PUBLIC_SUPABASE_ANON_KEY'
  | 'VITE_SUPABASE_PUBLISHABLE_KEY'
  | 'VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  | 'missing';

export type FrontendSupabaseKeyTypeGuess = 'jwt_anon' | 'publishable' | 'forbidden_secret' | 'unknown';
export type FrontendSupabaseKeyProjectMatch = 'true' | 'false' | 'unknown';

interface SupabaseUrlParts {
  host: string | null;
  origin: string | null;
  projectRef: string | null;
  isExpectedProjectRef: boolean;
  parseError: string | null;
}

interface SelectedBrowserKey {
  source: FrontendSupabaseKeySource;
  key: string;
}

export interface FrontendSupabaseDecodedKeyDebug {
  role: string | null;
  ref: string | null;
  iss: string | null;
  exp: string | null;
  projectMatch: FrontendSupabaseKeyProjectMatch;
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
  decodedKey: FrontendSupabaseDecodedKeyDebug;
  keyProjectMatch: FrontendSupabaseKeyProjectMatch;
  selectedSupabaseUrlSource: FrontendSupabaseUrlSource;
  hashibotSupabaseUrlPresent: boolean;
  hashibotSupabaseUrlHost: string | null;
  hashibotSupabaseUrlProjectRef: string | null;
  publicSupabaseUrlPresent: boolean;
  publicSupabaseUrlHost: string | null;
  publicSupabaseUrlProjectRef: string | null;
  viteSupabaseUrlPresent: boolean;
  viteSupabaseUrlHost: string | null;
  viteSupabaseUrlProjectRef: string | null;
  staleViteSupabaseUrlIgnored: boolean;
  fallbackSupabaseUrlUsed: boolean;
  rawHashibotSupabaseAnonKeyPresent: boolean;
  rawSupabaseAnonKeyPresent: boolean;
  rawPublicSupabaseAnonKeyPresent: boolean;
  rawSupabasePublishableKeyPresent: boolean;
  rawPublicSupabasePublishableKeyPresent: boolean;
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
    const atobFn = globalThis.atob;
    if (typeof atobFn !== 'function') return null;
    const decoded = atobFn(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function guessKeyType(key: string): FrontendSupabaseKeyTypeGuess {
  if (!key) return 'unknown';
  if (key.startsWith('sb_publishable_')) return 'publishable';
  if (key.startsWith('sb_secret_')) return 'forbidden_secret';

  const payload = getBase64UrlJsonPayload(key);
  if (payload?.role === 'anon') return 'jwt_anon';
  if (payload?.role === 'service_role') return 'forbidden_secret';

  return 'unknown';
}

function stringFromClaim(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

function projectRefFromIssuer(iss: string | null): string | null {
  if (!iss) return null;
  try {
    const parsed = new URL(iss);
    return parsed.hostname.endsWith('.supabase.co')
      ? parsed.hostname.slice(0, -'.supabase.co'.length)
      : parsed.hostname.split('.')[0] || null;
  } catch {
    const match = iss.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i);
    return match?.[1] ?? null;
  }
}

function decodeKeyDebug(key: string, keyTypeGuess: FrontendSupabaseKeyTypeGuess): FrontendSupabaseDecodedKeyDebug {
  if (!key || keyTypeGuess !== 'jwt_anon') {
    return { role: null, ref: null, iss: null, exp: null, projectMatch: 'unknown' };
  }

  const payload = getBase64UrlJsonPayload(key);
  if (!payload) return { role: null, ref: null, iss: null, exp: null, projectMatch: 'unknown' };

  const role = stringFromClaim(payload.role);
  const ref = stringFromClaim(payload.ref) ?? stringFromClaim(payload.project_ref);
  const iss = stringFromClaim(payload.iss);
  const exp = stringFromClaim(payload.exp);
  const issuerRef = projectRefFromIssuer(iss);
  const comparableRef = ref ?? issuerRef;
  const projectMatch: FrontendSupabaseKeyProjectMatch = comparableRef
    ? (comparableRef === EXPECTED_SUPABASE_PROJECT_REF ? 'true' : 'false')
    : 'unknown';

  return { role, ref, iss, exp, projectMatch };
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
  return `${source} is present but points to wrong project ref ${projectRef ?? 'unknown'}; selected a higher-priority valid URL or safe fallback instead.`;
}

function selectBrowserKey(): SelectedBrowserKey {
  const orderedKeys: Array<[FrontendSupabaseKeySource, string | null]> = [
    ['VITE_HASHIBOT_SUPABASE_ANON_KEY', nonEmpty(import.meta.env.VITE_HASHIBOT_SUPABASE_ANON_KEY)],
    ['VITE_SUPABASE_ANON_KEY', nonEmpty(import.meta.env.VITE_SUPABASE_ANON_KEY)],
    ['VITE_PUBLIC_SUPABASE_ANON_KEY', nonEmpty(import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY)],
    ['VITE_SUPABASE_PUBLISHABLE_KEY', nonEmpty(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)],
    ['VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY', nonEmpty(import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY)],
  ];

  for (const [source, key] of orderedKeys) {
    if (key) return { source, key };
  }

  return { source: 'missing', key: '' };
}

export function toSupabaseEnvProofLog(debug: FrontendSupabaseDebugInfo) {
  return {
    marker: debug.marker,
    rawHashibotUrlPresent: debug.hashibotSupabaseUrlPresent,
    rawPublicUrlPresent: debug.publicSupabaseUrlPresent,
    rawViteUrlPresent: debug.viteSupabaseUrlPresent,
    rawViteUrlProjectRef: debug.viteSupabaseUrlProjectRef,
    staleViteSupabaseUrlIgnored: debug.staleViteSupabaseUrlIgnored,
    selectedUrlSource: debug.selectedSupabaseUrlSource,
    selectedUrlOrigin: debug.selectedUrlOrigin,
    selectedUrlHost: debug.selectedUrlHost,
    selectedProjectRef: debug.selectedProjectRef,
    expectedProjectRef: debug.expectedProjectRef,
    projectRefMatch: debug.projectRefMatch,
    keySource: debug.selectedKeySource,
    keyPresent: debug.keyPresent,
    keyTypeGuess: debug.keyTypeGuess,
    decodedKeyRole: debug.decodedKey.role,
    decodedKeyRef: debug.decodedKey.ref,
    decodedKeyIss: debug.decodedKey.iss,
    keyProjectMatch: debug.keyProjectMatch,
  };
}

export function logSupabaseEnvProof(debug = getFrontendSupabaseDebugInfo()): void {
  console.info('[HashiBot Supabase Env Proof]', toSupabaseEnvProofLog(debug));
}

export function getFrontendSupabaseConfig(): FrontendSupabaseConfig {
  // Browser/Vite code intentionally reads only browser-safe VITE_* public values.
  // URL priority: VITE_HASHIBOT_SUPABASE_URL, VITE_PUBLIC_SUPABASE_URL, matching
  // VITE_SUPABASE_URL, then the known safe public fallback for the expected project.
  const hashibotSupabaseUrl = nonEmpty(import.meta.env.VITE_HASHIBOT_SUPABASE_URL);
  const publicSupabaseUrl = nonEmpty(import.meta.env.VITE_PUBLIC_SUPABASE_URL);
  const viteSupabaseUrl = nonEmpty(import.meta.env.VITE_SUPABASE_URL);
  const hashibotParsed = parseSupabaseUrl(hashibotSupabaseUrl);
  const publicParsed = parseSupabaseUrl(publicSupabaseUrl);
  const viteParsed = parseSupabaseUrl(viteSupabaseUrl);

  const hashibotUrlAllowed = Boolean(hashibotSupabaseUrl && !hashibotParsed.parseError);
  const publicUrlAllowed = Boolean(publicSupabaseUrl && !publicParsed.parseError);
  const viteUrlAllowed = Boolean(viteSupabaseUrl && viteParsed.isExpectedProjectRef);
  const selectedUrlSource: FrontendSupabaseUrlSource = hashibotUrlAllowed
    ? 'VITE_HASHIBOT_SUPABASE_URL'
    : publicUrlAllowed
      ? 'VITE_PUBLIC_SUPABASE_URL'
      : viteUrlAllowed
        ? 'VITE_SUPABASE_URL'
        : 'safe_public_fallback';
  const selectedUrl = hashibotUrlAllowed
    ? hashibotSupabaseUrl
    : publicUrlAllowed
      ? publicSupabaseUrl
      : viteUrlAllowed
        ? viteSupabaseUrl
        : EXPECTED_SUPABASE_ORIGIN;
  const selectedParsed = parseSupabaseUrl(selectedUrl);

  const { source: selectedKeySource, key: supabaseKey } = selectBrowserKey();
  const keyTypeGuess = guessKeyType(supabaseKey);
  const decodedKey = decodeKeyDebug(supabaseKey, keyTypeGuess);
  const keyProjectMatch = decodedKey.projectMatch;
  const keyProjectMismatchError = keyProjectMatch === 'false'
    ? 'Selected browser key appears to belong to a different Supabase project.'
    : null;
  const keyForbiddenError = keyTypeGuess === 'forbidden_secret'
    ? 'selected browser key appears to be a forbidden service-role/secret key'
    : null;
  const keyError = supabaseKey
    ? null
    : 'missing browser Supabase anon or publishable key';
  const selectedUrlError = selectedParsed.isExpectedProjectRef
    ? null
    : `selected Supabase URL project ref mismatch: expected ${EXPECTED_SUPABASE_PROJECT_REF}, got ${selectedParsed.projectRef ?? 'unknown'}`;
  const rawError = selectedParsed.parseError ?? selectedUrlError ?? keyForbiddenError ?? keyProjectMismatchError ?? keyError;
  const errorMessage = formatConfigError(rawError);
  const selectedProjectRef = selectedParsed.projectRef;
  const projectRefMatch = selectedProjectRef === EXPECTED_SUPABASE_PROJECT_REF;
  const isValid = errorMessage === null;
  const viteWrongProject = Boolean(viteSupabaseUrl && !viteParsed.isExpectedProjectRef && !viteParsed.parseError);
  const hashibotWrongProject = Boolean(hashibotSupabaseUrl && !hashibotParsed.isExpectedProjectRef && !hashibotParsed.parseError);
  const publicWrongProject = Boolean(publicSupabaseUrl && !publicParsed.isExpectedProjectRef && !publicParsed.parseError);
  const warningMessage = keyProjectMismatchError
    ?? (viteWrongProject
      ? getWrongProjectWarning('VITE_SUPABASE_URL', viteParsed.projectRef)
      : hashibotWrongProject
        ? getWrongProjectWarning('VITE_HASHIBOT_SUPABASE_URL', hashibotParsed.projectRef)
        : publicWrongProject
          ? getWrongProjectWarning('VITE_PUBLIC_SUPABASE_URL', publicParsed.projectRef)
          : null);

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
    keyTypeGuess,
    decodedKey,
    keyProjectMatch,
    selectedSupabaseUrlSource: selectedUrlSource,
    hashibotSupabaseUrlPresent: Boolean(hashibotSupabaseUrl),
    hashibotSupabaseUrlHost: hashibotParsed.host,
    hashibotSupabaseUrlProjectRef: hashibotParsed.projectRef,
    publicSupabaseUrlPresent: Boolean(publicSupabaseUrl),
    publicSupabaseUrlHost: publicParsed.host,
    publicSupabaseUrlProjectRef: publicParsed.projectRef,
    viteSupabaseUrlPresent: Boolean(viteSupabaseUrl),
    viteSupabaseUrlHost: viteParsed.host,
    viteSupabaseUrlProjectRef: viteParsed.projectRef,
    staleViteSupabaseUrlIgnored: viteWrongProject,
    fallbackSupabaseUrlUsed: selectedUrlSource === 'safe_public_fallback',
    rawHashibotSupabaseAnonKeyPresent: Boolean(nonEmpty(import.meta.env.VITE_HASHIBOT_SUPABASE_ANON_KEY)),
    rawSupabaseAnonKeyPresent: Boolean(nonEmpty(import.meta.env.VITE_SUPABASE_ANON_KEY)),
    rawPublicSupabaseAnonKeyPresent: Boolean(nonEmpty(import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY)),
    rawSupabasePublishableKeyPresent: Boolean(nonEmpty(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)),
    rawPublicSupabasePublishableKeyPresent: Boolean(nonEmpty(import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY)),
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
  return { ...config };
}

export function getFrontendSupabaseUrl(): string {
  const config = getFrontendSupabaseConfig();
  return config.supabaseUrl;
}

export function getSupabaseClientConfig(): FrontendSupabaseConfig {
  return getFrontendSupabaseConfig();
}
