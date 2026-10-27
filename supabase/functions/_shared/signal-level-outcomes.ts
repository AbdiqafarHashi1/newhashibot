/** Gross reference-level R only. Never claims a fill, costs, or net account P&L. */
export function signalReferenceR(levels:{entry:number|null;stop:number|null;tp1:number|null;tp2:number|null;direction:string},status:string):number|null {
 const {entry,stop,direction}=levels;if(entry===null||stop===null||!Number.isFinite(entry)||!Number.isFinite(stop)||entry<=0||stop<=0||!['buy','sell'].includes(direction))return null;
 const sign=direction==='buy'?1:-1,risk=(entry-stop)*sign;if(!(risk>0))return null;
 if(status==='sl_hit')return -1;
 const target=status==='tp1_hit'?levels.tp1:status==='tp2_hit'?levels.tp2:null;
 if(target===null||!Number.isFinite(target)||(target-entry)*sign<=0)return null;
 return (target-entry)*sign/risk;
}
