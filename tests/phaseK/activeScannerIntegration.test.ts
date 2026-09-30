import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { arbitrateActiveScanner, ACTIVE_SCANNER_ARBITRATOR, ACTIVE_SCANNER_FRAMEWORK } from "../../supabase/functions/_shared/active-scanner-core.ts";
import { admitClosedRuntimeCandles, boundedScannerTimeframes, boundedScannerUniverse, SCANNER_HARD_LIMITS } from "../../supabase/functions/_shared/scanner-limits.ts";
import { commitScannerDecision, immutableSignalHash, scannerCycleKey, scannerSignalIdentity } from "../../supabase/functions/_shared/scanner-signal-repository.ts";
import type { ArbitrationCandidate } from "../../supabase/functions/_shared/arbitrator.ts";

const now = new Date("2026-09-30T12:00:00.000Z");
const candidate = (id: string, score: number): ArbitrationCandidate => ({ id, strategyId: "crypto.micro-scalper", strategyVersion: "1.0.0", market: "crypto", symbol: "BTCUSDT", timeframe: "5m", side: "buy", confidence: score, grade: score >= 85 ? "A+" : "A", score, entry: 100, stop: 99, targets: [101, 102], riskReward: 2, expiry: "2026-09-30T13:00:00.000Z", fresh: true, lifecycle: "ENABLED", publicationMode: "LIVE", evidence: { configuration_version: "db:MicroScalper" }, rejectionReasons: [] });
const decision = arbitrateActiveScanner([candidate("b", 85), candidate("a", 85)], { now, minimumScore: 75, allowedGrades: ["A", "A+"] });
assert.equal(decision.winner?.id, "a"); assert.equal(decision.rejected.length, 1); assert.equal(decision.evidence.authority, "trading-domain.arbitrateCanonical");
assert.equal(ACTIVE_SCANNER_FRAMEWORK, "professional-strategy-registry/v1"); assert.equal(ACTIVE_SCANNER_ARBITRATOR, decision.version);

assert.throws(() => boundedScannerUniverse([], Array(7).fill("FX"), undefined, "7"), /UNSAFE_SCANNER_LIMIT:SCANNER_MAX_FOREX_SYMBOLS/);
assert.throws(() => boundedScannerUniverse([], [], undefined, "NaN"), /UNSAFE_SCANNER_LIMIT/);
assert.throws(() => boundedScannerUniverse([], [], undefined, "1.5"), /UNSAFE_SCANNER_LIMIT/);
const bounded = boundedScannerUniverse(Array.from({ length: 30 }, (_, i) => i), Array.from({ length: 6 }, (_, i) => i), "25", "6", "10");
assert.equal(bounded.forex.length, 6); assert.equal(bounded.crypto.length, 4); assert.equal(bounded.forex.length + bounded.crypto.length, 10); assert.equal(SCANNER_HARD_LIMITS.providerRequests, 124);
assert.throws(() => boundedScannerTimeframes(["1m", "5m", "15m", "1h", "4h"]), /UNSAFE_SCANNER_TIMEFRAMES/); assert.throws(() => boundedScannerTimeframes(["2m"]), /UNSAFE_SCANNER_TIMEFRAMES/);
const closed = { open_time: "2026-09-30T11:55:00.000Z", open: 100, high: 102, low: 99, close: 101, volume: 1 }, mutable = { ...closed, open_time: "2026-09-30T12:00:00.000Z" };
assert.deepEqual(admitClosedRuntimeCandles([closed, mutable], 5, now.getTime()), { candles: [closed], rejection: null, mutableDropped: 1 });
assert.equal(admitClosedRuntimeCandles([{ ...closed, high: 98 }], 5, now.getTime()).rejection, "malformed_candle");
assert.equal(admitClosedRuntimeCandles([closed, closed], 5, now.getTime()).rejection, "duplicate_candle");
assert.equal(admitClosedRuntimeCandles([{ ...closed, open_time: "2026-09-30T10:00:00.000Z" }], 5, now.getTime()).rejection, "stale_candles");

