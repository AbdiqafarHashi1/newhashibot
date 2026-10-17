import {test} from 'node:test';import assert from 'node:assert/strict';
import {commerceEnvironment,redactCommerceSettings} from '../../supabase/functions/_shared/commerce-provider-settings';
test('saved provider settings override legacy values, redact secret values, and cannot shadow unrelated service configuration',async()=>{
 const data={WHOP_API_KEY:'saved-secret',WHOP_COMPANY_ID:'biz_fixture',WHOP_ENVIRONMENT:'sandbox',SUPABASE_SERVICE_ROLE_KEY:'forbidden'};
 const get=await commerceEnvironment({rpc:async(_name:string,args:any)=>({data:args.p_provider==='WHOP'?data:null})},key=>key==='WHOP_API_KEY'?'legacy-secret':key==='SUPABASE_SERVICE_ROLE_KEY'?'real-service-secret':undefined);
 assert.equal(get('WHOP_API_KEY'),'saved-secret');assert.equal(get('SUPABASE_SERVICE_ROLE_KEY'),'real-service-secret');
 const safe=redactCommerceSettings('WHOP',data);assert.deepEqual(safe.WHOP_API_KEY,{present:true});assert.deepEqual(safe.WHOP_COMPANY_ID,{value:'biz_fixture'});assert.ok(!JSON.stringify(safe).includes('saved-secret'));assert.ok(!JSON.stringify(safe).includes('forbidden'));
 await assert.rejects(commerceEnvironment({rpc:async()=>({error:{message:'fixture'}})},()=>undefined),/CONFIGURATION_UNAVAILABLE/);
});
