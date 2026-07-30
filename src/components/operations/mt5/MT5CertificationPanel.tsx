import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

const CHECKS = ['command_polling','test_connection','sync_account','snapshot','positions_read','pending_orders_read','history_30d','terminal_authentication','login_match','server_match','heartbeat','restart_recovery','stale_lock_cleanup','duplicate_worker_rejection','command_lease_reclaim','idempotency','account_isolation','owner_isolation','bridge_isolation','execution_gate','protection','recovery','market_data_feed','forex_candles','symbol_mapping'];
type Row={check_key:string;status:'PASS'|'FAIL'|'NOT_RUN';error_code?:string|null};

export function MT5CertificationPanel(){
 const [rows,setRows]=useState<Row[]>([]);
 useEffect(()=>{void supabase.from('mt5_certification_results').select('check_key,status,error_code').then(({data})=>setRows((data??[]) as Row[]));},[]);
 const truth=new Map(rows.map(row=>[row.check_key,row]));
 return <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4"><h3 className="text-sm font-bold text-white mb-3">MT5 Demo Certification</h3><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">{CHECKS.map(key=>{const row=truth.get(key);const status=row?.status??'NOT_RUN';return <div key={key} className="bg-zinc-950 border border-zinc-800 rounded p-2"><div className="text-[10px] text-zinc-400 uppercase">{key.replaceAll('_',' ')}</div><div className={`text-xs font-bold ${status==='PASS'?'text-emerald-400':status==='FAIL'?'text-red-400':'text-zinc-500'}`}>{status}</div>{row?.error_code&&<div className="text-[10px] text-red-300 font-mono">{row.error_code}</div>}</div>})}</div><p className="text-[10px] text-amber-400 mt-3">Forex execution and controlled Demo order remain disabled until every required gate passes and an operator explicitly confirms the order.</p></div>;
}
