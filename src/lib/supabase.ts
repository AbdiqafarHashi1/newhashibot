import { createClient } from '@supabase/supabase-js';
import { EXPECTED_SUPABASE_ORIGIN, getSupabaseClientConfig } from './supabaseEnv';

export const supabaseClientConfig = getSupabaseClientConfig();

if (supabaseClientConfig.frontendEnvError) {
  console.error(supabaseClientConfig.frontendEnvError);
}

// Keep the app renderable when env is missing so /login can show the safe debug panel.
// Auth calls are guarded before use, so these inert values are never used for real login.
const clientUrl = supabaseClientConfig.supabaseUrl || EXPECTED_SUPABASE_ORIGIN;
const clientKey = supabaseClientConfig.supabaseKey || 'missing-browser-supabase-key-not-used-for-login';

export const supabase = createClient(clientUrl, clientKey);
