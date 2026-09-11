import assert from 'node:assert/strict';
import { BinanceHistoricalAdapter, HistoricalDataService, MemoryHistoricalCache, MT5BridgeHistoricalAdapter, datasetKey, mergeRanges, normalizeAndValidate, type CanonicalCandle, type HistoricalDataRequest } from '../../src/lib/historicalData/index';

const step=300_000, start=Date.UTC(2024,0,1);
const candle=(timestamp:number, close=2):CanonicalCandle=>({timestamp,open:1,high:3,low:0.5,close,volume:10});
const request=(overrides:Partial<HistoricalDataRequest>={}):HistoricalDataRequest=>({provider:'BINANCE',symbol:'BTCUSDT',timeframe:'5m',from:start,to:start+step*2,...overrides});

async function main(){
  const cache=new MemoryHistoricalCache(); let calls=0;
  const adapter={provider:'BINANCE' as const,async fetch(_r:HistoricalDataRequest,range:{from:number;to:number}){calls++;const bars=[];for(let t=range.from;t<=range.to;t+=step)bars.push(candle(t));return {sourceSymbol:'BTCUSDT',bars:[...bars].reverse()};}};
  const service=new HistoricalDataService(cache,[adapter]);
  const first=await service.get(request()); assert.equal(first.bars.length,3,'insertion/retrieval'); assert.equal(first.metadata.quality.outOfOrder,0,'stored result is normalized');
  const second=await service.get(request());assert.deepEqual(second.bars,first.bars,'same period is stable');assert.equal(calls,1,'offline/cache reuse avoids provider');
  await cache.putBars(request(),[candle(start),candle(start)],first.metadata);assert.equal((await cache.getBars(request())).length,3,'deterministic identity prevents duplicates');
  const partial=request({to:start+step*4});assert.deepEqual(await service.getMissingRanges(partial),[{from:start+step*3,to:start+step*4}]);await service.get(partial);assert.equal(calls,2,'only partial missing range fetched');
  assert.deepEqual(mergeRanges([{from:1,to:2},{from:3,to:4}],1),[{from:1,to:4}],'range merge');
  const bad=normalizeAndValidate([candle(start+step),candle(start),{...candle(start+step*2),high:0}], '5m',{from:start,to:start+step*2});assert.equal(bad.quality.invalidBars,1);assert.equal(bad.quality.outOfOrder,1);assert.deepEqual(bad.bars.map(x=>x.timestamp),[start,start+step]);
  assert.notEqual(datasetKey(request()),datasetKey(request({symbol:'ETHUSDT'})),'symbols isolated');assert.notEqual(datasetKey(request()),datasetKey(request({timeframe:'15m'})),'timeframes isolated');assert.notEqual(datasetKey(request()),datasetKey(request({provider:'BYBIT'})),'providers isolated');
  let contract:any;const mt5=new MT5BridgeHistoricalAdapter(async p=>{contract=p;return {version:'1.0',provider:'MT5',broker:'Broker',server:'Demo',account_id:'11111111-1111-4111-8111-111111111111',environment:'demo',canonical_symbol:'EURUSD',source_symbol:'EURUSD.a',timeframe:'5m',from:p.from,to:p.to,bars:[{time:start/1000,open:1,high:2,low:.5,close:1.5,tick_volume:5,real_volume:2,spread:12}]};});const mt=await mt5.fetch(request({provider:'MT5_BRIDGE',symbol:'EURUSD',accountId:'11111111-1111-4111-8111-111111111111'}),{from:start,to:start});assert.equal(contract.operation,'FETCH_HISTORY');assert.equal(contract.version,'1.0');assert.equal(mt.bars[0].tickVolume,5);assert.equal(mt.sourceSymbol,'EURUSD.a');
  const fakeFetch=async()=>new Response(JSON.stringify([[start,'1','3','.5','2','99']]),{status:200});const crypto=await new BinanceHistoricalAdapter(fakeFetch as typeof fetch).fetch(request(),{from:start,to:start});assert.deepEqual(crypto.bars,[{...candle(start),volume:99}]);
  const other=await service.get(request({symbol:'ETHUSDT'}));assert.equal(other.bars.length,3,'multi-symbol isolation and shared service');
  console.log('historical data foundation: 15 deterministic checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
