/** userDb must carry the authenticated customer's JWT; service identity cannot mint their token. */
export async function customerTelegramLink(userDb:any,botToken:string,relink=false,fetcher:typeof fetch=fetch){
 if(!botToken)throw Error('Telegram connection is temporarily unavailable. Please contact support.');
 const response=await fetcher(`https://api.telegram.org/bot${botToken}/getMe`,{signal:AbortSignal.timeout(8000)});
 const body=await response.json().catch(()=>null),name=body?.result?.username;
 if(!response.ok||!body?.ok||typeof name!=='string'||!/^[A-Za-z0-9_]{5,32}$/.test(name))throw Error('Telegram connection could not be confirmed. Please try again.');
 const {data,error}=await userDb.rpc('create_telegram_link_token',{p_relink:relink});
 if(error)throw Error('Your personal Telegram link could not be created. Please refresh and try again.');
 if(data?.state==='LINKED')return {state:'LINKED'};
 if(!/^[a-f0-9]{48}$/i.test(data?.token??''))throw Error('Your personal Telegram link could not be confirmed.');
 return {state:'ONBOARDING_REQUIRED',url:`https://t.me/${name}?start=${data.token}`,expiresAt:data.expires_at};
}
