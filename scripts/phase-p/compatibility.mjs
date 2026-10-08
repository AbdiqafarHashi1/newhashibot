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
 rationale:'Actual compatibility rehearsal proves the INSERT consumes entry_enabled before migration 074 adds it. Copy only the identical additive column declaration from 074 before this first use; retain the original 074 identity and all original seeds. Default false adds no activation.'
}];
export function compatibleSql(path,sql,id){
 if(id!==compatibility.id)throw Error('UNKNOWN_COMPATIBILITY_PATH');
 const repair=compatibilityRepairs.find(r=>r.path===path);if(!repair)return {sql,changed:false};
 if(hash(sql)!==repair.sourceSha256)throw Error('COMPATIBILITY_SOURCE_HASH_MISMATCH');
 if(sql.split(repair.original).length!==repair.occurrences+1)throw Error('COMPATIBILITY_LITERAL_COUNT_MISMATCH');
 const output=sql.replaceAll(repair.original,repair.replacement);
 return {sql:output,changed:true,sourceSha256:hash(sql),executedSha256:hash(output),identity:path,compatibilityId:id};
}
