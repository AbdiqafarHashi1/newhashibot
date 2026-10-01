import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { readAttribution, type CommerceProduct } from '../../lib/commerce';
import { authResumePath, getOrCreatePurchaseAttemptKey, purchaseAttemptScope, savePurchaseIntent, updatePurchaseAttempt } from '../../lib/purchaseIntent';

const productMap:Record<CommerceProduct,string>={HASHIBOT_VIP_SIGNALS:'VIP_SIGNALS',PERSONAL_AUTO:'FOUNDING_AUTO_EXECUTION',FOREX_PROP:'FOUNDING_AUTO_EXECUTION',CRYPTO_PROP:'FOUNDING_AUTO_EXECUTION'};
const customerMessage:Record<string,string>={CHECKOUT_NOT_CONFIGURED:'International checkout cannot currently be started. Please try again later.',READY_FOR_CONFIGURATION:'International checkout cannot currently be started. Please try again later.',CREATED:'Checkout created. Preparing the secure payment page…',PROVIDER_PENDING:'Opening the secure payment page…'};

export function WhopCheckout({product,compact=false,executionAccountId}:{product:CommerceProduct;compact?:boolean;executionAccountId?:string}) {
  const [state,setState]=useState(''); const [busy,setBusy]=useState(false); const submitting=useRef(false); const {session}=useAuth(); const navigate=useNavigate(); const [params]=useSearchParams();
  const begin=async()=>{
    if(submitting.current)return;
    const productCode=productMap[product] as 'VIP_SIGNALS'|'FOUNDING_AUTO_EXECUTION';
    const attribution=readAttribution(params);
    savePurchaseIntent({product:productCode,provider:'WHOP',executionAccountId,attribution:{...attribution}});
    if(!session){navigate(authResumePath());return;}
    if(productCode==='FOUNDING_AUTO_EXECUTION'&&!executionAccountId){setState('Create and select an execution account before purchasing this per-account entitlement.');return;}
    submitting.current=true;setBusy(true);setState('Creating your secure checkout…');
    const scope=purchaseAttemptScope(session.user.id,`whop.${productCode}.${executionAccountId??'signals'}`);
    let data:any,error:any;
    try { ({data,error}=await supabase.functions.invoke('commerce-checkout',{body:{product_code:productCode,provider:'WHOP',currency:'USD',execution_account_id:executionAccountId,return_url:`${location.origin}/payment/result`,...attribution},headers:{'x-idempotency-key':getOrCreatePurchaseAttemptKey(scope)}}));
      updatePurchaseAttempt(scope,error?'UNCERTAIN':data?.state==='PROVIDER_PENDING'?'PENDING':data?.state==='FAILED'?'FAILED':'READY',data?.checkout_id);
    } finally { submitting.current=false;setBusy(false); }
    if(error){setState('International checkout cannot currently be started. No payment or access was created.');return;}
    setState(customerMessage[String(data?.state)]??'We could not start checkout. No access was granted.');
    if(data?.action_url&&data.state==='PROVIDER_PENDING')location.assign(data.action_url);
  };
  const button=<button disabled={busy} onClick={begin} className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{busy?'Starting…':'Continue to secure checkout'}</button>;
  if(compact)return <div>{button}{state&&<p role="status" className="mt-2 text-xs text-amber-300">{state}</p>}</div>;
  return <div className="rounded-2xl border border-blue-500/30 bg-zinc-950 p-7 text-center"><ShieldCheck className="mx-auto text-blue-400"/><h3 className="mt-3 font-bold text-white">Card / International</h3><p className="my-4 text-xs text-zinc-400">Your account, product and price are checked by HashiBot. Returning from a payment page does not by itself activate access.</p>{button}{state&&<p role="status" className="mt-3 text-xs text-amber-300">{state}</p>}</div>;
}
