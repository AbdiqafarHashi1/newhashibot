/** Learned utility forecasts R; it is neither a probability nor a risk authority. */
import { atrRootV1, emaRootV1, rsiRootV1 } from './indicator-engine.ts';
import type { LegacyStrategyResult, StrategyCandle, StrategyDefinition, StrategyEvaluationContext } from './professional-strategies.ts';
export const COST_AWARE_IDS = ['crypto.cost-aware-15m', 'forex.cost-aware-hourly'] as const;
export const COST_AWARE_VERSION = '1.0.0';
export const BASE_FEATURES = ['return1_atr','return4_atr','return16_atr','return64_atr','ema_spread_atr','distance_ema_atr',
  'rsi_centered','body_atr','range_atr','close_location','log_relative_volume','atr_fraction','efficiency16',
  'clock_sin','clock_cos','weekday_sin','weekday_cos','estimated_cost_r','trend_volume_interaction'] as const;
export const FLOW_FEATURES = ['taker_imbalance','taker_imbalance4','flow_return_interaction'] as const;
const reject = (reason: string): LegacyStrategyResult => ({status:'rejected',direction:'none',entry_low:0,entry_high:0,
  stop_loss:0,tp1:0,tp2:0,risk_reward:0,confidence_score:0,grade:'reject',reason,rejection_reason:reason,
  score_breakdown:{score_is_probability:false,measured_release_required:true}});
