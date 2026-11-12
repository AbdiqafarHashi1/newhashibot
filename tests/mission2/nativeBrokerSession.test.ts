import {test} from 'node:test';import assert from 'node:assert/strict';
import {scheduledMarketClosed,scheduledBarClosed,consecutiveMarketBars} from '../../supabase/functions/_shared/conditional-market.ts';
import {closedAggregate} from '../../supabase/functions/_shared/regime-opportunities.ts';
import {FOREX_PRODUCTION_EVALUATORS} from '../../supabase/functions/_shared/forex-production-strategies.ts';
import {calculateActiveIndicators} from '../../supabase/functions/_shared/active-validation-runtime.ts';
const source='EXNESS_BROKER_BID_ASK',at=(x:string)=>Date.parse(x);
test('named native broker weekly opening and gold maintenance honor New York DST; unknown gaps remain gaps',()=>{
 assert(!scheduledBarClosed('XAUUSD',at('2025-01-06T22:00Z'),86400000,source));assert(scheduledBarClosed('EURUSD',at('2025-01-04T00:00Z'),86400000,source));
 assert(scheduledMarketClosed('EURUSD',at('2025-01-05T22:00Z'),source));assert(!scheduledMarketClosed('EURUSD',at('2025-01-05T22:05Z'),source));
 assert(scheduledMarketClosed('XAUUSD',at('2025-07-06T21:30Z'),source));assert(!scheduledMarketClosed('XAUUSD',at('2025-07-06T22:05Z'),source));
 assert(scheduledMarketClosed('XAUUSD',at('2025-01-06T22:30Z'),source));assert(!scheduledMarketClosed('XAUUSD',at('2025-01-06T23:05Z'),source));
 assert(consecutiveMarketBars('XAUUSD',at('2025-01-06T21:55Z'),at('2025-01-06T23:05Z'),300000,source)===false,'unexplained missing 23:00 quote bar is not maintenance');
 assert(consecutiveMarketBars('XAUUSD',at('2025-01-06T21:55Z'),at('2025-01-06T23:00Z'),300000,source));
});
test('partial session opening aggregates only real observed quotes, but an unexplained missing quote rejects the whole aggregate',()=>{
 const start=at('2025-01-05T22:00Z'),rows=Array.from({length:11},(_,i)=>({symbol:'EURUSD',market_type:'forex',source,timeframe:'5m',open_time:new Date(start+(i+1)*300000).toISOString(),open:1,high:1.1,low:.9,close:1,volume:5,ask_open:1.01,ask_high:1.11,ask_low:.91,ask_close:1.01}));
 const result=closedAggregate(rows,60,'2025-01-05T23:00Z');assert.equal(result.length,1);assert.equal(result[0].volume,55);assert.equal(result[0].open,1);assert.equal(result[0].ask_close,1.01);
 assert.equal(closedAggregate(rows.filter((_,i)=>i!==5),60,'2025-01-05T23:00Z').length,0);
 assert.equal(closedAggregate(rows.map(r=>({...r,source:'UNVERIFIED'})),60,'2025-01-05T23:00Z').length,0);
});
test('Gold canonical production adapter retains native bid/ask identity without masquerading as an MT5 connection',()=>{
 const end=at('2025-01-08T14:00Z'),rows=Array.from({length:100},(_,i)=>({symbol:'XAUUSD',market_type:'forex',source,timeframe:'15m',open_time:new Date(end-(100-i)*900000).toISOString(),open:2000+i,high:2002+i,low:1998+i,close:2001+i,volume:100,ask_open:2000.2+i,ask_high:2002.2+i,ask_low:1998.2+i,ask_close:2001.2+i})),ctx={symbol:'XAUUSD',market:'forex' as const,timeframe:'15m',candles:rows,indicators:calculateActiveIndicators(rows),evaluated_at:new Date(end).toISOString()};
 const result=FOREX_PRODUCTION_EVALUATORS['gold.volatility-breakout'](ctx);assert.notEqual(result.rejection_reason,'gold_provider_or_symbol_metadata_invalid');assert.equal(result.score_breakdown.provider,'EXNESS_REFERENCE');
 const invalid=FOREX_PRODUCTION_EVALUATORS['gold.volatility-breakout']({...ctx,candles:rows.map(r=>({...r,ask_low:r.low-1}))});assert.equal(invalid.rejection_reason,'gold_provider_or_symbol_metadata_invalid');
});
