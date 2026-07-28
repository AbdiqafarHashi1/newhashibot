import assert from 'node:assert/strict';
import fs from 'node:fs';
import { providerEnvironment, safeAccountSummary, verifyProvider } from '../../supabase/functions/_shared/execution-account-onboarding.ts';

const ui=fs.readFileSync('src/pages/admin/Execution.tsx','utf8');
const edge=fs.readFileSync('supabase/functions/execution-account-onboarding/index.ts','utf8');
const sql=fs.readFileSync('supabase/migrations/20260728020000_phase5c_secure_account_onboarding.sql','utf8');
const hotfix=fs.readFileSync('supabase/migrations/20260728030000_phase5c_runtime_account_adoption_hotfix.sql','utf8');
const createHotfix=fs.readFileSync('supabase/migrations/20260728040000_phase5c_binance_create_hotfix.sql','utf8');
const workspace=fs.readFileSync('src/pages/admin/ProviderOperationsWorkspace.tsx','utf8');
assert.match(ui,/Add System Account/); assert.match(ui,/Add Customer Account/);
assert.doesNotMatch(ui,/owner UUID|Provider account ID|Vault credential UUID/i,'ordinary UI never asks for internal identifiers');
assert.match(ui,/list_customers/); assert.match(edge,/profiles.*full_name/,'canonical profile selector resolves customers');
assert.match(sql,/owner_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid/,'canonical system owner UUID is generated');
assert.match(sql,/execution_enabled[\s\S]*false/,'creation fixes execution OFF');
assert.match(sql,/vault\.create_secret/); assert.doesNotMatch(sql,/ADD COLUMN[^;]*(api_key|api_secret|passphrase|password|token)/i);
assert.match(sql,/customer_id, provider, environment, provider_account_identity/,'duplicates are owner and environment scoped');
assert.match(sql,/customer_id = v_owner AND provider = p_provider AND environment = p_environment AND is_operational/,'operational update is owner scoped');
assert.match(edge,/finally[\s\S]*credential = null/); assert.doesNotMatch(edge,/console\.(log|error|warn)/,'credentials cannot enter edge logs');
assert.doesNotMatch(edge,/system_secret/,'unsafe fake system-secret adoption is absent');
assert.match(edge,/POST_CREATE_ACCOUNT_READ_FAILED/,'missing row produces a specific safe failure');
assert.match(edge,/POST_CREATE_STATE_MISMATCH/,'persisted state must match the requested contract');
assert.match(edge,/\.eq\("id", accountId\)\.maybeSingle/,'creation is followed by canonical ID re-read');
assert.match(edge,/status: "ACCOUNT_CREATED"/,'success is emitted only after persisted truth checks');
assert.match(ui,/data\.raw\?\.responseBody/,'manager unwraps the operator envelope before refetch display');
assert.match(ui,/Designate operational/); assert.match(ui,/await load\(\);setNotice/,'success banner follows refetch');
assert.match(workspace,/providerAccounts\.find\(row => row\.is_operational\) \?\? providerAccounts\.find\(row => row\.enabled\)/,'selectable non-operational fallback remains visible');
assert.match(workspace,/OPERATIONAL ACCOUNT \{canonicalAccount\.is_operational \? 'DESIGNATED' : 'NOT DESIGNATED'\}/);
assert.match(hotfix,/customer_id = auth\.uid\(\) OR COALESCE\(public\.is_admin\(\), false\)/,'admin RLS reads canonical system accounts');
assert.match(hotfix,/p_selectable,p_monitor_enabled,p_operational,false/,'explicit operational state is preserved and execution remains off');
assert.match(hotfix,/customer_id=v_owner AND provider=lower\(p_provider\) AND environment=lower\(p_environment\)/,'operational designation scope vocabulary is canonical');

assert.equal(providerEnvironment('binance'),'testnet'); assert.equal(providerEnvironment('bybit'),'demo');
await assert.rejects(()=>verifyProvider('binance','demo',{apiKey:'x',apiSecret:'y'}),/provider_environment_mismatch/);
await assert.rejects(()=>verifyProvider('bybit','testnet',{apiKey:'x',apiSecret:'y'}),/provider_environment_mismatch/);

