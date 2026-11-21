import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runSmoke,smokeMode,liveSmokeConfig,telegramSmoke} from '../../scripts/run_connected_demo_smoke.ts';
import {defaultTierStrategies,requireTradingAdmin,PROP_DEFAULT_EXCLUSIONS} from '../../supabase/functions/_shared/execution-tier-presets.ts';
import {executionStrategyChoices} from '../../supabase/functions/_shared/execution-strategy-selection.ts';
import {customerTradingActionAllowed} from '../../supabase/functions/_shared/customer-trading-access.ts';
import {VIP_CONFIG_IDS,VIP_RISK_FOOTER,assertVipStrategy,vipSetupTag} from '../../supabase/functions/_shared/vip-signal-policy.ts';
import {renderCanonicalVipSignal} from '../../supabase/functions/_shared/telegram-product.ts';

test('Personal defaults use one Crypto core and four Forex/Gold engines; Prop retains its independent reviewed lineup',()=>{
 const personal=defaultTierStrategies('MT5_PERSONAL','demo','PERSONAL');assert.equal(personal.length,4);
 assert.equal(defaultTierStrategies('BINANCE','testnet','PERSONAL').length,1);
 for(const mode of ['PROP_EVALUATION','PROP_FUNDED']){const prop=defaultTierStrategies('MT5_PROP','demo',mode);assert.equal(prop.length,8);for(const id of PROP_DEFAULT_EXCLUSIONS){assert.ok(!prop.includes(id));assert.ok(executionStrategyChoices('MT5_PROP','demo').some(c=>c.id===id));}}
});
test('Admin onboarding and mutation authority remain Admin-only; customer report actions remain readable',()=>{
 requireTradingAdmin('admin');for(const role of ['customer','owner',undefined])assert.throws(()=>requireTradingAdmin(role),/ADMIN_REQUIRED/);
 for(const action of ['admin_apply_tier_preset','admin_account_strategies','connect_crypto_credentials','create_pairing','set_account_control','save_onboarding','acknowledge_risk']){
  assert.equal(customerTradingActionAllowed('admin',action),true);assert.equal(customerTradingActionAllowed('customer',action),false);
 }
 assert.equal(customerTradingActionAllowed('customer','account_detail'),true);
 const edge=readFileSync('supabase/functions/execution-account-onboarding/index.ts','utf8');assert.match(edge,/requireTradingAdmin\(admin\?\.role\)/);
 const authority=readFileSync('supabase/functions/phase-h-authority/index.ts','utf8');assert.match(authority,/profile\?\.role!=='admin'/);assert.match(authority,/admin_apply_tier_preset/);
});
test('VIP filter has eight audited configs, no raw historical rates, true target R and exact footer',()=>{
 assert.equal(VIP_CONFIG_IDS.length,8);assert.throws(()=>assertVipStrategy('forex.native-sweep-retest-60-16-2-5-usdjpy-h72'));
 const card=renderCanonicalVipSignal({signal_id:'test',symbol:'XAUUSD',market:'forex',direction:'BUY',entry_low:100,entry_high:100,stop_loss:90,targets:[115,115],strategy:'gold.native-momentum-15-48-2-5',occurred_at:new Date().toISOString()});
 assert.ok(card.includes(VIP_RISK_FOOTER));assert.match(card,/TP2 canonical target \(1.50R\):/);assert.match(card,/below 3.0R/);assert.doesNotMatch(card,/win.?rate|40\.54%/i);
 assert.match(vipSetupTag('crypto.launch-trend-pullback-48-1.5-5'),/TREND RUNNER/);
});
test('mock executes the real authorization/dispatch functions completely offline',async()=>{
 const result=await runSmoke('mock',{},async()=>{throw Error('NETWORK_MUST_NOT_RUN')});
 assert.equal(result.mode,'mock');assert.equal(result.equity_phase,'PERSONAL_BASE');assert.equal(result.applied_risk_pct,1);assert.equal(result.dispatches[0].state,'SENT');assert.equal(result.telegram.length,2);
});
test('mode parser and live preflight reject missing secrets and accidental destinations',async()=>{
 assert.equal(smokeMode(['--mode=mock']),'mock');assert.throws(()=>smokeMode([]));assert.throws(()=>smokeMode(['--mode=live','--bypass-risk']));
 await assert.rejects(runSmoke('live',{}),/MISSING_SUPABASE_URL/);
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',HASHIBOT_INTERNAL_SECRET:'test',TELEGRAM_BOT_TOKEN:'test',TELEGRAM_VIP_CRYPTO_CHAT_ID:'1',TELEGRAM_VIP_FOREX_GOLD_CHAT_ID:'1',TELEGRAM_FREE_CHAT_ID:'3',SMOKE_ACCOUNTS_FILE:'unused'};
 assert.throws(()=>liveSmokeConfig(env),/DISTINCT_VIP/);
});
test('live branch checks ownership, authorizes, dispatches and observes actual receipts using injected transports',async()=>{
 const selections=[{customerId:'c',accountId:'b',signalId:'s1'},{customerId:'c',accountId:'y',signalId:'s2'},{customerId:'c',accountId:'m',signalId:'s3'}];
 const accounts=selections.map((s,i)=>({id:s.accountId,customer_id:s.customerId,provider:['BINANCE','BYBIT','MT5_PERSONAL'][i],environment:i===0?'testnet':'demo',execution_enabled:true,runtime_control:'START'}));
 const db={from(table:string){const filters:any={};const q:any={select:()=>q,in:()=>q,update:()=>q,eq:(k:string,v:any)=>{filters[k]=v;return q;},then:(yes:any)=>Promise.resolve({data:table==='connected_execution_accounts'?accounts:[],error:null}).then(yes),single:async()=>({data:table==='account_risk_state'?{equity_phase:'PERSONAL_BASE',applied_risk_pct:1,observed_at:new Date().toISOString()}:table==='signals'?{id:filters.id,symbol:filters.id==='s3'?'XAUUSD':'ETHUSDT',market_type:filters.id==='s3'?'forex':'crypto',direction:'BUY',entry_low:100,stop_loss:90,tp1:115,tp2:130,created_at:new Date().toISOString(),strategy_id:filters.id==='s3'?'gold.native-momentum-15-48-2-5':'crypto.complementary-ema-pullback'}:{id:'job'},error:null}),maybeSingle:async()=>({data:{execution_plan_id:'plan',provider_order_id:'observed-provider-order',lifecycle_state:'PROTECTED'},error:null})};return q;}};
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',HASHIBOT_INTERNAL_SECRET:'test',TELEGRAM_BOT_TOKEN:'test',TELEGRAM_VIP_CRYPTO_CHAT_ID:'1',TELEGRAM_VIP_FOREX_GOLD_CHAT_ID:'2',TELEGRAM_FREE_CHAT_ID:'3',SMOKE_ACCOUNTS_FILE:'unused'};
 let authorizations=0;const transport:typeof fetch=async input=>new Response(JSON.stringify(String(input).includes('telegram.org')?{ok:true,result:{message_id:1}}:{success:true,canonical_state:'PROTECTED'}));
 const deps:any={db,selections,authorize:async()=>{authorizations++;return{decision:'ALLOW',id:'decision',execution_plan_id:'plan'};},dispatch:async(_db:any,submit:any)=>{const results=[];for(const s of selections){const receipt=await submit({routing:{environment:'DEMO',account_id:s.accountId},risk_decision:{account:{customer_id:'c'}},execution_plan_id:'plan'},'v1');results.push({id:s.accountId,state:receipt.accepted?'SENT':'FAILED'});}return results;}};
 const result=await runSmoke('live',env,transport,deps);assert.equal(authorizations,3);assert.equal(result.order_receipts.length,3);assert.equal(result.telegram.length,2);
 accounts[0].environment='live';await assert.rejects(runSmoke('live',env,transport,deps),/SANDBOX_REQUIRED/);
});
test('Telegram errors cannot be reported as a delivered message',async()=>{
 await assert.rejects(telegramSmoke(async()=>new Response(JSON.stringify({ok:false}),{status:403}),'test','1',{id:'t',strategy_id:'gold.native-momentum-15-48-2-5',symbol:'XAUUSD',market_type:'forex',direction:'BUY',entry_low:100,stop_loss:90,tp1:115,tp2:130,created_at:new Date().toISOString()},'vip_forex_gold'),/TELEGRAM_DELIVERY_FAILED/);
});
test('editorial SQL enforces durable channel locking, jitter and cooldown under service authority',()=>{
 const sql=readFileSync('supabase/migrations/20261121111114_editorial_channel_spacing_unique.sql','utf8');
 for(const term of ['pg_advisory_xact_lock',"interval '2 hours'","interval '30 minutes'",'random()',"status='processing'",'enable row level security','SERVICE_ROLE_REQUIRED'])assert.ok(sql.includes(term));
});

