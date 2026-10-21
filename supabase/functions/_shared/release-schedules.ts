/** Deployment installs paused schedules; owner activation remains an explicit operation. */
export const releaseSchedules=[
 {name:'hashibot_scheduled_market_scanner_5m',endpoint:'scheduled-market-scanner',schedule:'*/5 * * * *',header:'x-scanner-cron-secret',secret:'SCANNER_CRON_SECRET',body:{}},
 {name:'hashibot_outcomes_5m',endpoint:'evaluate-signal-outcomes',schedule:'*/5 * * * *',header:'x-hashibot-cron-token',secret:'HASHIBOT_CRON_TOKEN',body:{}},
 {name:'hashibot_binance_monitor_1m',endpoint:'binance-testnet-monitor',schedule:'* * * * *',header:'x-hashibot-cron-token',secret:'HASHIBOT_CRON_TOKEN',body:{}},
 {name:'hashibot_bybit_monitor_1m',endpoint:'bybit-testnet-monitor',schedule:'* * * * *',header:'x-hashibot-cron-token',secret:'HASHIBOT_CRON_TOKEN',body:{}},
 {name:'hashibot_account_authorization_1m',endpoint:'account-signal-authorization',schedule:'* * * * *',header:'x-hashibot-internal-secret',secret:'HASHIBOT_INTERNAL_SECRET',body:{action:'drain'}},
 {name:'hashibot_account_commands_1m',endpoint:'phase-n-command-worker',schedule:'* * * * *',header:'x-hashibot-internal-secret',secret:'HASHIBOT_INTERNAL_SECRET',body:{}},
 {name:'hashibot_reporting_1m',endpoint:'canonical-reporting-worker',schedule:'* * * * *',header:'x-hashibot-cron-token',secret:'HASHIBOT_CRON_TOKEN',body:{action:'work'}},
 {name:'hashibot_commerce_recovery_5m',endpoint:'commerce-reconcile',schedule:'*/5 * * * *',header:'x-hashibot-cron-token',secret:'HASHIBOT_CRON_TOKEN',body:{}},
 {name:'hashibot_telegram_membership_1m',endpoint:'telegram-membership',schedule:'* * * * *',header:'Authorization',secret:'TELEGRAM_WORKER_SECRET',body:{}},
 {name:'hashibot_agents_5m',endpoint:'phase-o-worker',schedule:'*/5 * * * *',header:'x-phase-o-worker-secret',secret:'PHASE_O_WORKER_SECRET',body:{worker_id:'scheduled-agent-worker',limit:5}},
] as const;
export const release1Schedules=[...releaseSchedules.filter(j=>['hashibot_scheduled_market_scanner_5m','hashibot_outcomes_5m','hashibot_reporting_1m','hashibot_commerce_recovery_5m','hashibot_telegram_membership_1m'].includes(j.name)),{name:'hashibot_intelligence_5m',endpoint:'intelligence-engine',schedule:'*/5 * * * *',header:'x-hashibot-cron-token',secret:'HASHIBOT_CRON_TOKEN',body:{action:'scheduled'}}] as const;
export async function installReleaseSchedules(db:any,actor:string,projectUrl:string,env:(key:string)=>string|undefined,scope:"RELEASE1"|"ALL"="RELEASE1"){
 const selected=scope==="ALL"?releaseSchedules:release1Schedules;
 const missing=selected.filter(j=>!env(j.secret)).map(j=>({name:j.name,missingSecret:j.secret}));
 if(missing.length)return {success:false,state:'SECRETS_REQUIRED',missing};
 const jobs=selected.map(j=>({name:j.name,endpoint:j.endpoint,schedule:j.schedule,header:j.header,token:(j.header==='Authorization'?'Bearer ':'')+env(j.secret),body:j.body}));
 const r=await db.rpc('install_hashibot_release_schedules',{p_actor:actor,p_project_url:projectUrl,p_jobs:jobs});if(r.error)throw Error('RELEASE_SCHEDULE_INSTALL_FAILED');return {success:true,state:'INSTALLED_PAUSED',jobs:r.data};
}
