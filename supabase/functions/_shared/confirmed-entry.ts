export type EntryConfirmation={signal_id:string;new_status:string;price:number|string|null;reason:string|null;created_at:string};
/** A pending setup is never an executable trade. Only the persisted outcome observer can supply entry evidence. */
export function assertConfirmedEntry(signal:{id:string;status:string;created_at:string;expires_at:string},confirmation:EntryConfirmation|null,now=Date.now()){
 if(signal.status!=='active')throw Error('SIGNAL_CONDITION_NOT_CONFIRMED');
 const created=Date.parse(signal.created_at),expires=Date.parse(signal.expires_at),observed=Date.parse(confirmation?.created_at??'');
 if(!confirmation||confirmation.signal_id!==signal.id||confirmation.new_status!=='active'||!['entry_trigger','candle_entry_trigger','conditional_close_confirmed'].includes(confirmation.reason??'')||confirmation.price===null||!Number.isFinite(Number(confirmation.price))||Number(confirmation.price)<=0||!Number.isFinite(created)||!Number.isFinite(observed)||!Number.isFinite(expires)||observed<created||observed>now||observed>=expires||expires<=now)throw Error('PERSISTED_ENTRY_CONFIRMATION_REQUIRED');
 return confirmation;
}
export async function loadConfirmedEntry(db:any,signal:{id:string;status:string;created_at:string;expires_at:string},now=Date.now()){
 if(signal.status!=='active')throw Error('SIGNAL_CONDITION_NOT_CONFIRMED');
 const result=await db.from('signal_updates').select('signal_id,new_status,price,reason,created_at').eq('signal_id',signal.id).eq('new_status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(result.error)throw Error('PERSISTED_ENTRY_CONFIRMATION_REQUIRED');
 return assertConfirmedEntry(signal,result.data,now);
}
