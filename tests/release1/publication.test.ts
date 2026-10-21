import {SupabasePublicationStore,renderCanonicalTruth} from '../../supabase/functions/_shared/canonical-publication-runtime.ts';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertPublishableSignal} from '../../supabase/functions/_shared/signal-publication-guard.ts';
import {qualifiedFixture} from './fixtures.ts';
import {normalizeNewsHeadlines,snapshotFromCandles} from '../../supabase/functions/_shared/intelligence-engine.ts';
import {renderCanonicalVipSignal,validateEditorialPublication} from '../../supabase/functions/_shared/telegram-product.ts';
import {renderFreeChannelSignalTemplate,splitMessageSafely} from '../../supabase/functions/_shared/telegram-templates.ts';
const now=Date.parse('2026-10-21T06:00:00Z');
assert.equal(assertPublishableSignal(...Object.values(qualifiedFixture(now)) as [any,any,any],now).id,'s1');
for(const mutate of [(x:any)=>x.release=null,(x:any)=>x.release.state='RETIRED',(x:any)=>x.plan.provenance.evaluated_parameters.stopAtr=9,(x:any)=>x.signal.expires_at=new Date(now).toISOString(),(x:any)=>x.signal.entry_high=102,(x:any)=>x.plan.provenance.candle_boundary.closed_only=false,(x:any)=>x.signal.data_source='MOCK']) {
 const f=qualifiedFixture(now);mutate(f);assert.throws(()=>assertPublishableSignal(f.signal,f.plan,f.release,now));
}
for(const [market,symbol,entry] of [['crypto','BTCUSDT',67000],['forex','EURUSD',1.085],['metals','XAUUSD',2700]] as const){
 const p={signal_id:'sig_1',market,symbol,direction:'buy',occurred_at:'2026-10-21T06:00:00Z',entry_low:entry,entry_high:entry*1.0001,stop_loss:entry*.99,targets:[entry*1.01,entry*1.02],strategy:'A_*[B]'};
 const rendered=renderCanonicalVipSignal(p);assert.match(rendered,/9:00 AM EAT/);assert.equal(rendered,readFileSync(`tests/release1/snapshots/${symbol}.txt`,'utf8').trimEnd());
 const preview=renderFreeChannelSignalTemplate({eventType:'NEW_SIGNAL',market,symbol,entryLow:entry,entryHigh:entry*1.0001,stopLoss:entry*.99,tp1:entry*1.01,publicationMode:'full',timestamp:p.occurred_at});assert.match(preview,/PREVIEW/);assert.doesNotMatch(preview,/67000|1\.085|2700\.00/);
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
