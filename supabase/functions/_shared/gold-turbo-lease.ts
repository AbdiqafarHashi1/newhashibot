/** Account-bound, short-lived permission for LOCAL demo decisions. No ticks/orders. */
export const TURBO_IDS = ['gold.turbo-micro-scalper','gold.turbo-momentum-scalper','gold.turbo-range-scalper','gold.turbo-trend-scalper','gold.turbo-price-action-basket'] as const;
export function buildGoldTurboLease(account:any, mt5:any, binding:any, entitlement:any, scope:{owner:string;account:string;bridge:string;worker:string}, now=Date.now()) {
 const c=account?.policy_overrides?.gold_turbo;
 if(!c||c.enabled!==true)throw Error('GOLD_TURBO_DISABLED');
 if(account.customer_id!==scope.owner||account.provider_account_identity!==scope.account||!['MT5','MT5_PERSONAL'].includes(account.provider)||account.environment!=='demo'||account.account_mode!=='PERSONAL'||account.execution_enabled!==true)throw Error('TURBO_PERSONAL_DEMO_ACCOUNT_REQUIRED');
 if(account.runtime_control==='STOP')throw Error('TURBO_EMERGENCY_STOP');
 if(account.runtime_control!=='START')throw Error('TURBO_ENTRIES_PAUSED');
 if(mt5.id!==scope.account||mt5.user_id!==scope.owner||mt5.bridge_id!==scope.bridge||mt5.credential_capability!=='master'||mt5.execution_enabled!==true||mt5.operational!==true)throw Error('TURBO_BRIDGE_SCOPE_REQUIRED');
 if(!binding||binding.customer_id!==scope.owner||binding.execution_account_id!==account.id||binding.state!=='ACTIVE'||binding.entitlement_id!==entitlement?.id||entitlement.customer_id!==scope.owner||entitlement.execution_account_id!==account.id||entitlement.state!=='ACTIVE'||entitlement.source==='NOT_CONFIGURED'||entitlement.revoked_at!=null)throw Error('TURBO_ACTIVE_ENTITLEMENT_REQUIRED');
 const until=Date.parse(entitlement.valid_until),from=Date.parse(entitlement.valid_from);
 if(!Number.isFinite(until)||until<=now||!Number.isFinite(from)||from>now)throw Error('TURBO_FINITE_SUBSCRIPTION_REQUIRED');
 if(!Array.isArray(c.strategy_ids)||!c.strategy_ids.length||new Set(c.strategy_ids).size!==c.strategy_ids.length||c.strategy_ids.some((id:string)=>!(TURBO_IDS as readonly string[]).includes(id)))throw Error('TURBO_STRATEGY_SELECTION_REQUIRED');
 const bounded=(key:string,fallback:number,min:number,max:number)=>{const v=c[key]??fallback;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`TURBO_INVALID_${key}`);return v;};
 const finiteCost=(key:string)=>{const v=c[key];if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw Error('TURBO_EXPLICIT_COSTS_REQUIRED');return v;};
 if(c.selection_mode!==undefined&&(!['SINGLE','CUSTOM','ADAPTIVE'].includes(c.selection_mode)||(c.selection_mode==='SINGLE'&&c.strategy_ids.length!==1)))throw Error('TURBO_SELECTION_MODE_INVALID');
 if(c.expiry_policy!==undefined&&c.expiry_policy!=='CLOSE')throw Error('TURBO_EXPIRY_POLICY_UNSUPPORTED');
 return {schema:'gold-turbo-lease/v1',owner_id:scope.owner,account_id:scope.account,execution_account_id:account.id,bridge_id:scope.bridge,worker_id:scope.worker,environment:'demo',account_mode:'PERSONAL',server:mt5.server,
 issued_at_ms:now,expires_at_ms:Math.min(now+30000,until),subscription_until_ms:until,strategy_ids:[...c.strategy_ids],selection_mode:c.selection_mode??'CUSTOM',
 risk_pct:bounded('risk_pct',.25,.01,.5),daily_loss_pct:bounded('daily_loss_pct',1.5,1,2),total_loss_pct:bounded('total_loss_pct',8,1,10),
 max_open_risk_pct:bounded('max_open_risk_pct',1,.01,2),max_margin_pct:bounded('max_margin_pct',20,1,30),
 session_profit_lock_pct:bounded('session_profit_lock_pct',3,.1,20),session_trailing_pct:bounded('session_trailing_pct',1,.1,5),
 basket_target_pct:bounded('basket_target_pct',.2,.05,1),commission_quote_per_lot_per_side:finiteCost('commission_quote_per_lot_per_side'),slippage_quote_per_side:finiteCost('slippage_quote_per_side'),expiry_policy:'CLOSE',hedge_enabled:false};
}
export async function loadGoldTurboLease(db:any,mt5:any,scope:{owner:string;account:string;bridge:string;worker:string},now=Date.now()) {
 const a=await db.from('connected_execution_accounts').select('*').eq('customer_id',scope.owner).eq('provider_account_identity',scope.account).in('provider',['MT5','MT5_PERSONAL']).maybeSingle();
 if(a.error)throw Error('TURBO_CONTROL_UNAVAILABLE');
 if(!a.data)throw Error('TURBO_CONNECTED_ACCOUNT_REQUIRED');
 const b=await db.from('execution_entitlement_bindings').select('*').eq('customer_id',scope.owner).eq('execution_account_id',a.data.id).eq('state','ACTIVE').maybeSingle();
 if(b.error)throw Error('TURBO_CONTROL_UNAVAILABLE');
 if(!b.data)throw Error('TURBO_ENTITLEMENT_BINDING_REQUIRED');
 const e=await db.from('phase_h_entitlements').select('*').eq('id',b.data.entitlement_id).eq('customer_id',scope.owner).eq('execution_account_id',a.data.id).maybeSingle();
 if(e.error)throw Error('TURBO_CONTROL_UNAVAILABLE');
 return buildGoldTurboLease(a.data,mt5,b.data,e.data,scope,now);
}
