import {isEditorialPolicyWait} from '../../supabase/functions/_shared/phase-o-agents.ts';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolveHubChat,hubAudience,telegramHubOverview,sendHubTest} from '../../supabase/functions/_shared/telegram-hub.ts';
import {verifyAcquisitionDestination} from '../../supabase/functions/_shared/acquisition-destinations.ts';
const channelDb=(row:any,error:any=null)=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:row,error})})})})});
test('saved hub mappings control delivery, pauses override environment and split VIP never shares legacy room',async()=>{
 assert.equal(await resolveHubChat(channelDb({chat_id:'-42',enabled:true,bot_permission_verified_at:'observed'}),'FREE','-old'),'-42');
 assert.equal(await resolveHubChat(channelDb({chat_id:'-42',enabled:false,bot_permission_verified_at:'observed'}),'FREE','-old'),'');
 assert.equal(await resolveHubChat(channelDb(null),'ADMIN','-old'),'-old');assert.equal(await resolveHubChat(channelDb(null),'VIP_CRYPTO','-shared'),'');
 await assert.rejects(resolveHubChat(channelDb(null,{message:'db unavailable'}),'FREE','-old'),/UNAVAILABLE/);assert.throws(()=>hubAudience('VIP'),/INVALID/);
});
test('VIP verification requires invite/remove rights; explicit test uses the actual saved destination',async()=>{
 const fetcher=(async(url:any)=>{const m=String(url).split('/').at(-1);return new Response(JSON.stringify({ok:true,result:m==='getMe'?{id:1}:m==='getChat'?{id:-42,type:'channel'}:{status:'administrator',can_post_messages:true,can_invite_users:false,can_restrict_members:false}}));}) as typeof fetch;
 await assert.rejects(verifyAcquisitionDestination('fixture','@crypto',fetcher,true),/INVITE_AND_REMOVE/);
 let sent=0;const result=await sendHubTest(channelDb({chat_id:'-42',enabled:true,bot_permission_verified_at:'observed'}),()=> 'fixture','VIP_CRYPTO',(async(_url,init)=>{sent++;const p=JSON.parse(String(init?.body));assert.equal(p.chat_id,'-42');assert.match(p.text,/VIP CRYPTO/);return new Response(JSON.stringify({ok:true,result:{message_id:12}}));}) as typeof fetch);assert.equal(sent,1);assert.equal(result.messageId,'12');
});

test('only routine destination policy holds get automatic wait handling',()=>{assert.equal(isEditorialPolicyWait(new Error('DESTINATION_QUIET_HOURS')),true);assert.equal(isEditorialPolicyWait(new Error('NETWORK_SUBMISSION_UNCERTAIN')),false);});
