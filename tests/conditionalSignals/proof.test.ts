import {test} from 'node:test';import assert from 'node:assert/strict';
import {loadConditionalProof,conditionalPeriod,renderConditionalProof} from '../../supabase/functions/_shared/conditional-proof.ts';
test('agent reads the complete server cohort and renders losses, no-entry and unknown outcomes',async()=>{
 const now=Date.parse('2026-10-29T12:00:00Z'),id='2026-10-28T00:00:00.000Z/2026-10-29T00:00:00.000Z';
 const data=[{id:'win',status:'CLOSED',netR:1},{id:'loss',status:'CLOSED',netR:-1},{id:'be',status:'CLOSED',netR:0},{id:'pending',status:'WAITING'},{id:'unknown',status:'DATA_GAP'},{id:'expired',status:'EXPIRED'}].map(state=>({state}));
 const query:any={select:()=>query,gte:()=>query,lt:()=>query,order:()=>query,limit:async()=>({data})};
 const db={from:(table:string)=>{assert.equal(table,'conditional_signal_setups');return query;}};
 const fact=await loadConditionalProof(db,id,now);assert.equal(fact.classification,'PAPER');assert.equal(fact.facts.total,6);assert.equal(fact.facts.unresolved,2);assert.equal(fact.facts.notEntered,1);assert.equal(fact.facts.netR,0);
 const svg=renderConditionalProof(fact);assert.match(svg,/losses 1/);assert.match(svg,/no entry 1/);assert.match(svg,/not portfolio return/);
 assert.throws(()=>renderConditionalProof({...fact,facts:{...fact.facts,total:5}}),/DENOMINATOR/);
 assert.throws(()=>conditionalPeriod('2026-10-29/2026-11-01',now),/INVALID/);
 assert.throws(()=>conditionalPeriod('2026-01-01/2026-10-01',now),/INVALID/);
});

test('approved artifact is a separate durable part and uncertain upload never blindly resends',async()=>{
 const {approvalBinding,deliverApproved}=await import('../../supabase/functions/_shared/phase-o-agents.ts');
 const draft={id:'d',jobId:'j',version:1,content:'Complete paper cohort',contentHash:'hash',artifactId:'artifact',destinationId:'crypto'};
 const states=new Map<string,string>(),sent:any[]=[];
 const store:any={loadDraft:async()=>draft,loadApproval:async()=>({draftId:'d',version:1,bindingHash:await approvalBinding(draft),approvedAt:new Date().toISOString()}),
 reserveDelivery:async(_:any,part:number,identity:string)=>({state:states.get(identity)??'SEND',reservationId:identity,token:'lease'}),
 finishDelivery:async(id:string,_token:string,state:string)=>{states.set(id,state);}};
 const transport={send:async(x:any)=>{sent.push(x);return x.artifactId?{kind:'uncertain' as const,reason:'injected timeout'}:{kind:'accepted' as const,messageId:'text-only-test'};}};
 const r=await deliverApproved({draftId:'d',store,transport});assert.equal(r.state,'UNCERTAIN');assert.equal(sent.length,2);assert.equal(sent[0].artifactId,undefined);assert.equal(sent[1].artifactId,'artifact');
 await assert.rejects(deliverApproved({draftId:'d',store,transport}),/RECONCILIATION/);assert.equal(sent.length,2);
});
