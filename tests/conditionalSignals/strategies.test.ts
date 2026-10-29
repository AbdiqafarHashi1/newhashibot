import {test} from 'node:test';import assert from 'node:assert/strict';
import {watchedStrategyCatalog,CORE_WATCH_STRATEGIES} from '../../supabase/functions/_shared/watched-strategy-catalog.ts';
import {discoverWatchedStrategies,watchedSetupFromEvaluation} from '../../supabase/functions/_shared/watched-strategy-discovery.ts';
import {watchedMarketContext,strategyContextDecision,type StrategyThesis} from '../../supabase/functions/_shared/watched-market-context.ts';
import {FOREX_STRATEGY_CONTRACTS} from '../../supabase/functions/_shared/forex-runtime-contracts.ts';
import {calculateActiveIndicators} from '../../supabase/functions/_shared/active-validation-runtime.ts';
import {ProfessionalStrategyRegistry,type StrategyCandle,type StrategyDefinition} from '../../supabase/functions/_shared/professional-strategies.ts';
import {closedAggregate} from '../../supabase/functions/_shared/regime-opportunities.ts';
import {watchWidth,type WatchTimeframe} from '../../supabase/functions/_shared/conditional-contract.ts';
import {observeConditionalSymbol,ConditionalSignalStore} from '../../supabase/functions/_shared/conditional-signal-runtime.ts';
import {advanceConditionalSetup,enterConditionalAtOpen} from '../../supabase/functions/_shared/conditional-signal-service.ts';
import {runConditionalWatch} from '../../supabase/functions/_shared/conditional-watch.ts';
const now=Date.parse('2026-10-28T14:00:00Z');
const configurations=[...CORE_WATCH_STRATEGIES.map(c=>({strategy_name:c.name,enabled:true})),...FOREX_STRATEGY_CONTRACTS.map(c=>({strategy_name:c.legacyName,enabled:true}))];
function bars(symbol='BTCUSDT',tf:WatchTimeframe='5m'):StrategyCandle[]{const scale=symbol==='XAUUSD'?2:symbol.endsWith('USDT')?1:.0002,base=symbol==='XAUUSD'?2200:symbol.endsWith('USDT')?1000:1.1,w=watchWidth(tf);return Array.from({length:240},(_,i)=>{const c=base+i*scale;return {symbol,market_type:symbol.endsWith('USDT')?'crypto':'forex',timeframe:tf,source:'TEST_ONLY_SOURCE',open_time:new Date(now-(240-i)*w).toISOString(),open:c-4*scale,high:c+5*scale,low:c-5*scale,close:c,volume:1000};});}
function context(symbol='BTCUSDT',tf:WatchTimeframe='5m'){const rows=bars(symbol,tf),higher=closedAggregate(rows,tf==='5m'?15:tf==='15m'?60:240,new Date(now).toISOString());return {rows,higher,ctx:{symbol,market:rows[0].market_type as 'crypto'|'forex',timeframe:tf,candles:rows,indicators:calculateActiveIndicators(rows),higher_timeframe_candles:higher,evaluated_at:new Date(now).toISOString()}};}

test('all ten primary evaluators and the registered research inventory have unique watched-strategy coverage',()=>{
 const catalog=watchedStrategyCatalog(configurations),ids=catalog.map(d=>d.id);assert.equal(new Set(ids).size,ids.length);assert(ids.length>20);
 for(const id of [...CORE_WATCH_STRATEGIES.map(c=>c.id),...FOREX_STRATEGY_CONTRACTS.map(c=>c.id)])assert(catalog.some(d=>d.id===id&&d.config.enabled));
 for(const d of catalog.filter(d=>!CORE_WATCH_STRATEGIES.some(c=>c.id===d.id)&&!FOREX_STRATEGY_CONTRACTS.some(c=>c.id===d.id)))assert.equal(d.config.enabled,false,d.id);
 const forged=watchedStrategyCatalog([{strategy_name:'DailyEmaTrend',enabled:true}]);assert.equal(forged.find(d=>d.id==='crypto.daily-ema-trend')?.config.enabled??false,false);
 assert.equal(watchedStrategyCatalog([{strategy_name:'ForexMicroScalper',enabled:true,allowed_symbols:['XAUUSD']}]).find(d=>d.id==='forex.micro-scalper')!.config.enabled,false);
 assert.equal(watchedStrategyCatalog([{strategy_name:'MicroScalper',enabled:true,allowed_timeframes:['1m']}]).find(d=>d.id==='crypto.micro-scalper')!.config.enabled,false);
});

