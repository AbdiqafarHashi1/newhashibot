export const EXPECTED_SUPABASE_PROJECT_REF = 'uqiwbzfcntlcyyeewafc';

export type FrontendSupabaseEnvSource =
  | 'VITE_SUPABASE_URL'
  | 'missing';

export type FrontendSupabaseKeySource =
  | 'VITE_SUPABASE_ANON_KEY'
  | 'VITE_SUPABASE_PUBLISHABLE_KEY'
  | 'VITE_SUPABASE_PUBLISHABLE_KEYS'
  | 'missing';

export interface FrontendSupabaseDebugInfo {
  selectedFrontendEnvSource: FrontendSupabaseEnvSource;
  selectedFrontendKeySource: FrontendSupabaseKeySource;
  frontendSupabaseUrlHost: string | null;
  expectedProjectRef: string;
  actualProjectRef: string | null;
  projectRefMatches: boolean;
  managedSupabaseFallbackIgnored: boolean;
  frontendEnvError: string | null;
}

export interface FrontendSupabaseConfig extends FrontendSupabaseDebugInfo {
  supabaseUrl: string;
  supabaseKey: string;
  hasValidConfig: boolean;
}

const FALLBACK_PLACEHOLDER_URL = `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;
const FALLBACK_PLACEHOLDER_KEY = 'frontend-supabase-env-missing';

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function firstPublishableKey(value: unknown): string | null {
  const raw = nonEmpty(value);
  if (!raw) return null;

  return raw
    .split(',')
    .map(part => part.trim())
    .find(Boolean) ?? null;
}

function parseSupabaseUrl(url: string | null): { host: string | null; projectRef: string | null; error: string | null } {
  if (!url) {
    return {
      host: null,
      projectRef: null,
      error: 'Frontend Supabase env error: VITE_SUPABASE_URL is missing. Add the real frontend project URL in Bolt/Vite env secrets.',
    };
  }

  try {
    const parsed = new URL(url);
    const projectRef = parsed.hostname.endsWith('.supabase.co')
      ? parsed.hostname.split('.')[0]
      : parsed.hostname.split('.')[0] || null;

    return {
      host: parsed.host,
      projectRef,
      error: projectRef === EXPECTED_SUPABASE_PROJECT_REF
        ? null
        : `Frontend Supabase project mismatch: VITE_SUPABASE_URL must point to ${EXPECTED_SUPABASE_PROJECT_REF}, but resolved to ${projectRef ?? 'unknown'}.`,
    };
  } catch {
    return {
      host: 'invalid-url',
      projectRef: null,
      error: 'Frontend Supabase env error: VITE_SUPABASE_URL is not a valid URL.',
    };
  }
}

export function getFrontendSupabaseConfig(): FrontendSupabaseConfig {
  // Browser/Vite code intentionally reads only VITE_* variables. Bolt-managed SUPABASE_*
  // values are server/Edge Function envs and must never be used as browser fallbacks.
  const viteSupabaseUrl = nonEmpty(import.meta.env.VITE_SUPABASE_URL);
  const anonKey = nonEmpty(import.meta.env.VITE_SUPABASE_ANON_KEY);
  const publishableKey = nonEmpty(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  const publishableKeys = firstPublishableKey(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEYS);

  const selectedKeySource: FrontendSupabaseKeySource = anonKey
    ? 'VITE_SUPABASE_ANON_KEY'
    : publishableKey
      ? 'VITE_SUPABASE_PUBLISHABLE_KEY'
      : publishableKeys
        ? 'VITE_SUPABASE_PUBLISHABLE_KEYS'
        : 'missing';
  const supabaseKey = anonKey ?? publishableKey ?? publishableKeys ?? '';
  const parsed = parseSupabaseUrl(viteSupabaseUrl);
  const keyError = supabaseKey
    ? null
    : 'Frontend Supabase env error: set VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY for the browser Supabase client.';
  const frontendEnvError = parsed.error ?? keyError;

  return {
    selectedFrontendEnvSource: viteSupabaseUrl ? 'VITE_SUPABASE_URL' : 'missing',
    selectedFrontendKeySource: selectedKeySource,
    frontendSupabaseUrlHost: parsed.host,
    expectedProjectRef: EXPECTED_SUPABASE_PROJECT_REF,
    actualProjectRef: parsed.projectRef,
    projectRefMatches: parsed.projectRef === EXPECTED_SUPABASE_PROJECT_REF,
    managedSupabaseFallbackIgnored: true,
    frontendEnvError,
    supabaseUrl: viteSupabaseUrl ?? '',
    supabaseKey,
    hasValidConfig: frontendEnvError === null,
  };
}

export function getFrontendSupabaseDebugInfo(): FrontendSupabaseDebugInfo {
  const config = getFrontendSupabaseConfig();
  return {
    selectedFrontendEnvSource: config.selectedFrontendEnvSource,
    selectedFrontendKeySource: config.selectedFrontendKeySource,
    frontendSupabaseUrlHost: config.frontendSupabaseUrlHost,
    expectedProjectRef: config.expectedProjectRef,
    actualProjectRef: config.actualProjectRef,
    projectRefMatches: config.projectRefMatches,
    managedSupabaseFallbackIgnored: config.managedSupabaseFallbackIgnored,
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

export function getSupabaseClientConfig(): { supabaseUrl: string; supabaseKey: string; frontendEnvError: string | null } {
  const config = getFrontendSupabaseConfig();
  return {
    supabaseUrl: config.frontendEnvError ? FALLBACK_PLACEHOLDER_URL : config.supabaseUrl,
    supabaseKey: config.frontendEnvError ? FALLBACK_PLACEHOLDER_KEY : config.supabaseKey,
    frontendEnvError: config.frontendEnvError,
  };
}
