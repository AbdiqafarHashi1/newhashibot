import {consecutiveMarketBars,scheduledMarketClosed} from './conditional-market.ts';
/** Complementary fixed-bracket hypotheses in the existing registry contract.
 * Uses root indicator semantics, closed native candles and no account/execution authority.
 * v1 deliberately keeps numerical TP2 for the existing signal/management contract.
 */
import {atrRootV1,emaRootV1,rsiRootV1,trueRange} from './indicator-engine.ts';
import type {StrategyCandle as Bar,StrategyDefinition,StrategyEvaluationContext as Context,LegacyStrategyResult as Result,StrategyRuntimeConfig} from './professional-strategies.ts';
export const COMPLEMENTARY_VERSION='1.0.0';
export const COMPLEMENTARY_ROLES=['ema-pullback','band-reclaim','session-orb','fvg-sweep','donchian-breakout','level-divergence'] as const;
export type ComplementaryRole=typeof COMPLEMENTARY_ROLES[number];
const WIDTH:Record<string,number>={'5m':300000,'15m':900000,'1h':3600000,'4h':14400000};
const mean=(v:readonly number[])=>v.reduce((a,b)=>a+b,0)/v.length;
const ema=(r:readonly Bar[],n:number)=>r.length>=n?emaRootV1(r.map(c=>c.close),n):NaN;
const hi=(r:readonly Bar[])=>Math.max(...r.map(c=>c.high)),lo=(r:readonly Bar[])=>Math.min(...r.map(c=>c.low));
const rejection=(reason:string):Result=>({status:'rejected',direction:'none',entry_low:0,entry_high:0,stop_loss:0,tp1:0,tp2:0,risk_reward:0,confidence_score:0,grade:'reject',reason,rejection_reason:reason,score_breakdown:{complementary_policy:'complementary/v1',score_is_probability:false}});
/** Wilder ADX; root SMA ATR/RSI remain unchanged elsewhere. */
export function complementaryAdx(rows:readonly Bar[],n=14):number {
 if(rows.length<2*n+1)return NaN;
 const tr:number[]=[],plus:number[]=[],minus:number[]=[];
 for(let i=1;i<rows.length;i++){const up=rows[i].high-rows[i-1].high,down=rows[i-1].low-rows[i].low;tr.push(trueRange(rows[i],rows[i-1].close));plus.push(up>down&&up>0?up:0);minus.push(down>up&&down>0?down:0);}
 let a=mean(tr.slice(0,n)),p=mean(plus.slice(0,n)),m=mean(minus.slice(0,n));const dx:number[]=[];
 for(let i=n-1;i<tr.length;i++){if(i>=n){a=(a*(n-1)+tr[i])/n;p=(p*(n-1)+plus[i])/n;m=(m*(n-1)+minus[i])/n;}const total=p+m;dx.push(a>0&&total>0?100*Math.abs(p-m)/total:0);}
 let adx=mean(dx.slice(0,n));for(let i=n;i<dx.length;i++)adx=(adx*(n-1)+dx[i])/n;return adx;
}
export function complementaryAggregate(rows:readonly Bar[],sourceWidth:number,targetWidth:number):Bar[]{
 if(targetWidth<sourceWidth||targetWidth%sourceWidth)return [];
 const result:Bar[]=[];let group:Bar[]=[];let bucket=-1;
 const asOf=rows.length?Date.parse(rows.at(-1)!.open_time)+sourceWidth:0;
 const flush=()=>{
  if(!group.length||bucket+targetWidth>asOf)return;
  const expected:number[]=[];
  for(let t=bucket;t<bucket+targetWidth;t+=sourceWidth)if(group[0].market_type==='crypto'||!scheduledMarketClosed(group[0].symbol,t))expected.push(t);
  if(group.length!==expected.length||group.some((c,i)=>Date.parse(c.open_time)!==expected[i]))return;
  result.push({...group[0],open_time:new Date(bucket).toISOString(),timeframe:targetWidth===3600000?'1h':'4h',high:hi(group),low:lo(group),close:group.at(-1)!.close,volume:group.reduce((s,c)=>s+c.volume,0)});
 };
 for(const c of rows){const b=Math.floor(Date.parse(c.open_time)/targetWidth)*targetWidth;if(b!==bucket){flush();group=[];bucket=b;}group.push(c);}flush();return result;
}
function admitted(ctx:Context):readonly Bar[]|null{
 const width=WIDTH[ctx.timeframe],at=Date.parse(ctx.evaluated_at),r=ctx.candles.slice(-220);
 if(!width||!Number.isFinite(at)||r.length<64||ctx.market==='forex'&&scheduledMarketClosed(ctx.symbol,at))return null;
 const close=Date.parse(r.at(-1)!.open_time)+width;
 if(close>at||at-close>width)return null;
 for(let i=0;i<r.length;i++){const c=r[i],t=Date.parse(c.open_time);if(c.symbol!==ctx.symbol||c.timeframe!==ctx.timeframe||c.market_type!==ctx.market||!Number.isFinite(t)||t%width||![c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)||c.low<=0||c.volume<0||c.low>Math.min(c.open,c.close)||c.high<Math.max(c.open,c.close)||i>0&&t<=Date.parse(r[i-1].open_time))return null;
  if(i>0&&!consecutiveMarketBars(ctx.symbol,Date.parse(r[i-1].open_time),t,width))return null;}
 return r;
}
export function complementaryRegime(rows:readonly Bar[],asOf:string):{regime:string;enabled:readonly ComplementaryRole[];adx:number;atr:number}{
 const adx=complementaryAdx(rows),atr=atrRootV1(rows,14),baseline=mean(Array.from({length:20},(_,i)=>atrRootV1(rows.slice(0,rows.length-i),14)));
 if(!Number.isFinite(adx)||!(atr>0&&baseline>0))return {regime:'UNAVAILABLE',enabled:[],adx,atr};
 if(atr>2.5*baseline)return {regime:'VOLATILITY_LOCK',enabled:[],adx,atr};
 const enabled:ComplementaryRole[]=adx>25?['ema-pullback','fvg-sweep','donchian-breakout']:adx<20?['band-reclaim','level-divergence']:adx>22?['donchian-breakout']:[];
 const t=new Date(asOf),minute=t.getUTCHours()*60+t.getUTCMinutes();
 if(adx>=20&&t.getUTCDay()!==0&&t.getUTCDay()!==6&&(minute>=420&&minute<600||minute>=810&&minute<960))enabled.push('session-orb');
 return {regime:adx>25?'TREND':adx<20?'RANGE':'TRANSITION',enabled,adx,atr};
}
function engulf(r:readonly Bar[],s:number){const a=r.at(-2)!,b=r.at(-1)!;return s*(b.close-b.open)>0&&s*(a.close-a.open)<0&&s*(b.open-a.close)<=0&&s*(b.close-a.open)>=0;}
function pin(c:Bar,s:number){const body=Math.abs(c.close-c.open),range=c.high-c.low,tail=s===1?Math.min(c.close,c.open)-c.low:c.high-Math.max(c.close,c.open),opposite=s===1?c.high-Math.max(c.close,c.open):Math.min(c.close,c.open)-c.low;return range>0&&tail>=2*body&&tail>=2*opposite&&(s===1?c.close>=c.low+.66*range:c.close<=c.low+.34*range);}
function pivots(r:readonly Bar[],s:number):number[]{const out:number[]=[];for(let i=2;i<r.length-2;i++){const v=s===1?r[i].low:r[i].high,others=[r[i-2],r[i-1],r[i+1],r[i+2]];if(s===1?others.every(c=>v<c.low):others.every(c=>v>c.high))out.push(i);}return out;}
function bands(r:readonly Bar[]){const closes=r.slice(-20).map(c=>c.close),mid=mean(closes),sd=Math.sqrt(mean(closes.map(c=>(c-mid)**2)));return {mid,lower:mid-2*sd,upper:mid+2*sd};}
export interface ComplementaryProposal {side:number;stop:number;tp1:number;tp2:number;setup:string;details:Record<string,string|number|boolean>}
export function complementaryProposal(role:ComplementaryRole,ctx:Context):ComplementaryProposal|null {
 const r=admitted(ctx);if(!r)return null;const c=r.at(-1)!,p=r.at(-2)!,width=WIDTH[ctx.timeframe],at=Date.parse(c.open_time)+width,regime=complementaryRegime(r,new Date(at).toISOString()),atr=regime.atr;
 if(!regime.enabled.includes(role))return null;
 const bracket=(s:number,stop:number,a=1.5,b=2.5,details:Record<string,string|number|boolean>={}):ComplementaryProposal=>{const risk=s*(c.close-stop);return {side:s,stop,tp1:c.close+s*a*risk,tp2:c.close+s*b*risk,setup:role,details:{regime:regime.regime,adx:regime.adx,...details}};};
 const hourly=width<=3600000?complementaryAggregate(r,width,3600000):[];
 const higherWidth=ctx.timeframe==='1h'?14400000:3600000,higherTf=ctx.timeframe==='1h'?'4h':'1h';
 const supplied=ctx.higher_timeframe_candles;
 const higher=(supplied?.length?supplied:complementaryAggregate(ctx.candles,width,higherWidth)).filter(b=>Date.parse(b.open_time)+higherWidth<=at).slice(-220);
 if(supplied?.some((b,i)=>b.symbol!==ctx.symbol||b.timeframe!==higherTf||b.market_type!==ctx.market||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||b.volume<0||i>0&&!consecutiveMarketBars(ctx.symbol,Date.parse(supplied[i-1].open_time),Date.parse(b.open_time),higherWidth)))return null;
 for(const s of [1,-1]){
  if(role==='ema-pullback'){
   // 15m uses closed H1 EMA200; 1h uses closed H4 EMA200. No short-history EMA fallback.
   if(!['15m','1h'].includes(ctx.timeframe)||higher.length<200||hourly.length<30||s*(higher.at(-1)!.close-ema(higher,200))<=0||complementaryAdx(hourly)<=25)continue;
   const e=ema(r,20),touched=s===1?c.low<=e:c.high>=e;
   if(touched&&s*(c.close-e)>0&&(engulf(r,s)||pin(c,s)))return bracket(s,(s===1?lo(r.slice(-5)):hi(r.slice(-5)))-s*1.5*atr);
  }else if(role==='band-reclaim'){
   if(!['5m','15m','1h'].includes(ctx.timeframe))continue;
   const old=bands(r.slice(0,-1)),now=bands(r),rsi=rsiRootV1(r.slice(0,-1).map(c=>c.close),14);
   const crossed=s===1?p.close<old.lower&&rsi<30&&c.close>=now.lower:p.close>old.upper&&rsi>70&&c.close<=now.upper;
   if(crossed&&c.close>=now.lower&&c.close<=now.upper)return {...bracket(s,c.close-s*1.5*atr),tp1:now.mid,tp2:s===1?now.upper:now.lower};
  }else if(role==='session-orb'){
   if(!['5m','15m'].includes(ctx.timeframe)||hourly.length<50)continue;
   const day=Math.floor(at/86400000)*86400000;
   for(const startMinute of [420,810]){const start=day+startMinute*60000,finish=start+900000,end=day+(startMinute===420?600:960)*60000;
    if(at<=finish||at>=end)continue;
    const range=r.filter(b=>Date.parse(b.open_time)>=start&&Date.parse(b.open_time)+width<=finish);
    if(range.length!==900000/width||Date.parse(range[0].open_time)!==start||Date.parse(range.at(-1)!.open_time)+width!==finish)continue;
    const h=hi(range),l=lo(range),broken=s===1?c.close>h&&p.close<=h:c.close<l&&p.close>=l;
    if(broken&&c.volume>mean(r.slice(-21,-1).map(b=>b.volume))&&s*(hourly.at(-1)!.close-ema(hourly,50))>0)return bracket(s,c.close-s*Math.min(s*(c.close-(h+l)/2),1.2*atr),1.5,2.5,{range_high:h,range_low:l,session_start:new Date(start).toISOString()});
   }
  }else if(role==='fvg-sweep'){
   if(!['15m','1h'].includes(ctx.timeframe)||hourly.length<25||!engulf(r,s))continue;
   const points=pivots(r.slice(0,-1),s);if(!points.length)continue;const level=s===1?r[points.at(-1)!].low:r[points.at(-1)!].high,wick=s===1?c.low:c.high;
   if(!(s*(wick-level)<0&&s*(c.close-level)>0))continue;
   for(let i=hourly.length-1;i>=22;i--){const a=hourly[i-2],b=hourly[i-1],z=hourly[i],formed=Date.parse(z.open_time)+3600000;if(at-formed>86400000)break;if(formed>Date.parse(c.open_time))continue;
    const prior=hourly.slice(i-20,i-1),gap=s===1?z.low>a.high&&b.close>b.open:z.high<a.low&&b.close<b.open,bos=s===1?Math.max(b.close,z.close)>hi(prior):Math.min(b.close,z.close)<lo(prior);
    if(!gap||!bos)continue;const low=s===1?a.high:z.high,high=s===1?z.low:a.low;
    const touched=r.some(v=>Date.parse(v.open_time)>=formed&&Date.parse(v.open_time)<Date.parse(c.open_time)&&v.low<=high&&v.high>=low);
    if(!touched&&wick>=low&&wick<=high)return bracket(s,wick-s*.5*atr,2,3,{fvg_low:low,fvg_high:high,sweep:level});
   }
  }else if(role==='donchian-breakout'){
   if(!['1h','4h'].includes(ctx.timeframe)||r.length<201||regime.adx<=22||s*(c.close-ema(r,200))<=0)continue;
   const prior=r.slice(-21,-1),old=r.slice(-22,-2),broken=s===1?c.close>hi(prior)&&p.close<=hi(old):c.close<lo(prior)&&p.close>=lo(old);
   if(broken)return bracket(s,c.close-s*2*atr,2,4,{exit_adaptation:'fixed_4R_TP2_existing_management'});
  }else if(role==='level-divergence'){
   if(!['15m','1h'].includes(ctx.timeframe)||!engulf(r,s))continue;const points=pivots(r.slice(0,-1),s);if(!points.length)continue;
   const i=points.at(-1)!,old=r[i],oldRsi=rsiRootV1(r.slice(0,i+1).map(b=>b.close),14),nowRsi=rsiRootV1(r.map(b=>b.close),14),wick=s===1?c.low:c.high;
   if(!(s===1?wick<old.low&&nowRsi>oldRsi&&nowRsi<35:wick>old.high&&nowRsi<oldRsi&&nowRsi>65))continue;
   const day=Math.floor(at/86400000)*86400000,previous=r.filter(b=>Date.parse(b.open_time)>=day-86400000&&Date.parse(b.open_time)+width<=day),asia=r.filter(b=>Date.parse(b.open_time)>=day&&Date.parse(b.open_time)+width<=day+7*3600000),levels:number[]=[];
   if(previous.length>=.8*86400000/width)levels.push(s===1?lo(previous):hi(previous));if(at>=day+7*3600000&&asia.length===7*3600000/width)levels.push(s===1?lo(asia):hi(asia));
   const key=levels.find(level=>Math.abs(wick-level)<=.5*atr);if(key!==undefined)return bracket(s,wick-s*atr,1.5,2.5,{key_level:key});
  }
 }
 return null;
}
export function evaluateComplementary(role:ComplementaryRole,ctx:Context):Result {
 if(Object.keys(ctx.strategy_parameters??{}).some(k=>!['entry_engine_version','estimated_round_trip_cost_bps','minimum_net_target_r'].includes(k)))return rejection('COMPLEMENTARY_FROZEN_PARAMETERS');
 const q=complementaryProposal(role,ctx);if(!q)return rejection('NO_COMPLEMENTARY_SETUP');const entry=ctx.candles.at(-1)!.close,risk=q.side*(entry-q.stop),rr=q.side*(q.tp2-entry)/risk;
 if(![entry,q.stop,q.tp1,q.tp2,risk,rr].every(Number.isFinite)||Math.min(q.stop,q.tp1,q.tp2)<=0||risk<=0||q.side*(q.tp1-entry)<=0||q.side*(q.tp2-q.tp1)<=0)return rejection('COMPLEMENTARY_GEOMETRY');
 return {status:'candidate',direction:q.side===1?'buy':'sell',entry_low:entry,entry_high:entry,stop_loss:q.stop,tp1:q.tp1,tp2:q.tp2,risk_reward:rr,confidence_score:80,grade:'A',reason:q.setup,rejection_reason:'',score_breakdown:{...q.details,complementary_policy:'complementary/v1',score_is_probability:false,score_meaning:'fixed rule conformance',risk_pct_hint:.5,tp1_break_even:true,source_close:new Date(Date.parse(ctx.candles.at(-1)!.open_time)+WIDTH[ctx.timeframe]).toISOString()}};
}
export function complementaryDefinitions(configuration?:(name:string,id:string,version:string)=>StrategyRuntimeConfig):StrategyDefinition[]{
 const out:StrategyDefinition[]=[];
 for(const market of ['crypto','forex'] as const)for(const role of COMPLEMENTARY_ROLES){
  if(role==='session-orb'&&market==='crypto'||role==='donchian-breakout'&&market==='forex')continue;
  const id=`${market}.complementary-${role}`,name=`${market==='crypto'?'Crypto':'Forex'}Complementary${role.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join('')}`;
  const frames=role==='session-orb'?['5m','15m']:role==='donchian-breakout'?['1h','4h']:role==='band-reclaim'?['5m','15m','1h']:['15m','1h'];
  const symbols=market==='crypto'?['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','LINKUSDT','AVAXUSDT','ADAUSDT','DOGEUSDT','LTCUSDT']:['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','XAUUSD'];
  const cfg=configuration?.(name,id,COMPLEMENTARY_VERSION)??{strategy_name:name,enabled:false,min_score:75,min_rr:1,max_bars_in_trade:role==='donchian-breakout'?168:role==='ema-pullback'?96:48,allowed_symbols:symbols,allowed_timeframes:frames,params:{}};
  const scopeValid=(!cfg.allowed_symbols.length||cfg.allowed_symbols.some(s=>symbols.includes(s)))&&(!cfg.allowed_timeframes.length||cfg.allowed_timeframes.some(t=>frames.includes(t)));
  const promoted=scopeValid&&cfg.enabled&&cfg.config_source?.startsWith('measured_release:');
  out.push({id,version:COMPLEMENTARY_VERSION,legacyName:name,market,lifecycle:promoted?'ENABLED':'RESEARCH',publicationMode:promoted?'LIVE':'SHADOW',certification:promoted?'PRODUCTION':'RESEARCH',config:{...cfg,enabled:!!promoted,allowed_symbols:cfg.allowed_symbols.length?cfg.allowed_symbols.filter(s=>symbols.includes(s)):symbols,allowed_timeframes:cfg.allowed_timeframes.length?cfg.allowed_timeframes.filter(t=>frames.includes(t)):frames},evaluate:ctx=>evaluateComplementary(role,ctx)});
 }
 return out;
}

/** Shared specialist policy: low-ADX reversal is not rejected as a failed trend. */
export function complementaryMarketPolicy(entries:readonly {name:string;result:Result}[]):string|undefined {
 if(!entries.length||!entries.every(e=>/^(Crypto|Forex)Complementary/.test(e.name)))return undefined;
 return entries.every(e=>{const b=e.result.score_breakdown,role=e.result.reason,adx=b.adx;
  return b.complementary_policy==='complementary/v1'&&b.score_is_probability===false&&typeof adx==='number'&&Number.isFinite(adx)&&
   (['band-reclaim','level-divergence'].includes(role)?adx<20:['ema-pullback','fvg-sweep'].includes(role)?adx>25:role==='donchian-breakout'?adx>22:role==='session-orb'&&adx>=20);
 })?'':'COMPLEMENTARY_POLICY_MISMATCH';
}
