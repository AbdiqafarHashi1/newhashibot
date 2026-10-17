import {test} from 'node:test';import assert from 'node:assert/strict';
import {verifyAndPersistCustomerCredential} from '../../supabase/functions/_shared/phase-n-customer-credentials';
test('Binance customer setup resolves the native balance accountAlias when the account endpoint omits it',async()=>{
 const hosts:string[]=[],paths:string[]=[];let stores=0;
 const fetcher=(async(url:any)=>{const u=new URL(String(url));hosts.push(u.hostname);paths.push(u.pathname);assert.ok(u.searchParams.get('signature'));assert.ok(u.searchParams.get('timestamp'));
  return Response.json(u.pathname==='/fapi/v2/account'?{assets:[],positions:[],canTrade:true,canWithdraw:false}:u.pathname==='/fapi/v3/balance'?[{asset:'USDT',accountAlias:'native-customer-001'}]:[]);
 }) as typeof fetch;
 const result=await verifyAndPersistCustomerCredential({customerId:'customer',accountId:'account',provider:'binance',environment:'testnet',credential:{apiKey:'fixture-key',apiSecret:'fixture-secret'},fetcher,store:{async persist(input){stores++;assert.equal(input.verification.discovered_account_identity,'native-customer-001');return'vault-id'}}});
 assert.equal(result.state,'CONNECTED');assert.equal(stores,1);assert.ok(paths.includes('/fapi/v3/balance'));assert.ok(hosts.every(host=>host==='demo-fapi.binance.com'));assert.equal(JSON.stringify(result).includes('fixture-secret'),false);
});
test('contradictory native balance identities cannot create a shared or guessed customer binding',async()=>{
 let stores=0;await assert.rejects(verifyAndPersistCustomerCredential({customerId:'customer',accountId:'account',provider:'binance',environment:'testnet',credential:{apiKey:'key',apiSecret:'secret'},fetcher:(async(url:any)=>Response.json(String(url).includes('/account?')?{assets:[],positions:[],canTrade:true,canWithdraw:false}:String(url).includes('/balance?')?[{accountAlias:'one'},{accountAlias:'two'}]:[])) as typeof fetch,store:{async persist(){stores++;return'never'}}}),/IDENTITY_UNVERIFIED/);assert.equal(stores,0);
});