test('canonical worker defers editorial claims but never applies content cooldown to trade claims',async()=>{
 (globalThis as any).Deno={env:{get:()=>undefined}};
 const {SupabasePublicationStore}=await import('../../supabase/functions/_shared/canonical-publication-runtime.ts');
 const calls:any[]=[];let event='EDITORIAL';let allowed=false;
 const db={rpc:async(name:string,args:any)=>{calls.push({name,args});return{data:name==='claim_signal_publication_work'?[{id:'w',entity_type:'lifecycle_event',entity_id:'e',event_type:event,event_version:1,destination:'vip_crypto',attempt_count:1,lease_token:'lease'}]:name==='reserve_editorial_channel_slot'?{allowed,next_attempt_at:new Date(Date.now()+7200000).toISOString()}:null,error:null};}};
 const store=new SupabasePublicationStore(db);
 store.loadTruth=async()=>({entityType:'lifecycle_event',entityId:'e',eventType:'EDITORIAL',eventVersion:1,occurredAt:new Date().toISOString(),payload:{editorial:{content_id:'i',dedupe_key:'i',content_type:'NEWS_DIGEST',audience:'vip',title:'Macro context',sections:[{body:'Volatility reminder'}],source_type:'APPROVED_INTELLIGENCE',source_ids:['source'],generated_at:new Date().toISOString(),expires_at:new Date(Date.now()+600000).toISOString(),evidence_class:'LIVE',author_type:'SYSTEM',requires_approval:false,approval_state:'NOT_REQUIRED',compliance_state:'APPROVED'}}});
 assert.equal((await store.claim({workerId:'unit',limit:1,leaseSeconds:60,maxAttempts:5})).length,0);
 assert.ok(calls.some(c=>c.name==='finish_signal_publication_work'&&c.args.p_reason==='EDITORIAL_CHANNEL_COOLDOWN'));
 allowed=true;assert.equal((await store.claim({workerId:'unit',limit:1,leaseSeconds:60,maxAttempts:5})).length,1);
 calls.length=0;event='SIGNAL_QUALIFIED';assert.equal((await store.claim({workerId:'unit',limit:1,leaseSeconds:60,maxAttempts:5})).length,1);
 assert.ok(!calls.some(c=>c.name==='reserve_editorial_channel_slot'));
});

