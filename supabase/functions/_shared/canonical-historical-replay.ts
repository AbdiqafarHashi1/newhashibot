import {nativeCandleEvidence} from './native-candle-evidence.ts';
import {runConditionalWatch} from './conditional-watch.ts';
import {watchWidth,type WatchTimeframe} from './conditional-contract.ts';
import {discoverWatchedStrategies,type StrategyObservation} from './watched-strategy-discovery.ts';
import {watchedMarketContext} from './watched-market-context.ts';
import {currentWatchQualification,frozenStrategyConfirmation} from './frozen-strategy-confirmation.ts';
import type {StrategyDefinition,StrategyCandle} from './professional-strategies.ts';
import {HistoricalConditionalStore,type HistoricalStoreSnapshot} from './historical-conditional-store.ts';

export interface CanonicalHistoricalDataset {
 id:string;sha256:string;symbol:string;timeframe:WatchTimeframe;
 provenance:{source:string;instrument:'SPOT'|'PERPETUAL'|'BROKER_BID_ASK'|'INDICATIVE'|'CONTROLLED_TEST';limitations:string[]};
 candles:readonly StrategyCandle[];
}
export interface CanonicalReplayCheckpoint {
 schema:'canonical-historical-replay/v1';lineage:string;cursor:number;through:number|null;store:HistoricalStoreSnapshot;
}
export interface CanonicalReplayEvidence {
 at:string;observations:StrategyObservation[];health:Record<string,unknown>[];
 events:HistoricalStoreSnapshot['events'];rejections:HistoricalStoreSnapshot['rejections'];
}
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export async function canonicalSnapshotFingerprint(value:unknown){
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value)))),x=>x.toString(16).padStart(2,'0')).join('');
}
export const historicalCandleChecksum=(candles:readonly StrategyCandle[])=>canonicalSnapshotFingerprint(candles);
export async function canonicalReplayLineage(input:{datasets:readonly CanonicalHistoricalDataset[];definitions:readonly StrategyDefinition[];start:number;end:number;stepMs?:number;releaseTimeline?:readonly {at:number;enabledStrategyIds:readonly string[]}[]}){
 const text=stable({policy:'entry-decision/v1',start:input.start,end:input.end,stepMs:input.stepMs??60000,releaseTimeline:input.releaseTimeline??[],datasets:input.datasets.map(d=>({id:d.id,hash:d.sha256,symbol:d.symbol,tf:d.timeframe,provenance:d.provenance})),definitions:input.definitions.map(d=>({id:d.id,version:d.version,lifecycle:d.lifecycle,publicationMode:d.publicationMode,config:d.config}))});
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
}
/** An OHLC archive's native flow and ask high/low/close are future information at its open. */
export function historicalOpeningQuote(b:StrategyCandle):StrategyCandle {
 return {symbol:b.symbol,market_type:b.market_type,timeframe:b.timeframe,source:b.source,open_time:b.open_time,open:b.open,high:b.open,low:b.open,close:b.open,volume:0,...(b.instrument_type?{instrument_type:b.instrument_type}:{}),...(b.ask_open!==undefined?{ask_open:b.ask_open,ask_high:b.ask_open,ask_low:b.ask_open,ask_close:b.ask_open}:{})};
}
/** Replays the actual independent production worker and its named evaluator/entry/watcher/arbitration modules.
 * Inputs are frozen release definitions. Unqualified configurations stay non-executable, as in production.
 * This stage yields modeled signal outcomes, NOT executable broker fills or account profitability.
 * Each callback must atomically persist evidence plus checkpoint before returning. */
