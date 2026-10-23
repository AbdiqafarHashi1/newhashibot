import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {decodeNativeKline} from '../../supabase/functions/_shared/native-kline.ts';
import {costAwareFeatures,predictUtility,evaluateCostAware,costAwareResearchDefinitions} from '../../supabase/functions/_shared/cost-aware-opportunities.ts';
import {chooseObservedUniverse,freshListingObservations,unverifiedCoreRows} from '../../supabase/functions/_shared/opportunity-universe.ts';
import {editorialDestinations,type EditorialPublication} from '../../supabase/functions/_shared/telegram-product.ts';
import {calculateActiveIndicators} from '../../supabase/functions/_shared/active-validation-runtime.ts';
import {generateForexIntelligence} from '../../supabase/functions/_shared/intelligence-engine.ts';
import {intelligencePublication} from '../../supabase/functions/_shared/intelligence-publication.ts';
import {routeTelegramEvent} from '../../supabase/functions/_shared/telegram-router.ts';
const base=Date.parse('2025-01-01T00:00:00Z'),native=[base,'100','102','99','101','100',base+899999,'10000',25,'60','6000','0'];
assert.equal(decodeNativeKline('BTCUSDT','15m',native,'USDT_PERPETUAL').taker_buy_volume,60);
assert.equal(decodeNativeKline('BTCUSDT','15m',[base*1000,...native.slice(1)],'SPOT').open_time,new Date(base).toISOString());
assert.equal(decodeNativeKline('BTCUSDT','15m',native,'SPOT').source,'BINANCE_SPOT_KLINES');
for(const bad of [null,undefined,'',true,'101']){const row=[...native];row[9]=bad as never;assert.throws(()=>decodeNativeKline('BTCUSDT','15m',row,'USDT_PERPETUAL'));}
const rows=Array.from({length:110},(_,i)=>decodeNativeKline('BTCUSDT','15m',[base+i*900000,...native.slice(1)],'USDT_PERPETUAL'));
const context={symbol:'BTCUSDT',market:'crypto' as const,timeframe:'15m',candles:rows,evaluated_at:new Date(base+110*900000).toISOString(),indicators:calculateActiveIndicators(rows)};
assert.equal(costAwareFeatures(context,20).values.length,22);
assert.throws(()=>costAwareFeatures({...context,evaluated_at:new Date(base+109*900000).toISOString()},20),/CANDLES_INVALID/);
assert.throws(()=>costAwareFeatures({...context,candles:rows.map(r=>({...r,instrument_type:'SPOT' as const}))},20),/NATIVE_FUTURES_FLOW_REQUIRED/);
assert.throws(()=>costAwareFeatures({...context,candles:rows.map((r,i)=>i===108?{...r,open_time:rows[107].open_time}:r)},20),/CANDLE_GAP/);
assert.throws(()=>costAwareFeatures({...context,evaluated_at:new Date(base+111*900000).toISOString()},20),/STALE/);
const ridge={model_schema:1,feature_count:1,long_intercept:1,short_intercept:-1,mean_0:2,scale_0:2,long_0:3,short_0:-2};
assert.deepEqual(predictUtility([4],ridge),{longNetR:4,shortNetR:-3});
assert.deepEqual(predictUtility([100],ridge),{longNetR:16,shortNetR:-11});
const trees:Record<string,number>={model_schema:2,feature_count:1,long_intercept:1,short_intercept:-1,mean_0:0,scale_0:1,tree_count:1,learning_rate:.1};
for(const h of [0,1])Object.assign(trees,{[`h${h}t0_count`]:3,[`h${h}t0n0f`]:0,[`h${h}t0n0b`]:.5,[`h${h}t0n0l`]:1,[`h${h}t0n0r`]:2,[`h${h}t0n1f`]:-2,[`h${h}t0n1v`]:2,[`h${h}t0n2f`]:-2,[`h${h}t0n2v`]:-3});
assert.deepEqual(predictUtility([0],trees),{longNetR:1.2,shortNetR:-.8});
assert.deepEqual(predictUtility([1],trees),{longNetR:.7,shortNetR:-1.3});
assert.throws(()=>predictUtility([1],{...trees,h0t0n0r:0}),/CYCLE_OR_DEPTH/);
assert.throws(()=>predictUtility([1],{...trees,h0t0n0r:8}),/NODE_INVALID/);
assert.equal(evaluateCostAware(context).status,'rejected');
for(const d of costAwareResearchDefinitions()){assert.equal(d.lifecycle,'DISABLED');assert.equal(d.publicationMode,'SHADOW');assert.equal(d.certification,'RESEARCH');}
const asOf=Date.parse('2026-10-23T00:00:00Z'),symbols=['BTCUSDT','ETHUSDT',...Array.from({length:30},(_,i)=>`COIN${i}USDT`)];
const exchange=symbols.map(symbol=>({symbol,status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:symbol.slice(0,-4),onboardDate:asOf-100*86400000}));
const tickers=symbols.map(symbol=>({symbol,quoteVolume:'100000000',priceChangePercent:'1',highPrice:'110',lowPrice:'90',lastPrice:'100',closeTime:asOf}));
const input={exchange,tickers,asOf,limit:10,poolSize:32,minQuoteVolume:5000000};
const a=chooseObservedUniverse(input),b=chooseObservedUniverse({...input,asOf:asOf+300000});
assert.equal(a.symbols.length,10);assert.equal(a.pool.length,32);assert.equal(a.coverage.allSymbolsEvaluatedEveryClose,false);
assert.notDeepEqual(a.symbols.map(x=>x.symbol),b.symbols.map(x=>x.symbol));
assert.equal(chooseObservedUniverse({...input,tickers:tickers.map(t=>({...t,closeTime:asOf-300001}))}).symbols.length,0);
assert.equal(chooseObservedUniverse({...input,exclude:['BTCUSDT']}).symbols.some(x=>x.symbol==='BTCUSDT'),false);
assert.equal(chooseObservedUniverse({...input,exchange:exchange.map(s=>({...s,onboardDate:asOf-86400000}))}).symbols.length,0);
assert.equal(chooseObservedUniverse({...input,minQuoteVolume:1e10,include:['BTCUSDT']}).symbols.length,0);
assert.throws(()=>chooseObservedUniverse({...input,limit:26}));
assert.ok(unverifiedCoreRows().every(r=>r.quote_volume===null&&r.price_change_pct===null));
const listings=freshListingObservations([{...exchange[0],onboardDate:asOf-1000},{...exchange[0],onboardDate:asOf-1000},{...exchange[1],onboardDate:asOf+1000}],asOf);
assert.equal(listings.length,1);assert.equal(listings[0].classification,'NEW_LISTING_RESEARCH_ONLY');assert.equal('entry' in listings[0],false);
const editorial={audience:'vip',market_scope:['crypto']} as EditorialPublication;
assert.deepEqual(editorialDestinations(editorial),['vip_crypto']);
assert.deepEqual(editorialDestinations({...editorial,market_scope:['forex','gold']}),['vip_forex_gold']);
assert.deepEqual(editorialDestinations({...editorial,market_scope:[]}),['vip_crypto','vip_forex_gold']);
assert.throws(()=>editorialDestinations({...editorial,market_scope:['unknown']}));
// Concrete owner-feed reader is exercised with a query transport, never customer accounts or HTTP.
(globalThis as any).Deno={env:{get:()=>undefined}};
const readTables:string[]=[];
function database(healthy:boolean){return {from(table:string){readTables.push(table);const q:any={};for(const method of ['select','eq','is','limit','order'])q[method]=()=>q;
 q.maybeSingle=async()=>({data:table==='mt5_scanner_feeds'?{bridge_id:'owner-bridge',feed_identity:'owner',status:healthy?'HEALTHY':'UNHEALTHY',last_heartbeat_at:new Date(asOf).toISOString()}:{last_update_at:new Date(asOf).toISOString(),stale:false}});
 q.then=(resolve:any)=>resolve({data:Array.from({length:55},(_,i)=>({open_time:new Date(asOf-(i+1)*3600000).toISOString(),open:100,high:102,low:99,close:101,tick_volume:100})),error:null});return q;}};}
