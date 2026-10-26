import assert from 'node:assert/strict';
import {proposeMajorBreakout} from '../../scripts/research/major-breakout-rules.ts';
import {proposeMajorBear} from '../../scripts/research/major-bear-rules.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
const t=Date.parse('2025-01-01T00:00:00Z');
const rows=(symbol:string,last:number):StrategyCandle[]=>Array.from({length:240},(_,i)=>{const p=i===239?last:100+i*.001;return {symbol,source:'BINANCE_USDM_KLINES',market_type:'crypto',instrument_type:'USDT_PERPETUAL',timeframe:'1h',open_time:new Date(t+i*3600000).toISOString(),open:p,high:p+.1,low:p-.1,close:p,volume:100,quote_volume:i===239?2000:1000}});
const at=new Date(t+240*3600000).toISOString();
for(const [symbol,peer] of [['BTCUSDT','ETHUSDT'],['ETHUSDT','BTCUSDT']]){
 const asset=rows(symbol,110),reference=rows(peer,101);
 for(const variant of ['PEER_RELATIVE','PEER_BREADTH'] as const){const r=proposeMajorBreakout(asset,reference,variant,at);assert.ok(r.candidate);assert.equal(r.candidate.symbol,symbol);assert.equal(r.candidate.evidence.peer,peer);assert.equal(r.candidate.lifecycle,'RESEARCH');assert.equal(r.candidate.publicationMode,'SHADOW');assert.equal(r.candidate.side,'buy');assert.equal(proposeMajorBreakout(asset,asset,variant,at).candidate,null);assert.equal(proposeMajorBreakout(asset,reference.slice(1),variant,at).candidate,null);assert.equal(proposeMajorBreakout(asset,reference,variant,new Date(Date.parse(at)-1).toISOString()).candidate,null);assert.equal(proposeMajorBreakout(asset.map((c,i)=>i===239?{...c,quote_volume:500}:c),reference,variant,at).candidate,null);assert.equal(proposeMajorBreakout(asset,reference.map((c,i)=>i===5?{...c,open_time:'invalid'}:c),variant,at).candidate,null);}
 assert.equal(proposeMajorBreakout(rows(symbol,105),rows(peer,104),'PEER_RELATIVE',at).candidate,null);assert.ok(proposeMajorBreakout(rows(symbol,105),rows(peer,104),'PEER_BREADTH',at).candidate);
 for(const variant of ['PEER_RELATIVE','PEER_BREADTH'] as const){const b=proposeMajorBear(rows(symbol,90),rows(peer,99),variant,at);assert.ok(b.candidate);assert.equal(b.candidate.side,'sell');assert.equal(b.candidate.evidence.peer,peer);assert.equal(b.candidate.lifecycle,'RESEARCH');assert.equal(proposeMajorBear(rows(symbol,90),rows(symbol,99),variant,at).candidate,null);}
 assert.equal(proposeMajorBear(rows(symbol,95),rows(peer,96),'PEER_RELATIVE',at).candidate,null);assert.ok(proposeMajorBear(rows(symbol,95),rows(peer,96),'PEER_BREADTH',at).candidate);
}
console.log('Major breakout: true peer identities, both transfers, relative/breadth separation, volume, closed-time, malformed and missing history checks passed.');
