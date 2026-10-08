import assert from 'node:assert/strict';
const url=process.env.TEST_SUPABASE_URL,key=process.env.TEST_SUPABASE_SERVICE_ROLE_KEY,draft=process.env.TEST_PHASE_O_DRAFT_ID;
if(!url||!key||!draft)throw Error('Set TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_ROLE_KEY and TEST_PHASE_O_DRAFT_ID for a disposable migrated database');
const rpc=(name,body)=>fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json()}));
const identity=`phase-o-db-harness:${crypto.randomUUID()}:p0`,input={p_draft_id:draft,p_part:0,p_identity:identity,p_lease_seconds:30};const [a,b]=await Promise.all([rpc('reserve_phase_o_delivery_part',input),rpc('reserve_phase_o_delivery_part',input)]);assert.equal([a.status,b.status].filter(x=>x<300).length,2);const states=[a.body.state,b.body.state];assert.equal(states.filter(x=>x==='SEND').length,1);assert.ok(states.some(x=>x==='BLOCKED'||x==='UNCERTAIN'));
console.log('Disposable database concurrent reservation fencing passed');