const good=await generateForexIntelligence(database(true) as never,'morning_brief',asOf);
assert.equal(good.status,'generated');assert.equal(good.market,'forex');assert.equal(good.symbols.length,6);
const bad=await generateForexIntelligence(database(false) as never,'morning_brief',asOf);
assert.equal(bad.status,'partial');assert.equal(bad.symbols.length,0);
assert.ok(readTables.every(t=>['mt5_scanner_feeds','mt5_market_data_latest','mt5_market_candles'].includes(t)));
const instant=Date.now(),fresh={...good,freshness:{generated_at:new Date(instant).toISOString()}};
const fxPublication=intelligencePublication(fresh,'vip',instant),cryptoPublication=intelligencePublication({...fresh,market:'crypto'},'vip',instant);
assert.notEqual(fxPublication.dedupe_key,cryptoPublication.dedupe_key);
const queued:unknown[]=[];const queue={rpc:async(name:string,payload:Record<string,unknown>)=>{assert.equal(name,'enqueue_canonical_lifecycle_event');queued.push(payload.p_destinations);return{data:'durable-id',error:null};}};
assert.equal((await routeTelegramEvent(queue as never,{event_type:'EDITORIAL',editorial:fxPublication}))[0].status,'queued');
assert.equal((await routeTelegramEvent(queue as never,{event_type:'EDITORIAL',editorial:cryptoPublication}))[0].status,'queued');
assert.deepEqual(queued,[['vip_forex_gold'],['vip_crypto']]);
for(const market of ['crypto','forex']){
 const report=JSON.parse(readFileSync(`docs/research/cost-aware/${market}-development.json`,'utf8'));
 assert.equal(report.verdict,'NOT_CERTIFIED');assert.equal(report.publication,false);assert.equal(report.promotion,false);
 for(const [file,hash] of Object.entries(report.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),hash,`Research source drift: ${file}`);
 for(const model of report.models){assert.ok(model.parameters.trained_through_ms<model.parameters.valid_from_ms);assert.equal(model.parameters.publication_approved,0);}
 assert.equal(report.trials.length,3);for(const trial of report.trials){assert.ok(trial.reasons.length);for(const item of trial.evidence){
  const sum=item.outcome.cashFlowEvents.reduce((n:number,event:{realizedR:number})=>n+event.realizedR,0);assert.ok(Math.abs(sum-item.outcome.netR)<1e-9);
 }}
 if(market==='crypto')assert.equal(report.sources.length,90);else assert.equal(report.forexCoverage.status,'PARTIAL');
}
console.log('Opportunity runtime: native flow, model inference, bounded coverage, listing observations, audience isolation and owner-feed editorial passed.');
