/** Aggregate reporting happens after account proofs are written. It never feeds another account's health. */
export function mergeMonitorStatistics(target:Record<string,any>,source:Record<string,any>){
 for(const key of ['checked','updated','protected','managed','stale_closed','closed_synced','safety_closed','events','telegram_sent','stale_cleaned','reduce_only_orders','cancelled_orders','unsafe_positions'])target[key]+=source[key]??0;
 for(const key of ['row_errors','warnings','critical_errors'])target[key].push(...source[key]);
 for(const key of ['latest_monitor_error','latest_sync_error','latest_monitor_warning','last_managed_action'])if(source[key])target[key]=source[key];
 for(const [key,value] of Object.entries(source.profit_lock_study??{})){if(typeof value==='number')target.profit_lock_study[key]=(target.profit_lock_study[key]??0)+value;}
 for(const [reason,count] of Object.entries(source.profit_lock_study?.skipped_reasons??{}))target.profit_lock_study.skipped_reasons[reason]=(target.profit_lock_study.skipped_reasons[reason]??0)+Number(count);
 for(const [key,value] of Object.entries(source.reconciliation_summary??{})){if(typeof value==='number')target.reconciliation_summary[key]=(target.reconciliation_summary[key]??0)+value;else if(typeof value==='boolean')target.reconciliation_summary[key]=target.reconciliation_summary[key]||value;}
}
