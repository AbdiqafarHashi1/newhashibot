import {renderCanonicalTruth} from '../../supabase/functions/_shared/canonical-publication-runtime.ts';
import {evaluateAccountSignal} from '../../supabase/functions/_shared/account-policy-authority.ts';
import {executeAccountEntry} from '../../supabase/functions/_shared/account-execution-controller.ts';
import {DEFAULT_BINANCE_PERSONAL_POLICY} from '../../supabase/functions/_shared/account-execution-brain/contracts.ts';
import {input as accountFixture,eligibility as fixtureEligibility} from '../operations/support/accountPolicyFixture.ts';
import {cryptoSpec} from '../operations/support/planningFixture.ts';
import {bootstrapMissionDatabase} from './mission1-database-fixture.ts';
import {PGlite} from '@electric-sql/pglite';import {test} from 'node:test';import assert from 'node:assert/strict';
import {ConditionalSignalStore,admitConditionalBatch} from '../../supabase/functions/_shared/conditional-signal-runtime.ts';
import {discoverWatchedStrategies} from '../../supabase/functions/_shared/watched-strategy-discovery.ts';
import {watchedStrategyCatalog} from '../../supabase/functions/_shared/watched-strategy-catalog.ts';
import {closedAggregate} from '../../supabase/functions/_shared/regime-opportunities.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
test('real discovery → atomic immediate admission → single measured signal/outbox, replay and rollback',async(t)=>{t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-04T14:00:00Z')});const db=new PGlite();try{
 await bootstrapMissionDatabase(db);
 const now=Date.now(),close=Math.floor(now/300000)*300000,release='11111111-1111-4111-8111-111111111111';
 // Keep a controlled current candle boundary independent of wall-clock test start.
 const rows:StrategyCandle[]=Array.from({length:240},(_,i)=>{const c=1000+i;return {symbol:'BTCUSDT',market_type:'crypto',timeframe:'5m',source:'TEST_ONLY',open_time:new Date(close-(240-i)*300000).toISOString(),open:c-4,high:c+5,low:c-5,close:c,volume:1000};});
 const d=watchedStrategyCatalog([{strategy_name:'MicroScalper',enabled:true,params:{entry_engine_version:1,tp2_r:3}}]).find(d=>d.id==='crypto.micro-scalper')!;
 const cfg={...d.config,config_source:`measured_release:${release}`};
 const definition={...d,config:cfg};
 const assessment=discoverWatchedStrategies({definitions:[definition],symbol:'BTCUSDT',tf:'5m',rows,higher:closedAggregate(rows,15,new Date(close).toISOString()),now:close});
 const setup=assessment.setups[0];assert(setup);assert.equal(setup.status,'ACTIVE');
 await db.query('insert into strategy_release_candidates values($1,$2,$3,$4)',[release,d.id,'PROMOTED',JSON.stringify({strategies:[{id:d.id,version:d.version,enabled:true,minScore:cfg.min_score,minRiskReward:cfg.min_rr,maxBarsInTrade:cfg.max_bars_in_trade,symbols:['BTCUSDT'],timeframes:['5m'],parameters:cfg.params}]})]);
 const legacyRun='22222222-2222-4222-8222-222222222222';
 await db.query("insert into validation_runs(id,mode,status,configuration_hash,immutable_configuration,provenance,outcome_assumptions) values($1,'REPLAY','COMPLETED','test-hash',$2,$3,$4)",[legacyRun,JSON.stringify({strategies:[{id:d.id,parameters:cfg.params}]}),JSON.stringify({start:'2025-01-01T00:00:00Z',end:'2025-01-02T00:00:00Z'}),JSON.stringify({feeBps:10})]);
 await db.exec('set role service_role');
 await assert.rejects(db.query('select assert_measured_strategy_run($1,$2,$3)',[legacyRun,d.id,'test-hash']),/CANONICAL_ENTRY_POLICY_REPLAY_REQUIRED/);

 const adapter={rpc:async(name:string,p:any)=>{if(name==='record_watched_strategy_observations'){await db.query('select record_watched_strategy_observations($1::jsonb)',[JSON.stringify(p.p_rows)]);return {data:null};}const q=name==='admit_conditional_signal_setup'?'select admit_conditional_signal_setup($1::jsonb,$2) ok':'select commit_conditional_signal_setup($1::jsonb,$2,$3) ok';const args=name==='admit_conditional_signal_setup'?[JSON.stringify(p.p_state),p.p_message]:[JSON.stringify(p.p_state),p.p_expected_version,p.p_message];try{return {data:(await db.query<{ok:boolean}>(q,args)).rows[0].ok};}catch(error){return {error};}}};
 const store=new ConditionalSignalStore(adapter);assert.equal((await admitConditionalBatch(store,[setup],now)).admitted,1);
 assert.equal((await admitConditionalBatch(store,[setup],now)).admitted,0);
 assert.equal((await db.query('select * from signals')).rows.length,1);assert.equal((await db.query('select * from test_events')).rows.length,1);
 const link=(await db.query<any>('select * from conditional_execution_links')).rows[0];assert.equal(link.state,'PROJECTED');assert.equal(link.setup_id,setup.id);
 const signal=(await db.query<any>('select * from signals')).rows[0];assert.equal(signal.id,link.signal_id);assert.equal(signal.status,'active');assert.equal(signal.mode_slug,'conditional_execution');
 const event=(await db.query<any>('select payload from test_events')).rows[0].payload;assert.equal(event.confirmed_signal_id,signal.id);assert.equal(event.setup_id,setup.id);assert.equal(event.state.entryDecision.kind,'IMMEDIATE_CONFIRMED');
 // Research admission and account execution do not authorize an excluded VIP strategy.
 assert.throws(()=>renderCanonicalTruth({entityType:'lifecycle_event',entityId:'test-confirmation-event',eventType:'CONDITIONAL_SETUP',eventVersion:1,occurredAt:new Date(now).toISOString(),customerId:null,payload:event},'vip_crypto'),/VIP_STRATEGY_NOT_ADMITTED/);
 const original=accountFixture(),stamp=new Date(now).toISOString(),policy=DEFAULT_BINANCE_PERSONAL_POLICY,eligibility={...fixtureEligibility('CRYPTO_PERSONAL'),market:'CRYPTO' as const};
 const account={...original.account,provider:'BINANCE' as const,policyProfileId:policy.policy_id,policyVersion:policy.policy_version};
 const context={...structuredClone(original.context),provider:'BINANCE' as const,environment:'TESTNET' as const,provider_contract:cryptoSpec('BINANCE'),updated_at:stamp,session_state:{...original.context.session_state,current_time_utc:stamp},runtime_health:{...original.context.runtime_health,last_heartbeat_at:stamp}};
 const customerSignal={signal_id:signal.id,symbol:signal.symbol,market_type:'crypto' as const,direction:'BUY' as const,entry_price:Number(signal.entry_low),stop_loss:Number(signal.stop_loss),tp1:Number(signal.tp1),tp2:Number(signal.tp2),confidence_score:Number(signal.confidence_score),grade:signal.grade,strategy_id:signal.strategy_id,timeframe:signal.timeframe,created_at:stamp};
 const accountInput={signal:customerSignal,account,context,basePolicy:policy,configuration:{preset:'BALANCED' as const,allowedSymbols:['BTCUSDT'],allowedStrategies:[signal.strategy_id]},entitlement:{state:'ACTIVE' as const,expiresAt:new Date(now+86400000).toISOString()},product:'CRYPTO_PERSONAL' as const,eligibility,evaluatedAt:stamp};
 const decision=evaluateAccountSignal(accountInput);assert.equal(decision.decision,'ALLOW',JSON.stringify(decision.reasonCodes));assert.equal(decision.signalId,event.confirmed_signal_id);assert.ok(decision.executionIntent!.approvedQuantity>0);
 const expired=evaluateAccountSignal({...accountInput,entitlement:{state:'EXPIRED',expiresAt:new Date(now-1).toISOString()}});assert.equal(expired.decision,'BLOCK');
 const noCapital=evaluateAccountSignal({...accountInput,context:{...context,free_margin:0}});assert.equal(noCapital.decision,'BLOCK');
 let submissions=0;const receipt=await executeAccountEntry({attempt:'NEW_ENTRY',signalId:signal.id,accountId:account.id,customerId:account.customerId,product:'CRYPTO_PERSONAL',assignedProvider:'BINANCE',requestedProvider:'BINANCE',eligibility,runtimeControl:'START',openPositions:0,pendingOrders:0,duplicateSignalForAccount:false,activeSymbolConflict:false,canonicalRiskApproved:decision.authorizedRiskPct>0,canonicalCapitalApproved:!!decision.executionIntent,accountRuleApproved:true},{submit:async()=>{submissions++;return {simulated:true,signalId:signal.id,quantity:decision.executionIntent!.approvedQuantity,status:'ACCEPTED_SIMULATED'};},emergency:async()=>{},audit:async()=>{}});
 assert.equal(receipt.submitted,true);assert.equal(submissions,1);assert.equal(receipt.providerResult!.signalId,event.confirmed_signal_id);
 await assert.rejects(db.query("select enqueue_canonical_lifecycle_event('forged-free','CONDITIONAL_SETUP',1,null,null,null,null,now(),$1::jsonb,array['free'])",[JSON.stringify({...event,setup_version:999})]),/PERSISTED_FREE_CONDITIONAL_SAMPLE_REQUIRED/);
 assert.equal((await db.query('select * from test_events')).rows.length,1,'failed Free publication rolls its event insert back');
 await assert.rejects(store.save({...setup,version:2,lastBar:new Date(now+300000).toISOString(),watchOutcome:'CONFIRMED',entryDecision:undefined},1),/ENTRY_DECISION_REQUIRED/);
 const forged={...setup,id:'forged',symbol:'ETHUSDT',origin:undefined,entryDecision:undefined};assert.equal(await store.admit(forged),false);
 await db.exec('reset role');await db.query("update strategy_release_candidates set state='REVOKED'");
 // A revoked release may never leave a published actionable signal after projection failure.
 // Same-symbol arbitration would reject admission earlier, so use a cleared fixture ledger.
 await db.exec('delete from conditional_free_samples;delete from conditional_setup_history;delete from conditional_execution_links;delete from conditional_signal_setups;delete from signals;set role service_role;');
 await assert.rejects(store.admit(setup),/CONFIRMED_SIGNAL_PROJECTION_REJECTED/);
 assert.equal((await db.query('select * from conditional_signal_setups')).rows.length,0);
 }finally{await db.close();}});