test('canonical VIP rendering filters conditional broadcasts and preserves risk footer on each alert',async()=>{
 (globalThis as any).Deno={env:{get:()=>undefined}};
 const {renderCanonicalTruth}=await import('../../supabase/functions/_shared/canonical-publication-runtime.ts');
 const truth:any={entityType:'lifecycle_event',entityId:'e',eventType:'CONDITIONAL_SETUP',eventVersion:1,occurredAt:new Date().toISOString(),payload:{market_type:'forex',policy:'conditional-signals/v1',message:'Watchlist WR: 65% — condition pending',state:{status:'WAITING',strategy:'gold.native-momentum-15-48-2-5'}}};
 const parts=await renderCanonicalTruth(truth,'vip_forex_gold');assert.ok(parts[0].text.includes('Standard Account:'));assert.ok(!parts[0].text.includes('65%'));
 truth.payload.state.strategy='gold.frontier-compression-15-24-1.5-5-h96';assert.throws(()=>renderCanonicalTruth(truth,'vip_forex_gold'),/VIP_STRATEGY_NOT_ADMITTED/);
});

test('approved channel agents wait for the canonical Telegram receipt instead of treating queued as sent',async()=>{
 const {queueApprovedChannelText}=await import('../../supabase/functions/_shared/channel-agent-publication.ts');let sent=false;
 const db={rpc:async()=>({data:'event-id'}),from(table:string){const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:table==='signal_publication_work'?{id:'work',status:sent?'sent':'pending'}:{telegram_message_id:'telegram-id'},error:null})};return q;}};
 const input={identity:'phase-o:approved-text',text:'Approved analysis',audience:'VIP_CRYPTO',draftId:'approved-draft',approvedAt:new Date().toISOString()};
 assert.equal((await queueApprovedChannelText(db,input)).kind,'retry');sent=true;assert.deepEqual(await queueApprovedChannelText(db,input),{kind:'accepted',messageId:'telegram-id'});
});

test('Phase-O retains known queued reasons so content cooldown does not exhaust transport attempts',async()=>{
 const {deliverApproved,approvalBinding}=await import('../../supabase/functions/_shared/phase-o-agents.ts');
 const draft={id:'d',jobId:'j',version:1,content:'Approved channel context',contentHash:'hash',destinationId:'dest'};
 const finished:any[]=[];const store:any={loadDraft:async()=>draft,loadApproval:async()=>({draftId:'d',version:1,bindingHash:await approvalBinding(draft),approvedAt:new Date().toISOString()}),reserveDelivery:async()=>({state:'SEND',reservationId:'r',token:'t'}),finishDelivery:async(...args:any[])=>finished.push(args)};
 const result=await deliverApproved({draftId:'d',store,transport:{send:async()=>({kind:'retry',reason:'CHANNEL_CONTENT_SCHEDULED',retryAfterMs:120000})}});
 assert.equal(result.state,'RETRY');assert.equal(result.reason,'CHANNEL_CONTENT_SCHEDULED');assert.equal(finished[0][2],'RETRY');
});


test('mock drives Growth and Aggressive through canonical account authorization and dispatch without network',async()=>{
 await assert.rejects(runSmoke('live',{SMOKE_PERSONAL_RISK_PROFILE:'GROWTH_2PCT'}),/MOCK_ONLY_RISK_PROFILE_OVERRIDE/);
 for(const [profile,risk] of [['SMART_GROWTH',1.5],['GROWTH_2PCT',2],['AGGRESSIVE_5PCT',5]] as const){const result=await runSmoke('mock',{SMOKE_PERSONAL_RISK_PROFILE:profile},async()=>{throw Error('NETWORK_MUST_NOT_RUN')});assert.equal(result.equity_phase,'PERSONAL_'+profile);assert.equal(result.applied_risk_pct,risk);assert.equal(result.dispatches[0].state,'SENT');}
});
