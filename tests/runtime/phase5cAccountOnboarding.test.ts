import assert from 'node:assert/strict';
import fs from 'node:fs';
import { providerEnvironment, safeAccountSummary, verifyProvider } from '../../supabase/functions/_shared/execution-account-onboarding.ts';

const ui=fs.readFileSync('src/pages/admin/Execution.tsx','utf8');
const edge=fs.readFileSync('supabase/functions/execution-account-onboarding/index.ts','utf8');
const sql=fs.readFileSync('supabase/migrations/20260728020000_phase5c_secure_account_onboarding.sql','utf8');
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
const summary=safeAccountSummary({id:'canonical',credential_ref:'12345678-1234-4234-8234-123456789abc',execution_enabled:false});
assert.equal('credential_ref' in summary,false); assert.equal(summary.credentials_configured,true); assert.match(String(summary.masked_credential_reference),/••••56789abc/);

// Transactional RPC performs Vault creation before the row insert; PostgreSQL rolls
// both back on duplicate/insert failure, preventing orphan accounts and secrets.
assert.match(sql,/vault\.create_secret[\s\S]*INSERT INTO public\.connected_execution_accounts/);
assert.match(sql,/RAISE EXCEPTION 'duplicate owned provider account'/);
console.log('Phase 5C secure account onboarding tests passed');
