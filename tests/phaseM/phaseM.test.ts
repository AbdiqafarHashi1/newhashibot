import assert from "node:assert/strict";
import { audienceAllows, processCanonicalPublicationBatch, publicationIdentity, type CanonicalPublicationTruth, type PublicationClaim, type PublicationStore } from "../../supabase/functions/_shared/canonical-publication-worker.ts";
import { buildPropCampaign, evaluatePropPath, replayScannerChronologically, simulateAccountThroughPhaseD } from "../../supabase/functions/_shared/phase-m-validation.ts";

const claim=(overrides:Partial<PublicationClaim>={}):PublicationClaim=>({id:"w1",entityType:"signal",entityId:"s1",eventType:"SIGNAL_QUALIFIED",eventVersion:1,destination:"vip",customerId:null,attemptCount:1,leaseToken:"lease",...overrides});
class MemoryStore implements PublicationStore {
 claims:PublicationClaim[]=[]; truth=new Map<string,CanonicalPublicationTruth>(); parts=new Map<string,{state:"SEND"|"DELIVERED"|"UNCERTAIN";deliveryId:string;messageId?:string}>(); finished:any[]=[];
 async claim(){const out=this.claims;this.claims=[];return out} async loadTruth(c:PublicationClaim){return this.truth.get(c.id)??null}
 async reservePart(i:any){const old=this.parts.get(i.identity);if(old)return old;const value={state:"SEND" as const,deliveryId:i.identity};this.parts.set(i.identity,value);return value}
 async finishPart(i:any){this.finished.push(i);this.parts.set(i.deliveryId,{state:i.state==="DELIVERED"?"DELIVERED":"UNCERTAIN",deliveryId:i.deliveryId,messageId:i.messageId})}
 async finishClaim(i:any){this.finished.push(i)}
}
const truth=(c:PublicationClaim,customerId:string|null=null):CanonicalPublicationTruth=>({entityType:c.entityType,entityId:c.entityId,eventType:c.eventType,eventVersion:c.eventVersion,occurredAt:"2026-10-02T09:00:00Z",customerId,payload:{symbol:"BTCUSDT"}});

