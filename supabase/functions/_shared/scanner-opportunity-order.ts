import type {ScannerSelection,ReplayEvent} from './phase-m-validation.ts';
import type {ArbitrationCandidate} from './arbitrator.ts';
export const opportunityIdentity=(e:ReplayEvent)=>`${e.symbol}:${e.timeframe}:${e.closedAt}`;
/** Cross-symbol admission order only. Existing strategy scores are retained, never probabilities.
 * Relative-return and quote-volume ties use facts from the current closed prefix, not outcomes. */
export function rankScannerOpportunities(rows:readonly {event:ReplayEvent;selection:ScannerSelection}[],directional=false){
 const winner=(r:typeof rows[number])=>r.selection.decision==='SIGNAL'?(r.selection.cycle?.arbitration as {winner?:ArbitrationCandidate})?.winner:undefined;
 const value=(c:ArbitrationCandidate|undefined,key:string)=>typeof c?.evidence[key]==='number'&&Number.isFinite(c.evidence[key])?Number(c.evidence[key])*(directional&&key==='relative_return'&&c.side==='sell'?-1:1):0;
 return [...rows].sort((a,b)=>{const x=winner(a),y=winner(b);return Number(Boolean(y))-Number(Boolean(x))||(y?.score??0)-(x?.score??0)||value(y,'relative_return')-value(x,'relative_return')||value(y,'quote_volume_ratio')-value(x,'quote_volume_ratio')||opportunityIdentity(a.event).localeCompare(opportunityIdentity(b.event));});
}