export async function runCanonicalHistoricalReplay(input:{
 datasets:readonly CanonicalHistoricalDataset[];definitions:readonly StrategyDefinition[];start:number;end:number;
 stepMs?:number;maxSteps:number;resume?:CanonicalReplayCheckpoint;
 shouldCancel?:()=>Promise<boolean>|boolean;
 releaseTimeline?:readonly {at:number;enabledStrategyIds:readonly string[]}[];
 checkpoint?:(evidence:CanonicalReplayEvidence,state:CanonicalReplayCheckpoint)=>Promise<void>;
}){
 const step=input.stepMs??60000;
 if(!Number.isInteger(input.start)||!Number.isInteger(input.end)||input.end<input.start||step!==60000||input.start%step||input.end%step)throw Error('HISTORICAL_CLOCK_INVALID');
 if(!input.datasets.length||!input.definitions.length)throw Error('HISTORICAL_INPUTS_REQUIRED');
 if(!Number.isInteger(input.maxSteps)||input.maxSteps<1)throw Error('HISTORICAL_STEP_LIMIT_INVALID');
 if(Math.floor((input.end-input.start)/step)+1>input.maxSteps)throw Error('HISTORICAL_STEP_LIMIT_EXCEEDED');
 const keys=new Set<string>();
 for(const d of input.datasets){
  const key=`${d.symbol}:${d.timeframe}`,w=watchWidth(d.timeframe);
  if(keys.has(key)||!Number.isFinite(w)||!d.id||!/^[0-9a-f]{64}$/.test(d.sha256))throw Error('HISTORICAL_DATASET_IDENTITY_INVALID');keys.add(key);
  if(await historicalCandleChecksum(d.candles)!==d.sha256)throw Error('HISTORICAL_DATASET_CHECKSUM_MISMATCH');
  if(!d.provenance.source||!d.provenance.instrument||!Array.isArray(d.provenance.limitations))throw Error('HISTORICAL_PROVENANCE_REQUIRED');
  for(let i=0;i<d.candles.length;i++){
   const b=d.candles[i],at=Date.parse(b.open_time);
   nativeCandleEvidence(b as unknown as Record<string,unknown>);
   if(!Number.isFinite(at)||at%w||b.symbol!==d.symbol||b.timeframe!==d.timeframe||b.source!==d.provenance.source||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||b.volume<0||i>0&&at<=Date.parse(d.candles[i-1].open_time))throw Error('HISTORICAL_CANDLE_INTEGRITY_INVALID');
  }
 }
 for(let i=0;i<(input.releaseTimeline?.length??0);i++){const r=input.releaseTimeline![i];if(!Number.isInteger(r.at)||i>0&&r.at<=input.releaseTimeline![i-1].at||r.enabledStrategyIds.some(id=>!input.definitions.some(d=>d.id===id)))throw Error('HISTORICAL_RELEASE_TIMELINE_INVALID');}
 const lineage=await canonicalReplayLineage(input),total=Math.floor((input.end-input.start)/step)+1;
 let cursor=input.resume?.cursor??0,now=input.start+cursor*step;
 if(input.resume&&(input.resume.schema!=='canonical-historical-replay/v1'||input.resume.lineage!==lineage||!Number.isInteger(cursor)||cursor<0||cursor>total||input.resume.through!==(cursor?input.start+(cursor-1)*step:null)))throw Error('HISTORICAL_CHECKPOINT_LINEAGE_INVALID');
 const store=new HistoricalConditionalStore(()=>now,input.resume?.store);
 const evidence:CanonicalReplayEvidence[]=[];
 for(;cursor<total;cursor++){
  if(await input.shouldCancel?.())return {status:'CANCELLED' as const,checkpoint:{schema:'canonical-historical-replay/v1' as const,lineage,cursor,through:cursor?input.start+(cursor-1)*step:null,store:store.snapshot()},evidence};
  now=input.start+cursor*step;
  const release=input.releaseTimeline?.filter(r=>r.at<=now).at(-1);
  const definitions=release?input.definitions.filter(d=>release.enabledStrategyIds.includes(d.id)):input.definitions;
  // A dynamic release timeline is restricted to revocation/disable: configurations cannot be rewritten mid-run.
  if(definitions.some(d=>!input.definitions.some(original=>original.id===d.id&&original.version===d.version&&stable(original.config)===stable(d.config))))throw Error('HISTORICAL_RELEASE_TIMELINE_MUTATION');
  const row:CanonicalReplayEvidence={at:new Date(now).toISOString(),observations:[],health:[],events:[],rejections:[]},before=store.snapshot();
  await runConditionalWatch({store,streams:input.datasets.map(d=>({symbol:d.symbol,tf:d.timeframe})),discovery:{crypto:true,forex:true},
   feed:async(symbol,tf,at)=>{
    const d=input.datasets.find(d=>d.symbol===symbol&&d.timeframe===tf);
    if(!d)return {candles:[],error:'HISTORICAL_CONTEXT_DATASET_UNAVAILABLE'};
    const w=watchWidth(tf),closed=d.candles.filter(b=>Date.parse(b.open_time)+w<=at).slice(-240),opening=d.candles.find(b=>Date.parse(b.open_time)===at);
    // Only the opening quote is observable. Never expose its future high/low/close/volume.
    const currentOpen=opening?historicalOpeningQuote(opening):undefined;
    const last=closed.at(-1),spreadPrice=opening?.ask_open!==undefined?opening.ask_open-opening.open:last?.ask_close!==undefined?last.ask_close-last.close:undefined;
    const spreadObservedAt=opening?.ask_open!==undefined?new Date(at).toISOString():last?.ask_close!==undefined?new Date(Date.parse(last.open_time)+w).toISOString():undefined;
    return {candles:closed,currentOpen,spreadPrice,spreadObservedAt};
   },
   health:async r=>{row.health.push(r);},
   assess:async({symbol,tf,rows,now,feed,load})=>{
    const higherTf:WatchTimeframe=tf==='5m'?'15m':tf==='15m'?'1h':tf==='1h'?'4h':'1d';
    const [higher,anchor]=await Promise.all([load(symbol,higherTf),symbol.endsWith('USDT')&&symbol!=='BTCUSDT'?load('BTCUSDT',tf):undefined]);
    const options={higher:higher.candles,anchor:anchor?.candles,spreadPrice:feed.spreadPrice,spreadObservedAt:feed.spreadObservedAt};
    const found=discoverWatchedStrategies({definitions,symbol,tf,rows,now,...options});row.observations.push(...found.observations);
    return {setups:found.setups,qualification:s=>currentWatchQualification(s,definitions),confirmation:(s,prefix,at)=>frozenStrategyConfirmation(s,prefix,at,options),intelligence:(prefix,at)=>watchedMarketContext(prefix,at,options)};
   }
  },now);
  const snapshot=store.snapshot();row.events=snapshot.events.slice(before.events.length);row.rejections=snapshot.rejections.slice(before.rejections.length);
  const checkpoint:CanonicalReplayCheckpoint={schema:'canonical-historical-replay/v1',lineage,cursor:cursor+1,through:now,store:snapshot};
  await input.checkpoint?.(row,checkpoint);evidence.push(row);
 }
 return {status:'COMPLETED' as const,checkpoint:{schema:'canonical-historical-replay/v1' as const,lineage,cursor,through:cursor?input.start+(cursor-1)*step:null,store:store.snapshot()},evidence};
}
