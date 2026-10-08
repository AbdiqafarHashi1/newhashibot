import assert from'node:assert/strict';import{actionStillValid,desiredMembership}from'../../supabase/functions/_shared/telegram-membership.ts';import{audiencesForEntitlement}from'../../supabase/functions/_shared/phase-o-agents.ts';
type Row={audience:string;state:string};const memberships=new Map<string,Row>();
function apply(entitlement:string,action:'ADD'|'RESTORE'|'SUSPEND'|'REMOVE',failed?:string){for(const audience of audiencesForEntitlement('VIP_SIGNALS',entitlement)){if(audience===failed)continue;assert.equal(actionStillValid(action,entitlement as any),true);memberships.set(audience,{audience,state:action==='REMOVE'?'REMOVED':action==='SUSPEND'?'SUSPENDED':'ACTIVE'})}}
apply('ACTIVE','ADD','VIP_CRYPTO');assert.equal(memberships.get('VIP_FOREX_GOLD')?.state,'ACTIVE');assert.equal(memberships.has('VIP_CRYPTO'),false);
apply('ACTIVE','RESTORE');assert.equal(memberships.get('VIP_CRYPTO')?.state,'ACTIVE');assert.equal(memberships.size,2);
for(const audience of ['VIP_FOREX_GOLD','VIP_CRYPTO'])memberships.set(audience,{audience,state:desiredMembership('EXPIRED' as any)});assert.deepEqual([...memberships.values()].map(x=>x.state),['REMOVED','REMOVED']);
apply('GRACE','RESTORE');assert.deepEqual([...memberships.values()].map(x=>x.state),['ACTIVE','ACTIVE']);assert.equal(new Set([...memberships.keys()]).size,2);
console.log('Phase O two-audience Phase J lifecycle simulation passed');
