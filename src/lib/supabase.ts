import { createClient } from '@supabase/supabase-js';
import { getSupabaseClientConfig } from './supabaseEnv';

const { supabaseUrl, supabaseKey, frontendEnvError } = getSupabaseClientConfig();

if (frontendEnvError) {
  console.error(frontendEnvError);
}

export const supabase = createClient(supabaseUrl, supabaseKey);