const identityInput = { market: "crypto", symbol: "BTCUSDT", timeframe: "5m", candleCloseTime: now.toISOString(), strategyId: "crypto.micro-scalper", strategyVersion: "1.0.0", configurationVersion: "db:MicroScalper" };
assert.equal(scannerCycleKey(identityInput), scannerCycleKey(identityInput));
assert.equal(scannerSignalIdentity({ ...identityInput, side: "buy" }), scannerSignalIdentity({ ...identityInput, side: "buy" }));
assert.notEqual(immutableSignalHash({ symbol: "BTCUSDT", entry_low: 100 }), immutableSignalHash({ symbol: "BTCUSDT", entry_low: 101 }));

let rpcCalls = 0; const committed = new Map<string, { fingerprint: string; row: object }>();
const repository = { async rpc(_name: string, args: Record<string, unknown>) { rpcCalls++; const key = `${args.p_cycle_key}:${args.p_scope}`, fingerprint = JSON.stringify(args); const old = committed.get(key); if (old && old.fingerprint !== fingerprint) return { data: null, error: { message: "SCANNER_DECISION_CONFLICT" } }; if (old) return { data: { ...old.row, idempotent: true }, error: null }; const row = { decision_id: "d1", signal_id: args.p_signal ? "s1" : null, publication_work_id: args.p_enqueue_publication ? "p1" : null, idempotent: false }; committed.set(key, { fingerprint, row }); return { data: row, error: null }; } };
const commit = { cycleKey: "cycle", runId: "00000000-0000-0000-0000-000000000001", scope: "crypto:BTCUSDT:5m", decision: "SIGNAL" as const, reasonCodes: ["GRADE_A_PLUS"], arbitration: decision as unknown as Record<string, unknown>, signal: { market_type: "crypto", symbol: "BTCUSDT", timeframe: "5m", direction: "buy", entry_low: 100 }, enqueuePublication: true };
const [first, retry] = await Promise.all([commitScannerDecision(repository, commit), commitScannerDecision(repository, commit)]); assert.equal(first.signal_id, retry.signal_id); assert.equal(committed.size, 1); assert.equal(rpcCalls, 2);
await assert.rejects(() => commitScannerDecision(repository, { ...commit, signal: { ...commit.signal, entry_low: 101 } }), /SCANNER_DECISION_CONFLICT/);

const root = readFileSync("supabase/functions/market-scanner/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260930120000_phase_k_active_scanner_signal_truth.sql", "utf8");
assert.equal((root.match(/new ProfessionalStrategyRegistry/g) ?? []).length, 1, "root constructs one operational registry");
assert.equal((root.match(/arbitrateActiveScanner\(/g) ?? []).length, 1, "root calls one operational arbitrator boundary");
assert.equal((root.match(/\.from\("signals"\)\.insert/g) ?? []).length, 0, "root cannot bypass durable signal RPC");
assert.match(root, /evaluateActiveStrategies\(registry, strategyContext\)/); assert.match(root, /commitScannerDecision/); assert.match(root, /FOREX_PROVIDER_AUTHORITY_UNRESOLVED_TWELVE_DATA_LOCK_MT5_IMPLEMENTATION/);
assert.match(root, /const modesToRun = \["signal_mode"\]/, "scanner emits global signal truth only; Phase D owns account decisions");
assert.doesNotMatch(root, /adopt_execution_plan/, "scanner cannot call an account execution provider");
assert.match(migration, /pg_advisory_xact_lock/); assert.match(migration, /UNIQUE \(cycle_key, arbitration_scope\)/); assert.match(migration, /IMMUTABLE_SCANNER_SIGNAL_TRUTH/); assert.match(migration, /SERVICE_ROLE_REQUIRED/); assert.match(migration, /signal_publication_work/);
console.log("Phase K active market-scanner integration tests passed");
