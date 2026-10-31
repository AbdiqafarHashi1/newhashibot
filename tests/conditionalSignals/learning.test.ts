import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyPaperLearning,assessPaperLearning,loadPaperLearning,paperLearningKey,type PaperLearningSnapshot} from '../../supabase/functions/_shared/paper-learning.ts';
import {selectConditionalSetup,advanceConditionalSetup,type ConditionalSetup} from '../../supabase/functions/_shared/conditional-signal-service.ts';
import {watchedMarketContext} from '../../supabase/functions/_shared/watched-market-context.ts';
import {discoverWatchedStrategies} from '../../supabase/functions/_shared/watched-strategy-discovery.ts';
import {watchedStrategyCatalog} from '../../supabase/functions/_shared/watched-strategy-catalog.ts';
import {closedAggregate} from '../../supabase/functions/_shared/regime-opportunities.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
const now=Date.parse('2026-10-30T12:00:00Z'),DAY=86400000;
const iso=(t:number)=>new Date(t).toISOString();
function setup(patch:Partial<ConditionalSetup>={}):ConditionalSetup {
 return {id:'new',symbol:'BTCUSDT',market:'crypto',strategy:'crypto.conditional-intraday',variant:'TREND_PULLBACK',
  policy:'conditional-signals/v1',timeframe:'15m',track:'INTRADAY',side:'buy',source:'FIXTURE',
  sourceClose:iso(now),lastBar:iso(now-900000),trigger:100,stop:90,tp1:110,tp2:120,
  score:85,reason:'test setup',expiresAt:iso(now+3600000),holdBars:48,status:'WAITING',version:1,
  cost:{price:.25,label:'Fixture modeled round-trip costs'},...patch};
}
function history(base=setup(),returns:number[]=Array(30).fill(1)):PaperLearningSnapshot {
 return {available:true,asOf:now,reason:'complete fixture',rows:returns.map((netR,i)=>({
  created_at:iso(now-DAY*2),updated_at:iso(now-DAY+900000),
  state:{...structuredClone(base),id:`past-${i}`,status:'CLOSED',fill:100,fillAt:iso(now-DAY-900000),
   lastBar:iso(now-DAY),netR,result:netR>0?'TP2':'STOP',version:4}
 }))};
}
test('cold start and small samples never invent learned performance or change plan levels',()=>{
 const original=setup(),before=structuredClone(original);
 const cold=applyPaperLearning(original,history(original,[]),now);
 assert.equal(cold.learning!.status,'COLLECTING');assert.equal(cold.learning!.meanNetR,null);assert.equal(cold.selectionScore,85);
 const few=applyPaperLearning(original,history(original,[3,3,3]),now);
 assert.equal(few.learning!.adjustment,0);assert.equal(few.learning!.closed,3);
 assert.deepEqual(original,before);assert.equal(few.stop,original.stop);assert.equal(few.tp2,original.tp2);
});
test('cost-adjusted wins AND losses change future arbitration priority within five points',()=>{
 const original=setup(),good=applyPaperLearning(original,history(original),now);
 assert.equal(good.learning!.status,'ADAPTING');assert(good.selectionScore!>85&&good.selectionScore!<=90);
 const bad=applyPaperLearning(original,history(original,Array(30).fill(-1.2)),now);
 assert(bad.selectionScore!<85);assert.equal(bad.learning!.losses,30);assert.equal(bad.score,85);
 const alternative=setup({id:'alternative',score:86});
 assert.equal(selectConditionalSetup([good,alternative],now)!.id,good.id);
 assert.equal(selectConditionalSetup([bad,alternative],now)!.id,'alternative');
 const huge=applyPaperLearning(original,history(original,Array(100).fill(1000)),now);
 assert(huge.learning!.adjustment<=5);assert.equal(huge.learning!.meanNetR,1000);
});
test('learning isolates asset, settings, strategy, timeframe, track, source, direction, costs and volatility band',()=>{
 const s=setup(),h=history(s);
 for(const changed of [{symbol:'ETHUSDT'},{strategy:'crypto.other'},{timeframe:'1h',track:'SWING'},
  {side:'sell'},{source:'OTHER_VENUE'},{variant:'RANGE_REJECTION'},
  {cost:{price:.3,label:'Other costs'}},{intelligence:{volatility:{band:'HIGH'}}}] as Partial<ConditionalSetup>[]){
  assert.notEqual(paperLearningKey(s),paperLearningKey(setup(changed)));
  assert.equal(assessPaperLearning(setup(changed),h,now).closed,0);
 }
 const native=setup({origin:{version:'v1',plan:{provenance:{config_hash:'a'}}} as any});
 const changed=setup({origin:{version:'v1',plan:{provenance:{config_hash:'b'}}} as any});
 assert.equal(assessPaperLearning(changed,history(native),now).closed,0);
 const version=setup({origin:{version:'v2',plan:{provenance:{config_hash:'a'}}} as any});
 assert.equal(assessPaperLearning(version,history(native),now).closed,0);
});
test('pending, source gaps, missing costs, future closes and no-entry events cannot become wins',()=>{
 const s=setup(),h=history(s);
 const pending=history(s).rows.map((r,i)=>({...r,state:{...r.state,id:`pending-${i}`,status:'DATA_GAP' as const}}));
 const incomplete=assessPaperLearning(s,{...h,rows:[...h.rows,...pending]},now);
 assert.equal(incomplete.closed,30);assert.equal(incomplete.unresolved,30);assert.equal(incomplete.adjustment,0);
 const future={...h,rows:h.rows.map(r=>({...r,state:{...r.state,lastBar:iso(now)}}))};
 assert.equal(assessPaperLearning(s,future,now).closed,0);
 const noEntry={...h,rows:h.rows.map(r=>({...r,state:{...r.state,status:'EXPIRED' as const,fill:undefined}}))};
 const counted=assessPaperLearning(s,noEntry,now);assert.equal(counted.noEntry,30);assert.equal(counted.closed,0);
 assert.equal(assessPaperLearning(s,{...h,asOf:now+1},now).status,'UNAVAILABLE');
 assert.equal(assessPaperLearning(s,h,now+300001).status,'UNAVAILABLE');
});
test('durable complete snapshots survive restarts; errors, truncation, duplicates and stale snapshots keep baseline',async()=>{
 const s=setup(),h=history(s),payload={rows:h.rows,total:h.rows.length,observed_at:iso(now)};
 const db=(data:any,error:any=null)=>({rpc:async(name:string,args:any)=>{assert.equal(name,'conditional_proof_cohort');assert.equal(Date.parse(args.p_end)-Date.parse(args.p_start),30*DAY);return {data,error};}});
 const a=await loadPaperLearning(db(payload),now),b=await loadPaperLearning(db(structuredClone(payload)),now);
 assert.deepEqual(applyPaperLearning(s,a,now),applyPaperLearning(s,b,now));
 for(const invalid of [{...payload,total:999},{...payload,rows:[...h.rows,h.rows[0]],total:31},
  {...payload,observed_at:iso(now-120000)},{...payload,total:10001,rows:Array(10001).fill(h.rows[0])}]){
  const snapshot=await loadPaperLearning(db(invalid),now);assert.equal(snapshot.available,false);
  assert.equal(applyPaperLearning(s,snapshot,now).selectionScore,s.score);
 }
 assert.equal((await loadPaperLearning(db(null,'offline'),now)).available,false);
});
function candles():StrategyCandle[]{return Array.from({length:240},(_,i)=>({symbol:'BTCUSDT',market_type:'crypto',timeframe:'5m',source:'FIXTURE',open_time:iso(now-(240-i)*300000),open:996+i,close:1000+i,high:1005+i,low:995+i,volume:1000}));}
test('volatility classification uses each asset own historical baseline and follows an observed expansion',()=>{
 const rows=candles(),normal=watchedMarketContext(rows,now);
 assert.equal(normal.volatility!.band,'NORMAL');
 const scaled=rows.map(r=>({...r,symbol:'ETHUSDT',open:r.open*.01,close:r.close*.01,high:r.high*.01,low:r.low*.01}));
 assert(Math.abs(watchedMarketContext(scaled,now).volatility!.ratio-normal.volatility!.ratio)<1e-9);
 const shocked=rows.map((r,i)=>i<226?r:{...r,high:r.close+30,low:r.close-30});
 assert.equal(watchedMarketContext(shocked,now).volatility!.band,'HIGH');
});
test('real evaluator discovery receives learned priority while preserving evaluator levels and published lifecycle evidence',()=>{
 const rows=candles(),higher=closedAggregate(rows,15,iso(now));
 const definitions=watchedStrategyCatalog([{strategy_name:'MicroScalper',enabled:true}]);
 const input={definitions,symbol:'BTCUSDT',tf:'5m' as const,rows,higher,now};
 const baseline=discoverWatchedStrategies(input).setups.find(s=>s.strategy==='crypto.micro-scalper')!;assert(baseline);
 const found=discoverWatchedStrategies({...input,learning:history(baseline)});
 const learned=found.setups.find(s=>s.strategy===baseline.strategy)!;assert(learned.selectionScore!>learned.score);
 assert.deepEqual(learned.origin,baseline.origin);assert.equal(learned.stop,baseline.stop);assert.equal(learned.tp2,baseline.tp2);
 assert.equal((found.observations.find(o=>o.strategy_id===baseline.strategy)!.evidence.paper_learning as any).closed,30);
 const next=advanceConditionalSetup(learned,{...rows.at(-1)!,open_time:iso(now),high:learned.trigger+1,low:learned.trigger-.1,open:learned.trigger,close:learned.trigger+.5});
 assert.deepEqual(next.learning,learned.learning);assert.deepEqual(next.origin,learned.origin);
});
