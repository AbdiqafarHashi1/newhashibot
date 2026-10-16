/** Provider evidence, not a price crossing or position-size heuristic, confirms TP1. */
export function confirmedBybitTp1(order:Record<string,unknown>|undefined,expected:{symbol:string;orderId?:string;orderLinkId:string}) {
 return !!order&&order.symbol===expected.symbol&&(expected.orderId?String(order.orderId)===expected.orderId:order.orderLinkId===expected.orderLinkId)&&order.orderStatus==='Filled'&&Number.isFinite(Number(order.cumExecQty))&&Number(order.cumExecQty)>0;
}
export async function collectBybitPages(request:(cursor?:string)=>Promise<{list?:unknown;nextPageCursor?:unknown}>,maxPages=5):Promise<Record<string,unknown>[]> {
 const result:Record<string,unknown>[]=[];const seen=new Set<string>();let cursor:string|undefined;
 for(let page=0;page<maxPages;page++){const data=await request(cursor);if(!Array.isArray(data.list))throw new Error('PROVIDER_SNAPSHOT_MALFORMED');result.push(...data.list);const next=String(data.nextPageCursor??'');if(!next)return result;if(seen.has(next))throw new Error('PROVIDER_CURSOR_REPEATED');seen.add(next);cursor=next;}
 throw new Error('PROVIDER_SNAPSHOT_PAGE_LIMIT');
}
export interface BybitStopTransport { read():Promise<Record<string,unknown>|undefined>; amend(input:{orderId:string;triggerPrice:string;qty:string}):Promise<unknown>; }
/** Amend the existing stop in place. Never cancel protection or claim an ACK is a fill/verification. */
export async function reconcileBybitStop(input:{symbol:string;side:'LONG'|'SHORT';target:number;quantity:number;mark:number;transport:BybitStopTransport}) {
 const pending=(reason:string)=>({state:'PENDING' as const,reason});
 if(![input.target,input.quantity,input.mark].every(x=>Number.isFinite(x)&&x>0))throw new Error('INVALID_STOP_AMENDMENT');
 const observed=await input.transport.read().catch(()=>undefined);
 const valid=(o:Record<string,unknown>|undefined)=>!!o&&o.symbol===input.symbol&&String(o.orderId??'')!==''&&(o.reduceOnly===true||o.reduceOnly==='true')&&o.side===(input.side==='LONG'?'Sell':'Buy')&&['New','Untriggered','PartiallyFilled'].includes(String(o.orderStatus))&&Number.isFinite(Number(o.triggerPrice))&&Number(o.triggerPrice)>0&&Number(o.qty)>=input.quantity;
 if(!valid(observed))return pending('EXISTING_STOP_NOT_VERIFIED');
 const current=Number(observed!.triggerPrice),target=input.side==='LONG'?Math.max(current,input.target):Math.min(current,input.target);
 if(input.side==='LONG'?target>=input.mark:target<=input.mark)return pending('STOP_CROSSED_MARKET_RECONCILE');
 const tolerance=Math.max(1e-9,Math.abs(target)*1e-8);
 if(Math.abs(current-target)<=tolerance)return {state:'VERIFIED' as const,price:current,orderId:String(observed!.orderId)};
 try{await input.transport.amend({orderId:String(observed!.orderId),triggerPrice:String(target),qty:String(input.quantity)})}catch{return pending('STOP_AMENDMENT_UNCERTAIN_EXISTING_STOP_PRESERVED')}
 const after=await input.transport.read().catch(()=>undefined);
 if(!valid(after)||String(after!.orderId)!==String(observed!.orderId)||Math.abs(Number(after!.triggerPrice)-target)>tolerance)return pending('STOP_AMENDMENT_NOT_YET_OBSERVED');
 return {state:'VERIFIED' as const,price:Number(after!.triggerPrice),orderId:String(after!.orderId)};
}
