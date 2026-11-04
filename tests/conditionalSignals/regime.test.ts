import {test} from 'node:test';import assert from 'node:assert/strict';
import {classifyEntryRegime,entryRegimeRejection,type EntryRegime} from '../../supabase/functions/_shared/entry-regime.ts';
import {conditionalCost} from '../../supabase/functions/_shared/conditional-market.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
const base=Date.parse('2026-11-04T00:00:00Z');
function scenario(kind:string):StrategyCandle[]{
 const rows:StrategyCandle[]=Array.from({length:140},(_,i)=>{
  let c=kind==='up'?100+i*.1:kind==='down'?130-i*.1:100+Math.sin(i)*.4,range=.3;
  if(['compression','expansion'].includes(kind)){c=i<115?100+Math.sin(i)*2:100+Math.sin(i)*.005;range=i<115?.5:.02;}
  if(kind==='transition')c=100+i*.005;
  return {symbol:'BTCUSDT',timeframe:'5m',market_type:'crypto',source:'CONTROLLED',open_time:new Date(base+i*300000).toISOString(),open:c-.01,high:c+range,low:c-range,close:c,volume:100};
 });
 if(kind==='shock')rows.at(-1)!.high+=10;
 if(kind==='expansion'){rows.at(-1)!.high+=.03;rows.at(-1)!.close+=.03;}
 return rows;
}
test('causal closed candle sequences distinguish all seven regimes and insufficient warm-up',()=>{
 const cases:Record<string,EntryRegime>={up:'UPTREND',down:'DOWNTREND',range:'RANGE',compression:'COMPRESSION',expansion:'VOLATILITY_EXPANSION',shock:'ABNORMAL',transition:'TRANSITION'};
 for(const [kind,expected] of Object.entries(cases))assert.equal(classifyEntryRegime(scenario(kind)).state,expected,kind);
 assert.equal(classifyEntryRegime([]).state,'UNAVAILABLE');assert.equal(classifyEntryRegime(scenario('up').slice(0,50)).state,'UNAVAILABLE');
 assert.equal(entryRegimeRejection('TREND','buy',classifyEntryRegime(scenario('range'))),'REGIME_INCOMPATIBLE_WITH_TREND');
 assert.equal(entryRegimeRejection('TREND','buy',classifyEntryRegime(scenario('down'))),'REGIME_DIRECTION_CONFLICT');
 assert.equal(entryRegimeRejection('BREAKOUT','buy',classifyEntryRegime(scenario('range'))),'BREAKOUT_WITHOUT_EXPANSION');
 assert.equal(entryRegimeRejection('REVERSAL','sell',classifyEntryRegime(scenario('expansion'))),'REVERSAL_AGAINST_EXPANSION');
 assert.equal(entryRegimeRejection('TREND','buy',classifyEntryRegime(scenario('shock'))),'ABNORMAL_MARKET');
});
test('asset-aware modeled costs preserve FX/JPY/Gold units and reject unsupported metals',()=>{
 assert(conditionalCost('DOGEUSDT',100).price>conditionalCost('BTCUSDT',100).price);
 assert.equal(conditionalCost('EURUSD',1.1).price,.0002);assert.equal(conditionalCost('USDJPY',150).price,.02);
 assert.equal(conditionalCost('XAUUSD',2500).price,.5);
 assert.throws(()=>conditionalCost('XAGUSD',30),/UNSUPPORTED_COST_INSTRUMENT/);
 assert.throws(()=>conditionalCost('BTCUSDT',NaN),/INVALID_COST_PRICE/);
});
