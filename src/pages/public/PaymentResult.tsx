import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { CommerceLayout } from '../../components/layout/CommerceLayout';
export default function PaymentResult() {
  const [params] = useSearchParams(); const [state, setState] = useState('PENDING VERIFICATION');
  useEffect(() => { const id=params.get('checkout'); if(!id)return; supabase.from('commerce_checkout_sessions').select('status').eq('id',id).maybeSingle().then((result: {data:{status?:string}|null}) => { const status=result.data?.status; setState(status==='COMPLETED'?'SUCCESSFUL AND VERIFIED':status==='REVIEW_REQUIRED'?'MANUAL REVIEW REQUIRED':status??'PENDING VERIFICATION'); }); }, [params]);
  return <CommerceLayout><main className="mx-auto max-w-xl px-5 py-20 text-center text-white"><p className="text-xs font-bold text-blue-400">BACKEND PAYMENT TRUTH</p><h1 className="mt-3 text-3xl font-black">{state}</h1><p className="mt-4 text-zinc-400">Redirect parameters are not payment evidence. This page changes only when the authenticated backend confirms canonical payment state.</p></main></CommerceLayout>;
}
