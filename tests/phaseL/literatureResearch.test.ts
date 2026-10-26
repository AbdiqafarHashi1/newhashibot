import assert from 'node:assert/strict';
import {selectVolumeClock,volumeClockProposal,hourlyOverreaction,fundingPriceDisagreement,quantile,wilder14,type NativeFunding} from '../../scripts/research/literature-btc-eth-rules.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
const start=Date.parse('2025-01-01T00:00:00Z');
const rows=(n:number):StrategyCandle[]=>Array.from({length:n},(_,i)=>({symbol:'BTCUSDT',source:'BINANCE_USDM_KLINES',instrument_type:'USDT_PERPETUAL',market_type:'crypto',timeframe:'15m',open_time:new Date(start+i*900000).toISOString(),open:100,high:101,low:99,close:100,volume:100,quote_volume:1000,taker_buy_volume:50}));
assert.equal(quantile([1,2,3,4],.75),3.25);assert.equal(wilder14(rows(110)),2);
const dayStart=2880,slot=5,clockRows=rows(dayStart+slot*2+94);
for(let d=0;d<30;d++){clockRows[d*96+slot*2].quote_volume=10000;clockRows[d*96+slot*2+1].quote_volume=10000;}
assert.equal(selectVolumeClock(clockRows.slice(0,dayStart)),slot);
clockRows[dayStart+slot*2].quote_volume=15000;clockRows[dayStart+slot*2+1]={...clockRows[dayStart+slot*2+1],quote_volume:15000,close:103,high:104};
const momentum=volumeClockProposal(clockRows,dayStart,slot);assert.ok(momentum);assert.equal(momentum.horizon,2);assert.equal(momentum.candidate.side,'buy');assert.equal(momentum.candidate.lifecycle,'RESEARCH');assert.equal(momentum.candidate.publicationMode,'SHADOW');assert.equal(volumeClockProposal(clockRows,dayStart,slot+1),null);
const shock=rows(964);for(let i=0;i<240;i++){const j=i*4;shock[j+3].close=100*(1+.001*Math.sin(i));}
shock[960]={...shock[960],quote_volume:2000,taker_buy_volume:80};shock[961]={...shock[961],open:100,high:106,low:99,close:105,quote_volume:2000,taker_buy_volume:80};shock[962]={...shock[962],open:105,high:111,low:104,close:110,quote_volume:2000,taker_buy_volume:80};shock[963]={...shock[963],open:110,high:111,low:108,close:109,quote_volume:2000,taker_buy_volume:80};
const reversal=hourlyOverreaction(shock);assert.ok(reversal);assert.equal(reversal.candidate.side,'sell');assert.equal(reversal.horizon,4);assert.equal(hourlyOverreaction(shock.map(b=>({...b,taker_buy_volume:undefined}))),null);
const native=rows(110);native[109]={...native[109],close:103,high:104};const at=Date.parse(native[109].open_time)+900000,current:NativeFunding={symbol:'BTCUSDT',calcTimeMs:at-900000+1,intervalHours:8,rate:-.001},previous=Array.from({length:90},(_,i)=>({...current,rate:.0001,calcTimeMs:current.calcTimeMs-(90-i)*28800000}));
const disagreement=fundingPriceDisagreement(native,current,previous);assert.ok(disagreement);assert.equal(disagreement.candidate.side,'buy');assert.equal(disagreement.horizon,12);assert.equal(fundingPriceDisagreement(native,{...current,calcTimeMs:at+1},previous),null);assert.equal(fundingPriceDisagreement(native,{...current,intervalHours:4},previous),null);assert.equal(fundingPriceDisagreement(native,current,previous.slice(1)),null);assert.equal(fundingPriceDisagreement(native,current,previous.map((p,i)=>i===50?{...p,calcTimeMs:p.calcTimeMs-100000}:p)),null);
for(const f of [()=>volumeClockProposal(clockRows.map((b,i)=>i===5?{...b,symbol:'ETHUSDT'}:b),dayStart,slot),()=>hourlyOverreaction(shock.map((b,i)=>i===5?{...b,open_time:'invalid'}:b)),()=>fundingPriceDisagreement(native.map((b,i)=>i===5?{...b,low:-1}:b),current,previous)])assert.equal(f(),null);
console.log('Literature hypotheses: causal volume clock, Wilder oracle, reversal direction/native flow, actual funding maturity/interval/gap rejection and malformed histories passed.');
