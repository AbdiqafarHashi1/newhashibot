import {hash} from './sql-inventory.mjs';
export const compatibility={
 id:'deployment-compatibility-v1',
 path:'supabase/migrations/20260530170000_020_c2_forex_signal_mode_parity.sql',
 sourceSha256:'eecd345c6e9e21e872ff7c31b4ae8abef38ef18830052e6b356c2bd9eba14f19',
 prerequisite:'public.scanner_config.active_timeframes is text[] (migration 002)',
 original:`active_timeframes = '["5m","15m","1h","4h"]'::jsonb`,
 replacement:`active_timeframes = ARRAY['5m','15m','1h','4h']::text[]`,
 rationale:'The unchanged chain fails before any forward migration can run. Preserve the existing column type and identical timeframe values; only correct the incompatible literal type.',
 onlineExecution:'NOT_IMPLEMENTED; separately reviewed per-file compatibility execution and migration-content reconciliation required',
 activation:'No activation; unchanged surrounding seed operations must still be reviewed'
};
export const compatibilityRepairs=[{...compatibility,table:'scanner_config',column:'active_timeframes',type:'text[]',occurrences:1},{
 id:compatibility.id,path:'supabase/migrations/20260605093000_038_end_to_end_strategy_scanner_parity_repair.sql',sourceSha256:'e24bbc78e80164fc7d3568be2696bb9050973492942f40036599949fc1eaad74',table:'strategy_configs',column:'allowed_timeframes',type:'jsonb',occurrences:2,
 original:"allowed_timeframes = ARRAY['15m','1h']",replacement:`allowed_timeframes = '["15m","1h"]'::jsonb`,
 rationale:'The separately executed compatibility chain proves text[] literals cannot be assigned to the JSONB column established by migration 007. Preserve the two identical timeframe arrays and every other strategy setting.'
},{id:compatibility.id,path:'supabase/migrations/20260608120000_046_b6_real_binance_futures_bot_lifecycle.sql',sourceSha256:'c2f94fe052673d19e8355974ac2ffe01581e40dc84b4f6b7d1378dc2d1a79b58',routine:'admin_reset_trading_history',returnType:'TABLE(table_name text, deleted_count bigint)',occurrences:1,
 original:'CREATE OR REPLACE FUNCTION public.admin_reset_trading_history()',replacement:'DROP FUNCTION public.admin_reset_trading_history();\nCREATE OR REPLACE FUNCTION public.admin_reset_trading_history()',
 rationale:'Rehearsal proves migration 046 cannot replace the table-returning zero-argument routine from 027/031 with JSONB. Drop only that exact signature, without CASCADE, within the same transaction; preserve the intended existing body and explicit service-role-only grants. No reset routine is invoked and no data is deleted.'
},{id:compatibility.id,path:'supabase/migrations/20260616090000_050_provider_neutral_bybit_dynamic_scanner.sql',sourceSha256:'0dd3aec7c87e3af5bacee5602b1892bed1031ef3d0e23a90a5784d79078c360a',table:'execution_provider_controls',column:'entry_enabled',type:'boolean',allowAbsent:true,occurrences:1,
 original:'ALTER TABLE public.scanner_config\n',replacement:'ALTER TABLE public.execution_provider_controls ADD COLUMN IF NOT EXISTS entry_enabled boolean NOT NULL DEFAULT false;\n\nALTER TABLE public.scanner_config\n',
 additionalLiterals:['configured','monitor_pending','placeholder'].map(status=>({original:`'${status}', '{`,replacement:`'disconnected', '{`})),
 rationale:'Status is operational health, not setup stage: 072 already seeds all providers and 050 conflict updates deliberately preserve their status. Use the disconnected default for hypothetical inserts, retaining every existing status, seed metadata and constraint. Actual compatibility rehearsal proves the INSERT consumes entry_enabled before migration 074 adds it. Copy only the identical additive column declaration from 074 before this first use; retain the original 074 identity and all original seeds. Default false adds no activation.'
},{id:compatibility.id,path:'supabase/migrations/20260622153740_088_trade_management_truth_table.sql',sourceSha256:'00b066bfb16c89d6da555d5b122d73e1a85fbb797263f7d7f0d67408aeafc68b',table:'trade_management_truth',column:'provider',type:'text',occurrences:1,
 original:'ALTER TABLE public.trade_management_truth ENABLE ROW LEVEL SECURITY;',
 replacement:`ALTER TABLE public.trade_management_truth
 ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN IF NOT EXISTS direction text,
 ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unknown',
 ADD COLUMN IF NOT EXISTS quantity numeric,
 ADD COLUMN IF NOT EXISTS leverage numeric,
 ADD COLUMN IF NOT EXISTS sl_price numeric,
 ADD COLUMN IF NOT EXISTS tp1_price numeric,
 ADD COLUMN IF NOT EXISTS tp2_price numeric,
 ADD COLUMN IF NOT EXISTS monitor_run_id text,
 ADD COLUMN IF NOT EXISTS notes text;
UPDATE public.trade_management_truth SET direction=side WHERE direction IS NULL;
UPDATE public.trade_management_truth SET quantity=qty WHERE quantity IS NULL;
ALTER TABLE public.trade_management_truth ENABLE ROW LEVEL SECURITY;`,
 rationale:'075 already creates the canonical composite-key truth table. IF NOT EXISTS in 088 does not add its newer columns. Add only absent fields, keep the existing key/checks/RLS and existing values. Unknown status explicitly represents absent historical evidence; direction and quantity derive from retained side/qty. Later account-ownership migration retains its primary-key replacement authority.'

},{id:compatibility.id,path:'supabase/migrations/20260708000000_092_retention_batch_cleanup_and_runtime_stability.sql',sourceSha256:'cb18a9c14b8c35f2827a89b6e01218f36cba7063da28ce6c4e7b6152f66d4853',table:'candles',column:'open_time',type:'timestamp with time zone',occurrences:1,
 original:'idx_candles_timestamp ON public.candles(timestamp)',replacement:'idx_candles_timestamp ON public.candles(open_time)',
 rationale:'001 uses open_time, not timestamp; the same 092 retention RPC already selects open_time as its candle fallback. Keep the index identity and retention behavior, pointing at the actual authoritative candle time.'

},{id:compatibility.id,path:'supabase/migrations/20260708160000_097_crypto_execution_protection_closeout.sql',sourceSha256:'3c842ccdafcc6eabb9b41d9226b3859298f120f00095a12eca23b404d7e8948f',table:'trade_management_truth',column:'provider',type:'text',occurrences:1,
 original:'REVOKE EXECUTE ON FUNCTION public.upsert_trade_management_truth FROM anon;',
 replacement:'REVOKE EXECUTE ON FUNCTION public.upsert_trade_management_truth(uuid,text,text,text,text,text,text,boolean,boolean,boolean,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,integer,text,text,text) FROM anon;',
 rationale:'088 leaves a 19-argument overload; this migration creates a 23-argument overload. The unqualified REVOKE is ambiguous. Revoke the precise newly defined signature; later 097 catch-up retains its explicit obsolete-overload DROP and final grants.'

},{id:compatibility.id,path:'supabase/migrations/20260710230322_20260710120000_097_runtime_monitor_schema_catchup.sql.sql',sourceSha256:'8ff25f4a8d3a179a94b0bb74980a65fff467bcd8a891a3088cddc94b2a91b897',table:'problem_symbol_quarantine',column:'provider',type:'text',occurrences:1,
 original:'ALTER TABLE public.problem_symbol_quarantine ENABLE ROW LEVEL SECURITY;',
 replacement:`DO $bootstrap$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.problem_symbol_quarantine'::regclass AND attname='occurrence_count' AND NOT attisdropped) THEN
  ALTER TABLE public.problem_symbol_quarantine ADD COLUMN occurrence_count integer NOT NULL DEFAULT 1;
  UPDATE public.problem_symbol_quarantine SET occurrence_count=failure_count;
 END IF;
END $bootstrap$;
DO $overload$ DECLARE definition text; body text; acl aclitem[]; owner_name text; BEGIN
 SELECT pg_get_functiondef(oid),prosrc,proacl,pg_get_userbyid(proowner) INTO definition,body,acl,owner_name FROM pg_proc WHERE oid='public.record_symbol_failure(text,text,text,jsonb,integer,integer)'::regprocedure;
 IF position('p_metadata jsonb DEFAULT ''{}''::jsonb' in definition)=0 THEN RAISE EXCEPTION 'QUARANTINE_OVERLOAD_DEFAULT_PRECONDITION_FAILED'; END IF;
 IF acl IS NOT NULL OR owner_name<>current_user THEN RAISE EXCEPTION 'QUARANTINE_OVERLOAD_OWNER_OR_CUSTOM_ACL_REVIEW_REQUIRED'; END IF;
 DROP FUNCTION public.record_symbol_failure(text,text,text,jsonb,integer,integer);
 EXECUTE replace(definition,'p_metadata jsonb DEFAULT ''{}''::jsonb','p_metadata jsonb');
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.record_symbol_failure(text,text,text,jsonb,integer,integer)'::regprocedure AND (prosrc IS DISTINCT FROM body OR proacl IS DISTINCT FROM acl)) THEN RAISE EXCEPTION 'QUARANTINE_OVERLOAD_BODY_OR_GRANTS_CHANGED'; END IF;
END $overload$;
ALTER TABLE public.problem_symbol_quarantine ADD COLUMN IF NOT EXISTS resolved boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.execution_provider_controls ADD COLUMN IF NOT EXISTS provider text GENERATED ALWAYS AS (provider_name) STORED, ADD COLUMN IF NOT EXISTS subsystem text;
ALTER TABLE public.problem_symbol_quarantine ENABLE ROW LEVEL SECURITY;`,
 rationale:'085 quarantine and 072 provider controls exist already. Add the exact absent resolution fields required by the partial index and occurrence_count required by the retained RPC, deriving initial counts from existing failure_count without overwriting a pre-existing counter. The provider index uses a stored read-only alias of canonical provider_name and a nullable unknown subsystem; keep original provider key, flags and status checks. Drop/recreate only the exact six-argument signature without CASCADE in the same transaction, removing its overlapping metadata default so the published three-argument signature is callable; metadata-bearing four/six-argument Edge callers and trailing defaults remain intact. Require the original owner/current role and default ACL; verify identical stored body and ACL. Custom ownership/grants or dependencies refuse rather than losing privileges. No new subsystem authority or runtime activation.'

},{id:compatibility.id,path:'supabase/migrations/20260902120000_102_prop_personal_execution_mode_and_scanner_combined.sql',sourceSha256:'a59814e9f41fbf68e9ccb9236c61bf9ee51ec26ce023d121e33b04fb0ff0c1ff',table:'scanner_config',column:'scan_forex_enabled',type:'boolean',occurrences:1,
 original:'DO $$',replacement:'ALTER TABLE public.scanner_config ADD COLUMN IF NOT EXISTS signal_enable_forex boolean NOT NULL DEFAULT false;\nDO $$',
 rationale:'102 updates a column that no earlier automatic migration creates. Add the exact boolean flag with a disabled default before the existing update; preserve the original seed and the scanner environment/execution gates. No scanner or schedule is invoked.'

},{id:compatibility.id,path:'supabase/migrations/20260926210000_phase_h_completion.sql',sourceSha256:'35fe4bab6c4a1b51d0317427ab79cf03702381dacb04c0f3d5f9e451510d4167',table:'connected_execution_accounts',column:'provider',type:'text',occurrences:1,
 original:'runtime_control,phase_h_asset_class,phase_h_readiness,phase_h_readiness_reasons,phase_h_certification_status,created_at,updated_at',
 replacement:'runtime_control,created_at,updated_at,phase_h_asset_class,phase_h_readiness,phase_h_readiness_reasons,phase_h_certification_status',
 rationale:'CREATE OR REPLACE VIEW must retain every existing output name/type/order and append new fields. Keep all selected values, security_invoker, grants and dependent views; append Phase-H fields after existing timestamps rather than dropping/renaming the view.'

},{id:compatibility.id,path:'supabase/migrations/20261003120000_phase_m_lifecycle_publication_and_edits.sql',sourceSha256:'c2e81cc86960bca5fe04decfb805b1650de04b54afee930a036b9d5fbc97d25d',table:'signal_publication_work',column:'id',type:'uuid',occurrences:1,
 original:'w.destination,w.customer_id,w.status',replacement:'w.destination,w.status',
 additionalLiterals:[{original:"AS dead_parts,count(*) FILTER(WHERE p.operation='EDIT')",replacement:"AS dead_parts,w.customer_id,count(*) FILTER(WHERE p.operation='EDIT')"}],
 rationale:'Phase M reporting view exists already. Append customer_id and edit_parts after all existing columns; retain grouping, values, invoker security, grants and all canonical publication RPCs/triggers.'

},{id:compatibility.id,path:'supabase/migrations/20261009120000_phase_n_certification_atomicity.sql',sourceSha256:'761bcfbe821f78cb3f3d54e7e2c6de7e4bb7275ab0b6109cb7c9f0a8f11b0a33',table:'phase_n_operations_commands',column:'id',type:'uuid',occurrences:1,
 original:"provider is distinct from case when lower(a.provider)='mt5' and upper(a.account_mode) like 'PROP%' then 'MT5_PROP' when lower(a.provider)='mt5' then 'MT5_PERSONAL' else upper(a.provider) end then",
 replacement:"provider is distinct from (case when lower(a.provider)='mt5' and upper(a.account_mode) like 'PROP%' then 'MT5_PROP' when lower(a.provider)='mt5' then 'MT5_PERSONAL' else upper(a.provider) end) then",
 rationale:'The PL/pgSQL IF parser terminates the unparenthesized CASE at its first THEN. Parenthesize the scalar CASE expression only; preserve every canonical Phase-D/G/provider/entitlement gate, lock, RPC signature and service-role grant.'

},{id:compatibility.id,path:'supabase/migrations/20261012120000_phase_o_completion_controls.sql',sourceSha256:'a595bb10d9d59b48b736cb1d53b7de31769cc4188aaf1911c4dc3e5f845d5638',table:'phase_o_attribution_events',column:'id',type:'uuid',occurrences:1,
 original:"count(distinct customer_id)filter(where event_type='ENROLLMENT')enrollments,",replacement:'',
 additionalLiterals:[{original:"vip_crypto_members,count(distinct customer_id)filter(where event_type='RENEWED')",replacement:"vip_crypto_members,count(distinct customer_id)filter(where event_type='ENROLLMENT')enrollments,count(distinct customer_id)filter(where event_type='RENEWED')"}],
 rationale:'Append enrollments, renewals and churn after every original funnel field, preserving all metrics, invoker security, grants, approval fences and dormant agent controls.'

}];
export function compatibleSql(path,sql,id){
 if(id!==compatibility.id)throw Error('UNKNOWN_COMPATIBILITY_PATH');
 const repair=compatibilityRepairs.find(r=>r.path===path);if(!repair)return {sql,changed:false};
 if(hash(sql)!==repair.sourceSha256)throw Error('COMPATIBILITY_SOURCE_HASH_MISMATCH');
 if(sql.split(repair.original).length!==repair.occurrences+1)throw Error('COMPATIBILITY_LITERAL_COUNT_MISMATCH');
 let output=sql.replaceAll(repair.original,()=>repair.replacement);
 for(const literal of repair.additionalLiterals??[]){if(output.split(literal.original).length!==2)throw Error('COMPATIBILITY_LITERAL_COUNT_MISMATCH');output=output.replace(literal.original,()=>literal.replacement);}
 return {sql:output,changed:true,sourceSha256:hash(sql),executedSha256:hash(output),identity:path,compatibilityId:id};
}