async function publicationTests(){
 const store=new MemoryStore(),c=claim();store.claims=[c];store.truth.set(c.id,truth(c));let sends=0;
 const first=await processCanonicalPublicationBatch({store,workerId:"a",render:()=>[{text:"part 1"},{text:"part 2"}],transport:{send:async()=>{sends++;return sends===2?{kind:"retry",retryAfterMs:30_000,reason:"TELEGRAM_429"}:{kind:"accepted",messageId:"m1"}}}});
 assert.equal(first[0].state,"RETRY");assert.equal(sends,2);assert.equal(publicationIdentity(c,0),"signal:s1:v1:vip:p0");
 store.claims=[c];store.parts.set(publicationIdentity(c,1),{state:"SEND",deliveryId:publicationIdentity(c,1)});await processCanonicalPublicationBatch({store,workerId:"restart",render:()=>[{text:"part 1"},{text:"part 2"}],transport:{send:async()=>({kind:"accepted",messageId:"m2"})}});assert.equal(store.finished.at(-1).state,"SENT");
 const uncertain=new MemoryStore(),u=claim({id:"w2"});uncertain.claims=[u];uncertain.truth.set(u.id,truth(u));await processCanonicalPublicationBatch({store:uncertain,workerId:"x",render:()=>[{text:"x"}],transport:{send:async()=>{throw new Error("timeout after submit")}}});assert.equal(uncertain.finished.at(-1).state,"RETRY");assert.equal(uncertain.finished.at(-2).state,"UNCERTAIN");
 const customer=claim({destination:"customer",eventType:"FILL",customerId:"customer-a"});assert(audienceAllows(customer,truth(customer,"customer-a")));assert(!audienceAllows({...customer,destination:"vip"},truth(customer,"customer-a")));assert(!audienceAllows({...customer,customerId:"customer-b"},truth(customer,"customer-a")));
 assert(!audienceAllows(claim({destination:"free",eventVersion:2}),truth(claim())));assert(audienceAllows(claim({destination:"owner"}),truth(claim())));
}
async function replayTests(){
 const times=["2026-01-01T00:02:00Z","2026-01-01T00:00:00Z","2026-01-01T00:01:00Z"],seen:string[]=[];
 const evidence=await replayScannerChronologically({cooldownMs:120_000,events:times.map((closedAt,i)=>({symbol:i===0?"ETHUSDT":"BTCUSDT",timeframe:"1m",closedAt,contentHash:String(i),payload:{}})),evaluate:e=>{seen.push(e.closedAt);return{decision:"SIGNAL",signalId:e.symbol+e.closedAt,expiresAt:new Date(Date.parse(e.closedAt)+120_000).toISOString(),reasons:[]}}});
 assert.deepEqual(seen,[times[1],times[0]]);assert.equal(evidence[1].selection.reasons[0],"ACTIVE_SIGNAL_RESTRICTION");assert.deepEqual(evidence.map(x=>x.event.closedAt),[times[1],times[2],times[0]]);
 await assert.rejects(()=>replayScannerChronologically({cooldownMs:0,events:[{symbol:"X",timeframe:"1m",closedAt:times[0],contentHash:"a",payload:{}},{symbol:"X",timeframe:"1m",closedAt:times[0],contentHash:"b",payload:{}}],evaluate:()=>({decision:"NO_TRADE",reasons:[]})}),/CONTENT_CONFLICT/);
}
function accountAndPropTests(){
 const result=simulateAccountThroughPhaseD({initialCapital:10_000,accountCurrency:"USD",contracts:new Map([["EURUSD",{symbol:"EURUSD",contractSize:100_000,quantityStep:.01,quoteCurrency:"USD"}]]),points:[{at:"2026-01-01T10:00:00Z",signalId:"1",symbol:"EURUSD",entry:1,exit:1.001,side:"buy",fees:2,funding:1,spread:.00001,slippage:.00001}],phaseD:(_p,_s,_c)=>({decision:"REDUCE",authorizedRiskPct:.25,quantity:.1,reasonCodes:["DRAWDOWN_REDUCTION"]})});
 assert.equal(result.endingBalance,10006.8);assert.equal(result.decisions[0].decision.decision,"REDUCE");
 assert.throws(()=>simulateAccountThroughPhaseD({initialCapital:1,accountCurrency:"USD",contracts:new Map(),points:[{at:"2026-01-01T00:00:00Z",signalId:"x",symbol:"X",entry:1,exit:2,side:"buy",fees:0,funding:0,spread:0,slippage:0}],phaseD:()=>({decision:"ALLOW",authorizedRiskPct:1,quantity:1,reasonCodes:[]})}),/CONTRACT_SPEC_MISSING/);
 const rules={id:"firm",version:"1",timezone:"Africa/Nairobi",profitTargetPct:10,dailyDrawdownPct:5,overallDrawdownPct:10,drawdown:"STATIC" as const,basis:"EQUITY" as const,minimumTradingDays:1,unsupportedRules:[]};
 assert.equal(evaluatePropPath(rules,10_000,[{at:"2026-01-01T20:59:00Z",balance:10_000,equity:10_000},{at:"2026-01-01T21:01:00Z",balance:9_400,equity:9_400},{at:"2026-01-01T22:01:00Z",balance:8_900,equity:8_900}]).reason,"DAILY_DRAWDOWN");
 assert.equal(evaluatePropPath({...rules,unsupportedRules:["NEWS_WINDOW"]},10_000,[]).status,"INCOMPLETE");
 const starts=Array.from({length:100},(_,i)=>new Date(Date.UTC(2020,0,i+1)).toISOString()),campaign=buildPropCampaign({availableStarts:starts,windowDays:30});assert.equal(campaign.length,100);assert.match(campaign[1].overlapDisclosure,/NOT_INDEPENDENT/);
}
await publicationTests();await replayTests();accountAndPropTests();console.log("Phase M deterministic integration tests passed");
