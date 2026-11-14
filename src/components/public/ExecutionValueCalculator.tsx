import {useState} from 'react';
/** Fee arithmetic only; no trading return forecast or automatic pricing change. */
export function ExecutionValueCalculator(){
 const[capital,setCapital]=useState(5000),[share,setShare]=useState(100);
 const fee=100,drag=capital>0?fee/capital*100:null;
 return <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-label="Account subscription economics">
  <div className="rounded-2xl border border-zinc-700 bg-zinc-900/40 p-6"><h2 className="text-2xl font-black">Choose the service that fits your account</h2>
   <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">Auto Execution includes account setup, risk sizing, order protection, trade management and reports. Compare the advertised $100 monthly account fee with your capital before choosing it.</p>
   <div className="mt-5 grid gap-4 sm:grid-cols-3"><label className="text-sm">Trading capital · USD<input aria-label="Trading capital in USD" type="number" min="1" step="100" value={capital} onChange={e=>setCapital(Number(e.target.value))} className="mt-2 block w-full rounded-lg border border-zinc-700 bg-black p-3"/></label>
    <label className="text-sm">Your share of trading profit<select aria-label="Customer profit share" value={share} onChange={e=>setShare(Number(e.target.value))} className="mt-2 block w-full rounded-lg border border-zinc-700 bg-black p-3"><option value="100">100% · personal account</option><option value="80">80% · example Prop split</option><option value="90">90% · example Prop split</option></select></label>
    <div className="rounded-xl bg-black/40 p-4"><p className="text-xs text-zinc-400">Trading profit needed to cover software fee</p><p className="mt-2 text-2xl font-bold">{drag!==null&&Number.isFinite(drag)?`${(drag/(share/100)).toFixed(2)}%`:'Enter capital'}</p><p className="mt-2 text-xs leading-5 text-zinc-400">Per month, after trading costs and before any other account or firm fees. Your actual Prop agreement determines the split.</p></div>
   </div>
   <p className="mt-4 text-sm leading-6 text-zinc-400">This is fee arithmetic, not an expected return. For smaller capital, <a className="text-cyan-300 underline" href="/ai-signals">Signal Room</a> lets you use the analysis and manage your own trades. Demo accounts let you evaluate the execution workflow before committing live capital.</p>
  </div>
 </section>;
}
