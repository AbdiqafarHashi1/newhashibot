import {test} from 'node:test';import assert from 'node:assert/strict';
import {deliverIntelligenceOutput,intelligenceSourceFailures} from '../../supabase/functions/_shared/intelligence-delivery.ts';
import type {IntelligenceOutput} from '../../supabase/functions/_shared/intelligence-engine.ts';
const now=Date.parse('2026-10-30T12:00:00Z');
const output=(patch:any={}):IntelligenceOutput=>({event_id:'source-record',event_type:'morning_brief',market:'crypto',title:'Crypto session brief',summary:'BTC and ETH closed-candle trend context.',symbols:['BTCUSDT','ETHUSDT'],sentiment:{},regime:'neutral',confidence:80,data_sources:{candles:'recorded_exchange_candles'},freshness:{generated_at:new Date(now).toISOString()},output_channel:['admin','free','vip'],status:'generated',metadata:{feed_health:[]},...patch});
test('incomplete analysis and news go to Admin only, without any Free/VIP delivery',async()=>{
 for(const market of ['crypto','forex'])for(const event_type of ['morning_brief','news_digest']){
  const events:any[]=[];const o=output({market,event_type,status:'partial',summary:'News provider unavailable.',metadata:{feed_health:[{feed_type:'news',status:'failed',error_message:'upstream connection timed out'}]}});
  const r=await deliverIntelligenceOutput(o,{route:async e=>{events.push(e);return [];}},now);
  assert.equal(r.state,'HELD_SOURCE_EVIDENCE');assert.equal(events.length,1);assert.deepEqual(events[0].channels,['admin']);assert.match(events[0].text,/upstream connection timed out/);
 }
});
test('independent successful analysis can queue while failed optional source details stay Admin only',async()=>{
 const events:any[]=[];const o=output({metadata:{feed_health:[{feed_type:'funding',status:'failed',error_message:'upstream timeout'}],feed_failures:[{symbol:'SOLUSDT',reason:'MT5 candles unavailable'}]}});
 const r=await deliverIntelligenceOutput(o,{route:async e=>{events.push(e);return [];}},now);
 assert.equal(r.state,'QUEUED');assert.deepEqual(events.map(e=>e.channels),[['admin'],['free'],['vip']]);
 assert.equal(intelligenceSourceFailures(o).length,2);
 for(const e of events.filter(e=>e.editorial)){const text=JSON.stringify(e.editorial);assert.doesNotMatch(text,/upstream timeout|MT5 candles unavailable/);assert.match(text,/BTC and ETH/);}
});
test('technical error summaries and unsupported freshness are held for both subscriber audiences',async()=>{
 for(const patch of [{summary:'Site not found'},{summary:'Funding: upstream connection timed out',metadata:{feed_health:[{feed_type:'funding',status:'failed',error_message:'upstream connection timed out'}]}},{freshness:{generated_at:new Date(now-3600000).toISOString()}},{status:'failed'}]){
  const events:any[]=[];const r=await deliverIntelligenceOutput(output(patch),{route:async e=>{events.push(e);return [];}},now);
  assert.equal(r.state,'HELD_SOURCE_EVIDENCE');assert(events.every(e=>e.channels.length===1&&e.channels[0]==='admin'));
 }
});
test('healthy intelligence has no diagnostic post; both subscriber audiences receive source-backed content',async()=>{
 const events:any[]=[];await deliverIntelligenceOutput(output(),{route:async e=>{events.push(e);return [];}},now);
 assert.deepEqual(events.map(e=>e.channels),[['free'],['vip']]);assert(events.every(e=>e.editorial.source_ids.includes('source-record')));
});
