import {canonicalExecutionAccountId} from './canonical-account-identity.ts';
export interface ExecutionAccessBoundary {state:'ACTIVE'|'EXPIRED'|'INACTIVE'|'NOT_CONFIGURED';entitlement_id?:string;expires_at?:string;}
/** Missing entitlement data is unavailable, never an invented expired subscription. */
export async function executionAccessBoundary(store:any,owner:Record<string,any>,provider:'BINANCE'|'BYBIT'):Promise<ExecutionAccessBoundary>{
 if(String(owner.environment).toLowerCase()==='live')return {state:'NOT_CONFIGURED'}; // This release verifies sandbox management.
 const id=await canonicalExecutionAccountId(store,owner,provider),result=await store.rpc('execution_access_boundary',{p_account:id,p_customer:owner.customer_id});
 if(result.error||!result.data||!['ACTIVE','EXPIRED','INACTIVE','NOT_CONFIGURED'].includes(result.data.state))throw Error('EXECUTION_ACCESS_READ_UNAVAILABLE');
 const data=result.data as ExecutionAccessBoundary;
 if(data.state==='EXPIRED'&&(!data.entitlement_id||!Number.isFinite(Date.parse(data.expires_at??''))||Date.parse(data.expires_at!)>Date.now()))throw Error('EXECUTION_EXPIRY_EVIDENCE_INVALID');
 return data;
}
export function ownedExpiryQuantity(native:number,owned:unknown){
 const quantity=Number(owned);
 if(!Number.isFinite(native)||native<0||!Number.isFinite(quantity)||quantity<=0)throw Error('EXPIRY_OWNED_QUANTITY_REQUIRED');
 return Math.min(native,quantity);
}
