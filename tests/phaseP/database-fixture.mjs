import {readFileSync} from 'node:fs';
const migration=file=>readFileSync(`supabase/migrations/${file}`,'utf8');
/** Explicit prerequisite fixture, followed by actual L/M/P SQL; not the complete migration chain. */
export function initializeDatabaseFixture(raw,{actor,other,nativeAuth=false}){
 if(!nativeAuth)raw(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$select current_setting('request.jwt.claim.role',true)$$; GRANT USAGE ON SCHEMA auth TO service_role,authenticated,anon; GRANT SELECT ON auth.users TO service_role; INSERT INTO auth.users VALUES('${actor}'),('${other}');`);
 raw(`CREATE TABLE profiles(id uuid PRIMARY KEY,role text); CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS $$select false$$; CREATE TABLE connected_execution_accounts(id uuid PRIMARY KEY,customer_id uuid); CREATE TABLE mt5_accounts(id uuid PRIMARY KEY); CREATE EXTENSION btree_gist; INSERT INTO profiles VALUES('${actor}','admin'),('${other}','user');`);
 const h=migration('20260926180000_phase_h_customer_onboarding.sql');raw(h.slice(h.indexOf('create table if not exists public.portable_jobs'),h.indexOf(';',h.indexOf('create table if not exists public.portable_jobs'))+1));raw('ALTER TABLE portable_jobs ENABLE ROW LEVEL SECURITY; REVOKE ALL ON portable_jobs FROM anon,authenticated;');
 for(const file of ['20261001120000_phase_l_replay_shadow_evidence.sql','20261001180000_phase_l_validation_server_and_datasets.sql','20261001210000_phase_l_dataset_outcome_integrity.sql','20261001220000_phase_l_outcome_cashflow_integrity.sql'])raw(migration(file));
 const m=migration('20261002120000_phase_m_canonical_reporting_validation.sql');raw(m.slice(m.indexOf('ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS lease_token'),m.indexOf('-- Read-only operator health')));
 raw(migration('20261004120000_phase_m_atomic_evidence_completion.sql'));raw(migration('20261005120000_phase_m_scanner_outcome_atomicity.sql'));raw(migration('20261013120000_phase_p_portable_workers.sql'));

}
