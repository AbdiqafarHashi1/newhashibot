/** Resolve a configured partner destination using read-only Bot API calls. Never sends a test post. */
export async function verifyAcquisitionDestination(token:string,identity:string,fetcher:typeof fetch=fetch){
 if(!token||!/^(-[0-9]+|@[A-Za-z0-9_]{5,32})$/.test(identity))throw Error('TELEGRAM_DESTINATION_REQUIRED');
 const call=async(method:string,body:Record<string,unknown>)=>{
  const response=await fetcher(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
  const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw Error('TELEGRAM_PERMISSION_CHECK_FAILED');return data.result;
 };
 const me=await call('getMe',{}),chat=await call('getChat',{chat_id:identity});
 if(!['group','supergroup','channel'].includes(chat.type))throw Error('GROUP_OR_CHANNEL_REQUIRED');
 const member=await call('getChatMember',{chat_id:chat.id,user_id:me.id});
 const admin=['creator','administrator'].includes(member.status);
 const canPost=chat.type==='channel'?(member.status==='creator'||member.status==='administrator'&&member.can_post_messages===true):
  admin||(member.status==='member'&&chat.permissions?.can_send_messages!==false)||(member.status==='restricted'&&member.is_member===true&&member.can_send_messages===true);
 if(!canPost)throw Error('BOT_POSTING_PERMISSION_REQUIRED');
 return{chatId:String(chat.id),title:String(chat.title??identity),verifiedAt:new Date().toISOString()};
}

export function acquisitionLink(campaign:{id:string;source_code:string;canonical_url:string}){
 const url=new URL(campaign.canonical_url);if(!['hashibot.app','www.hashibot.app','hashibot.vip','www.hashibot.vip'].includes(url.hostname))throw Error('CANONICAL_URL_NOT_ALLOWED');
 url.searchParams.set('utm_campaign',campaign.id);url.searchParams.set('utm_source',campaign.source_code);return url.toString();
}
