import {GoldTurboControls} from './GoldTurboControls';
import {useEffect,useState} from 'react';
import {executionStrategyChoices} from '../../../supabase/functions/_shared/execution-strategy-selection';
import {executionStrategyPresets,executionStrategyDisplayName,executionStrategyEvidence} from '../../../supabase/functions/_shared/execution-strategy-presets';
import {supabase} from '../../lib/supabase';
import {adminRequestError} from '../../lib/adminRequestError';
type Account={id:string;customer_id:string;provider:string;environment:string;account_mode?:string;policy_overrides:Record<string,unknown>};
export function AccountStrategySelection({account,onSaved}:{account:Account;onSaved:()=>Promise<void>}){
 const configuration=account.policy_overrides?.policy_configuration as {allowedStrategies?:string[]}|undefined;
 const initial=configuration?.allowedStrategies??[];
 const initialKey=JSON.stringify(initial);
 const[selected,setSelected]=useState(initial),[pending,setPending]=useState(false),[notice,setNotice]=useState('');
 // A different account must never inherit the preceding customer's unsaved draft.
 useEffect(()=>{setSelected(JSON.parse(initialKey) as string[]);setNotice('')},[account.id,initialKey]);
 const choices=executionStrategyChoices(account.provider,account.environment);
 const reviewed=choices.filter(c=>executionStrategyEvidence(c.id));
 const other=choices.filter(c=>!executionStrategyEvidence(c.id));
 const presets=executionStrategyPresets(account.provider,account.environment,account.account_mode);
 const save=async()=>{setPending(true);setNotice('');try{
  const{data,error}=await supabase.functions.invoke('phase-h-authority',{body:{action:'admin_account_strategies',customer_id:account.customer_id,execution_account_id:account.id,expected_strategies:initial,strategies:selected}});
  if(error||data?.state!=='SAVED')throw Error(await adminRequestError(data,error));
  await onSaved();setNotice('Strategy selection saved for this account. Start execution from account controls when ready.');
 }catch(e){setNotice(e instanceof Error?e.message:'Strategy selection was not saved.')}finally{setPending(false)}};
 const applyDefault=async()=>{setPending(true);setNotice('');try{const {data,error}=await supabase.functions.invoke('phase-h-authority',{body:{action:'admin_apply_tier_preset',customer_id:account.customer_id,execution_account_id:account.id,expected_strategies:initial}});if(error||data?.state!=='SAVED')throw Error(await adminRequestError(data,error));await onSaved()}catch(e){setNotice(e instanceof Error?e.message:'Default preset was not saved.')}finally{setPending(false)}};
 const toggle=(id:string,checked:boolean)=>setSelected(checked?[...new Set([...selected,id])]:selected.filter(s=>s!==id));
 return <section className="mt-6 rounded-lg border border-zinc-700 p-4">
  <h3 className="font-semibold">Strategy deployment for this account</h3><button disabled={pending} className="mt-2 rounded border border-cyan-700 p-2 text-xs" onClick={()=>{setPending(true);void supabase.functions.invoke('phase-h-authority',{body:{action:'activate_growth_product_engines'}}).then(({data,error})=>{setNotice(error||data?.state!=='INSTALLED'?'Activation was not confirmed.':'13 scanner engines activated: eight VIP sources, focused Personal defaults and separate Prop presets.')}).finally(()=>setPending(false))}}>Activate product strategy lineup</button>
  <p className="mt-2 text-xs leading-6 text-zinc-400">Personal defaults use the audited growth lineup; all earlier reviewed engines remain available for Admin comparison and Prop. Gold RSI entries require recorded relative volume of at least 1 for Personal and VIP. Choose a preset or individual configurations. Presets replace this draft selection; they keep the account’s risk settings. Prop defaults omit the two 15m trailing/compression Gold variants; individual checkboxes remain available as Admin overrides. Saving pauses new entries until you start the account again.</p>
  <button disabled={pending} type="button" onClick={()=>void applyDefault()} className="mt-3 rounded border border-cyan-700 p-2 text-sm">Apply default account tier preset</button><div className="mt-3 flex flex-wrap gap-2">{presets.map(p=><button key={p.id} type="button" disabled={pending} onClick={()=>setSelected([...p.ids])} className="rounded border border-cyan-700 px-3 py-2 text-left text-xs text-cyan-200">{p.label} · {p.ids.length}</button>)}</div>
  <fieldset disabled={pending} className="mt-4 grid gap-3 sm:grid-cols-2"><legend className="mb-2 text-sm">Reviewed configurations · {selected.length} selected</legend>
   {reviewed.map(c=>{const review=executionStrategyEvidence(c.id)!;return <label key={c.id} className="rounded border border-zinc-700 p-3 text-sm">
    <span className="flex items-start gap-2"><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>toggle(c.id,e.target.checked)}/><span>{executionStrategyDisplayName(c.id,c.label)}</span></span>
    <span className="mt-2 block text-xs leading-5 text-zinc-400">{review.periods.map(p=><span key={p.reportSha256} className="block">{p.start.slice(0,10)} → {p.end.slice(0,10)} · net {p.metrics.netReturnPct.toFixed(2)}% · DD {p.metrics.maximumDrawdownPct.toFixed(2)}% · {p.metrics.closedTrades} closed · risk {p.riskPct}%</span>)}</span>
   </label>})}
  </fieldset>
  {reviewed.length>0&&<p className="mt-3 text-xs leading-5 text-zinc-400">Historical results use the displayed period and risk. Target R describes the planned reward, not realized returns. Combining selections has different exposure. Exact releases, provider compatibility and account limits still apply to each order.</p>}
  {other.length>0&&<details className="mt-4 rounded border border-zinc-800 p-3"><summary className="cursor-pointer text-sm">Other configurations · {selected.filter(id=>other.some(c=>c.id===id)).length} selected</summary><fieldset disabled={pending} className="mt-3 grid gap-3 sm:grid-cols-2">{other.map(c=><label key={c.id} className="text-sm"><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>toggle(c.id,e.target.checked)}/> {c.label}{c.demoOnly&&<span className="ml-2 text-xs text-zinc-400">Cost-positive hourly reference</span>}</label>)}</fieldset></details>}
  <button disabled={pending||!selected.length} onClick={()=>void save()} className="mt-4 rounded bg-cyan-700 px-4 py-2 text-sm disabled:opacity-40">{pending?'Saving…':'Save selected strategies'}</button>
  <GoldTurboControls account={account} onSaved={onSaved}/>
  {notice&&<p role="status" className="mt-3 text-sm text-cyan-200">{notice}</p>}
 </section>;
}
