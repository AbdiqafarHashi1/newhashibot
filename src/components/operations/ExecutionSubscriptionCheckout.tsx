import {useEffect,useState} from 'react';
import {supabase} from '../../lib/supabase';
import {WhopCheckout} from '../commerce/WhopCheckout';
import {MpesaCheckout} from '../commerce/MpesaCheckout';
type Price={provider:string;currency:string;amount_minor:number;configured:boolean};
/** The account UUID is always carried through checkout; credentials and account capital are never payment inputs. */
export function ExecutionSubscriptionCheckout({accountId}:{accountId:string}){
 const [prices,setPrices]=useState<Price[]>([]),[failed,setFailed]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setLoading(true);void supabase.from('commerce_product_prices').select('provider,currency,amount_minor,configured').eq('product_code','FOUNDING_AUTO_EXECUTION').eq('active',true).eq('configured',true).order('version',{ascending:false}).then(({data,error})=>{if(!active)return;setFailed(Boolean(error));setPrices(error?[]:(data??[]) as Price[]);setLoading(false)});return()=>{active=false}},[accountId]);
 const card=prices.find(p=>p.provider==='WHOP'&&p.currency==='USD'),mpesa=prices.find(p=>p.provider==='MPESA'&&p.currency==='KES'&&Number(p.amount_minor)>0);
 return <details className="mt-4 rounded border border-zinc-800 p-4"><summary className="cursor-pointer font-semibold">Execution subscription &amp; renewal</summary><p className="my-3 text-xs text-zinc-400">Purchase or renew 30-day access for this account. Payment does not start trading. New entries require verified readiness and your Start action; monitoring and protection continue when access expires.</p>{loading?<p className="text-sm">Loading payment options…</p>:failed?<p className="text-sm text-amber-300">Payment options could not be loaded. Refresh before paying.</p>:!card&&!mpesa?<p className="text-sm text-zinc-400">Execution payments are not currently available. You can finish connecting your account first.</p>:<div className="grid gap-4 xl:grid-cols-2">{card&&<div><p className="mb-2 text-sm">USD {(Number(card.amount_minor)/100).toLocaleString('en-KE')} · 30 days / account</p><WhopCheckout product="PERSONAL_AUTO" executionAccountId={accountId}/></div>}{mpesa&&<MpesaCheckout productCode="FOUNDING_AUTO_EXECUTION" executionAccountId={accountId} termDays={30} amountMinor={Number(mpesa.amount_minor)}/>}</div>}</details>;
}
