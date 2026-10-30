import {test} from 'node:test';import assert from 'node:assert/strict';
import {verifyProvider} from '../../supabase/functions/_shared/execution-account-onboarding';
import {providerEnvironmentContract} from '../../supabase/functions/_shared/provider-environment';
import {accountSetupScope,normalizeOnboarding,initialOnboarding} from '../../src/lib/onboardingWorkflow';
test('provider environment chooses a closed native endpoint before credentials are used',async()=>{
 for(const [provider,environment,host] of [['binance','testnet','demo-fapi.binance.com'],['binance','live','fapi.binance.com'],['bybit','demo','api-demo.bybit.com'],['bybit','live','api.bybit.com']] as const){
  const urls:string[]=[];const fetcher:any=async(url:string)=>{urls.push(url);assert.equal(new URL(url).hostname,host);const result=provider==='binance'?{accountAlias:'native',canTrade:true,canWithdraw:false,assets:[],positions:[]}:{retCode:0,result:{userID:'native',permissions:{ContractTrade:['Order']},list:[]}};return new Response(JSON.stringify(result),{status:200})};
  const r=await verifyProvider(provider,environment,{apiKey:'key',apiSecret:'secret'},fetcher);assert.equal(r.environment,environment);assert.equal(r.connection_verified,true);assert.equal(r.withdrawal_permission,false);assert.ok(urls.length>=2);
 }
 await assert.rejects(verifyProvider('binance','demo',{apiKey:'key',apiSecret:'secret'},()=>{throw Error('credentials must not be sent')}),/environment_mismatch/);
 assert.throws(()=>providerEnvironmentContract('bybit','https://attacker.invalid'),/environment_mismatch/);
});
test('one onboarding flow stores live setup independently from existing demo attempts',()=>{
 const demo=normalizeOnboarding({...initialOnboarding,provider:'BINANCE',asset:'CRYPTO',environment:'testnet'}),live=normalizeOnboarding({...demo,environment:'live'});
 assert.equal(demo.environment,'testnet');assert.equal(live.environment,'live');assert.notEqual(accountSetupScope('owner','BINANCE','PERSONAL',demo.environment),accountSetupScope('owner','BINANCE','PERSONAL',live.environment));
});
