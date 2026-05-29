import { createClient } from '@supabase/supabase-js';
import { EXPECTED_SUPABASE_ORIGIN, getSupabaseClientConfig } from './supabaseEnv';

export const supabaseClientConfig = getSupabaseClientConfig();
export const isSupabaseClientEnabled = supabaseClientConfig.hasValidConfig;
export const supabaseConfigErrorMessage = supabaseClientConfig.frontendEnvError;

if (supabaseClientConfig.frontendEnvError) {
  console.error(supabaseClientConfig.frontendEnvError);
}

// Never allow malformed or mismatched frontend env to crash module import. When the
// selected config is invalid, create an inert SDK client against the expected public
// origin and guard auth/database calls before they run.
const safeClientUrl = supabaseClientConfig.hasValidConfig
  ? supabaseClientConfig.supabaseUrl
  : EXPECTED_SUPABASE_ORIGIN;
const safeClientKey = supabaseClientConfig.hasValidConfig
  ? supabaseClientConfig.supabaseKey
  : 'disabled-browser-supabase-client-config-invalid';

export const supabase = createClient(safeClientUrl, safeClientKey);
