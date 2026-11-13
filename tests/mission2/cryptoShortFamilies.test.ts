import {test} from 'node:test';import assert from 'node:assert/strict';
import {CRYPTO_SHORT_CANDIDATES,cryptoShortId,cryptoShortDefinitions,evaluateCryptoShort} from '../../supabase/functions/_shared/crypto-short-families.ts';
import {authorizeHistoricalResearch} from '../../supabase/functions/_shared/historical-research-authorization.ts';
import {discoverWatchedStrategies} from '../../supabase/functions/_shared/watched-strategy-discovery.ts';
import type {StrategyCandle,StrategyEvaluationContext} from '../../supabase/functions/_shared/professional-strategies.ts';
for(const c of CRYPTO_SHORT_CANDIDATES)test(`${cryptoShortId(c)} preserves its own entry, automatic confirmation and exact holding contract`,async()=>{
 const w=c.minutes*60000,start=Date.parse('2025-01-01T00:00:00Z'),tf=c.minutes===5?'5m':'15m',range=['bollinger','failed_breakout'].includes(c.family);
 const rows:StrategyCandle[]=Array.from({length:200},(_,i)=>{const close=range?100+Math.sin(i)*.2:100+i*.1;return {symbol:c.symbol,market_type:'crypto',timeframe:tf,source:'BINANCE_USDM_KLINES',instrument_type:'USDT_PERPETUAL',open_time:new Date(start+i*w).toISOString(),open:close-.05,high:close+.8,low:close-.8,close,volume:100,quote_volume:close*100};});
 const set=(i:number,close:number,open=close-.1,low=Math.min(close,open)-.8,high=Math.max(close,open)+.8)=>{rows[i]={...rows[i],open,high,low,close,quote_volume:close*100};};
 if(c.family==='donchian')set(199,122);
 if(c.family==='bollinger')set(199,97,97.1);
 if(c.family==='failed_breakout')set(199,100.1,99.9,98,100.8);
 if(c.family==='vwap_reclaim'){set(198,108,108.1);set(199,112,111.9);}
 if(c.family==='rsi2')for(let i=196;i<200;i++)set(i,119.5-(i-195)*.2,119.65-(i-195)*.2);
 const now=start+rows.length*w,ctx:StrategyEvaluationContext={symbol:c.symbol,market:'crypto',timeframe:tf,candles:rows,evaluated_at:new Date(now).toISOString(),indicators:{}},r=evaluateCryptoShort(ctx,c);
 assert.equal(r.status,'candidate',r.reason);assert.equal(r.tp1,r.tp2);assert.equal(r.score_breakdown.max_bars_in_trade,c.hold);
 const definitions=await authorizeHistoricalResearch(cryptoShortDefinitions().filter(d=>d.id===cryptoShortId(c)),'short-entry-integration'),found=discoverWatchedStrategies({definitions,symbol:c.symbol,tf,rows,now});assert.equal(found.setups.length,1,JSON.stringify(found.observations));const s=found.setups[0];assert.equal(s.entryDecision?.kind,'IMMEDIATE_CONFIRMED');assert.equal(s.entryDecision?.executionEligible,false);assert.equal(s.holdBars,c.hold);assert.equal(s.management?.partialFraction,0);
 assert.equal(evaluateCryptoShort({...ctx,evaluated_at:new Date(now-1).toISOString()},c).status,'rejected');assert.equal(evaluateCryptoShort({...ctx,symbol:'BTCUSDT'},c).status,'rejected');assert.equal(evaluateCryptoShort({...ctx,candles:rows.map(b=>({...b,instrument_type:'SPOT'}))},c).status,'rejected');
 if(c.family==='vwap_reclaim'){assert.equal(evaluateCryptoShort({...ctx,candles:rows.map(b=>({...b,quote_volume:undefined}))},c).rejection_reason,'NATIVE_QUOTE_VOLUME_REQUIRED');assert.equal(evaluateCryptoShort({...ctx,candles:rows.slice(1)},c).rejection_reason,'COMPLETE_UTC_VWAP_SESSION_REQUIRED');}
});
test('short entry volatility floor rejects an otherwise valid but uneconomic small-range breakout',()=>{
 const c=CRYPTO_SHORT_CANDIDATES.find(c=>c.family==='donchian')!,w=900000,start=Date.parse('2025-01-01T00:00:00Z'),rows:StrategyCandle[]=Array.from({length:200},(_,i)=>{const close=100+i*.001;return{symbol:c.symbol,market_type:'crypto',timeframe:'15m',source:'BINANCE_USDM_KLINES',instrument_type:'USDT_PERPETUAL',open_time:new Date(start+i*w).toISOString(),open:close-.001,high:close+.005,low:close-.005,close,volume:100};});rows[199].close+=.01;rows[199].high=rows[199].close+.002;
 const r=evaluateCryptoShort({symbol:c.symbol,market:'crypto',timeframe:'15m',candles:rows,evaluated_at:new Date(start+200*w).toISOString(),indicators:{}},c);assert.equal(r.rejection_reason,'CLOSED_VOLATILITY_COST_FLOOR');
});

test('native short entries request complete-session history and one consistent perpetual venue across context frames',async()=>{
 const {watchedHistoryBars,watchedCryptoInstrument}=await import('../../supabase/functions/_shared/strategy-runtime-parameters.ts'),defs=await authorizeHistoricalResearch(cryptoShortDefinitions(),'short-feed-test');
 assert.equal(watchedHistoryBars(defs,'DOGEUSDT','5m'),960);assert.equal(watchedCryptoInstrument(defs,'DOGEUSDT'),'USDT_PERPETUAL');assert.equal(watchedCryptoInstrument(defs,'ETHUSDT'),'USDT_PERPETUAL');assert.equal(watchedCryptoInstrument(defs,'BTCUSDT'),'SPOT');assert.equal(watchedCryptoInstrument(cryptoShortDefinitions(),'DOGEUSDT'),'SPOT');
});
