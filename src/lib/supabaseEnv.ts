const TARGET_SUPABASE_URL = 'https://uqiwbzfcntlcyyeewafc.supabase.co';

export interface FrontendSupabaseDebugInfo {
  url: string;
  projectRef: string | null;
  urlSource: string;
  anonKeySource: string;
  usingUrlFallback: boolean;
  hasAnonOrPublishableKey: boolean;
}

type EnvMap = Record<string, string | boolean | undefined>;

function env(): EnvMap {
  return import.meta.env as EnvMap;
}

function envString(name: string): string | null {
  const value = env()[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstEnv(names: string[]): { value: string | null; source: string } {
  for (const name of names) {
    const value = envString(name);
    if (value) return { value, source: name };
  }
  return { value: null, source: 'missing' };
}

function firstPublishableKeyFromJson(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === 'string') return parsed;
    if (Array.isArray(parsed)) {
      const first = parsed.find(item => typeof item === 'string' && item.trim());
      return typeof first === 'string' ? first : value;
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      for (const candidate of ['anon', 'publishable', 'current', 'key']) {
        if (typeof obj[candidate] === 'string' && obj[candidate].trim()) return obj[candidate] as string;
      }
      const first = Object.values(obj).find(item => typeof item === 'string' && item.trim());
      return typeof first === 'string' ? first : value;
    }
  } catch {
    // Plain key value, not JSON.
  }
  return value;
}

export function getFrontendSupabaseUrl(): { value: string; source: string; usingFallback: boolean } {
  const configured = firstEnv(['VITE_SUPABASE_URL', 'SUPABASE_URL']);
  if (configured.value) return { value: configured.value.replace(/\/+$/, ''), source: configured.source, usingFallback: false };
  return { value: TARGET_SUPABASE_URL, source: 'fallback:target_project_url', usingFallback: true };
}

export function getFrontendSupabaseAnonKey(): { value: string; source: string } {
  const configured = firstEnv([
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEYS',
    'SUPABASE_PUBLISHABLE_KEYS',
  ]);
  return { value: configured.value ? firstPublishableKeyFromJson(configured.value) : '', source: configured.source };
}

export function getFrontendSupabaseDebugInfo(): FrontendSupabaseDebugInfo {
  const url = getFrontendSupabaseUrl();
  const key = getFrontendSupabaseAnonKey();
  return {
    url: url.value,
    projectRef: getSupabaseProjectRef(url.value),
    urlSource: url.source,
    anonKeySource: key.source,
    usingUrlFallback: url.usingFallback,
    hasAnonOrPublishableKey: Boolean(key.value),
  };
}

export function getSupabaseProjectRef(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function edgeFunctionUrl(functionName: string): string {
  return `${getFrontendSupabaseUrl().value}/functions/v1/${functionName}`;
}

export const frontendSupabaseDebugInfo = getFrontendSupabaseDebugInfo();
