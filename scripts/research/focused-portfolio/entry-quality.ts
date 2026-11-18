import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {ms} from './replay.ts';
export const QUALITY_RULES=['all','normal-volatility','higher-timeframe-aligned','normal-and-aligned','active-volume','low-observed-spread'] as const;
export type QualityRule=typeof QUALITY_RULES[number];
/** Only saved information timestamped no later than the recorded entry is admitted. */
export function causalFeatureClock(recorded:any,observed:any,entry:any){const r=ms(recorded),o=ms(observed),e=ms(entry);return [r,o,e].every(Number.isFinite)&&o<=r&&r<=e;}
export function entryFeatures(data:any){
 const wanted=new Map(data.trades.map((t:any)=>[t.strategy+':'+t.id,t]));const features=new Map<string,any>();
 for(const source of data.sources){const raw=gunzipSync(readFileSync(source.path));if(createHash('sha256').update(raw).digest('hex')!==source.sha256)throw Error('ENTRY_FEATURE_SOURCE_HASH_MISMATCH');const report=JSON.parse(raw.toString('utf8')); 
  if(report.signalSnapshots){for(const row of report.signalSnapshots){const s=row.setup,key=s.strategy+':'+s.id,t:any=wanted.get(key);if(!t||t.source!==source.sha256||!Number.isFinite(ms(row.at))||ms(row.at)>ms(t.entry))continue;
   const i=s.intelligence??{};if(!causalFeatureClock(row.at,i.observedAt,t.entry))continue;const distance=Math.abs((s.trigger??0)-s.stop);features.set(key,{at:ms(row.at),relativeAtr:i.volatility?.ratio,higherAligned:i.higherDirection===(s.side==='buy'?1:-1),higherKnown:[-1,0,1].includes(i.higherDirection),volumeRatio:i.volumeRatio,spreadToRisk:Number.isFinite(i.spreadPrice)&&i.spreadPrice>=0&&distance>0?i.spreadPrice/distance:null});
  }}else for(const row of report.ledger??[]){const c=row.candidate,o=row.outcome;if(!c||!o)continue;const key=c.strategyId+':'+c.id,t:any=wanted.get(key),at=ms(row.decisionAt??c.evidence?.source_close);if(!t||t.source!==source.sha256||!Number.isFinite(at)||at>ms(t.entry))continue;features.set(key,{at,relativeAtr:c.evidence?.adaptive_market?.relativeAtr,higherKnown:false});}
 }
 return features;
}
export function qualityAllows(rule:QualityRule,f:any){
 if(rule==='all')return true;if(!f)return false;
 const normal=Number.isFinite(f.relativeAtr)&&f.relativeAtr>=.75&&f.relativeAtr<=1.75;
 if(rule==='normal-volatility')return normal;
 if(rule==='higher-timeframe-aligned')return f.higherKnown&&f.higherAligned;
 if(rule==='normal-and-aligned')return normal&&f.higherKnown&&f.higherAligned;
 if(rule==='active-volume')return Number.isFinite(f.volumeRatio)&&f.volumeRatio>=1;
 return typeof f.spreadToRisk==='number'&&Number.isFinite(f.spreadToRisk)&&f.spreadToRisk<=.1;
}
