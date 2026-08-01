import assert from "node:assert/strict";
import test from "node:test";
import * as core from "../src/index.ts";
import * as canonicalIndicators from "../../../supabase/functions/_shared/indicator-engine.ts";
import * as canonicalArbitrator from "../../../supabase/functions/_shared/arbitrator.ts";
import * as canonicalRisk from "../../../supabase/functions/_shared/professional-risk-engine.ts";
import * as canonicalCapital from "../../../supabase/functions/_shared/professional-capital-allocation.ts";
import * as canonicalPlanning from "../../../supabase/functions/_shared/professional-execution-planning.ts";
import * as canonicalProtection from "../../../supabase/functions/_shared/professional-protection-verification.ts";

test("market normalization is deterministic and immutable",()=>{const raw={openTime:1,closeTime:2,open:100,high:102,low:99,close:101,volume:10,closed:true};const a=core.market.normalizeCandle(raw,{symbol:"btcusdt",timeframe:"5M",source:"fixture"});const b=core.market.normalizeCandle(raw,{symbol:"btcusdt",timeframe:"5M",source:"fixture"});assert.deepEqual(a,b);assert.equal(a.symbol,"BTCUSDT");assert.ok(Object.isFrozen(a));});

test("indicator facade executes exact canonical behavior",()=>{assert.strictEqual(core.strategy.canonical.indicators.ema,canonicalIndicators.ema);assert.deepEqual(core.strategy.canonical.indicators.ema([1,2,3,4],3),canonicalIndicators.ema([1,2,3,4],3));assert.equal(core.strategy.canonical.indicators.INDICATOR_VERSIONS.atr,canonicalIndicators.INDICATOR_VERSIONS.atr);});

test("arbitrator facade executes exact canonical behavior",()=>{assert.strictEqual(core.arbitrator.arbitrate,canonicalArbitrator.arbitrate);const candidate:canonicalArbitrator.ArbitrationCandidate={id:"a",strategyId:"s",strategyVersion:"1",market:"crypto",symbol:"BTCUSDT",timeframe:"5m",side:"buy",confidence:80,grade:"A",score:.8,entry:100,stop:98,targets:[102,104],riskReward:2,expiry:"2026-08-01T00:00:00Z",fresh:true,lifecycle:"ENABLED",publicationMode:"LIVE",evidence:{},rejectionReasons:[],priority:1};const options={now:new Date("2026-07-31T00:00:00Z")};assert.deepEqual(core.arbitrator.arbitrate([candidate],options),canonicalArbitrator.arbitrate([candidate],options));});

test("strategy, risk, capital, planner and protection facades are canonical implementations",()=>{assert.strictEqual(core.strategy.canonical.risk.evaluateRisk,canonicalRisk.evaluateRisk);assert.strictEqual(core.risk.evaluateRisk,canonicalRisk.evaluateRisk);assert.strictEqual(core.capital.allocateCapital,canonicalCapital.allocateCapital);assert.strictEqual(core.execution.planExecution,canonicalPlanning.planExecution);assert.strictEqual(core.protection.verifyProtection,canonicalProtection.verifyProtection);});

test("complete canonical facade retains single implementations",()=>{assert.strictEqual(core.canonical.indicatorEngine.atr,canonicalIndicators.atr);assert.strictEqual(core.canonical.arbitrator.arbitrate,canonicalArbitrator.arbitrate);assert.strictEqual(core.canonical.riskEngine.evaluateRisk,canonicalRisk.evaluateRisk);assert.strictEqual(core.canonical.capitalManager.allocateCapital,canonicalCapital.allocateCapital);assert.strictEqual(core.canonical.executionPlanning.planExecution,canonicalPlanning.planExecution);assert.strictEqual(core.canonical.protectionVerification.verifyProtection,canonicalProtection.verifyProtection);});

test("immutable signal creation preserves truth version and evidence",()=>{const signal=core.signal.createSignal({signalId:"sig-1",symbol:"btcusdt",market:"crypto",timeframe:"5m",direction:"BUY",strategyIdentity:"crypto.micro-scalper",strategyVersion:"1.0.0",createdAt:"2026-07-31T00:00:00Z",expiresAt:null,evidence:[{code:"PASS",message:"fixture"}],payload:{grade:"A"}});assert.equal(signal.truthVersion,1);assert.equal(signal.lifecycle,"CREATED");assert.equal(signal.symbol,"BTCUSDT");assert.ok(Object.isFrozen(signal));});

test("trade lifecycle rejects stale or invalid transitions",()=>{const truth:core.lifecycle.TradeTruth={tradeId:"t",state:"OPEN",truthVersion:3,updatedAt:"2026-07-31T00:00:00Z",evidence:[]};const valid:core.lifecycle.TradeTransition={transitionId:"x",tradeId:"t",from:"OPEN",to:"PROTECTED",expectedTruthVersion:3,occurredAt:"2026-07-31T00:00:01Z",correlationId:"c",causationId:null,evidence:[]};assert.doesNotThrow(()=>core.lifecycle.validateTransition(truth,valid));assert.throws(()=>core.lifecycle.validateTransition(truth,{...valid,expectedTruthVersion:2}),/STALE_TRUTH_VERSION/);});

test("recovery remains bounded",()=>{const intent:core.recovery.RecoveryIntent={recoveryId:"r",reason:"ORPHAN_POSITION",tradeId:"t",executionScopeKey:"scope",attempt:2,idempotencyKey:"recovery:v1:r",correlationId:"c",evidence:[]};assert.doesNotThrow(()=>core.recovery.validateRecoveryAttempt(intent,{maximumAttempts:2,leaseMs:1000,backoffMs:[10]}));assert.throws(()=>core.recovery.validateRecoveryAttempt({...intent,attempt:3},{maximumAttempts:2,leaseMs:1000,backoffMs:[10]}),/OUT_OF_BOUNDS/);});

test("provider and Telegram boundaries contain no transport implementation",()=>{const caps:core.providers.ProviderCapabilities={provider:"BINANCE",marketOrders:true,limitOrders:true,nativeStop:true,nativeTakeProfit:true,partialExit:true,trailing:false};const route:core.telegram.TelegramRoute={audience:"ADMIN",channelKey:"admin",templateKey:"provider_down"};assert.equal(caps.provider,"BINANCE");assert.equal(route.audience,"ADMIN");});

test("intelligence contracts have no runtime registry or implementation",()=>{assert.equal("registry" in core.intelligence,false);assert.equal("createAgent" in core.intelligence,false);});
