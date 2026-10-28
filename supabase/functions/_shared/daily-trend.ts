import {DAILY_TREND_ID,DAILY_EXIT_POLICY,DAILY_SYMBOLS} from './daily-trend-contract.ts';
import type {StrategyCandle,StrategyDefinition,StrategyEvaluationContext,LegacyStrategyResult} from './professional-strategies.ts';
const DAY=86400000;
/** Exact original research seed, intentionally distinct from root EMA's SMA seed. */
export function dailySeries(rows:readonly StrategyCandle[]){
 const ema=(n:number)=>{const out:number[]=[];for(let i=0;i<rows.length;i++)out.push(i?out[i-1]+2/(n+1)*(rows[i].close-out[i-1]):rows[i].close);return out;};
 const atr=Array<number>(rows.length).fill(NaN),tr=rows.map((c,i)=>i?Math.max(c.high-c.low,Math.abs(c.high-rows[i-1].close),Math.abs(c.low-rows[i-1].close)):NaN);
 if(rows.length>14){atr[14]=tr.slice(1,15).reduce((a,b)=>a+b,0)/14;for(let i=15;i<rows.length;i++)atr[i]=(atr[i-1]*13+tr[i])/14;}
 return {fast:ema(20),slow:ema(50),regime:ema(200),atr};
}
export function admitDailyRows(rows:readonly StrategyCandle[],symbol:string){return DAILY_SYMBOLS.includes(symbol)&&rows.length>=201&&rows.every((c,i)=>c.symbol===symbol&&c.timeframe==='1d'&&c.market_type==='crypto'&&c.instrument_type==='SPOT'&&['BINANCE_KLINES','BINANCE_SPOT_KLINES'].includes(c.source)&&Number.isFinite(Date.parse(c.open_time))&&Date.parse(c.open_time)%DAY===0&&(!i||Date.parse(c.open_time)-Date.parse(rows[i-1].open_time)===DAY)&&[c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)&&c.low>0&&c.volume>=0&&c.low<=Math.min(c.open,c.close)&&c.high>=Math.max(c.open,c.close));}
export function evaluateDailyTrend(ctx:StrategyEvaluationContext):LegacyStrategyResult{
 const rejected=(reason:string):LegacyStrategyResult=>({status:'rejected',direction:'none',entry_low:0,entry_high:0,stop_loss:0,tp1:0,tp2:0,risk_reward:0,confidence_score:0,grade:'reject',reason,rejection_reason:reason,score_breakdown:{}});
 if(ctx.market!=='crypto'||ctx.timeframe!=='1d'||Object.keys(ctx.strategy_parameters??{}).length||!admitDailyRows(ctx.candles,ctx.symbol)||Date.parse(ctx.candles.at(-1)!.open_time)+DAY!==Date.parse(ctx.evaluated_at))return rejected('DAILY_NATIVE_SPOT_HISTORY_REQUIRED');
 const f=dailySeries(ctx.candles),i=ctx.candles.length-1,c=ctx.candles[i],stop=c.close-2*f.atr[i];
 if(!(f.fast[i]>f.slow[i]&&c.close>f.regime[i]&&f.atr[i]>0&&stop>0))return rejected('DAILY_BULL_REGIME_ABSENT');
 return {status:'candidate',direction:'buy',entry_low:c.close,entry_high:c.close,stop_loss:stop,tp1:0,tp2:0,risk_reward:0,confidence_score:80,grade:'A',reason:'Closed daily EMA20 > EMA50 and close > EMA200; next-open SPOT entry; 2ATR protection and 3ATR closed-bar trail; regime exit next open.',rejection_reason:'',score_breakdown:{exit_policy:DAILY_EXIT_POLICY,research_only:true,instrument_type:'SPOT',score_is_probability:false,rr_status:'NOT_APPLICABLE',ema20:f.fast[i],ema50:f.slow[i],ema200:f.regime[i],atr14:f.atr[i],seed_open_time:ctx.candles[0].open_time,seed_policy:'FIRST_CLOSE_RECURSIVE',cost_bps:26}};
}
export function dailyTrendDefinitions():StrategyDefinition[]{return [{id:DAILY_TREND_ID,version:'1.0.0',legacyName:'DailyEmaTrend',market:'crypto',lifecycle:'DISABLED',publicationMode:'SHADOW',certification:'RESEARCH',config:{strategy_name:'DailyEmaTrend',enabled:false,min_score:75,min_rr:0,max_bars_in_trade:3650,allowed_symbols:[...DAILY_SYMBOLS],allowed_timeframes:['1d'],params:{}},evaluate:evaluateDailyTrend}];}
