import {gunzipSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ms} from './replay.ts';
export function withEntryGeometry(data:any){
// Stop geometry is taken only from saved pre-entry plans, never a subsequent trailing stop.
const geometry=new Map<string,{at:number;ratio:number}>();
for(const source of data.sources){const bytes=gunzipSync(readFileSync(source.path));if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('SOURCE_HASH_MISMATCH');const r=JSON.parse(bytes.toString());
 for(const row of r.signalSnapshots??[]){const s=row.setup;if(Number.isFinite(s.trigger)&&Number.isFinite(s.stop)&&s.trigger>0&&Math.abs(s.trigger-s.stop)>0)geometry.set(source.sha256+':'+s.strategy+':'+s.id,{at:ms(row.at),ratio:s.trigger/Math.abs(s.trigger-s.stop)});}
 for(const row of r.ledger??[]){const c=row.candidate;if(c&&Number.isFinite(c.entry)&&Number.isFinite(c.stop)&&c.entry>0&&Math.abs(c.entry-c.stop)>0)geometry.set(source.sha256+':'+c.strategyId+':'+c.id,{at:ms(row.decisionAt??c.evidence?.source_close),ratio:c.entry/Math.abs(c.entry-c.stop)});}
}
data.trades=data.trades.map((t:any)=>{const g=geometry.get(t.source+':'+t.strategy+':'+t.id);return {...t,notionalPerRisk:g&&Number.isFinite(g.at)&&g.at<=ms(t.entry)?g.ratio:undefined};});
return data;
}