const forexClock=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',hourCycle:'h23'});
function closedWeekend(t:number) { const parts=forexClock.formatToParts(new Date(t)),day=parts.find(p=>p.type==='weekday')?.value,hour=Number(parts.find(p=>p.type==='hour')?.value);return day==='Sat'||day==='Sun'&&hour<17||day==='Fri'&&hour>=17; }
export function costAwareFeatures(context: Pick<StrategyEvaluationContext,'candles'|'market'|'timeframe'|'symbol'|'evaluated_at'>, costsBps: number, stopAtr=2) {
  const rows=context.candles,crypto=context.market==='crypto',width=crypto?900000:3600000,at=Date.parse(context.evaluated_at);
  if(context.timeframe!==(crypto?'15m':'1h')||rows.length<110||!Number.isFinite(at)||!Number.isFinite(costsBps)||costsBps<0||!Number.isFinite(stopAtr)||stopAtr<=0)throw Error('MODEL_CONTEXT_INVALID');
  for(let i=0;i<rows.length;i++){
    const r=rows[i],t=Date.parse(r.open_time);
    if(r.symbol!==context.symbol||r.market_type!==context.market||r.timeframe!==context.timeframe||![r.open,r.high,r.low,r.close,r.volume,t].every(Number.isFinite)||t%width||t+width>at||r.low<=0||r.volume<0||r.high<Math.max(r.open,r.close)||r.low>Math.min(r.open,r.close))throw Error('MODEL_CANDLES_INVALID');
    if(i){const previous=Date.parse(rows[i-1].open_time),gap=t-previous;if(gap<=0||gap%width||gap>72*3600000)throw Error('MODEL_CANDLE_GAP');
      for(let missing=previous+width;missing<t;missing+=width)if(crypto||!closedWeekend(missing))throw Error('MODEL_CANDLE_GAP');}
  }
  const last=rows.at(-1)!,time=Date.parse(last.open_time);
  if(at-time-width>=width)throw Error('MODEL_CANDLES_STALE');
  const atr=atrRootV1([...rows.slice(0,-1)],14),closes=rows.map(r=>r.close);
  if(!(atr>0)||last.high-last.low>3*atr||Math.abs(last.open-rows.at(-2)!.close)>atr)throw Error('MODEL_SHOCK_OR_VOLATILITY_INVALID');
  if(!crypto&&(!Number.isFinite(last.ask_close)||last.ask_close!<last.close||!rows.slice(-4).every(r=>r.source==='DUKASCOPY_BROKER_BID_ASK'||r.source.startsWith('mt5_hashibridge:'))))throw Error('NATIVE_BROKER_QUOTE_EVIDENCE_REQUIRED');
  const spreadBps=crypto?0:(last.ask_close!-last.close)/last.close*10000;
  const risk=atr*stopAtr,costR=last.close*(costsBps+spreadBps)/10000/risk,averageVolume=rows.slice(-25,-1).reduce((n,r)=>n+r.volume,0)/24;
  if(!(averageVolume>0)||!(last.volume>0)||risk>=last.close)throw Error('MODEL_VOLUME_OR_GEOMETRY_INVALID');
  const fast=emaRootV1(closes,20),slow=emaRootV1(closes,50),range=last.high-last.low,path=closes.slice(-17),travel=path.slice(1).reduce((n,x,i)=>n+Math.abs(x-path[i]),0);
  const stamp=new Date(time),clock=(stamp.getUTCHours()+stamp.getUTCMinutes()/60)/24*2*Math.PI,day=stamp.getUTCDay()/7*2*Math.PI;
  const values=[1,4,16,64].map(lag=>(last.close-closes.at(-1-lag)!)/atr);
  values.push((fast-slow)/atr,(last.close-fast)/atr,(rsiRootV1(closes,14)-50)/50,(last.close-last.open)/atr,
    range/atr,range?(last.close-last.low)/range:.5,Math.log(Math.max(last.volume/averageVolume,1e-9)),atr/last.close,
    travel?Math.abs(path.at(-1)!-path[0])/travel:0,Math.sin(clock),Math.cos(clock),Math.sin(day),Math.cos(day),costR,
    (fast-slow)/atr*Math.log(Math.max(last.volume/averageVolume,1e-9)));
  if(crypto){
    const observed=rows.slice(-4);
    if(observed.some(r=>r.instrument_type!=='USDT_PERPETUAL'||!['BINANCE_USDM_KLINES','BINANCE_UM_FUTURES_ARCHIVE'].includes(r.source)||
      !Number.isFinite(r.taker_buy_volume)||r.taker_buy_volume!<0||r.taker_buy_volume!>r.volume||!(r.volume>0)))throw Error('NATIVE_FUTURES_FLOW_REQUIRED');
    const imbalance=(r:StrategyCandle)=>2*r.taker_buy_volume!/r.volume-1,flow=imbalance(last),four=observed.reduce((n,r)=>n+r.taker_buy_volume!,0)/observed.reduce((n,r)=>n+r.volume,0)*2-1;
    values.push(flow,four,flow*values[0]);
  }
  if(!values.every(Number.isFinite))throw Error('MODEL_FEATURE_NONFINITE');
  return {values,names:crypto?[...BASE_FEATURES,...FLOW_FEATURES]:[...BASE_FEATURES],atr,risk,costR};
}
export function predictUtility(values:readonly number[],p:Readonly<Record<string,number>>) {
  if(![1,2].includes(p.model_schema)||p.feature_count!==values.length)throw Error('MODEL_SCHEMA_MISMATCH');
  const heads=[p.long_intercept,p.short_intercept];
  if(!heads.every(Number.isFinite))throw Error('MODEL_COEFFICIENTS_MISSING');
  const normalized:number[]=[];
  values.forEach((x,i)=>{
    const mean=p[`mean_${i}`],scale=p[`scale_${i}`],long=p[`long_${i}`],short=p[`short_${i}`];
    if(![x,mean,scale].every(Number.isFinite)||scale<=0||p.model_schema===1&&![long,short].every(Number.isFinite))throw Error('MODEL_COEFFICIENTS_INVALID');
    const z=Math.max(-5,Math.min(5,(x-mean)/scale));normalized.push(Math.fround(z));
    if(p.model_schema===1){heads[0]+=z*long;heads[1]+=z*short;}
  });
  if(p.model_schema===2){
    if(!Number.isSafeInteger(p.tree_count)||p.tree_count<1||p.tree_count>100||!Number.isFinite(p.learning_rate)||p.learning_rate<=0||p.learning_rate>.1)throw Error('MODEL_TREE_BOUNDS_INVALID');
    for(let head=0;head<2;head++)for(let tree=0;tree<p.tree_count;tree++){
      const prefix=`h${head}t${tree}`,count=p[`${prefix}_count`];let node=0,leaf=false;
      if(!Number.isSafeInteger(count)||count<1||count>7)throw Error('MODEL_TREE_SIZE_INVALID');
      for(let depth=0;depth<4;depth++){
        const key=`${prefix}n${node}`,feature=p[`${key}f`];
        if(feature===-2){const v=p[`${key}v`];if(!Number.isFinite(v))throw Error('MODEL_LEAF_INVALID');heads[head]+=p.learning_rate*v;leaf=true;break;}
        const threshold=p[`${key}b`],left=p[`${key}l`],right=p[`${key}r`];
        if(!Number.isSafeInteger(feature)||feature<0||feature>=values.length||!Number.isFinite(threshold)||
          ![left,right].every(x=>Number.isSafeInteger(x)&&x>=0&&x<count))throw Error('MODEL_TREE_NODE_INVALID');
        node=normalized[feature]<=threshold?left:right;
      }
      if(!leaf)throw Error('MODEL_TREE_CYCLE_OR_DEPTH_INVALID');
    }
  }
  if(!heads.every(Number.isFinite))throw Error('MODEL_FORECAST_NONFINITE');
  return {longNetR:heads[0],shortNetR:heads[1]};
}
export function evaluateCostAware(context:StrategyEvaluationContext,p:Readonly<Record<string,number>>={}):LegacyStrategyResult {
  try{
    const at=Date.parse(context.evaluated_at);
    if(![1,2].includes(p.model_schema)||p.trained_through_ms>=p.valid_from_ms||!Number.isFinite(p.trained_through_ms)||
       !Number.isFinite(p.valid_from_ms)||!Number.isFinite(p.valid_until_ms)||p.valid_until_ms<=p.valid_from_ms||
       at<p.valid_from_ms||at>=p.valid_until_ms||p.publication_approved!==0)throw Error('RESEARCH_MODEL_MISSING_EXPIRED_OR_UNSAFE');
    if(p.minimum_predicted_net_r<.15||!Number.isFinite(p.minimum_predicted_net_r)||p.stop_atr!==2||p.max_bars!==32||p.target_r!==2.5||p.tp1_r!==1)throw Error('MODEL_POLICY_MISMATCH');
    const features=costAwareFeatures(context,p.estimated_cost_bps,p.stop_atr),prediction=predictUtility(features.values,p);
    const side=prediction.longNetR>=prediction.shortNetR?1:-1,net=side===1?prediction.longNetR:prediction.shortNetR;
    if(net<p.minimum_predicted_net_r)return reject('PREDICTED_NET_EDGE_INSUFFICIENT');
    const entry=context.candles.at(-1)!.close;
    return{status:'candidate',direction:side===1?'buy':'sell',entry_low:entry,entry_high:entry,stop_loss:entry-side*features.risk,
      tp1:entry+side*features.risk*p.tp1_r,tp2:entry+side*features.risk*p.target_r,risk_reward:p.target_r,confidence_score:80,grade:'A',
      reason:'COST_AWARE_WALK_FORWARD_UTILITY',rejection_reason:'',score_breakdown:{forecast_net_r:net,estimated_cost_r:features.costR,
        model_trained_through:p.trained_through_ms,model_valid_until:p.valid_until_ms,cost_aware_policy_version:'cost-aware-opportunity/v1',
        score_is_probability:false,forecast_is_guarantee:false,measured_release_required:true}};
  }catch(e){return reject(e instanceof Error?e.message:'MODEL_FAILURE');}
}
export function costAwareResearchDefinitions():StrategyDefinition[]{return COST_AWARE_IDS.map((id,index)=>({id,version:COST_AWARE_VERSION,legacyName:id,
  market:index===0?'crypto':'forex',lifecycle:'DISABLED',publicationMode:'SHADOW',certification:'RESEARCH',
  config:{strategy_name:id,enabled:false,min_score:75,min_rr:1.5,max_bars_in_trade:32,allowed_symbols:index===0?['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT']:['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD'],allowed_timeframes:[index===0?'15m':'1h'],params:{}},
  evaluate:context=>evaluateCostAware(context,context.strategy_parameters)}));}
