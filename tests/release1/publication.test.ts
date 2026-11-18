import {VIP_CONFIG_IDS,VIP_EXCLUDED_STRATEGIES,VIP_RISK_FOOTER} from '../../supabase/functions/_shared/vip-signal-policy.ts';
import {COST_POSITIVE_CONFIG_IDS} from '../../supabase/functions/_shared/cost-positive-configs.ts';
import {SupabasePublicationStore,renderCanonicalTruth,TelegramCanonicalTransport} from '../../supabase/functions/_shared/canonical-publication-runtime.ts';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertPublishableSignal} from '../../supabase/functions/_shared/signal-publication-guard.ts';
import {qualifiedFixture} from './fixtures.ts';
import {normalizeNewsHeadlines,snapshotFromCandles} from '../../supabase/functions/_shared/intelligence-engine.ts';
import {renderCanonicalVipSignal} from '../../supabase/functions/_shared/telegram-product.ts';
import {renderFreeChannelSignalTemplate,splitMessageSafely} from '../../supabase/functions/_shared/telegram-templates.ts';
const now=Date.parse('2026-10-21T06:00:00Z');
assert.equal(assertPublishableSignal(...Object.values(qualifiedFixture(now)) as [any,any,any],now).id,'s1');
for(const mutate of [(x:any)=>x.release=null,(x:any)=>x.release.state='RETIRED',(x:any)=>x.plan.provenance.evaluated_parameters.stopAtr=9,(x:any)=>x.signal.expires_at=new Date(now).toISOString(),(x:any)=>x.signal.entry_high=102,(x:any)=>x.plan.provenance.candle_boundary.closed_only=false,(x:any)=>x.signal.data_source='MOCK']) {
 const f=qualifiedFixture(now);mutate(f);assert.throws(()=>assertPublishableSignal(f.signal,f.plan,f.release,now));
}
assert.match(VIP_RISK_FOOTER,/Standard Account: Risk 0.5%–1.5%/);
assert.equal(COST_POSITIVE_CONFIG_IDS.length,16);assert.equal(VIP_CONFIG_IDS.length,8);
assert.deepEqual([...VIP_EXCLUDED_STRATEGIES].sort(),COST_POSITIVE_CONFIG_IDS.filter(id=>!VIP_CONFIG_IDS.includes(id)).sort());
for(const strategy of [...VIP_EXCLUDED_STRATEGIES,'A_*[B]'])assert.throws(()=>renderCanonicalVipSignal({signal_id:'blocked',market:'forex',symbol:'XAUUSD',direction:'buy',occurred_at:new Date(now).toISOString(),entry_low:100,stop_loss:90,targets:[115,130],strategy}),/VIP_STRATEGY_NOT_ADMITTED/);
for(const [market,symbol,entry,strategy] of [['crypto','BTCUSDT',67000,'crypto.launch-trend-pullback-48-1.5-5'],['forex','USDJPY',150,'forex.native-squeeze-15-48-2-3-usdjpy-h12'],['metals','XAUUSD',2700,'gold.native-momentum-15-48-2-5']] as const){
 const p={signal_id:'sig_1',market,symbol,direction:'buy',occurred_at:'2026-10-21T06:00:00Z',entry_low:entry,entry_high:entry*1.0001,stop_loss:entry*.99,targets:[entry*1.01,entry*1.02],strategy};
 const rendered=renderCanonicalVipSignal(p);assert.match(rendered,/9:00 AM EAT/);assert.ok(rendered.includes(VIP_RISK_FOOTER));assert.doesNotMatch(rendered,/win[ -]?rate|\bWR\s*[:=]?\s*\d/i);assert.equal(rendered,readFileSync(`tests/release1/snapshots/${symbol}.txt`,'utf8').trimEnd());
 const preview=renderFreeChannelSignalTemplate({eventType:'NEW_SIGNAL',market,symbol,entryLow:entry,entryHigh:entry*1.0001,stopLoss:entry*.99,tp1:entry*1.01,publicationMode:'full',timestamp:p.occurred_at});assert.match(preview,/PREVIEW/);assert.doesNotMatch(preview,/67000|1\.285|2700\.00/);
}
for(const text of ['x'.repeat(14000),'😀'.repeat(6000),'\\'.repeat(10000)]){const chunks=splitMessageSafely(text);assert(chunks.length>1);assert(chunks.every(c=>c.length<=4000));assert.equal(chunks.map(c=>c.replace(/\n\n_\(Part \d+\/\d+\)_$/,'')).join(''),text);}
const headlines=normalizeNewsHeadlines({articles:[{title:'Verified development',url:'https://example.org/item',source:'Example',published_at:'2026-10-21T05:00:00Z'},{title:'Old item',url:'https://example.org/old',source:'Example',published_at:'2026-10-18T00:00:00Z'},{title:'Missing date',url:'https://example.org/date',source:'Example'},{title:'Missing source link',published_at:'2026-10-21T05:00:00Z'},{title:'Verified development',url:'https://example.org/duplicate',source:'Example',published_at:'2026-10-21T05:00:00Z'}]},now);assert.equal(headlines.length,1);
assert.equal(snapshotFromCandles('BTCUSDT',[{symbol:'BTCUSDT',timeframe:'1h',open_time:'2026-10-18T00:00:00Z',open:100,high:102,low:99,close:101},{symbol:'BTCUSDT',timeframe:'1h',open_time:'2026-10-18T01:00:00Z',open:101,high:103,low:100,close:102}],now).dataSource,'unavailable');
console.log('Release 1 qualification, message snapshots, preview secrecy, long Unicode messages, and source freshness passed');

let published=false;
const lifecycleDb={from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,or:()=>q,limit:()=>q,maybeSingle:async()=>({error:null,data:table==='canonical_lifecycle_events'?{id:'event-row',signal_id:'signal-parent',event_type:'TP1',event_version:2,occurred_at:new Date().toISOString(),payload:{symbol:'BTCUSDT'}}:published?{id:'initial-sent'}:null})};return q;}};
const claim={id:'work',entityType:'lifecycle_event',entityId:'signal-parent',eventType:'TP1',eventVersion:2,destination:'vip' as const,customerId:null,attemptCount:1,leaseToken:'lease'};
const lifecycleStore=new SupabasePublicationStore(lifecycleDb);const held=(await lifecycleStore.loadTruth(claim))!;assert.equal(held.entityId,claim.entityId);assert.throws(()=>renderCanonicalTruth(held,'vip'),/QUALIFIED_INITIAL_PUBLICATION_REQUIRED/);
published=true;const deliveredParent=(await lifecycleStore.loadTruth(claim))!;assert.doesNotThrow(()=>renderCanonicalTruth(deliveredParent,'vip'));

const oldDeno=globalThis.Deno;
globalThis.Deno={env:{get:(key:string)=>key==='TELEGRAM_BOT_TOKEN'?'123456:fixture-secret':key==='TELEGRAM_ADMIN_CHAT_ID'?'-100123':undefined}} as typeof Deno;
try{const transport=new TelegramCanonicalTransport({from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{telegram_user_id:'7001',access_state:'ACTIVE'},error:null})})},async()=>{throw Error('request failed https://api.telegram.org/bot123456:fixture-secret/sendMessage')});const result=await transport.send({destination:'customer',customerId:'customer',text:'test',identity:'redaction'});assert.equal(result.kind,'uncertain');assert.doesNotMatch(JSON.stringify(result),/fixture-secret|123456:/);}finally{globalThis.Deno=oldDeno;}
