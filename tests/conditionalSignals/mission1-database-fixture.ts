import {readFile} from 'node:fs/promises';
/** Disposable SQL fixture: production migrations, external service boundary schemas only. */
export async function bootstrapMissionDatabase(db:{exec:(sql:string)=>Promise<unknown>}){
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.role() returns text language sql as $$select 'service_role'$$;create function is_admin() returns boolean language sql as $$select false$$;

 create table strategy_release_candidates(id uuid primary key,strategy_id text,state text,immutable_configuration jsonb);
 create table scanner_runs(id uuid primary key default gen_random_uuid(),status text,finished_at timestamptz,symbols_scanned integer,candidates_found integer,signals_created integer);
 create table strategy_candidates(id uuid primary key default gen_random_uuid(),scanner_run_id uuid,symbol text,market_type text,timeframe text,strategy_name text,direction text,entry_low numeric,entry_high numeric,stop_loss numeric,tp1 numeric,tp2 numeric,confidence_score integer,grade text,reason text,status text);
 create table certified_strategy_plans(evaluation_id text primary key,candidate_id uuid,scanner_run_id uuid,arbitration_decision_key text,strategy_id text,strategy_version text,canonical_side text,symbol text,market text,strategy_plan jsonb);
 create table signals(id uuid primary key default gen_random_uuid(),candidate_id uuid,symbol text,market_type text,timeframe text,direction text,entry_type text,entry_low numeric,entry_high numeric,stop_loss numeric,tp1 numeric,tp2 numeric,strategy_name text,grade text,confidence_score integer,reason text,status text,source text,mode_slug text,data_source text,created_at timestamptz,expires_at timestamptz,signal_identity text unique,strategy_id text,strategy_version text,configuration_version text,candle_close_time timestamptz,immutable_hash text,arbitrator_decision jsonb,updated_at timestamptz);
 create table signal_updates(signal_id uuid,update_type text,old_status text,new_status text,message text,price numeric,reason text,created_at timestamptz);`);
 await db.exec(`alter table signals add risk_reward numeric,add regime text,add invalidation text,add risk_profile_snapshot jsonb,add recommended_risk_pct numeric,add suggested_leverage_min numeric,add suggested_leverage_max numeric,add leverage_cap numeric;`);
 await db.exec(await readFile('supabase/migrations/20260930120000_phase_k_active_scanner_signal_truth.sql','utf8'));


 await db.exec(`create table strategy_configs(strategy_name text,allowed_timeframes jsonb);create table test_events(key text primary key,payload jsonb);create function public.enqueue_canonical_lifecycle_event(text,text,integer,uuid,uuid,uuid,uuid,timestamptz,jsonb,text[]) returns void language sql as $$insert into test_events values($1,$9)$$;`);
 await db.exec(await readFile('supabase/migrations/20261029031319_conditional_signal_service.sql','utf8'));
 const tracks=await readFile('supabase/migrations/20261029053521_conditional_tracks_and_acquisition.sql','utf8');await db.exec(tracks.slice(0,tracks.indexOf('create or replace function public.commit_conditional_signal_setup')));
 const dual=await readFile('supabase/migrations/20261029205531_dual_market_conditional_watch.sql','utf8');await db.exec(dual.slice(0,dual.indexOf('create or replace function public.commit_conditional_signal_setup')));
 const watches=await readFile('supabase/migrations/20261029212305_strategy_watches_and_context.sql','utf8');
 await db.exec(watches.slice(0,watches.indexOf('-- Extend only')));
 await db.exec(await readFile('supabase/migrations/20261030055040_conditional_execution_bridge.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261104224012_mission1_entry_lifecycle.sql','utf8'));

}
