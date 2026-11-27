import {useEffect,useState} from 'react';
import {supabase} from '../../lib/supabase';
import {adminRequestError} from '../../lib/adminRequestError';
import {TURBO_IDS} from '../../../supabase/functions/_shared/gold-turbo-lease';
import {strategyPlacement} from '../../../supabase/functions/_shared/strategy-placement-policy';
import {TURBO_NAMES,TURBO_FIELDS,goldTurboDraft,goldTurboCsv,turboAccountEligible,validateGoldTurboConfig,type GoldTurboConfig} from '../../../supabase/functions/_shared/gold-turbo-admin';

type Account={id:string;customer_id:string;provider:string;environment:string;account_mode?:string;policy_overrides:Record<string,unknown>};
type Status={state:string;summary:null|{as_of_ms:number;last_reason:string;lease_valid:boolean;locked:boolean;total_locked:boolean;net_money:number|null;realized_net_money:number|null;floating_net_money:number|null;margin_money:number|null;open_risk_money:number|null;active_baskets:Record<string,unknown>[];recent_decisions:Record<string,unknown>[]}};
function download(name:string,content:string,type:string){const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function GoldTurboControls({account,onSaved}:{account:Account;onSaved:()=>Promise<void>}){
 const original=account.policy_overrides?.gold_turbo??null,key=JSON.stringify(original);
 const [draft,setDraft]=useState(()=>goldTurboDraft(original)),[pending,setPending]=useState(false),[notice,setNotice]=useState(''),[status,setStatus]=useState<Status|null>(null);
 useEffect(()=>{setDraft(goldTurboDraft(JSON.parse(key)));setNotice('');setStatus(null)},[account.id,key]);
 const eligible=turboAccountEligible(account);
 const refresh=async()=>{setPending(true);setNotice('');try{
  const {data,error}=await supabase.functions.invoke('phase-h-authority',{body:{action:'admin_gold_turbo_status',customer_id:account.customer_id,execution_account_id:account.id}});
  if(error||data?.state!=='LOADED')throw Error(await adminRequestError(data,error));
  setStatus(data.data);
 }catch(e){setNotice(e instanceof Error?e.message:'Status unavailable')}finally{setPending(false)}};
 const save=async()=>{setPending(true);setNotice('');try{
  const checked=validateGoldTurboConfig(account,draft);
  const {data,error}=await supabase.functions.invoke('phase-h-authority',{body:{action:'admin_gold_turbo_config',customer_id:account.customer_id,execution_account_id:account.id,expected_configuration:original,configuration:checked}});
  if(error||data?.state!=='SAVED')throw Error(await adminRequestError(data,error));
  setNotice('Saved. New entries are paused; existing positions keep their protection. Use the account controls to start the demo.');await onSaved();
 }catch(e){setNotice(e instanceof Error?e.message:'Settings were not saved')}finally{setPending(false)}};
 const select=(id:string,checked:boolean)=>setDraft(d=>({...d,strategy_ids:d.selection_mode==='SINGLE'?[id]:checked?[...new Set([...d.strategy_ids,id])]:d.strategy_ids.filter(s=>s!==id)}));
 const setMode=(mode:GoldTurboConfig['selection_mode'])=>setDraft(d=>({...d,selection_mode:mode,strategy_ids:mode==='SINGLE'?[d.strategy_ids[0]??TURBO_IDS[0]]:d.strategy_ids}));
 const importLog=async(file:File|undefined)=>{if(!file)return;try{
  if(file.size>5*1024*1024)throw Error('Choose an event-log segment under 5 MB.');
  const rows=(await file.text()).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  if(rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('Expected one JSON event per line.');
  download('gold-turbo-events.csv',goldTurboCsv(rows),'text/csv');setNotice(`Exported ${rows.length} events from the selected local log. File processing stayed in your browser.`);
 }catch(e){setNotice(e instanceof Error?e.message:'The event log could not be read')}};
 if(!eligible)return null;
 const summary=status?.summary;
 return <details className="mt-5 rounded-lg border border-cyan-800 p-4">
  <summary className="cursor-pointer font-semibold">Gold Turbo · Personal demo</summary>
  <p className="mt-2 text-xs text-zinc-400">Local MT5 execution. Saving pauses new entries; it does not start trading. The bridge flag, valid access and account start control are still required. Netting and opposite hedges remain blocked.</p>
  <fieldset disabled={pending} className="mt-4 space-y-4">
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft(d=>({...d,enabled:e.target.checked}))}/>Configure Gold Turbo for this demo account</label>
   <label className="block text-sm">Selection <select aria-label="Gold Turbo selection mode" className="ml-2 rounded bg-zinc-900 p-2" value={draft.selection_mode} onChange={e=>setMode(e.target.value as GoldTurboConfig['selection_mode'])}><option value="SINGLE">One strategy</option><option value="CUSTOM">Custom combination · independent opportunities</option><option value="ADAPTIVE">Adaptive · rank selected strategies</option></select></label>
   <label className="block text-sm">Profit exits <select aria-label="Gold Turbo profit exit mode" className="ml-2 rounded bg-zinc-900 p-2" value={String(draft.profit_exit_mode)} onChange={e=>setDraft(d=>({...d,profit_exit_mode:e.target.value}))}><option value="EQUITY_TARGET">Basket equity target and trailing</option><option value="STRATEGY_EXITS">Individual strategy targets and trailing</option></select></label>
   <p className="text-xs text-zinc-400">Individual exits apply to Micro, Momentum, Range and Trend. The flagship keeps basket profit management. Loss limits, broker stops and maximum holding times remain active; open baskets keep their original settings.</p>
   <label className="block text-sm">Momentum entry <select aria-label="Gold Turbo Momentum entry model" className="ml-2 rounded bg-zinc-900 p-2" value={String(draft.momentum_entry_variant)} onChange={e=>setDraft(d=>({...d,momentum_entry_variant:e.target.value}))}><option value="BASELINE_RETEST">Original impulse/retest</option><option value="SESSION_BREAKOUT">New York opening range · demo comparison</option></select></label>
   <p className="text-xs text-zinc-400">The opening-range alternative changes standalone Momentum entries. Its historical comparison uses a separate experimental risk scenario; current account risk limits still apply. Flagship entry models remain unchanged.</p>
   <div className="grid gap-2 sm:grid-cols-2">{TURBO_IDS.map(id=><label key={id} title={strategyPlacement(id)?.decision} className="flex gap-2 text-sm"><input type={draft.selection_mode==='SINGLE'?'radio':'checkbox'} name={`turbo-${account.id}`} checked={draft.strategy_ids.includes(id)} onChange={e=>select(id,e.target.checked)}/>{TURBO_NAMES[id]}<span className="text-xs text-amber-300">{strategyPlacement(id)?.status==='REBUILD'?'Development':'Alternative'}</span></label>)}</div>
   <button type="button" className="rounded border border-cyan-700 px-3 py-1 text-sm" onClick={()=>setDraft(d=>({...d,selection_mode:'ADAPTIVE',strategy_ids:[...TURBO_IDS]}))}>Select all five adaptively</button>
   <p className="text-xs text-zinc-400">Adaptive selection ranks qualified planned reward after costs and rejects close opposing choices. Improved profitability is not assumed. The Basket Scalper also compares its own entry models.</p>
   <div className="grid gap-3 sm:grid-cols-2">{TURBO_FIELDS.map(([field,label,,min,max])=><label key={field} className="text-xs text-zinc-300">{label}<input aria-label={label} type="number" min={min} max={max} step="any" value={typeof draft[field]==='number'?draft[field] as number:''} onChange={e=>setDraft(d=>({...d,[field]:e.target.value===''?null:Number(e.target.value)}))} className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 p-2"/></label>)}</div>
   <p className="text-xs text-amber-200">Enter the intended broker's commission and slippage reserve explicitly; blank costs cannot enable entries. A 0.4% basket target is an experimental setting, not an expected return. Risk limits can be reduced further by capital and broker conditions.</p>
   <button type="button" onClick={()=>void save()} className="rounded bg-cyan-700 px-4 py-2 text-sm">{pending?'Working…':'Save & pause new entries'}</button>
  </fieldset>
  <div className="mt-5 border-t border-zinc-800 pt-4"><button disabled={pending} type="button" className="rounded border border-zinc-700 px-3 py-2 text-sm" onClick={()=>void refresh()}>Refresh Turbo status</button>
   <p className="mt-2 text-xs text-zinc-400">{status?status.state==='OBSERVED'?'Agent heartbeat observed':status.state==='STALE'?'Stale agent observation':'No verified Turbo observation':'Status has not been requested.'}{summary?` · ${new Date(summary.as_of_ms).toLocaleString()}`:''}</p>
   {summary&&<><p className="mt-2 text-sm">{summary.last_reason} · Entry lease {summary.lease_valid?'valid':'inactive'} · Daily lock {summary.locked?'on':'off'} · Drawdown lock {summary.total_locked?'on':'off'}</p>
    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">{[['Tracked net',summary.net_money],['Realized',summary.realized_net_money],['Floating after reserves',summary.floating_net_money],['Committed basket risk',summary.open_risk_money],['Margin',summary.margin_money],['Active baskets',summary.active_baskets.length]].map(([label,value])=><div key={String(label)}><dt className="text-xs text-zinc-400">{label}</dt><dd>{typeof value==='number'?value.toFixed(2):'Unavailable'}</dd></div>)}</dl>
    <details className="mt-3 text-xs"><summary>Recent decisions and baskets</summary><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap">{JSON.stringify({baskets:summary.active_baskets,decisions:summary.recent_decisions},null,2)}</pre></details>
    <div className="mt-3 flex flex-wrap gap-3 text-xs"><button type="button" onClick={()=>download('gold-turbo-status.json',JSON.stringify(status,null,2),'application/json')}>Download status JSON</button><button type="button" onClick={()=>download('gold-turbo-decisions.csv',goldTurboCsv(summary.recent_decisions),'text/csv')}>Export recent decisions CSV</button></div></>}
   <label className="mt-4 block text-xs text-cyan-300">Convert a full agent event-log segment to CSV<input type="file" accept=".jsonl,.log,.txt" onChange={e=>{void importLog(e.target.files?.[0]);e.target.value=''}} className="mt-2 block text-zinc-400"/></label>
   <p className="mt-2 text-xs text-zinc-500">Heartbeat exports contain at most 20 recent decisions/baskets. The agent's event log holds the fuller audit; repeated unchanged decisions are sampled every five seconds. Amounts use the connected account's currency and are tracked Turbo values, not the whole account's return.</p>
  </div>
  {notice&&<p role="status" className="mt-3 text-sm text-cyan-200">{notice}</p>}
 </details>;
}