const binanceFetch:typeof fetch=async(input)=>{
  const url=String(input); if(url.includes('openOrders')) return new Response('[]',{status:200});
  return new Response(JSON.stringify({accountAlias:'TEST_ACCOUNT_42',canTrade:true,assets:[],positions:[]}),{status:200});
};
const verified=await verifyProvider('binance','testnet',{apiKey:'not-an-identity',apiSecret:'secret'},binanceFetch);
assert.equal(verified.discovered_account_identity,'TEST_ACCOUNT_42'); assert.equal(verified.connection_verified,true);
assert.equal(JSON.stringify(verified).includes('not-an-identity'),false,'credentials are never returned');
const fallback=await verifyProvider('binance','testnet',{apiKey:'also-not-an-identity',apiSecret:'secret'},async(input)=>String(input).includes('openOrders')?new Response('[]',{status:200}):new Response(JSON.stringify({canTrade:true,assets:[],positions:[]}),{status:200}));
assert.equal(fallback.connection_verified,true); assert.equal(fallback.first_blocker,null);
assert.equal(fallback.discovered_account_identity,'canonical:binance:testnet:system');
assert.match(fallback.warnings[0],/safe canonical fallback used/i);
assert.equal(JSON.stringify(fallback).includes('also-not-an-identity'),false);
const invalid=await verifyProvider('binance','testnet',{apiKey:'invalid',apiSecret:'invalid'},async()=>new Response('{}',{status:401}));
assert.equal(invalid.connection_verified,false); assert.match(invalid.first_blocker!,/BINANCE_AUTH_OR_ACCOUNT_READ_FAILED/);
const summary=safeAccountSummary({id:'canonical',credential_ref:'12345678-1234-4234-8234-123456789abc',execution_enabled:false});
assert.equal('credential_ref' in summary,false); assert.equal(summary.credentials_configured,true); assert.match(String(summary.masked_credential_reference),/••••56789abc/);

// Transactional RPC performs Vault creation before the row insert; PostgreSQL rolls
// both back on duplicate/insert failure, preventing orphan accounts and secrets.
assert.match(sql,/vault\.create_secret[\s\S]*INSERT INTO public\.connected_execution_accounts/);
assert.match(sql,/RAISE EXCEPTION 'duplicate owned provider account'/);
assert.match(createHotfix,/account_id = 'canonical:binance:testnet:system'/,'the exact legacy colon constraint failure is narrowly repaired');
assert.match(createHotfix,/SYSTEM_ACCOUNT_ALREADY_EXISTS[\s\S]*duplicate_check/,'Binance system duplicate check happens explicitly before creation');
assert.match(createHotfix,/vault\.create_secret[\s\S]*INSERT INTO public\.connected_execution_accounts/,'Vault write precedes the canonical insert');
assert.match(createHotfix,/EXCEPTION WHEN SQLSTATE 'P0002'[\s\S]*CANONICAL_ACCOUNT_INSERT_FAILED/,'insert failure rolls its containing Vault subtransaction back');
assert.match(createHotfix,/p_selectable,[\s\S]*p_monitor_enabled,p_operational,false/,'submitted selectable, monitor and operational intent is preserved while execution stays off');
assert.match(createHotfix,/execution_account_onboarding_diagnostics[\s\S]*safe_error_code[\s\S]*failing_stage[\s\S]*owner_classification[\s\S]*canonical_account_id[\s\S]*occurred_at/,'redacted diagnostic contract is durable');
const diagnosticDefinition=createHotfix.match(/CREATE TABLE IF NOT EXISTS public\.execution_account_onboarding_diagnostics \([\s\S]*?\);/)?.[0]??'';
assert.doesNotMatch(diagnosticDefinition,/(api_key|api_secret|p_secret_json)/i,'diagnostics never contain credentials');
assert.match(edge,/existing_account/,'duplicate response carries safe refresh metadata');
assert.match(edge,/rollback_onboarded_execution_account/g,'post-create validation failures remove both partial resources');
assert.match(createHotfix,/rollback_onboarded_execution_account[\s\S]*DELETE FROM public\.connected_execution_accounts[\s\S]*vault\.delete_secret/,'cleanup removes the canonical row and its opaque Vault secret atomically');
assert.match(ui,/SYSTEM_ACCOUNT_ALREADY_EXISTS[\s\S]*await load\(\)/,'duplicate response refreshes canonical state without clearing the verified form');
assert.doesNotMatch(edge,/console\.(log|error|warn)/,'raw credentials are never logged');
assert.doesNotMatch(edge,/placeOrder|\/order/i,'onboarding never invokes an order endpoint');
console.log('Phase 5C secure account onboarding tests passed');
