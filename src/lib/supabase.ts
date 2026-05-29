import { createClient } from '@supabase/supabase-js';
import { getFrontendSupabaseAnonKey, getFrontendSupabaseUrl, frontendSupabaseDebugInfo } from './supabaseEnv';

const supabaseUrl = getFrontendSupabaseUrl();
const supabaseAnonKey = getFrontendSupabaseAnonKey();

if (!supabaseAnonKey.value) {
  throw new Error('Missing frontend Supabase anon/publishable key. Set VITE_SUPABASE_ANON_KEY, SUPABASE_ANON_KEY, VITE_SUPABASE_PUBLISHABLE_KEY, or SUPABASE_PUBLISHABLE_KEYS in Bolt. Do not use the service-role key in the frontend.');
}

export const supabase = createClient(supabaseUrl.value, supabaseAnonKey.value);
export { frontendSupabaseDebugInfo };
