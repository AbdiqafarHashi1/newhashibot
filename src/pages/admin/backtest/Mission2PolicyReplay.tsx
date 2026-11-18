import {useRef,useState} from 'react';
import {supabase} from '../../../lib/supabase';
import type {DatasetCampaign} from '../../../lib/research/datasetCampaign';
import {mission2CampaignDatasets} from '../../../lib/research/mission2Replay';
import {watchedStrategyCatalog} from '../../../../supabase/functions/_shared/watched-strategy-catalog';
import {runCanonicalHistoricalReplay,type CanonicalReplayCheckpoint,type CanonicalReplayEvidence} from '../../../../supabase/functions/_shared/canonical-historical-replay';

async function checkpointStore<T>(key:string,value?:T):Promise<T|undefined>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('hashibot-mission2-policy',1);r.onupgradeneeded=()=>r.result.createObjectStore('checkpoints');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{return await new Promise<T|undefined>((resolve,reject)=>{const tx=db.transaction('checkpoints',value===undefined?'readonly':'readwrite'),store=tx.objectStore('checkpoints'),r=value===undefined?store.get(key):store.put(value,key);let result:T|undefined;r.onsuccess=()=>{result=value===undefined?r.result:value;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
interface SavedReplay {checkpoint:CanonicalReplayCheckpoint;observations:CanonicalReplayEvidence['observations'];health:CanonicalReplayEvidence['health'];}
export default function Mission2PolicyReplay({campaign}:{campaign:DatasetCampaign|null}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState<SavedReplay|null>(null),[minutes,setMinutes]=useState(60),stop=useRef(false);
 async function run(resume:boolean){
  if(!campaign)return;setBusy(true);setMessage('Loading frozen strategy configuration…');stop.current=false;
  try{
   const [datasets,configs,releases]=await Promise.all([mission2CampaignDatasets(campaign),supabase.from('strategy_configs').select('*'),supabase.from('strategy_release_candidates').select('id,strategy_id,state,immutable_configuration').eq('state','PROMOTED')]);
   if(configs.error||releases.error)throw Error('Strategy configuration unavailable. Activate the backend and sign in as admin.');
   const definitions=watchedStrategyCatalog(configs.data??[],releases.data??[]),eligible=datasets.filter(d=>definitions.some(s=>s.config.enabled&&s.config.allowed_timeframes.includes(d.timeframe)&&(!s.config.allowed_symbols.length||s.config.allowed_symbols.includes(d.symbol))));
   if(!eligible.length)throw Error('No configured strategy supports the selected cached datasets.');
   const start=Math.ceil(Math.max(...eligible.map(d=>Date.parse(d.candles[Math.min(239,d.candles.length-1)]?.open_time??'')+({'5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000}[d.timeframe])))/60000)*60000;
   const end=start+(minutes-1)*60000,key=`${campaign.id}:policy:v1:${minutes}`;
   if(!Number.isFinite(start)||eligible.some(d=>Date.parse(d.candles.at(-1)!.open_time)<end))throw Error('Insufficient history for warm-up and the selected verification window. Download a longer range.');
   let state:SavedReplay|undefined=resume?await checkpointStore<SavedReplay>(key):undefined;
   if(resume&&!state)throw Error('No saved checkpoint for this campaign and window.');
   const result=await runCanonicalHistoricalReplay({datasets,definitions,start,end,maxSteps:500,resume:state?.checkpoint,shouldCancel:()=>stop.current,checkpoint:async(e,c)=>{
    state={checkpoint:c,observations:[...(state?.observations??[]),...e.observations],health:[...(state?.health??[]),...e.health]};
    await checkpointStore(key,state);setSaved(state);setMessage(`Persisted ${c.cursor} / ${minutes} historical worker ticks`);
    await new Promise(resolve=>setTimeout(resolve,0));
   }});
   setMessage(result.status==='CANCELLED'?'Paused. Resume uses the saved frozen lifecycle.':'Policy verification complete. Account simulation and strategy qualification require additional evidence.');
  }catch(e){setMessage(e instanceof Error?e.message:'Policy replay failed');}finally{setBusy(false);}
 }
 const states=saved?.checkpoint.store.records.map(r=>r.state)??[],confirmed=saved?.checkpoint.store.events.filter(e=>e.confirmedSignalId)??[];
 return <section className="space-y-3 rounded-xl border border-cyan-900 bg-zinc-950 p-4" data-testid="mission2-policy-replay"><h3 className="font-bold">Mission 1 entry policy verification</h3><p className="text-sm text-zinc-400">Replay cached candles through the actual named strategy engine and independent watcher, minute by minute. Frozen releases retain their qualification gates. This verifies signal behavior; it does not certify profitability or simulate broker fills.</p><div className="flex flex-wrap items-center gap-3"><label className="text-sm">Historical minutes <input aria-label="Historical minutes" type="number" min={1} max={500} value={minutes} disabled={busy} onChange={e=>setMinutes(Math.min(500,Math.max(1,Number(e.target.value)||1)))} className="w-20 rounded border border-zinc-700 bg-zinc-900 p-1"/></label><button disabled={busy||!campaign} onClick={()=>void run(false)} className="rounded border px-3 py-2 disabled:opacity-40">Verify selected campaign</button><button disabled={busy||!campaign} onClick={()=>void run(true)} className="rounded border px-3 py-2 disabled:opacity-40">Resume saved run</button><button disabled={!busy} onClick={()=>{stop.current=true;}} className="rounded border px-3 py-2 disabled:opacity-40">Pause</button></div>{!campaign&&<p className="text-sm text-amber-300">Choose a cached campaign in Market data first.</p>}<p role="status" className="text-sm text-cyan-200">{message}</p>{saved&&<><p className="text-xs text-zinc-400 break-all">Policy: entry-decision/v1 · Lineage SHA-256: {saved.checkpoint.lineage}</p><div className="flex flex-wrap gap-4 text-sm"><span>{states.length} watched setups</span><span>{confirmed.length} confirmed events</span><span>{states.filter(s=>s.watchOutcome==='INVALIDATED').length} invalidated</span><span>{states.filter(s=>s.watchOutcome==='EXPIRED').length} expired</span><span>{saved.observations.filter(o=>o.decision==='NO_TRADE').length} no-trade decisions</span></div><details><summary>Inspect decisions, events and worker health</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(saved,null,2)}</pre></details></>}</section>;
}
