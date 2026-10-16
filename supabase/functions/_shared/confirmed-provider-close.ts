export async function stableCloseIdentity(scope:string,rowId:string,reason:string){if(!scope||!rowId||!reason)throw new Error('CLOSE_IDENTITY_REQUIRED');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([scope,rowId,reason])));return 'hbcl_'+[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,24)}
/** Lookup before submit, and require an observed fill before callers remove protection. */
export async function confirmedProviderClose(input:{clientId:string;symbol:string;side:string;quantity:number;lookup:()=>Promise<Record<string,unknown>|null>;submit:()=>Promise<Record<string,unknown>>}) {
 if(!Number.isFinite(input.quantity)||input.quantity<=0)throw new Error('INVALID_CLOSE_QUANTITY');
 let order=await input.lookup(); // null means explicit provider not-found; an uncertain lookup must throw.
 if(!order){await input.submit();order=await input.lookup();}
 if(!order||order.clientOrderId!==input.clientId||order.symbol!==input.symbol||order.side!==input.side||order.status!=='FILLED'||(order.reduceOnly!==true&&order.reduceOnly!=='true')||!Number.isFinite(Number(order.executedQty))||Number(order.executedQty)+1e-10<input.quantity)throw new Error('CLOSE_SUBMISSION_UNCERTAIN_RECONCILE');
 return order;
}
