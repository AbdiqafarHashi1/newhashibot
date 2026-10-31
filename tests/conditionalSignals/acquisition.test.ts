import {test} from 'node:test';import assert from 'node:assert/strict';
import {verifyAcquisitionDestination,acquisitionLink} from '../../supabase/functions/_shared/acquisition-destinations.ts';
import {release1SaleDecision} from '../../supabase/functions/_shared/release1-sales-policy.ts';
import {generateDraft} from '../../supabase/functions/_shared/phase-o-agents.ts';
test('partner channel permissions are checked without sending; stable chat identity and tracked links',async()=>{
 const calls:string[]=[];const fetcher=(async(url:any)=>{const method=String(url).split('/').at(-1)!;calls.push(method);const result=method==='getMe'?{id:7}:method==='getChat'?{id:-1001,type:'channel',title:'Partner'}:{status:'administrator',can_post_messages:true};return new Response(JSON.stringify({ok:true,result}));}) as typeof fetch;
 const d=await verifyAcquisitionDestination('test-token','@partner',fetcher);assert.equal(d.chatId,'-1001');assert.deepEqual(calls,['getMe','getChat','getChatMember']);
 const denied=(async()=>new Response(JSON.stringify({ok:true,result:{id:7,type:'private',status:'left'}}))) as typeof fetch;await assert.rejects(verifyAcquisitionDestination('test','@partner',denied),/GROUP_OR_CHANNEL/);
 const url=new URL(acquisitionLink({id:'campaign',source_code:'partner',canonical_url:'https://hashibot.app/free'}));assert.equal(url.searchParams.get('utm_source'),'partner');assert.equal(url.searchParams.get('utm_campaign'),'campaign');
});
test('analysis subscription readiness stays separate from strategy certification and execution',()=>{
 const input={product:'VIP_SIGNALS',provider:'WHOP',currency:'USD',amountMinor:2900,salesEnabled:true,promotedStrategies:0};
 assert.equal(release1SaleDecision(input),'STRATEGY_CERTIFICATION_REQUIRED');assert.equal(release1SaleDecision({...input,analysisServiceReady:true}),null);
 assert.equal(release1SaleDecision({...input,analysisServiceReady:true,salesEnabled:false}),'RELEASE1_SALES_PAUSED');
 assert.equal(release1SaleDecision({...input,analysisServiceReady:true,product:'FOUNDING_AUTO_EXECUTION'}),'RELEASE2_NOT_AVAILABLE');
});
test('provider failures never become subscriber diagnostic drafts',async()=>{
 const job:any={task:'MARKET_CONTEXT',language:'en',evidenceIds:[]};const store:any={loadEvidence:async()=>[],loadBudget:async()=>({remainingUnits:100}),saveDraft:async()=>{throw Error('must not persist diagnostic copy');}};
 await assert.rejects(generateDraft({job,store}),/EDITORIAL_EVIDENCE_DRAFT_UNAVAILABLE/);
});
