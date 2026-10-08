import {test} from 'node:test';
import assert from 'node:assert/strict';
import {approvalBinding,deliverApproved,sha256,type AgentStore,type Draft} from '../../supabase/functions/_shared/phase-o-agents.ts';
test('retained Phase-O approval binding and uncertainty cannot be bypassed by portable work',async()=>{
  const draft:Draft={id:'draft',jobId:'retained-agent',version:1,content:'Evidence-grounded draft',contentHash:await sha256('Evidence-grounded draft'),destinationId:'private'};
  let approval:any=null,sends=0,reservation:'SEND'|'UNCERTAIN'='SEND';
  const store:AgentStore={
    async loadEvidence(){return[];},async loadBudget(){return {remainingUnits:0};},async saveDraft(){throw Error('NOT_GENERATING');},
    async loadDraft(){return draft;},async loadApproval(){return approval;},
    async reserveDelivery(){return {state:reservation,reservationId:'reservation',token:'token'};},async finishDelivery(){}
  };
  const transport={async send(){sends++;throw Error('NO_REAL_DELIVERY');}};
  await assert.rejects(()=>deliverApproved({draftId:draft.id,store,transport}),/APPROVAL/);
  approval={draftId:draft.id,version:1,bindingHash:await approvalBinding(draft),approvedAt:new Date().toISOString()};
  draft.version=2;await assert.rejects(()=>deliverApproved({draftId:draft.id,store,transport}),/APPROVAL/);
  draft.version=1;reservation='UNCERTAIN';await assert.rejects(()=>deliverApproved({draftId:draft.id,store,transport}),/RECONCILIATION_REQUIRED/);
  assert.equal(sends,0);
});
