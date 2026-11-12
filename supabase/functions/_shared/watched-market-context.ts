import {atrRootV1,emaRootV1} from './indicator-engine.ts';
import {closedAggregate} from './regime-opportunities.ts';
import {forexSession} from './forex-domain.ts';
import {watchWidth} from './conditional-contract.ts';
import type {StrategyCandle} from './professional-strategies.ts';
export interface WatchedIntelligence {
 observedAt:string;sourceIds:string[];priceSource:string;higherTimeframe:string;higherDirection:number;
 trendDirection:number;atr:number;rangeAtr:number;volumeRatio:number;spreadPrice:number|null;session:string;
 news:'HIGH_IMPACT_WINDOW'|'SOURCE_AVAILABLE'|'UNAVAILABLE';newsObservedAt:string|null;newsSources:string[];
 volatility?:{atrPercent:number;baselineAtrPercent:number;ratio:number;band:'QUIET'|'NORMAL'|'HIGH'};
 anchorDirection:number|null;
}
export interface SourceContext {id:string;created_at:string;market:string;metadata?:Record<string,any>;data_sources?:Record<string,unknown>;}
/** Only structured, timestamped source events are accepted; headlines never supply guessed event times. */
export function verifiedCalendarEvents(value:unknown):Array<{currency:string;impact:'HIGH';at:string;source_url:string}> {
 if(!Array.isArray(value))return [];
 return value.slice(0,100).filter((e:any)=>e&&typeof e.currency==='string'&&/^[A-Z]{3}$/.test(e.currency)&&e.impact==='HIGH'&&typeof e.at==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(e.at)&&Number.isFinite(Date.parse(e.at))&&typeof e.source_url==='string'&&e.source_url.length<=2048&&e.source_url.startsWith('https://')).map((e:any)=>({currency:e.currency,impact:'HIGH',at:e.at,source_url:e.source_url}));
}
export function watchedMarketContext(rows:readonly StrategyCandle[],now:number,options:{higher?:readonly StrategyCandle[];anchor?:readonly StrategyCandle[];spreadPrice?:number|null;spreadObservedAt?:string;sources?:readonly SourceContext[]}={}):WatchedIntelligence {
 const last=rows.at(-1)!;if(!last||rows.length<55)throw Error('CONTEXT_CANDLES_REQUIRED');
 const tf=last.timeframe,w=watchWidth(tf);if(!Number.isFinite(w)||Date.parse(last.open_time)+w>now||now-Date.parse(last.open_time)-w>=w)throw Error('CONTEXT_CANDLES_STALE');
 const higherMinutes=tf==='5m'?15:tf==='15m'?60:tf==='1h'?240:tf==='4h'?1440:10080;
 const higher=(options.higher??closedAggregate(rows,higherMinutes,new Date(now).toISOString())).filter(r=>r.symbol===last.symbol&&r.source===last.source&&Date.parse(r.open_time)+watchWidth(r.timeframe)<=now);
 if(higher.length&&now-Date.parse(higher.at(-1)!.open_time)-watchWidth(higher.at(-1)!.timeframe)>=watchWidth(higher.at(-1)!.timeframe)*2)higher.length=0;
 const direction=(bars:readonly StrategyCandle[])=>{if(bars.length<24)return 0;const c=bars.map(r=>r.close),d=emaRootV1(c,8)-emaRootV1(c,20);return Math.sign(d);};
 const prior=rows.slice(-21,-1),avg=prior.reduce((n,r)=>n+r.volume,0)/prior.length,atr=atrRootV1([...rows],14);
 const eligible=(options.sources??[]).filter(s=>s.market===last.market_type&&s.id&&Number.isFinite(Date.parse(s.created_at))&&now-Date.parse(s.created_at)>=0&&now-Date.parse(s.created_at)<=1800000);
 const currencies=last.market_type==='crypto'?[last.symbol.slice(0,-4),'USD']:last.symbol==='XAUUSD'?['USD']:[last.symbol.slice(0,3),last.symbol.slice(3,6)];
 const impacted=eligible.some(s=>verifiedCalendarEvents(s.metadata?.high_impact_events).some((e:any)=>currencies.includes(e.currency)&&e.impact==='HIGH'&&typeof e.source_url==='string'&&/^https:\/\//.test(e.source_url)&&Number.isFinite(Date.parse(e.at))&&Math.abs(Date.parse(e.at)-now)<=1800000));
 const newsSources=eligible.filter(s=>s.metadata?.news_available===true||Array.isArray(s.metadata?.feed_health)&&s.metadata!.feed_health.some((f:any)=>f.feed_type==='news'&&f.status==='available'));
 const anchor=options.anchor?.filter(r=>r.symbol==='BTCUSDT'&&Date.parse(r.open_time)+watchWidth(r.timeframe)<=now);
 const baseline=rows.slice(-134,-1).flatMap((_,i,a)=>{if(i<14)return [];const window=a.slice(i-14,i+1),value=atrRootV1(window,14)/window.at(-1)!.close*100;return Number.isFinite(value)&&value>0?[value]:[];}).sort((a,b)=>a-b);
 const baselineAtrPercent=baseline.length?baseline[Math.floor(baseline.length/2)]:atr/last.close*100;
 const atrPercent=atr/last.close*100,ratio=baselineAtrPercent>0?atrPercent/baselineAtrPercent:1;
 const volatility:NonNullable<WatchedIntelligence['volatility']>={atrPercent,baselineAtrPercent,ratio,band:ratio<.75?'QUIET':ratio>1.5?'HIGH':'NORMAL'};
 return {volatility,observedAt:new Date(now).toISOString(),sourceIds:[`${last.source}:${last.symbol}:${tf}:${last.open_time}`,...higher.slice(-1).map(r=>`${r.source}:${r.symbol}:${r.timeframe}:${r.open_time}`),...anchor?.slice(-1).map(r=>`${r.source}:${r.symbol}:${r.timeframe}:${r.open_time}`)??[],...eligible.map(s=>s.id)],priceSource:last.source,higherTimeframe:higher.at(-1)?.timeframe??`${higherMinutes}m`,higherDirection:direction(higher),trendDirection:Math.sign(emaRootV1(rows.map(r=>r.close),20)-emaRootV1(rows.map(r=>r.close),50)),atr,rangeAtr:atr>0?(last.high-last.low)/atr:Infinity,volumeRatio:avg>0?last.volume/avg:0,spreadPrice:options.spreadObservedAt&&now-Date.parse(options.spreadObservedAt)>=0&&now-Date.parse(options.spreadObservedAt)<=120000?options.spreadPrice??null:null,session:last.market_type==='forex'?forexSession(new Date(now).toISOString()):'CONTINUOUS',news:impacted?'HIGH_IMPACT_WINDOW':newsSources.length?'SOURCE_AVAILABLE':'UNAVAILABLE',newsObservedAt:newsSources.at(0)?.created_at??null,newsSources:newsSources.map(s=>s.id),anchorDirection:anchor?.length?direction(anchor):null};
}
export type StrategyThesis={family:'TREND'|'BREAKOUT'|'REVERSAL';boundary:number;minimumVolumeRatio:number;maximumRangeAtr:number;sessions:string[];higherRequired:boolean;maximumCostR:number;anchorRequired?:boolean;strategyDefined?:boolean};
export function strategyContextDecision(thesis:StrategyThesis,side:'buy'|'sell',rows:readonly StrategyCandle[],intel:WatchedIntelligence):'VALID'|'INVALID'|'WAIT'|'UNKNOWN' {
 const d=side==='buy'?1:-1,last=rows.at(-1)!;
 if(!last||!Number.isFinite(intel.atr)||intel.atr<=0)return 'UNKNOWN';
 if(thesis.sessions.length&&!thesis.sessions.includes(intel.session))return 'INVALID';
 if(intel.news==='HIGH_IMPACT_WINDOW'||intel.rangeAtr>thesis.maximumRangeAtr)return 'WAIT';
 if(thesis.family==='BREAKOUT'&&d*(last.close-thesis.boundary)<=0)return 'INVALID';
 if(thesis.family==='REVERSAL'&&d*(last.close-thesis.boundary)<=0)return 'INVALID';
 if(thesis.family==='TREND'&&!thesis.strategyDefined&&intel.trendDirection!==d)return 'INVALID';
 if(thesis.higherRequired&&intel.higherDirection!==d)return intel.higherDirection===0?'UNKNOWN':'INVALID';
 if(thesis.anchorRequired&&(intel.anchorDirection===null||intel.anchorDirection!==0&&intel.anchorDirection!==d))return 'WAIT';
 if(intel.volumeRatio<thesis.minimumVolumeRatio)return 'WAIT';
 return 'VALID';
}
