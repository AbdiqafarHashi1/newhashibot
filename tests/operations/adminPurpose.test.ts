import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {adminPrimaryPages,adminAdvancedPages} from '../../src/lib/adminNavigation';
import {customerTelegramLink} from '../../supabase/functions/_shared/customer-telegram-link.ts';
test('Release 1 navigation has nine unique, implemented owners including strategy research; advanced execution is separate',()=>{
 const app=readFileSync('src/App.tsx','utf8');assert.equal(adminPrimaryPages.length,9);
 assert(adminPrimaryPages.some(p=>p.to==='/admin/research'));
 assert.match(app.split('path="/admin/research"')[1].split('\n')[0],/RequireAdmin/);
 const all=[...adminPrimaryPages,...adminAdvancedPages];assert.equal(new Set(all.map(p=>p.to)).size,all.length);
 for(const p of all){assert(app.includes(`path="${p.to}"`),p.to);assert(p.purpose.length>20);}
 assert(!adminPrimaryPages.some(p=>/execution|fleet|readiness|operator/.test(p.to)));
 for(const old of ['/admin/onboarding','/admin/users','/admin/access-requests'])assert.match(app.split(`path="${old}"`)[1].split('\n')[0],/Navigate to="\/admin\/customers"/);
 for(const route of [...app.matchAll(/<Route path="([^"]+)"/g)].map(m=>m[1]))assert.equal((app.match(new RegExp(`path="${route.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"`,'g'))??[]).length,1,route);
});
test('customer bot link uses configured server identity and the user-scoped canonical token RPC',async()=>{
 const calls:any[]=[];const scoped={rpc:async(name:string,args:any)=>{calls.push({name,args});return {data:{state:'CREATED',token:'a'.repeat(48),expires_at:'2026-11-01T00:00:00Z'}};}};
 const result=await customerTelegramLink(scoped,'test-bot-token',false,(async()=>Response.json({ok:true,result:{username:'HashiBot_test'}})) as typeof fetch);
 assert.equal(result.url,`https://t.me/HashiBot_test?start=${'a'.repeat(48)}`);assert.deepEqual(calls,[{name:'create_telegram_link_token',args:{p_relink:false}}]);assert(!JSON.stringify(result).includes('test-bot-token'));
 const code=readFileSync('supabase/functions/phase-o-agents/index.ts','utf8');assert(code.includes('Authorization:`Bearer ${token}`'));assert(code.indexOf("if(action==='CUSTOMER_TELEGRAM_LINK')")<code.indexOf("if(profile?.role!=='admin')"));
});
test('failed bot identity never mints or invalidates a customer token',async()=>{
 let minted=0;const scoped={rpc:async()=>{minted++;return {data:{token:'bad'}}}};
 await assert.rejects(customerTelegramLink(scoped,'test-token',false,(async()=>Response.json({ok:false},{status:503})) as typeof fetch));assert.equal(minted,0);
 await assert.rejects(customerTelegramLink(scoped,'test-token',false,(async()=>Response.json({ok:true,result:{username:'valid_bot'}})) as typeof fetch));assert.equal(minted,1);
});
test('Release 1 browser endpoints allow the headers actually sent by the installed Supabase SDK',async()=>{
 const {createClient}=await import('@supabase/supabase-js');let sent:Headers|null=null;
 const client=createClient('https://unit.supabase.co','test-public-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(_url,init)=>{sent=new Headers(init?.headers);return Response.json({state:'fixture'})}}});
 await client.functions.invoke('free-enrollment',{body:{},headers:{'idempotency-key':'fixture'}});assert(sent);
 const names=['phase-o-agents','free-enrollment','commerce-configuration','saas-launch-status','canonical-reporting-worker','commerce-checkout','telegram-membership'];
 for(const name of names){const code=readFileSync(`supabase/functions/${name}/index.ts`,'utf8'),decl=/["']Access-Control-Allow-Headers["']\s*:\s*["']([^"']+)["']/i.exec(code);assert(decl,name);const allowed=decl[1].toLowerCase().split(',').map(x=>x.trim());for(const key of sent!.keys())if(key!=='idempotency-key'||['free-enrollment','phase-o-agents'].includes(name))assert(allowed.includes(key),`${name}: ${key}`);}
 const membership=readFileSync('supabase/functions/telegram-membership/index.ts','utf8');assert(membership.indexOf("if(request.method==='OPTIONS')")<membership.search(/const\s+db\s*=\s*createClient/));
});
