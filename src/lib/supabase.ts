import { createClient } from '@supabase/supabase-js';
import { getSupabaseClientConfig } from './supabaseEnv';

export const supabaseClientConfig = getSupabaseClientConfig();

if (!supabaseClientConfig.projectRefMatches) {
  throw new Error(supabaseClientConfig.frontendEnvError ?? 'Frontend Supabase project mismatch');
}

if (supabaseClientConfig.frontendEnvError) {
  console.error(supabaseClientConfig.frontendEnvError);
}

// Keep the app renderable when only the browser key is missing so /login can show the safe debug panel.
// Auth calls are guarded before use, so this inert value is never used for real login.
const clientKey = supabaseClientConfig.supabaseKey || 'missing-browser-supabase-key-not-used-for-login';

export const supabase = createClient(supabaseClientConfig.supabaseUrl, clientKey);
