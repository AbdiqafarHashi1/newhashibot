import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decideEntry} from '../../supabase/functions/_shared/entry-decision.ts';
import {discoverWatchedStrategies,watchedSetupFromEvaluation} from '../../supabase/functions/_shared/watched-strategy-discovery.ts';
import {watchedStrategyCatalog} from '../../supabase/functions/_shared/watched-strategy-catalog.ts';
import {ProfessionalStrategyRegistry,type StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
import {calculateActiveIndicators} from '../../supabase/functions/_shared/active-validation-runtime.ts';
import {watchedMarketContext} from '../../supabase/functions/_shared/watched-market-context.ts';
import {closedAggregate} from '../../supabase/functions/_shared/regime-opportunities.ts';
import {ConditionalSignalStore} from '../../supabase/functions/_shared/conditional-signal-runtime.ts';
import {watchTrack} from '../../supabase/functions/_shared/conditional-contract.ts';
import {enterConditionalAtOpen} from '../../supabase/functions/_shared/conditional-signal-service.ts';
const now=Date.parse('2026-11-04T14:00:00Z'),w=300000;
function fixture(){
 const rows:StrategyCandle[]=Array.from({length:240},(_,i)=>{const c=1000+i;return{symbol:'BTCUSDT',market_type:'crypto',timeframe:'5m',source:'TEST_ONLY',open_time:new Date(now-(240-i)*w).toISOString(),open:c-4,high:c+5,low:c-5,close:c,volume:1000};});
 const higher=closedAggregate(rows,15,new Date(now).toISOString()),d=watchedStrategyCatalog([{strategy_name:'MicroScalper',enabled:true}]).find(d=>d.id==='crypto.micro-scalper')!;
 const ctx={symbol:'BTCUSDT',market:'crypto' as const,timeframe:'5m',candles:rows,indicators:calculateActiveIndicators(rows),evaluated_at:new Date(now).toISOString(),higher_timeframe_candles:higher};
 const e=new ProfessionalStrategyRegistry([d]).evaluate(ctx)[0],intel=watchedMarketContext(rows,now,{higher}),s=watchedSetupFromEvaluation(e,ctx,intel)!;
 assert(s);return {rows,higher,d,s,intel};
}
test('one shared decision: complete, incomplete, stale, unqualified, cost, chase and arbitration',()=>{
 const {rows,s,intel}=fixture(),price=rows.at(-1)!.close,risk=price*.02;
 const setup={...s,origin:{...s.origin!,plan:{...s.origin!.plan,entry_plan:{...s.origin!.plan.entry_plan,zone:{low:price,high:price}}}},trigger:price,stop:price-risk,tp1:price+risk,tp2:price+2*risk,cost:{price:price*.0001,label:'controlled modeled cost'}};
 const run=(patch:any={})=>decideEntry({setup,rows,now,intelligence:intel,qualified:true,...patch});
 assert.equal(run().kind,'IMMEDIATE_CONFIRMED');
 assert.equal(run({setup:{...setup,trigger:price+risk*.1,origin:{...setup.origin!,plan:{...setup.origin!.plan,entry_plan:{...setup.origin!.plan.entry_plan,zone:{low:price+risk*.05,high:price+risk*.1}}}}}}).kind,'CONDITIONAL_WATCH');
 assert.equal(run({qualified:false}).kind,'NO_TRADE');assert(run({qualified:false}).reasons.includes('UNQUALIFIED_STRATEGY'));
 assert(run({now:now+w}).reasons.includes('STALE_OR_INCOMPLETE_DATA'));
 assert(run({arbitrationAllowed:false}).reasons.includes('ARBITRATION_REJECTED'));
 assert(run({setup:{...setup,tp1:price-1}}).reasons.includes('INVALID_STOP_TARGET_GEOMETRY'));
 assert(run({setup:{...setup,cost:{price:risk,label:'too expensive'}}}).reasons.includes('EXCESSIVE_EXECUTION_COST'));
 assert(run({setup:{...setup,trigger:price-risk*.3}}).reasons.includes('MAXIMUM_ENTRY_CHASE'));
 assert.equal(run({rows:rows.slice(0,-1)}).kind,'NO_TRADE'); // prior candle is stale, not a current confirmation
 const touching=rows.map(b=>({...b}));touching.at(-1)!.close=price-1;
 assert.notEqual(run({rows:touching}).kind,'IMMEDIATE_CONFIRMED');
});
test('actual discovery immediately admits a fully confirmed qualified evaluator; shadow cannot execute',()=>{
 const {rows,higher,d}=fixture(),price=rows.at(-1)!.close,risk=price*.02;
 const evaluator=()=>({status:'candidate' as const,direction:'buy' as const,entry_low:price,entry_high:price,stop_loss:price-risk,tp1:price+risk,tp2:price+2*risk,risk_reward:2,confidence_score:90,grade:'A+' as const,reason:'Controlled evaluator boundary',rejection_reason:'',score_breakdown:{}});
 const definition={...d,config:{...d.config,config_source:'measured_release:controlled-test',params:{...d.config.params,entry_engine_version:1}},evaluate:evaluator};
 const assessment=discoverWatchedStrategies({definitions:[definition],symbol:'BTCUSDT',tf:'5m',rows,higher,now});
 assert.equal(assessment.observations[0].decision,'IMMEDIATE_CONFIRMED');assert.equal(assessment.setups.length,1);assert.equal(assessment.setups[0].status,'ACTIVE');assert.equal(assessment.setups[0].fillAt,new Date(now).toISOString());
 const shadow=discoverWatchedStrategies({definitions:[{...definition,config:{...d.config}}],symbol:'BTCUSDT',tf:'5m',rows,higher,now});
 assert.equal(shadow.observations[0].decision,'NO_TRADE');assert.equal(shadow.setups[0].status,'WAITING');assert.equal(shadow.setups[0].entryDecision?.executionEligible,false);
});
test('all open watches are loaded and expired by CAS without a new candle, including concurrent workers',async()=>{
 const {s}=fixture();let states=[{...s,id:'a',expiresAt:new Date(now-1).toISOString()},{...s,id:'b',expiresAt:new Date(now-1).toISOString()}];let limit=0;
 const db={from:()=>{const q:any={select:()=>q,eq:()=>q,in:()=>q,limit:async(n:number)=>{limit=n;return {data:states.filter(s=>s.status==='WAITING').map(state=>({state}))};}};return q;},rpc:async(_name:string,p:any)=>{const i=states.findIndex(s=>s.id===p.p_state.id);if(states[i].version!==p.p_expected_version)return {data:false};states[i]=p.p_state;return {data:true};}};
 const a=new ConditionalSignalStore(db),b=new ConditionalSignalStore(db);assert.equal((await a.open(s.symbol,s.timeframe)).length,2);assert.equal(limit,100);
 const expired=await Promise.all([a.expire(s.symbol,s.timeframe,now),b.expire(s.symbol,s.timeframe,now)]);assert.equal(expired.reduce((a,b)=>a+b),2);assert(states.every(s=>s.status==='EXPIRED'));
 assert.equal(await a.expire(s.symbol,s.timeframe,now),0);
});
test('swing identity survives a 15m chart and late current-open prices cannot invent fills',()=>{
 assert.equal(watchTrack('15m','crypto.swing-continuation'),'SWING');
 const {s,rows}=fixture(),armed={...s,status:'ARMED' as const,armedAt:new Date(now).toISOString()},bar={...rows.at(-1)!,open_time:new Date(now).toISOString()};
 assert.equal(enterConditionalAtOpen(armed,bar,now+91000).status,'INVALIDATED');
});

test('the real evaluator already confirmed inside its entry zone is not forced to wait for another candle',()=>{
 const {rows,higher}=fixture();
 const d=watchedStrategyCatalog([{strategy_name:'MicroScalper',enabled:true,params:{entry_engine_version:1,tp2_r:3}}]).find(d=>d.id==='crypto.micro-scalper')!;
 const definition={...d,config:{...d.config,config_source:'measured_release:test-only'}};
 // Rebuild the genuine evaluator with its frozen parameters, rather than injecting success.
 const result=discoverWatchedStrategies({definitions:[definition],symbol:'BTCUSDT',tf:'5m',rows,higher,now});
 assert.equal(result.observations[0].decision,'IMMEDIATE_CONFIRMED',JSON.stringify(result.observations));
 assert.equal(result.setups[0].status,'ACTIVE');
});

test('genuine incomplete MicroScalper body persists a frozen watch, then its own evaluator confirms',async()=>{
 const {rows,higher}=fixture();rows.at(-1)!.open=rows.at(-1)!.close-.01;
 const d=watchedStrategyCatalog([{strategy_name:'MicroScalper',enabled:true,params:{entry_engine_version:1,tp2_r:3}}]).find(d=>d.id==='crypto.micro-scalper')!;
 const definition={...d,config:{...d.config,config_source:'measured_release:controlled-conditional'}};
 const found=discoverWatchedStrategies({definitions:[definition],symbol:'BTCUSDT',tf:'5m',rows,higher,now});
 assert.equal(found.observations[0].decision,'CONDITIONAL_WATCH',JSON.stringify(found.observations));
 let s=found.setups[0];assert.equal(s.status,'WAITING');const frozen=structuredClone(s.origin);
 const b={...rows.at(-1)!,open_time:new Date(now).toISOString(),open:s.trigger-1,high:s.trigger+3,low:s.trigger-3,close:s.trigger+1};
 const {observeConditionalSymbol}=await import('../../supabase/functions/_shared/conditional-signal-runtime.ts');
 const {frozenStrategyConfirmation}=await import('../../supabase/functions/_shared/frozen-strategy-confirmation.ts');
 const store={open:async()=>[s],save:async(next:any,expected:number)=>{assert.equal(s.version,expected);s=next;return true;}} as unknown as ConditionalSignalStore;
 await observeConditionalSymbol(store,s.symbol,'5m',[...rows,b],now+w,{qualification:()=>true,intelligence:(prefix,at)=>watchedMarketContext(prefix,at,{higher}),confirmation:(setup,prefix,at)=>frozenStrategyConfirmation(setup,prefix,at,{higher})});
 assert.equal(s.status,'ARMED',s.result);assert.equal(s.entryDecision?.kind,'IMMEDIATE_CONFIRMED');assert.deepEqual(s.origin,frozen);
});

test('current qualification cannot be inherited after revocation, version changes or configuration replacement',async()=>{
 const {rows,higher}=fixture();rows.at(-1)!.open=rows.at(-1)!.close-.01;
 const d=watchedStrategyCatalog([{strategy_name:'MicroScalper',enabled:true,params:{entry_engine_version:1,tp2_r:3}}]).find(d=>d.id==='crypto.micro-scalper')!,definition={...d,config:{...d.config,config_source:'measured_release:qualification-test'}};
 const found=discoverWatchedStrategies({definitions:[definition],symbol:'BTCUSDT',tf:'5m',rows,higher,now});let s=found.setups[0];assert(s);
 const {currentWatchQualification,frozenStrategyConfirmation}=await import('../../supabase/functions/_shared/frozen-strategy-confirmation.ts');
 assert.equal(currentWatchQualification(s,[definition]),true);assert.equal(currentWatchQualification(s,[]),false);
 assert.equal(currentWatchQualification(s,[{...definition,version:'different'}]),false);assert.equal(currentWatchQualification(s,[{...definition,config:{...definition.config,enabled:false}}]),false);
 assert.equal(currentWatchQualification(s,[{...definition,config:{...definition.config,config_source:'measured_release:replacement'}}]),false);
 const bar={...rows.at(-1)!,open_time:new Date(now).toISOString(),open:s.trigger-1,high:s.trigger+3,low:s.trigger-3,close:s.trigger+1};
 const store={open:async()=>[s],save:async(next:any)=>{s=next;return true;}} as unknown as ConditionalSignalStore;
 const {observeConditionalSymbol}=await import('../../supabase/functions/_shared/conditional-signal-runtime.ts');
 await observeConditionalSymbol(store,s.symbol,'5m',[...rows,bar],now+w,{qualification:()=>false,intelligence:(prefix,at)=>watchedMarketContext(prefix,at,{higher}),confirmation:(saved,prefix,at)=>frozenStrategyConfirmation(saved,prefix,at,{higher})});
 assert.equal(s.status,'INVALIDATED');assert.equal(s.fill,undefined);assert(s.result?.includes('CURRENT_STRATEGY_QUALIFICATION_REQUIRED'));
 s={...found.setups[0],status:'ARMED',version:2,lastBar:bar.open_time,armedAt:new Date(now+w).toISOString()};
 const missed={...bar,open_time:new Date(now+w).toISOString(),open:s.trigger};
 await observeConditionalSymbol(store,s.symbol,'5m',[...rows,bar,missed],now+2*w,{qualification:()=>true,intelligence:(prefix,at)=>watchedMarketContext(prefix,at,{higher})});
 assert.equal(s.status,'INVALIDATED');assert.equal(s.fill,undefined);assert.equal(s.exit,undefined);assert(s.result?.includes('MISSED_EXECUTABLE_ENTRY_WINDOW'));

});
