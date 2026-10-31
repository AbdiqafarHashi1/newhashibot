import type {ValidationDetails} from '../../lib/validationEvidence';
interface WorkerInspection {control?:{stop_new_work:boolean};limits?:{concurrency:number};usage?:unknown;cost?:unknown;jobs?:{id:string;kind:string;run_id?:string;status:string;lease_owner?:string;worker_revision?:string;heartbeat_at?:string;lease_expires_at?:string;checkpoint:Record<string,unknown>;attempt:number;max_attempts:number;slice_count:number;safe_error?:string}[]}
import {useEffect,useState,useRef} from 'react';
import {exportPersistedEvidence} from '../../lib/phaseMOperations';
import {phasePWorkerOperation,submitPortableValidation} from '../../lib/phasePWorkers';
const field='rounded border border-zinc-700 bg-zinc-950 p-2 text-xs';
export function PhasePWorkersOperations(){
  const [details,setDetails]=useState<ValidationDetails|null>(null);
  const [state,setState]=useState<WorkerInspection|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [provider,setProvider]=useState('BINANCE'),[symbol,setSymbol]=useState('BTCUSDT'),[timeframe,setTimeframe]=useState('15m'),[start,setStart]=useState(''),[end,setEnd]=useState('');
  async function refresh(){try{setState(await phasePWorkerOperation({action:'inspect'}));}catch(e){setMessage(e instanceof Error?e.message:'INSPECTION_FAILED');}}
  useEffect(()=>{void refresh();},[]);
  const submissionLock=useRef(false);
  async function control(body:Record<string,unknown>,newRun=false){if(submissionLock.current)return;submissionLock.current=true;setBusy(true);try{const {action,...input}=body;delete input.kind;const result=action==='submit'?await submitPortableValidation('HISTORY',input,newRun):await phasePWorkerOperation(body);if(action==='details')setDetails(result);setMessage(result.runId?`${result.status} · run ${result.runId}`:result.status);await refresh();}catch(e){setMessage(e instanceof Error?e.message:'REQUEST_FAILED');}finally{submissionLock.current=false;setBusy(false);}}
  return <section aria-label="Portable worker operations" className="rounded-xl border border-violet-500/20 bg-zinc-950 p-4">
    <header className="flex justify-between"><div><h2 className="font-semibold">Portable workers</h2><p className="text-xs text-zinc-400">Bounded historical research and validation · live execution disabled</p></div><button disabled={busy} className={field} onClick={()=>void refresh()}>Refresh</button></header>
    <p className="mt-3 text-xs">New work: {!state?.control?'Unknown':state.control.stop_new_work?'Stopped':'Accepting'} · concurrency {state?.limits?.concurrency??'—'} · scanner: Supabase</p>
    <div className="my-3 flex gap-2"><button disabled={busy} className={field} onClick={()=>void control({action:'stop'})}>Stop new work</button><button disabled={busy} className={field} onClick={()=>void control({action:'resume'})}>Resume bounded work</button></div>
    <details><summary className="text-xs">Acquire public crypto research history</summary><fieldset disabled={busy} className="mt-2 grid gap-2 md:grid-cols-6">
      <select aria-label="History provider" className={field} value={provider} onChange={e=>setProvider(e.target.value)}><option>BINANCE</option><option>BYBIT</option></select>
      <input aria-label="Symbol" className={field} value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())}/>
      <select aria-label="Timeframe" className={field} value={timeframe} onChange={e=>setTimeframe(e.target.value)}><option>5m</option><option>15m</option><option>1h</option><option>4h</option></select>
      <input aria-label="Start UTC" type="datetime-local" className={field} value={start} onChange={e=>setStart(e.target.value)}/>
      <input aria-label="End UTC" type="datetime-local" className={field} value={end} onChange={e=>setEnd(e.target.value)}/>
      <button disabled={busy||!start||!end} className={field} onClick={()=>void control({action:'submit',kind:'HISTORY',provider,symbol,timeframe,start:`${start}:00Z`,end:`${end}:00Z`})}>Queue / retry history</button><button disabled={busy||!start||!end} className={field} onClick={()=>void control({action:'submit',kind:'HISTORY',provider,symbol,timeframe,start:`${start}:00Z`,end:`${end}:00Z`},true)}>New history run</button>
    </fieldset><p className="mt-2 text-xs text-zinc-400">Dates are UTC. Limit: 3,000 candles. Forex and Gold use the separate owner-controlled HashiBridge feed.</p></details>
    {message&&<p role="status" className="mt-2 text-xs text-amber-300">{message}</p>}
    <div className="mt-3 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th>Job / run</th><th>State</th><th>Host / revision</th><th>Heartbeat / lease</th><th>Checkpoint</th><th>Attempts</th><th>Reason / controls</th></tr></thead><tbody>{(state?.jobs??[]).map(j=><tr className="border-t border-zinc-800" key={j.id}>
      <td><button disabled={busy} className="text-violet-300" onClick={()=>void control({action:'details',kind:j.kind,runId:j.run_id})}>{j.kind} · Inspect</button><br/>{j.id.slice(0,8)} / {j.run_id?.slice(0,8)}</td><td>{j.status}</td><td>{j.lease_owner??'Unclaimed'}<br/>{j.worker_revision?.slice(0,12)??'—'}</td><td>{j.heartbeat_at??'—'}<br/>{j.lease_expires_at??'—'}</td><td>{JSON.stringify(j.checkpoint)}</td><td>{j.attempt}/{j.max_attempts} · {j.slice_count} slices</td><td>{j.safe_error??'—'}<br/>{['QUEUED','RUNNING','RETRY'].includes(j.status)&&<button disabled={busy} className={field} onClick={()=>void control({action:'cancel',jobId:j.id})}>Cancel</button>}{j.status==='RETRY'&&<button disabled={busy} className={field} onClick={()=>void control({action:'retry',jobId:j.id})}>Retry</button>}</td>
    </tr>)}</tbody></table></div>
    {details&&<details open className="mt-3"><summary className="text-xs">Persisted native evidence</summary><button className={field} onClick={()=>exportPersistedEvidence(details,`phase-p-${details.run.id}.json`)}>Export persisted evidence</button><pre className="max-h-72 overflow-auto p-2 text-xs">{JSON.stringify(details,null,2)}</pre></details>}
    <details className="mt-3"><summary className="text-xs">Limits, quotas and cost evidence</summary><pre className="overflow-auto p-2 text-xs">{JSON.stringify({limits:state?.limits,usage:state?.usage,cost:state?.cost},null,2)}</pre></details>
  </section>;
}
