import {launchSeries} from './launch-strategy-families.ts';
import type {LegacyStrategyResult,StrategyDefinition,StrategyEvaluationContext} from './professional-strategies.ts';
export const CRYPTO_SHORT_RESEARCH_CANDIDATES=[
 {symbol:'DOGEUSDT',family:'vwap_reclaim',minutes:5,n:24,stop:2,rr:1.5,hold:12},
 {symbol:'ETHUSDT',family:'donchian',minutes:15,n:48,stop:3,rr:1.5,hold:24},
 {symbol:'XRPUSDT',family:'bollinger',minutes:15,n:24,stop:2,rr:1.5,hold:24},
 {symbol:'SOLUSDT',family:'rsi2',minutes:15,n:12,stop:1.5,rr:5,hold:24},
 {symbol:'LTCUSDT',family:'failed_breakout',minutes:15,n:48,stop:3,rr:1.5,hold:24},
 {symbol:'ADAUSDT',family:'bollinger',minutes:5,n:24,stop:3,rr:5,hold:24},
] as const;
export type CryptoShortCandidate=typeof CRYPTO_SHORT_RESEARCH_CANDIDATES[number];
// Exact configurations rejected by complete canonical replay remain research history,
// never customer choices. Active candidates retain both positive account periods.
export const CRYPTO_SHORT_CANDIDATES=CRYPTO_SHORT_RESEARCH_CANDIDATES.filter(c=>['DOGEUSDT','LTCUSDT'].includes(c.symbol));
export const CRYPTO_SHORT_ATR_FLOOR=.006;
export const cryptoShortId=(c:CryptoShortCandidate)=>`crypto.native-${c.family.replaceAll('_','-')}-${c.minutes}-${c.n}-${c.stop}-${c.rr}-${c.symbol.toLowerCase()}-h${c.hold}-v${CRYPTO_SHORT_ATR_FLOOR}`;
const reject=(reason:string):LegacyStrategyResult=>({status:'rejected',direction:'none',entry_low:0,entry_high:0,stop_loss:0,tp1:0,tp2:0,risk_reward:0,confidence_score:0,grade:'reject',reason,rejection_reason:reason,score_breakdown:{}});
export function evaluateCryptoShort(ctx:StrategyEvaluationContext,c:CryptoShortCandidate):LegacyStrategyResult{
 const rows=ctx.candles,tf=c.minutes===5?'5m':'15m',w=c.minutes*60000;
 if(ctx.market!=='crypto'||ctx.symbol!==c.symbol||ctx.timeframe!==tf||rows.length<Math.max(100,c.n*3)||Date.parse(rows.at(-1)!.open_time)+w!==Date.parse(ctx.evaluated_at))return reject('NATIVE_CLOSED_SHORT_HISTORY_REQUIRED');
 if(rows.some((b,i)=>b.symbol!==c.symbol||b.timeframe!==tf||b.instrument_type!=='USDT_PERPETUAL'||!b.source||b.source!==rows[0].source||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.volume<0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||(i>0&&Date.parse(b.open_time)-Date.parse(rows[i-1].open_time)!==w)))return reject('NATIVE_SHORT_HISTORY_INVALID');
 const s=launchSeries(rows,c.n),i=rows.length-1,b=rows[i],atr=s.atr[i],trend=(s.fast[i]-s.slow[i])/atr;
 if(!(atr/b.close>=CRYPTO_SHORT_ATR_FLOOR))return reject('CLOSED_VOLATILITY_COST_FLOOR');
 const prior=rows.slice(i-c.n,i),hi=Math.max(...prior.map(b=>b.high)),lo=Math.min(...prior.map(b=>b.low));let buy=false,sell=false;
 if(c.family==='donchian'){buy=b.close>hi&&s.fast[i]>s.slow[i];sell=b.close<lo&&s.fast[i]<s.slow[i];}
 if(c.family==='failed_breakout'){buy=b.low<lo&&b.close>lo&&b.close>b.open&&Math.abs(trend)<1;sell=b.high>hi&&b.close<hi&&b.close<b.open&&Math.abs(trend)<1;}
 if(c.family==='bollinger'){const closes=rows.slice(i-c.n+1,i+1).map(b=>b.close),mean=closes.reduce((a,b)=>a+b,0)/c.n,std=Math.sqrt(closes.reduce((a,b)=>a+(b-mean)**2,0)/c.n);buy=b.close<mean-2*std&&Math.abs(trend)<1;sell=b.close>mean+2*std&&Math.abs(trend)<1;}
 if(c.family==='rsi2'){let gain=0,loss=0;for(let j=1;j<=i;j++){const change=rows[j].close-rows[j-1].close,g=Math.max(change,0),l=Math.max(-change,0);gain=j===1?g:gain+.5*(g-gain);loss=j===1?l:loss+.5*(l-loss);}const rsi=loss===0?NaN:100-100/(1+gain/loss);buy=b.close>s.slow[i]&&rsi<10;sell=b.close<s.slow[i]&&rsi>90;}
 if(c.family==='vwap_reclaim'){
  for(const row of rows.slice(-2)){const dayStart=rows.find(b=>b.open_time.slice(0,10)===row.open_time.slice(0,10));if(!dayStart||Date.parse(dayStart.open_time)%86400000!==0)return reject('COMPLETE_UTC_VWAP_SESSION_REQUIRED');}
  let day='',quote=0,base=0;const vwap:number[]=[];
  for(const row of rows){if(!Number.isFinite(row.quote_volume)||row.quote_volume!<0)return reject('NATIVE_QUOTE_VOLUME_REQUIRED');const next=row.open_time.slice(0,10);if(next!==day){day=next;quote=0;base=0;}quote+=row.quote_volume!;base+=row.volume;vwap.push(base>0?quote/base:NaN);}
  buy=b.close>vwap[i]&&rows[i-1].close<=vwap[i-1]&&s.fast[i]>s.slow[i];sell=b.close<vwap[i]&&rows[i-1].close>=vwap[i-1]&&s.fast[i]<s.slow[i];
 }
 if(!buy&&!sell)return reject('FROZEN_SHORT_FAMILY_CONDITION_ABSENT');
 const side=buy?1:-1,dist=atr*c.stop,stop=b.close-side*dist,target=b.close+side*dist*c.rr;
 if(!(dist>0&&stop>0&&target>0))return reject('INVALID_PRICE_GEOMETRY');
 return {status:'candidate',direction:buy?'buy':'sell',entry_low:b.close,entry_high:b.close,stop_loss:stop,tp1:target,tp2:target,risk_reward:c.rr,confidence_score:80,grade:'A',reason:`Closed ${tf} ${c.family}; native perpetual volatility above its fixed cost floor.`,rejection_reason:'',score_breakdown:{research_only:true,score_is_probability:false,atr14:atr,minimum_atr_fraction:CRYPTO_SHORT_ATR_FLOOR,lookback:c.n,stop_atr:c.stop,reward_r:c.rr,max_bars_in_trade:c.hold,seed_open_time:rows[0].open_time,seed_policy:'FIRST_CLOSE_RECURSIVE'}};
}
export function cryptoShortDefinitions():StrategyDefinition[]{return CRYPTO_SHORT_CANDIDATES.map(c=>({id:cryptoShortId(c),version:'1.0.0',legacyName:cryptoShortId(c),market:'crypto',lifecycle:'RESEARCH',publicationMode:'SHADOW',certification:'RESEARCH',config:{strategy_name:cryptoShortId(c),enabled:false,min_score:75,min_rr:Math.max(.8,c.rr-.6),max_bars_in_trade:c.hold,allowed_symbols:[c.symbol],allowed_timeframes:[c.minutes===5?'5m':'15m'],params:{minimum_atr_fraction:CRYPTO_SHORT_ATR_FLOOR}},evaluate:ctx=>evaluateCryptoShort(ctx,c)}));}
export function cryptoShortProfile(id:string){const c=CRYPTO_SHORT_CANDIDATES.find(c=>cryptoShortId(c)===id);return c?{family:c.family==='donchian'?'BREAKOUT' as const:c.family==='bollinger'||c.family==='failed_breakout'?'REVERSAL' as const:'TREND' as const}:null;}