test('real named evaluators run through the registry for scalp, intraday and swing without identity substitution',()=>{
 const catalog=watchedStrategyCatalog(configurations);
 for(const d of catalog.filter(d=>d.config.enabled)){const symbol=d.id==='gold.volatility-breakout'?'XAUUSD':d.market==='forex'?'EURUSD':'BTCUSDT',tf=d.config.allowed_timeframes[0] as WatchTimeframe,c=context(symbol,tf);
  const direct=d.evaluate(c.ctx),result=new ProfessionalStrategyRegistry([d]).evaluate(c.ctx)[0];assert.deepEqual(result.professional.legacy,direct,d.id);
  const observed=discoverWatchedStrategies({definitions:[d],symbol,tf,rows:c.rows,higher:c.higher,now});assert.equal(observed.observations[0].strategy_id,d.id);assert.notEqual(observed.observations[0].decision,'DISABLED');
 }
});

test('every named strategy preserves its own entry boundary, targets, stop, version and complete original plan',()=>{
 for(const d of watchedStrategyCatalog(configurations).filter(d=>d.config.enabled)){
  const symbol=d.id==='gold.volatility-breakout'?'XAUUSD':d.market==='forex'?'EURUSD':'BTCUSDT',tf=d.config.allowed_timeframes[0] as WatchTimeframe,c=context(symbol,tf);
  if(/breakout|compression/.test(d.id)){const b=c.rows.at(-1)!,step=b.high-b.close;b.close+=step*1.5;b.open=b.close-step*.5;b.high=b.close+step*.2;b.low=b.open-step*.2;c.ctx.indicators=calculateActiveIndicators(c.rows);}
  const price=c.rows.at(-1)!.close,r=price*.02;
  // Inject only an evaluator result to isolate the adapter; the preceding test exercises each genuine evaluator.
  const definition:StrategyDefinition={...d,evaluate:()=>({status:'candidate',direction:'buy',entry_low:price,entry_high:price,stop_loss:price-r,tp1:price+r,tp2:price+2*r,risk_reward:2,confidence_score:90,grade:'A+',reason:`${d.id} original test plan`,rejection_reason:'',score_breakdown:{}})};
  const e=new ProfessionalStrategyRegistry([definition]).evaluate(c.ctx)[0],intel=watchedMarketContext(c.rows,now,{higher:c.higher});
  const s=watchedSetupFromEvaluation(e,c.ctx,intel);assert(s,d.id);assert.equal(s.strategy,d.id);assert.equal(s.stop,e.professional.stop);assert.equal(s.tp2,e.professional.tp2);assert.equal(s.trigger,price);assert.deepEqual(s.origin!.plan,e.plan);assert.equal(s.origin!.version,d.version);
 }
});

test('a real five-minute MicroScalper watch confirms, records the next open and closes in the same paper ledger',async()=>{
 const c=context(),d=watchedStrategyCatalog(configurations).find(d=>d.id==='crypto.micro-scalper')!;
 const found=discoverWatchedStrategies({definitions:[d],symbol:'BTCUSDT',tf:'5m',rows:c.rows,higher:c.higher,now});let s=found.setups.find(s=>s.strategy===d.id);assert(s,JSON.stringify(found.observations));assert.equal(s.track,'SCALP');
 const initial=structuredClone(s),risk=s.trigger-s.stop,confirmation:StrategyCandle={...c.rows.at(-1)!,open_time:new Date(now).toISOString(),open:s.trigger-risk*.05,high:s.trigger+risk*.2,low:s.trigger-risk*.1,close:s.trigger+risk*.1};
 const store={open:async()=>[s!],save:async(next:any,expected:number)=>{assert.equal(expected,s!.version);s=next;return true;}} as unknown as ConditionalSignalStore;
 await observeConditionalSymbol(store,s.symbol,'5m',[...c.rows,confirmation],now+300000,{intelligence:(rows,at)=>watchedMarketContext(rows,at,{higher:c.higher})});assert.equal(s.status,'ARMED');
 const opening={...confirmation,open_time:new Date(now+300000).toISOString(),open:s.trigger};s=enterConditionalAtOpen(s,opening,now+301000);assert.equal(s.status,'ACTIVE');assert.equal(s.bars,0);
 s=advanceConditionalSetup(s,{...opening,high:s.tp2+1,low:s.trigger-risk*.1,close:s.tp2});assert.equal(s.status,'CLOSED');assert.ok(s.netR!>0);assert.deepEqual(s.origin,initial.origin);
});

