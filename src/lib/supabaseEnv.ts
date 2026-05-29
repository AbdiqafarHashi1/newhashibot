export const EXPECTED_SUPABASE_PROJECT_REF = 'uqiwbzfcntlcyyeewafc';

export interface FrontendSupabaseDebugInfo {
  frontendSupabaseUrlHost: string | null;
  expectedProjectRef: string;
  actualProjectRef: string | null;
  projectRefMatches: boolean;
}

export function getFrontendSupabaseDebugInfo(): FrontendSupabaseDebugInfo {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  let frontendSupabaseUrlHost: string | null = null;
  let actualProjectRef: string | null = null;

  try {
    if (supabaseUrl) {
      const parsed = new URL(supabaseUrl);
      frontendSupabaseUrlHost = parsed.host;
      actualProjectRef = parsed.hostname.endsWith('.supabase.co')
        ? parsed.hostname.split('.')[0]
        : parsed.hostname.split('.')[0] || null;
    }
  } catch {
    frontendSupabaseUrlHost = 'invalid-url';
    actualProjectRef = null;
  }

  return {
    frontendSupabaseUrlHost,
    expectedProjectRef: EXPECTED_SUPABASE_PROJECT_REF,
    actualProjectRef,
    projectRefMatches: actualProjectRef === EXPECTED_SUPABASE_PROJECT_REF,
  };
}
