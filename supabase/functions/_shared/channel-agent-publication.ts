/** Approved Phase-O text goes through the same durable cooldown queue as news.
 * Queued is not delivered: the agent receives acceptance only after Telegram truth exists. */
export async function queueApprovedChannelText(db:any,input:{identity:string;text:string;audience:string;draftId:string;approvedAt:string}){
 const destination:Record<string,string>={FREE:'free',VIP_CRYPTO:'vip_crypto',VIP_FOREX_GOLD:'vip_forex_gold'};
 const channel=destination[input.audience];if(!channel)throw Error('CHANNEL_AGENT_AUDIENCE_REQUIRED');
 const now=input.approvedAt;if(!Number.isFinite(Date.parse(now)))return {kind:'permanent' as const,reason:'BOUND_APPROVAL_TIMESTAMP_REQUIRED'};
 const editorial={content_id:input.identity,content_type:'EDUCATION',audience:channel==='free'?'free':'vip',title:'HashiBot channel update',sections:[{body:input.text}],source_type:'HUMAN_APPROVED',source_ids:[input.draftId],generated_at:now,expires_at:new Date(Date.parse(now)+6*3600000).toISOString(),market_scope:channel==='vip_crypto'?['crypto']:channel==='vip_forex_gold'?['forex','gold']:['all'],evidence_class:'RESEARCH',author_type:'ADMIN',requires_approval:true,approval_state:'APPROVED',compliance_state:'APPROVED',dedupe_key:input.identity};
 const r=await db.rpc('enqueue_canonical_lifecycle_event',{p_event_key:input.identity,p_event_type:'EDITORIAL',p_event_version:1,p_signal_id:null,p_execution_id:null,p_customer_id:null,p_account_id:null,p_occurred_at:now,p_payload:{editorial},p_destinations:[channel]});
 if(r.error||typeof r.data!=='string')return {kind:'retry' as const,reason:'CHANNEL_CONTENT_QUEUE_UNAVAILABLE',retryAfterMs:120000};
 const work=await db.from('signal_publication_work').select('id,status').eq('entity_type','lifecycle_event').eq('entity_id',r.data).eq('destination',channel).eq('event_type','EDITORIAL').maybeSingle();
 if(work.error)return {kind:'retry' as const,reason:'CHANNEL_CONTENT_RECEIPT_UNAVAILABLE',retryAfterMs:120000};
 if(work.data?.status==='suppressed')return {kind:'permanent' as const,reason:'CHANNEL_CONTENT_SUPPRESSED'};
 if(work.data?.status!=='sent')return {kind:'retry' as const,reason:'CHANNEL_CONTENT_SCHEDULED',retryAfterMs:120000};
 const receipt=await db.from('canonical_telegram_delivery_parts').select('telegram_message_id').eq('publication_work_id',work.data.id).eq('state','DELIVERED').order('message_part').limit(1).maybeSingle();
 if(receipt.error||!receipt.data?.telegram_message_id)return {kind:'retry' as const,reason:'CHANNEL_CONTENT_RECEIPT_UNAVAILABLE',retryAfterMs:120000};
 return {kind:'accepted' as const,messageId:String(receipt.data.telegram_message_id)};
}
