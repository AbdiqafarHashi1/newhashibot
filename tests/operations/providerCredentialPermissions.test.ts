import {test} from 'node:test';import assert from 'node:assert/strict';import {verifyProvider} from '../../supabase/functions/_shared/execution-account-onboarding';import {verifyAndPersistCustomerCredential} from '../../supabase/functions/_shared/phase-n-customer-credentials';
function bybitFetcher(writes:string[],options:{readonly?:boolean;nativeUID?:boolean;position?:number}={}){return (async(url:any,request:any)=>{
 const u=new URL(String(url));assert.equal(u.origin,'https://api-demo.bybit.com');
 if(request.method==='POST'){writes.push(u.pathname);assert.equal(u.pathname,'/v5/order/cancel-all');assert.ok(request.headers['X-BAPI-SIGN']);assert.deepEqual(JSON.parse(request.body),{category:'linear',settleCoin:'USDT'});return Response.json({retCode:0,result:{list:[]}})}
 if(u.pathname==='/v5/user/query-api')return Response.json(options.nativeUID||options.readonly?{retCode:0,result:{userID:'uid',readOnly:options.readonly?1:0,permissions:{ContractTrade:['Order']}}}:{retCode:10005});
 if(u.pathname.includes('wallet-balance'))return Response.json({retCode:0,result:{list:[{totalInitialMargin:'0'}]}});
 if(u.pathname.includes('position/list'))return Response.json({retCode:0,result:{list:[{size:String(options.position??0)}]}});
 if(u.pathname.includes('order/realtime'))return Response.json({retCode:0,result:{list:[]}});
 return Response.json({retCode:0,result:{marginMode:'REGULAR_MARGIN'}});
 }) as typeof fetch;}
test('opaque Bybit demo keys need explicit consent and native write evidence; no UID, fill or profit is invented',async()=>{
 const writes:string[]=[];const credential={apiKey:'demo-key',apiSecret:'demo-secret'},fetcher=bybitFetcher(writes);
 const pending=await verifyProvider('bybit','demo',credential,fetcher);assert.equal(pending.first_blocker,'DEMO_WRITE_PERMISSION_CONFIRMATION_REQUIRED');assert.equal(pending.trading_permission,false);assert.equal(writes.length,0);
 const checked=await verifyProvider('bybit','demo',{...credential,allowDemoWriteProbe:true},fetcher);assert.equal(checked.identity_kind,'DEMO_CREDENTIAL');assert.match(checked.discovered_account_identity??'',/^demo-key-[a-f0-9]{64}$/);assert.equal(checked.native_account_uid,null);assert.equal(checked.trading_permission,true);assert.equal(checked.withdrawal_permission,false);assert.deepEqual(writes,['/v5/order/cancel-all']);assert.equal(JSON.stringify(checked).includes('demo-secret'),false);
 await assert.rejects(verifyProvider('bybit','demo',{...credential,allowDemoWriteProbe:true},bybitFetcher(writes,{position:1})),/EMPTY_DEDICATED_DEMO/);assert.equal(writes.length,1);
 const readonly=await verifyProvider('bybit','demo',{...credential,allowDemoWriteProbe:true},bybitFetcher(writes,{readonly:true}));assert.equal(readonly.trading_permission,false);assert.equal(readonly.first_blocker,'TRADING_PERMISSION_REQUIRED');assert.equal(writes.length,1);
 let stored:any;const persisted=await verifyAndPersistCustomerCredential({customerId:'customer',accountId:'account',provider:'bybit',environment:'demo',credential,fetcher:bybitFetcher(writes,{nativeUID:true}),store:{async knownBinding(){return {identity:checked.discovered_account_identity!,fingerprint:checked.credential_fingerprint!,kind:'DEMO_CREDENTIAL'}},async persist(x){stored=x;return 'vault-reference'}}});assert.equal(persisted.accountIdentity,checked.discovered_account_identity);assert.equal(stored.verification.identity_kind,'DEMO_CREDENTIAL');assert.equal(JSON.stringify(persisted).includes('demo-secret'),false);
});
test('Binance live verifies key permissions rather than account-level withdrawal status',async()=>{
 let stored=0;const fetcher=(withdraw:boolean)=>(async(url:any)=>{const u=new URL(String(url));if(u.pathname==='/sapi/v1/account/apiRestrictions'){assert.equal(u.hostname,'api.binance.com');return Response.json({enableReading:true,enableFutures:true,enableWithdrawals:withdraw})}assert.equal(u.hostname,'fapi.binance.com');return Response.json({accountAlias:'native-account',assets:[],positions:[],canTrade:true,canWithdraw:true})}) as typeof fetch;
 const input={customerId:'c',accountId:'a',provider:'binance' as const,environment:'live',credential:{apiKey:'key',apiSecret:'secret'},store:{async persist(){stored++;return 'vault-id'}}};
 await assert.rejects(verifyAndPersistCustomerCredential({...input,fetcher:fetcher(true)}),/WITHDRAWAL_PERMISSION_REJECTED/);assert.equal(stored,0);
 const result=await verifyAndPersistCustomerCredential({...input,fetcher:fetcher(false)});assert.equal(result.state,'CONNECTED');assert.equal(stored,1);
});
