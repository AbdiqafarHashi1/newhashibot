import test from 'node:test';
import assert from 'node:assert/strict';
import { Arbitrator, CandidateValidator, CapitalManager, ImmutableSignalEngine, RiskEngine, SignalLifecycle, emptyExposure, type BrainCandidate, type CapitalProfile, type MarketContext } from '../../services/hashicore/index.js';

const now='2026-01-01T10:00:00.000Z';
const ctx:MarketContext={marketStatus:'open',session:'london',regime:'trending',trendQuality:.8,volatility:1,liquidity:.9,spreadPct:.0005,atr:10,now};
const profile:CapitalProfile={mode:'personal',equity:10000,baseRiskPct:1,maxRiskPct:1,compound:true,maxAllocationPct:50};
function cand(id:string,over:Partial<BrainCandidate>={}):BrainCandidate{return{candidateId:id,strategyId:'crypto.trend-pullback',strategyVersion:'2.0.0-research-ready',lifecycleStatus:'RESEARCH_READY',market:'crypto',symbol:'BTCUSDT',timeframe:'15m',direction:'long',entry:{type:'marketable-limit',price:100,tolerancePct:.001},stopLoss:{price:85,type:'atr',atrMultiple:1.5},takeProfits:[{price:110,sizePct:50,rationale:'tp1'},{price:130,sizePct:50,rationale:'tp2'}],score:80,confidence:.7,riskReward:2,expectedDuration:'PT4H',reasons:['ATR_RISK_DEFINED'],invalidationRules:[],requiredIndicators:['atr'],marketFeaturesUsed:['trend'],createdAt:now,expiresAt:'2026-01-01T10:30:00.000Z',...over};}

test('arbitrator selects best candidate deterministically', async()=>{ const r=await new Arbitrator().arbitrate([cand('a',{symbol:'ETHUSDT',score:75}),cand('b',{symbol:'BTCUSDT',score:90,confidence:.8})],ctx,profile); assert.equal(r.status,'APPROVED_CANDIDATE'); if(r.status==='APPROVED_CANDIDATE') assert.equal(r.approved.candidate.candidateId,'b'); });
test('duplicate candidates rejected', async()=>{ const r=await new Arbitrator().arbitrate([cand('a'),cand('a',{symbol:'BTCUSDT'})],ctx,profile); assert.equal(r.rejected[0]?.code,'DUPLICATE_CANDIDATE'); });
test('conflicting BUY/SELL rejected', async()=>{ const r=await new Arbitrator().arbitrate([cand('a'),cand('b',{direction:'short',entry:{type:'marketable-limit',price:100,tolerancePct:.001},stopLoss:{price:115,type:'atr'}})],ctx,profile); assert.equal(r.rejected[0]?.code,'CONFLICTING_DIRECTION'); });
test('weak RR rejected',()=>{ assert.equal(new CandidateValidator().validate(cand('x',{riskReward:1.1}),ctx)?.code,'WEAK_RR'); });
test('weak confidence rejected',()=>{ assert.equal(new CandidateValidator().validate(cand('x',{confidence:.4}),ctx)?.code,'WEAK_CONFIDENCE'); });
test('expired candidates rejected',()=>{ assert.equal(new CandidateValidator().validate(cand('x',{expiresAt:'2026-01-01T09:59:59.000Z'}),ctx)?.code,'EXPIRED_CANDIDATE'); });
test('portfolio exposure limits enforced',()=>{ assert.throws(()=>new CapitalManager().plan(cand('x'),new RiskEngine().plan(cand('x'),ctx),profile,{...emptyExposure,openTrades:5}),/Maximum open trades/); });
test('risk plans deterministic',()=>{ const e=new RiskEngine(); assert.deepEqual(e.plan(cand('x'),ctx),e.plan(cand('x'),ctx)); });
test('capital plans deterministic',()=>{ const rp=new RiskEngine().plan(cand('x'),ctx); const cm=new CapitalManager(); assert.deepEqual(cm.plan(cand('x'),rp,profile),cm.plan(cand('x'),rp,profile)); });
test('immutable signals cannot change and IDs unique',async()=>{ const arb=await new Arbitrator().arbitrate([cand('a')],ctx,profile); assert.equal(arb.status,'APPROVED_CANDIDATE'); if(arb.status!=='APPROVED_CANDIDATE') return; const eng=new ImmutableSignalEngine(); const s1=eng.create(arb.approved,'2026-01-01T10:00:01.000Z'); const s2=eng.create(arb.approved,'2026-01-01T10:00:02.000Z'); assert.notEqual(s1.signalId,s2.signalId); assert.throws(()=>{(s1 as any).entry=999;},/read only|Cannot assign/); });
test('illegal state transitions rejected',()=>{ const sm=new SignalLifecycle('Approved'); assert.throws(()=>sm.transition('Executed'),/Illegal signal transition/); assert.equal(sm.transition('Dispatched'),'Dispatched'); });
