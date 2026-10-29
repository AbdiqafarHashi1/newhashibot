import {sha256,type EvidenceFact} from './phase-o-agents.ts';
export function conditionalPeriod(id:string,now=Date.now()){
 const parts=id.split('/');if(parts.length!==2)throw Error('CONDITIONAL_PERIOD_INVALID');
 const start=Date.parse(parts[0]),end=Date.parse(parts[1]);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>now||end-start>31*86400000)throw Error('CONDITIONAL_PERIOD_INVALID');
 return{start:new Date(start).toISOString(),end:new Date(end).toISOString()};
}
/** Complete creation cohort, current outcomes as of observation. Not portfolio return or entry-period performance. */
export async function loadConditionalProof(db:any,id:string,now=Date.now()):Promise<EvidenceFact>{
 const period=conditionalPeriod(id,now),response=await db.rpc('conditional_proof_cohort',{p_start:period.start,p_end:period.end});
 const data=response.data?.rows;
 if(response.error||!Array.isArray(data)||!data.length||data.length>10000||response.data.total!==data.length||!Number.isFinite(Date.parse(response.data.observed_at)))throw Error('CONDITIONAL_COMPLETE_COHORT_UNAVAILABLE');
 now=Date.parse(response.data.observed_at);
 const states=data.map((r:any)=>r.state),closed=states.filter((s:any)=>s.status==='CLOSED'&&typeof s.netR==='number'&&Number.isFinite(s.netR));
 const wins=closed.filter((s:any)=>s.netR>0).length,losses=closed.filter((s:any)=>s.netR<0).length,breakEven=closed.filter((s:any)=>s.netR===0).length;
 const notEntered=states.filter((s:any)=>['EXPIRED','INVALIDATED'].includes(s.status)&&!s.fill).length;
 const unresolved=states.length-closed.length-notEntered;
 return{id,kind:'CONDITIONAL_PERIOD',observedAt:new Date(now).toISOString(),classification:'PAPER',facts:{
 period:`Created ${period.start} to ${period.end} (exclusive); outcomes observed ${new Date(now).toISOString()}`,
 total:states.length,wins,losses,breakEven,notEntered,unresolved,netR:closed.reduce((n:number,s:any)=>n+s.netR,0),
 tracks:Object.fromEntries(['INTRADAY','SWING'].map(track=>{const group=states.filter((s:any)=>s.track===track),done=closed.filter((s:any)=>s.track===track);return[track,{total:group.length,closed:done.length,unknown:group.filter((s:any)=>s.status==='DATA_GAP').length,wins:done.filter((s:any)=>s.netR>0).length,losses:done.filter((s:any)=>s.netR<0).length,netR:done.reduce((n:number,s:any)=>n+s.netR,0)}];})),cohort_hash:await sha256(JSON.stringify(data)),source_count:states.length,source_ids_sample:states.slice(0,20).map((s:any)=>s.id),scope:'Complete setup creation cohort; R sum is not an account return. Includes losses, pending and no-entry setups.',
 accounting:'50% TP1 / 50% TP2; original stop; 25bps modeled round-trip reserve; stop first on ambiguous candles. No provider fills.'}};
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function renderConditionalProof(f:EvidenceFact){
 if(f.kind!=='CONDITIONAL_PERIOD'||f.classification!=='PAPER')throw Error('PAPER_COHORT_REQUIRED');
 const p=f.facts;if(Number(p.total)!==Number(p.wins)+Number(p.losses)+Number(p.breakEven)+Number(p.notEntered)+Number(p.unresolved))throw Error('COHORT_DENOMINATOR_MISMATCH');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#09090b"/><g fill="white" font-family="sans-serif"><text x="50" y="70" font-size="32">HASHIBOT · PAPER SETUP COHORT</text><text x="50" y="140" font-size="26">All ${p.total} setups · wins ${p.wins} · losses ${p.losses} · break-even ${p.breakEven}</text><text x="50" y="205" font-size="26">Unresolved ${p.unresolved} · no entry ${p.notEntered}</text><text x="50" y="270" font-size="26">Closed net R sum ${Number(p.netR).toFixed(3)} · not portfolio return</text><text x="50" y="350" font-size="16">${escape(String(p.period).slice(0,145))}</text><text x="50" y="415" font-size="18">25bps modeled costs · original stop · stop-first ambiguity</text><text x="50" y="470" font-size="18">Generated chart of recorded paper evidence; no real trading fills.</text><text x="50" y="535" font-size="15">Cohort ${escape(f.id)}</text><text x="50" y="575" font-size="13">Snapshot ${escape(String(p.cohort_hash??"test"))}</text></g></svg>`;
}
