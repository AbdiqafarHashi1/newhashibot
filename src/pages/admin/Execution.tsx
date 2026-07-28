import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { useAuth } from '../../contexts/AuthContext';
import { getFrontendSupabaseUrl } from '../../lib/supabaseEnv';
import { ExecutionAccount, ExecutionProvider, PROVIDER_CONTRACT, isOpaqueCredentialRef, providerAccountUrl } from '../../lib/executionAccounts';

async function operatorAction(token: string, action: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`${getFrontendSupabaseUrl()}/functions/v1/admin-operator-action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...body }),
  });
  const payload = await response.json();
  if (!response.ok || payload.success === false) throw new Error(payload.exact_error || payload.error || payload.responseBody?.errorMessage || 'Operator action failed');
  return payload.responseBody ?? payload;
}

const emptyForm = { display_label: '', account_id: '', customer_id: '', provider: 'binance' as ExecutionProvider, ownership_classification: 'customer', credential_ref: '', enabled: false, monitor_enabled: false, risk_profile_id: '' };

export default function Execution() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<ExecutionAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true); setError(null);
    try { const data = await operatorAction(session.access_token, 'list_execution_accounts'); setAccounts(data.accounts ?? []); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const act = async (action: string, body: Record<string, unknown>, success: string) => {
    if (!session?.access_token) return;
    setError(null);
    try { await operatorAction(session.access_token, action, body); setNotice(success); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (form.credential_ref && !isOpaqueCredentialRef(form.credential_ref)) { setError('Credential reference must be an opaque Vault UUID.'); return; }
    await act('create_execution_account', { ...form, environment: PROVIDER_CONTRACT[form.provider].environment, credential_ref: form.credential_ref || null }, 'Canonical account created with execution OFF.');
    setShowAdd(false); setForm(emptyForm);
  };

  return <AdminLayout>
    <div className="space-y-6 font-mono">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-blue-400">Execution Management / Account Manager</div>
          <h1 className="mt-1 text-2xl font-bold text-white">Connected Execution Accounts</h1>
          <p className="mt-1 max-w-3xl font-sans text-sm text-zinc-400">API reachability, account configuration, monitoring, and execution adoption are independent safety gates.</p>
        </div>
        <div className="flex gap-2"><button onClick={() => void load()} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300"><RefreshCw size={14} className="mr-2 inline"/>Refresh</button><button onClick={() => setShowAdd(true)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white"><Plus size={14} className="mr-2 inline"/>Add account</button></div>
      </div>

      {notice && <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-emerald-300"><CheckCircle2 size={15} className="mr-2 inline"/>{notice}</div>}
      {error && <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300"><AlertTriangle size={15} className="mr-2 inline"/>{error}</div>}

      {loading ? <div className="p-10 text-center text-zinc-500">Loading canonical accounts…</div> : accounts.length === 0 ? <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-10 text-center"><Activity className="mx-auto mb-3 text-zinc-600"/><div className="font-bold text-amber-300">NOT CONFIGURED</div><div className="mt-2 font-sans text-sm text-zinc-400">No canonical execution-account identity</div></div> :
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900"><table className="min-w-[1450px] w-full text-left text-xs"><thead className="bg-zinc-950 text-zinc-500"><tr>{['Label / Account ID','Provider / Environment','Owner','Credential reference','Selectable','Operational','Monitor','Execution adoption','Risk profile','Provider health','Runtime freshness / sync','First blocker','Actions'].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{accounts.map(account => {
        const blocker = !account.credential_ref ? 'No opaque credential reference' : !account.enabled ? 'Account selection disabled' : !account.execution_enabled ? 'Canonical execution adoption disabled' : account.last_error || '—';
        return <tr key={account.id} className="border-t border-zinc-800 align-top text-zinc-300"><td className="p-3"><b className="text-white">{account.display_label}</b><div className="mt-1 text-zinc-500">{account.account_id}</div></td><td className="p-3 uppercase">{account.provider}<div className="text-blue-300">{account.environment}</div><div className="text-zinc-500">{PROVIDER_CONTRACT[account.provider].adapter}</div></td><td className="p-3">{account.ownership_classification}<div className="max-w-36 truncate text-zinc-500" title={account.customer_id}>{account.customer_id}</div></td><td className="p-3">{account.credential_ref ? <span title={account.credential_ref} className="text-emerald-300"><KeyRound size={12} className="mr-1 inline"/>OPAQUE REF ASSIGNED</span> : <span className="text-amber-300">NOT ASSIGNED</span>}<button className="mt-2 block text-blue-400" onClick={() => { const ref = prompt('Opaque Vault credential UUID (never enter API keys or secrets):', account.credential_ref ?? ''); if (ref !== null) void act('update_execution_account', { id: account.id, credential_ref: ref || null }, 'Credential reference updated.'); }}>Assign reference</button></td>
        <td className="p-3"><Toggle value={account.enabled} onChange={v => void act('update_execution_account',{id: account.id,enabled:v},'Account selection updated.')}/></td><td className="p-3">{account.is_operational ? <span className="text-emerald-300">DESIGNATED</span> : <button className="text-blue-400" onClick={() => void act('designate_operational_account',{id:account.id},'Operational account designated.')}>Designate</button>}</td><td className="p-3"><Toggle value={account.monitor_enabled} onChange={v => void act('update_execution_account',{id:account.id,monitor_enabled:v},'Monitoring updated.')}/></td><td className="p-3"><Toggle value={account.execution_enabled} danger onChange={v => { if (!v || confirm('Explicitly change canonical execution adoption? This does not bypass other safety gates.')) void act('update_execution_account',{id:account.id,execution_enabled:v},`Execution adoption ${v?'ENABLED':'DISABLED'}.`); }}/><div className={account.execution_enabled?'text-red-300':'text-emerald-300'}>{account.execution_enabled?'EXECUTION ENABLED':'EXECUTION DISABLED'}</div></td>
        <td className="p-3">{account.risk_profile_id ?? 'UNASSIGNED'}<button className="mt-2 block text-blue-400" onClick={() => { const id=prompt('Risk profile UUID:',account.risk_profile_id??''); if(id!==null) void act('update_execution_account',{id:account.id,risk_profile_id:id||null},'Risk profile updated.');}}>Assign</button></td><td className="p-3 uppercase">{account.provider_health}</td><td className="p-3">{account.last_synchronized_at ? new Date(account.last_synchronized_at).toLocaleString() : 'NO EVIDENCE'}</td><td className="p-3 text-amber-300">{blocker}</td><td className="p-3 space-y-2"><button className="block text-blue-400" onClick={() => navigate(providerAccountUrl(account))}>Open operations <ExternalLink size={11} className="inline"/></button><button className="block text-blue-400" onClick={() => void act('test_execution_account_credentials',{id:account.id},'Credential route tested; execution unchanged.')}>Test reachability</button><button className="block text-blue-400" onClick={() => { const label=prompt('Display label:',account.display_label); if(label) void act('update_execution_account',{id:account.id,display_label:label},'Account updated.');}}>Edit label</button></td></tr>;
      })}</tbody></table></div>}

      {showAdd && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><form onSubmit={add} className="w-full max-w-xl space-y-4 rounded-xl border border-zinc-700 bg-zinc-900 p-6"><div><h2 className="text-lg font-bold text-white">Add canonical execution account</h2><p className="text-xs text-emerald-300">Execution adoption always defaults OFF.</p></div><Field label="Display label" value={form.display_label} onChange={v=>setForm({...form,display_label:v})}/><Field label="Provider account ID" value={form.account_id} onChange={v=>setForm({...form,account_id:v})}/><Field label="Customer or system owner UUID" value={form.customer_id} onChange={v=>setForm({...form,customer_id:v})}/><label className="block text-xs text-zinc-400">Provider<select value={form.provider} onChange={e=>setForm({...form,provider:e.target.value as ExecutionProvider})} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-white"><option value="binance">Binance Testnet</option><option value="bybit">Bybit Demo</option></select></label><Field label="Opaque Vault credential UUID (optional)" value={form.credential_ref} onChange={v=>setForm({...form,credential_ref:v})}/><div className="rounded border border-zinc-700 p-3 text-xs text-zinc-400"><label><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/> Selectable</label><label className="ml-5"><input type="checkbox" checked={form.monitor_enabled} onChange={e=>setForm({...form,monitor_enabled:e.target.checked})}/> Monitor enabled</label><div className="mt-2 text-emerald-300"><ShieldCheck size={13} className="mr-1 inline"/>Execution disabled (fixed safe default)</div></div><div className="flex justify-end gap-2"><button type="button" onClick={()=>setShowAdd(false)} className="rounded bg-zinc-800 px-4 py-2 text-xs">Cancel</button><button className="rounded bg-blue-600 px-4 py-2 text-xs font-bold text-white">Create account</button></div></form></div>}
    </div>
  </AdminLayout>;
}

function Toggle({value,onChange,danger=false}:{value:boolean;onChange:(value:boolean)=>void;danger?:boolean}) { return <button onClick={()=>onChange(!value)} className={`mb-1 rounded px-2 py-1 font-bold ${value?(danger?'bg-red-500/20 text-red-300':'bg-emerald-500/20 text-emerald-300'):'bg-zinc-800 text-zinc-500'}`}>{value?'ON':'OFF'}</button>; }
function Field({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) { return <label className="block text-xs text-zinc-400">{label}<input required={!label.includes('optional')} value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-white"/></label>; }