test('news evidence, spread, volatility, anchor and originating thesis govern confirmation without future information',()=>{
 const c=context('EURUSD','15m'),at=now,source={id:'calendar-record',created_at:new Date(now-1000).toISOString(),market:'forex',metadata:{news_available:true,high_impact_events:[{currency:'USD',impact:'HIGH',at:new Date(now+600000).toISOString(),source_url:'https://example.test/source'}]}};
 const info=watchedMarketContext(c.rows,at,{higher:c.higher,sources:[source]}),thesis:StrategyThesis={family:'TREND',boundary:0,minimumVolumeRatio:.35,maximumRangeAtr:3,sessions:[],higherRequired:true,maximumCostR:.4};
 assert.equal(info.news,'HIGH_IMPACT_WINDOW');assert.equal(strategyContextDecision(thesis,'buy',c.rows,info),'WAIT');
 const future=watchedMarketContext(c.rows,at,{higher:c.higher,sources:[{...source,created_at:new Date(now+1000).toISOString()}]});assert.equal(future.news,'UNAVAILABLE');
 assert.equal(strategyContextDecision(thesis,'buy',c.rows,{...future,trendDirection:-1}),'INVALID');assert.equal(strategyContextDecision(thesis,'buy',c.rows,{...future,volumeRatio:.1}),'WAIT');
 assert.equal(strategyContextDecision({...thesis,anchorRequired:true},'buy',c.rows,{...future,anchorDirection:-1}),'WAIT');assert.equal(strategyContextDecision(thesis,'buy',c.rows,{...future,rangeAtr:4}),'WAIT');
 const oldHigher=c.higher.map(r=>({...r,open_time:new Date(Date.parse(r.open_time)-86400000).toISOString()}));assert.equal(watchedMarketContext(c.rows,at,{higher:oldHigher}).higherDirection,0);
});

test('a known event window holds a crossed trigger; actual positions remain protected independently of news',async()=>{
 const c=context(),d=watchedStrategyCatalog(configurations).find(d=>d.id==='crypto.micro-scalper')!;let s=discoverWatchedStrategies({definitions:[d],symbol:'BTCUSDT',tf:'5m',rows:c.rows,higher:c.higher,now}).setups.find(s=>s.strategy===d.id)!;assert(s);
 const risk=s.trigger-s.stop,b={...c.rows.at(-1)!,open_time:new Date(now).toISOString(),open:s.trigger,low:s.trigger-risk*.1,high:s.trigger+risk*.3,close:s.trigger+risk*.2};
 const store={open:async()=>[s],save:async(next:any)=>{s=next;return true;}} as unknown as ConditionalSignalStore;
 await observeConditionalSymbol(store,s.symbol,'5m',[...c.rows,b],now+300000,{intelligence:(rows,at)=>({...watchedMarketContext(rows,at,{higher:c.higher}),news:'HIGH_IMPACT_WINDOW'})});assert.equal(s.status,'WAITING');assert.equal(s.fill,undefined);assert.equal(s.lastBar,b.open_time);
});

test('48 base streams share bounded provider reads and still manage open plans with discovery paused',async()=>{
 const health:any[]=[],calls=new Map<string,number>();let active=0,max=0;const store={open:async()=>[],save:async()=>true} as unknown as ConditionalSignalStore;
 const r=await runConditionalWatch({store,timeframes:['5m','15m','1h'],discovery:{crypto:true,forex:true},health:async row=>{health.push(row)},feed:async(symbol,tf)=>{active++;max=Math.max(max,active);const key=`${symbol}:${tf}`;calls.set(key,(calls.get(key)??0)+1);await new Promise(r=>setTimeout(r,1));active--;return{candles:bars(symbol,tf)};},assess:async({symbol,rows,now,load})=>{const higher=await load(symbol,'1h');return {setups:[],intelligence:(prefix,at)=>watchedMarketContext(prefix,at,{higher:higher.candles})};}});
 assert.equal(r.streams,48);assert.equal(health.length,48);assert.ok(max<=4);assert.ok([...calls.values()].every(n=>n===1));assert.equal(r.admission.admitted,0);
});

