import {TURBO_IDS} from './gold-turbo-lease.ts';
export const TURBO_NAMES:Record<string,string>={
 [TURBO_IDS[0]]:'Micro Scalper',[TURBO_IDS[1]]:'Momentum Scalper',[TURBO_IDS[2]]:'Range Scalper',
 [TURBO_IDS[3]]:'Trend Scalper',[TURBO_IDS[4]]:'Price-Action Basket Scalper'};
export const TURBO_FIELDS=[
 ['risk_pct','Risk per decision / basket (%)',.25,.01,.5],['daily_loss_pct','Daily loss limit (%)',1.5,1,2],
 ['total_loss_pct','Peak drawdown limit (%)',8,1,10],['max_open_risk_pct','Shared open-risk cap (%)',1,.01,2],
 ['max_margin_pct','Margin cap (% of equity)',20,1,30],['basket_target_pct','Basket profit target (% of starting equity)',.2,.05,1],
 ['session_profit_lock_pct','Session profit lock (%)',3,.1,20],['session_trailing_pct','Session equity trailing (%)',1,.1,5],
 ['commission_quote_per_lot_per_side','Commission (USD / lot / side)',null,0,10000],
 ['slippage_quote_per_side','Slippage reserve (USD / oz / side)',null,0,10000],
] as const;
export type GoldTurboConfig={enabled:boolean;selection_mode:'SINGLE'|'CUSTOM'|'ADAPTIVE';strategy_ids:string[];expiry_policy:'CLOSE';hedge_enabled:false;[key:string]:unknown};
export function turboAccountEligible(account:any){return ['MT5','MT5_PERSONAL'].includes(String(account?.provider).toUpperCase())&&account?.environment==='demo'&&account?.account_mode==='PERSONAL';}
export function goldTurboDraft(value:any):GoldTurboConfig{return {enabled:false,selection_mode:'ADAPTIVE',strategy_ids:[...TURBO_IDS],expiry_policy:'CLOSE',hedge_enabled:false,profit_exit_mode:'EQUITY_TARGET',momentum_entry_variant:'BASELINE_RETEST',...Object.fromEntries(TURBO_FIELDS.map(([k,,v])=>[k,v])),...(value??{})};}
export function validateGoldTurboConfig(account:any,value:any):GoldTurboConfig{
 if(!turboAccountEligible(account))throw Error('TURBO_PERSONAL_DEMO_ACCOUNT_REQUIRED');
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('TURBO_CONFIG_REQUIRED');
 const keys=new Set(['enabled','selection_mode','strategy_ids','expiry_policy','hedge_enabled','profit_exit_mode','momentum_entry_variant',...TURBO_FIELDS.map(f=>f[0])]);
 if(Object.keys(value).some(k=>!keys.has(k)))throw Error('TURBO_UNKNOWN_SETTING');
 const c=goldTurboDraft(value);
 if(!['EQUITY_TARGET','STRATEGY_EXITS'].includes(c.profit_exit_mode as string))throw Error('TURBO_PROFIT_EXIT_MODE_INVALID');
 if(!['BASELINE_RETEST','SESSION_BREAKOUT'].includes(c.momentum_entry_variant as string))throw Error('TURBO_MOMENTUM_VARIANT_INVALID');
 if(typeof c.enabled!=='boolean'||!['SINGLE','CUSTOM','ADAPTIVE'].includes(c.selection_mode)||c.hedge_enabled!==false||c.expiry_policy!=='CLOSE')throw Error('TURBO_MODE_OR_PROTECTION_INVALID');
 if(!Array.isArray(c.strategy_ids)||!c.strategy_ids.length||new Set(c.strategy_ids).size!==c.strategy_ids.length||c.strategy_ids.some(id=>!TURBO_IDS.includes(id as typeof TURBO_IDS[number])))throw Error('TURBO_STRATEGY_SELECTION_REQUIRED');
 if(c.selection_mode==='SINGLE'&&c.strategy_ids.length!==1)throw Error('TURBO_SINGLE_STRATEGY_REQUIRED');
 for(const [key,,,min,max] of TURBO_FIELDS){const n=c[key];if(!c.enabled&&n===null&&key.includes('quote_'))continue;if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error(`TURBO_INVALID_${key}`);}
 return {...c,strategy_ids:[...c.strategy_ids].sort()};
}
const stable=(x:any):string=>JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(v=>JSON.parse(stable(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(stable(x[k]))])):x??null);
export async function saveGoldTurboConfig(db:any,actor:{id:string;role:string},customer:string,accountId:string,expected:any,value:any){
 if(actor.role!=='admin')throw Error('ADMIN_REQUIRED');
 const r=await db.from('connected_execution_accounts').select('*').eq('id',accountId).eq('customer_id',customer).maybeSingle();
 if(r.error||!r.data)throw Error('ACCOUNT_OWNERSHIP_REQUIRED');const a=r.data;
 const checked=validateGoldTurboConfig(a,value),old=a.policy_overrides??{};
 if(stable(old.gold_turbo??null)!==stable(expected??null))throw Error('TURBO_CONFIGURATION_CHANGED_RELOAD');
 // Durable intent precedes the CAS write. An audit failure prevents mutation;
 // a conflict leaves an explicitly REQUESTED (not falsely SAVED) audit event.
 const audit=await db.from('phase_h_audit_events').insert({customer_id:customer,execution_account_id:accountId,actor_id:actor.id,event_type:'GOLD_TURBO_CONFIG_REQUESTED',safe_metadata:{expected:old.gold_turbo??null,requested:checked}});
 if(audit.error)throw Error('TURBO_AUDIT_REQUIRED');
 let q=db.from('connected_execution_accounts').update({policy_overrides:{...old,gold_turbo:checked},runtime_control:'PAUSE',updated_at:new Date().toISOString()}).eq('id',accountId).eq('customer_id',customer).eq('runtime_control',a.runtime_control).eq('execution_enabled',a.execution_enabled);
 q=a.policy_overrides==null?q.is('policy_overrides',null):q.eq('policy_overrides',JSON.stringify(a.policy_overrides));
 const saved=await q.select('id').maybeSingle();
 if(saved.error)throw Error('TURBO_CONFIGURATION_WRITE_FAILED');if(!saved.data)throw Error('TURBO_CONFIGURATION_CHANGED_RELOAD');
 return {configuration:checked,entries:'PAUSED',execution_started:false};
}
export function safeGoldTurboStatus(value:any,scope:{account:string;owner:string;bridge:string},now=Date.now()){
 if(!value||value.schema!=='gold-turbo-status/v1'||value.account_id!==scope.account||value.owner_id!==scope.owner||value.bridge_id!==scope.bridge||typeof value.as_of_ms!=='number'||!Number.isFinite(value.as_of_ms)||value.as_of_ms<=0||value.as_of_ms>now) return {state:'UNAVAILABLE',summary:null};
 const number=(v:any)=>typeof v==='number'&&Number.isFinite(v)?v:null;
 const text=(v:any)=>typeof v==='string'?v.slice(0,160):null;
 return {state:now-value.as_of_ms>30000?'STALE':'OBSERVED',summary:{schema:value.schema,as_of_ms:value.as_of_ms,
  last_reason:/^[A-Z0-9_:]{1,100}$/.test(value.last_reason)?value.last_reason:'RUNTIME_STATUS',lease_valid:value.lease_valid===true,
  locked:value.locked===true,total_locked:value.total_locked===true,realized_net_money:number(value.realized_net_money),
  floating_net_money:number(value.floating_net_money),net_money:number(value.net_money),margin_money:number(value.margin_money),open_risk_money:number(value.open_risk_money),
  active_baskets:Array.isArray(value.active_baskets)?value.active_baskets.slice(0,20).map((b:any)=>({basket_id:text(b.basket_id),strategy_id:text(b.strategy_id),state:text(b.state),side:text(b.side),positions:number(b.positions),net_money:number(b.net_money)})):[],
  recent_decisions:Array.isArray(value.recent_decisions)?value.recent_decisions.slice(-20).map((d:any)=>({at_ms:number(d.at_ms),strategy_id:text(d.strategy_id),decision:text(d.decision),entry_model:text(d.entry_model),reason:text(d.reason),opportunity_id:text(d.opportunity_id)})):[]}};
}
export async function loadGoldTurboStatus(db:any,account:any,now=Date.now()){
 if(!turboAccountEligible(account))throw Error('TURBO_PERSONAL_DEMO_ACCOUNT_REQUIRED');
 const a=await db.from('mt5_accounts').select('bridge_id').eq('id',account.provider_account_identity).eq('user_id',account.customer_id).maybeSingle();
 if(a.error||!a.data)return {state:'UNAVAILABLE',summary:null};
 const r=await db.from('mt5_bridge_registry').select('connection_info,last_heartbeat_at').eq('bridge_id',a.data.bridge_id).maybeSingle();
 if(r.error)return {state:'UNAVAILABLE',summary:null};
 return safeGoldTurboStatus(r.data?.connection_info?.gold_turbo,{account:account.provider_account_identity,owner:account.customer_id,bridge:a.data.bridge_id},now);
}
export function goldTurboCsv(rows:any[]){
 const columns=['at_ms','strategy_id','decision','entry_model','reason','opportunity_id','event','basket_id','net','realized','floating','margin','gross_lots','deal_id','lots'];
 const cell=(v:any)=>{let s=v==null?'':String(v);if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return [columns.join(','),...rows.map(r=>columns.map(k=>cell(r?.[k])).join(','))].join('\r\n');
}
