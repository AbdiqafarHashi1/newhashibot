import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, Clock3, RefreshCw, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CommerceLayout } from '../../components/layout/CommerceLayout';

type View = { title:string; body:string; tone:'waiting'|'warning'|'success'; entitlementActive:boolean };
const initial:View={title:'Checking payment progress…',body:'We are reading your account’s verified payment and access records.',tone:'waiting',entitlementActive:false};

export default function PaymentResult() {
  const [params] = useSearchParams(); const [view,setView]=useState(initial); const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    const id=params.get('checkout'); if(!id){setView({title:'Checkout not found',body:'Return to the offer page and start checkout again.',tone:'warning',entitlementActive:false});return;}
    setBusy(true);
    const {data:checkout}=await supabase.from('commerce_checkout_sessions').select('id,status,product_code,customer_id').eq('id',id).maybeSingle();
    if(!checkout){setView({title:'Checkout not available',body:'This checkout does not belong to the signed-in account, or it no longer exists.',tone:'warning',entitlementActive:false});setBusy(false);return;}
    const [{data:payments},{data:entitlements}]=await Promise.all([
      supabase.from('commerce_payment_attempts').select('state,reason_code').eq('checkout_session_id',id).order('requested_at',{ascending:false}).limit(1),
      supabase.from('phase_h_entitlements').select('state').eq('customer_id',checkout.customer_id).eq('product_code',checkout.product_code).in('state',['ACTIVE','GRACE']).limit(1),
    ]);
    const payment=payments?.[0]?.state; const active=Boolean(entitlements?.length);
    let next:View;
    if(active) next={title:'Access is active',body:'Your payment and matching entitlement are verified. You can now connect Telegram; admission is confirmed separately after Telegram completes membership.',tone:'success',entitlementActive:true};
    else if(payment==='SUCCEEDED'||checkout.status==='COMPLETED') next={title:'Payment verified',body:'Payment is verified. We are still preparing the matching access entitlement; Telegram access is not active yet.',tone:'waiting',entitlementActive:false};
    else if(payment==='FAILED'||payment==='CANCELLED') next={title:'Payment was declined or cancelled',body:'No access was granted. You can return to the offer page and try again.',tone:'warning',entitlementActive:false};
    else if(payment==='EXPIRED'||checkout.status==='EXPIRED') next={title:'Payment request timed out',body:'No access was granted. A later provider confirmation will be reconciled safely; do not pay twice unless instructed.',tone:'warning',entitlementActive:false};
    else if(payment==='REVIEW_REQUIRED'||checkout.status==='REVIEW_REQUIRED') next={title:'Payment needs review',body:'We received evidence that could not be matched safely. Access remains locked while support reviews it.',tone:'warning',entitlementActive:false};
    else if(checkout.status==='ACTION_REQUIRED') next={title:'Check your phone',body:'An M-Pesa prompt was sent. Enter your PIN only in the prompt on your phone. We are awaiting provider confirmation.',tone:'waiting',entitlementActive:false};
    else if(checkout.status==='PROVIDER_PENDING'||payment==='PENDING') next={title:'Awaiting payment confirmation',body:'The payment provider has not yet confirmed the payment. This page will not activate access from a redirect alone.',tone:'waiting',entitlementActive:false};
    else next={title:'Checkout created',body:'Your checkout exists, but a payment prompt or secure payment page has not yet been confirmed.',tone:'waiting',entitlementActive:false};
    setView(next);setBusy(false);
  },[params]);
  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),8000);return()=>window.clearInterval(timer)},[load]);
  const Icon=view.tone==='success'?CheckCircle:view.tone==='warning'?ShieldAlert:Clock3;
  return <CommerceLayout><main className="mx-auto max-w-xl px-5 py-20 text-center text-white"><Icon className={`mx-auto ${view.tone==='success'?'text-emerald-400':view.tone==='warning'?'text-amber-400':'text-blue-400'}`} size={34}/><h1 className="mt-4 text-3xl font-black">{view.title}</h1><p className="mt-4 leading-7 text-zinc-400">{view.body}</p><button disabled={busy} onClick={()=>void load()} className="mx-auto mt-6 flex items-center gap-2 rounded-xl border border-zinc-700 px-5 py-3 text-sm font-bold"><RefreshCw size={15} className={busy?'animate-spin':''}/>Refresh status</button>{view.entitlementActive&&<Link to="/app/telegram" className="mt-4 inline-flex rounded-xl bg-blue-600 px-6 py-3 font-bold">Connect Telegram</Link>}<p className="mt-6 text-xs text-zinc-600">Linking your Telegram account, receiving an invite, needing an action, and confirmed channel membership are separate steps.</p></main></CommerceLayout>;
}