test('genuine Forex five-minute evaluator creates a tracked scalp and rejects a current excessive spread',()=>{
 const rows=Array.from({length:240},(_,i)=>{const c=1.1+i*.000005+Math.sin(i*.5+1.3)*.00015;return{symbol:'EURUSD',market_type:'forex',timeframe:'5m',source:'TEST_ONLY_SOURCE',open_time:new Date(now-(240-i)*300000).toISOString(),open:c-.00035,high:c+.00015,low:c-.0005,close:c,volume:1000};});
 const input={definitions:watchedStrategyCatalog([{strategy_name:'ForexMicroScalper',enabled:true}]),symbol:'EURUSD',tf:'5m' as const,rows,now,higher:closedAggregate(rows,15,new Date(now).toISOString())};
 const good=discoverWatchedStrategies({...input,spreadPrice:.00003,spreadObservedAt:new Date(now).toISOString()}),s=good.setups.find(s=>s.strategy==='forex.micro-scalper');assert(s);assert.equal(s.track,'SCALP');assert.equal(s.origin!.plan.identity.strategy_id,'forex.micro-scalper');
 const wide=discoverWatchedStrategies({...input,spreadPrice:.0005,spreadObservedAt:new Date(now).toISOString()});assert.equal(wide.setups.filter(s=>s.strategy==='forex.micro-scalper').length,0);
 const stale=watchedMarketContext(rows,now,{spreadPrice:.00003,spreadObservedAt:new Date(now-121000).toISOString()});assert.equal(stale.spreadPrice,null);
});

test('context changing at the entry open cancels the watch; a filled position still stops during news',async()=>{
 const c=context(),d=watchedStrategyCatalog(configurations).find(d=>d.id==='crypto.micro-scalper')!;let s=discoverWatchedStrategies({definitions:[d],symbol:'BTCUSDT',tf:'5m',rows:c.rows,higher:c.higher,now}).setups.find(s=>s.strategy===d.id)!;
 const risk=s.trigger-s.stop,confirm={...c.rows.at(-1)!,open_time:new Date(now).toISOString(),open:s.trigger,high:s.trigger+risk*.2,low:s.trigger-risk*.1,close:s.trigger+risk*.1};
 s=advanceConditionalSetup(s,confirm);assert.equal(s.status,'ARMED');const opening={...confirm,open_time:new Date(now+300000).toISOString(),open:s.trigger};
 const store={open:async(symbol:string)=>symbol==='BTCUSDT'?[s]:[],save:async(next:any)=>{s=next;return true;}} as unknown as ConditionalSignalStore;
 await runConditionalWatch({store,timeframes:['5m'],discovery:{crypto:false,forex:false},health:async()=>{},feed:async()=>({candles:[...c.rows,confirm],currentOpen:opening}),assess:async()=>({setups:[],intelligence:(rows,at)=>({...watchedMarketContext(rows,at,{higher:c.higher}),news:'HIGH_IMPACT_WINDOW'})})},now+301000);
 assert.equal(s.status,'INVALIDATED');assert.equal(s.fill,undefined);assert.equal(s.confirmationIntelligence!.news,'HIGH_IMPACT_WINDOW');
 s={...s,status:'ACTIVE',fill:s.trigger,fillAt:opening.open_time,bars:0,netR:0};const stop={...opening,low:s.stop-risk*.1,high:s.trigger+risk*.1,close:s.trigger-risk*.5};
 await observeConditionalSymbol(store,s.symbol,'5m',[...c.rows,confirm,stop],now+600000,{intelligence:(rows,at)=>({...watchedMarketContext(rows,at,{higher:c.higher}),news:'HIGH_IMPACT_WINDOW'})});assert.equal(s.status,'CLOSED');assert.ok(s.netR!<0);
});
