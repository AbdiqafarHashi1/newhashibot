/** A fresh venue quote can veto a stored market entry; it never increases quantity or risk. */
export function admitExecutionQuote(x:{side:string;bid:number;ask:number;stop:number;tp1:number;quantity:number;contractMultiplier:number;quoteConversion:number;maximumRiskAmount:number}){
 if(![x.bid,x.ask,x.stop,x.tp1,x.quantity,x.contractMultiplier,x.quoteConversion,x.maximumRiskAmount].every(v=>Number.isFinite(v)&&v>0)||x.bid>x.ask||!['BUY','SELL'].includes(x.side))throw Error('COMPLETE_NATIVE_ENTRY_QUOTE_REQUIRED');
 const entry=x.side==='BUY'?x.ask:x.bid;
 if(x.side==='BUY'?!(x.stop<entry&&entry<x.tp1):!(x.stop>entry&&entry>x.tp1))throw Error('NATIVE_ENTRY_GEOMETRY_CHANGED');
 const risk=Math.abs(entry-x.stop)*x.quantity*x.contractMultiplier*x.quoteConversion;
 if(risk>x.maximumRiskAmount+1e-8)throw Error('NATIVE_ENTRY_EXCEEDS_APPROVED_RISK');
 return {entry,expectedRiskAmount:risk};
}
