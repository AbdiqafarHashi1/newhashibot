import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAPER_TRANSITIONS, PERSISTED_PAPER_STATUS, cancelPaperTrade, certifyPaperTrade, createPaperTrade, evaluatePaperTrade, paperIntentStatusForSignalStatus, persistedPaperIntentUpdate, type NewPaperTrade, type PaperCandle } from '../../supabase/functions/_shared/paper-trade-lifecycle.js';
import { TelegramDeliveryLedger, channelsForProfessionalMessage, messageFromPaperTransition, publicationAllowed, publicSignalReference, renderProfessionalTelegramMessage, telegramLifecycleKey, telegramTypeForSignalStatus } from '../../supabase/functions/_shared/professional-telegram.js';

const base: NewPaperTrade = { signal_id: 'signal-internal-123', strategy_id: 'crypto.micro-scalper', strategy_version: '1.0.0', market: 'crypto', provider: 'binance_market_data', symbol: 'BTCUSDT', timeframe: '15m', side: 'buy', entry_low: 99.8, entry_high: 100.2, stop_loss: 98, tp1: 102, tp2: 104, risk_reward: 2, normalized_size: 1, expires_at: '2025-01-01T15:00:00.000Z' };
const candle = (time: string, open: number, high: number, low: number, close: number, extra: Partial<PaperCandle> = {}): PaperCandle => ({ open_time: time, close_time: new Date(Date.parse(time) + 900_000).toISOString(), open, high, low, close, closed: true, ...extra });
const at = '2025-01-01T14:00:00.000Z';

const first = createPaperTrade(base), repeated = createPaperTrade(base);
assert.deepEqual(first, repeated, 'creation is deterministic'); assert.equal(first.status, 'PENDING_ENTRY'); assert.ok(first.idempotency_key.startsWith('paper:create:'));
assert.equal(first.side, 'buy'); assert.equal(persistedPaperIntentUpdate(first).direction, 'buy', 'domain side adapts to persisted direction');
assert.equal(PERSISTED_PAPER_STATUS.PENDING_ENTRY, 'simulated'); assert.equal(paperIntentStatusForSignalStatus('tp2_hit')?.status, 'completed');
assert.deepEqual(PAPER_TRANSITIONS.CLOSED, []); assert.ok(PAPER_TRANSITIONS.PENDING_ENTRY.includes('OPEN')); assert.ok(!PAPER_TRANSITIONS.CLOSED.includes('OPEN'));

const noEntry = evaluatePaperTrade(first, [candle('2025-01-01T12:00:00.000Z', 105, 106, 104, 105)], at);
assert.equal(noEntry.trade.status, 'PENDING_ENTRY'); assert.equal(noEntry.events.length, 0);
const opened = evaluatePaperTrade(first, [candle('2025-01-01T12:00:00.000Z', 100, 101, 99.5, 100.5)], at);
assert.equal(opened.trade.status, 'PROTECTED'); assert.deepEqual(opened.events.map((event) => event.to), ['OPEN', 'PROTECTED']);
const tp1 = evaluatePaperTrade(opened.trade, [candle('2025-01-01T12:15:00.000Z', 100.5, 102.5, 100.2, 102)], at);
assert.equal(tp1.trade.status, 'BREAK_EVEN'); assert.deepEqual(tp1.events.map((event) => event.to), ['TP1_HIT', 'BREAK_EVEN']);
const tp2 = evaluatePaperTrade(tp1.trade, [candle('2025-01-01T12:30:00.000Z', 102, 104.2, 101, 104)], at);
assert.equal(tp2.trade.status, 'CLOSED'); assert.equal(tp2.trade.closure_reason, 'TP2'); assert.ok((tp2.trade.realized_r ?? 0) > 1.9);
assert.ok(tp2.trade.mfe_r >= 2); assert.ok(tp2.trade.mae_r >= 0);

const beStop = evaluatePaperTrade(tp1.trade, [candle('2025-01-01T12:30:00.000Z', 101, 101.5, 99.9, 100)], at);
assert.equal(beStop.trade.status, 'CLOSED'); assert.equal(beStop.trade.closure_reason, 'BREAK_EVEN_STOP'); assert.equal(beStop.trade.realized_r, 0);
const stop = evaluatePaperTrade(opened.trade, [candle('2025-01-01T12:15:00.000Z', 100, 100.5, 97.5, 98)], at);
assert.equal(stop.trade.status, 'CLOSED'); assert.equal(stop.trade.closure_reason, 'STOP_LOSS'); assert.equal(stop.trade.realized_r, -1);

const directTp2 = evaluatePaperTrade(opened.trade, [candle('2025-01-01T12:15:00.000Z', 100, 104.5, 99, 104)], at);
assert.equal(directTp2.trade.closure_reason, 'TP2'); assert.deepEqual(directTp2.events.map((event) => event.to), ['TP2_HIT', 'CLOSED']);
const ambiguous = evaluatePaperTrade(opened.trade, [candle('2025-01-01T12:15:00.000Z', 100, 104.5, 97.5, 101)], at);
assert.equal(ambiguous.trade.closure_reason, 'STOP_LOSS'); assert.equal(ambiguous.trade.realized_r, -1); assert.equal(ambiguous.events[0].conservative_ambiguity, true);

const shortBase: NewPaperTrade = { ...base, signal_id: 'short-signal', side: 'sell', stop_loss: 102, tp1: 98, tp2: 96 };
const shortOpen = evaluatePaperTrade(createPaperTrade(shortBase), [candle('2025-01-01T12:00:00.000Z', 100, 100.5, 99, 99.5)], at);
const shortClose = evaluatePaperTrade(shortOpen.trade, [candle('2025-01-01T12:15:00.000Z', 99, 99.5, 95.5, 96)], at);
assert.equal(shortClose.trade.closure_reason, 'TP2'); assert.ok((shortClose.trade.realized_r ?? 0) > 1.9);

const expiredBase = createPaperTrade({ ...base, signal_id: 'expiry-signal', expires_at: '2025-01-01T12:10:00.000Z' });
const expired = evaluatePaperTrade(expiredBase, [candle('2025-01-01T12:15:00.000Z', 105, 106, 104, 105)], at);
assert.equal(expired.trade.status, 'CLOSED'); assert.equal(expired.trade.closure_reason, 'EXPIRED');
const cancelled = cancelPaperTrade(first, '2025-01-01T12:05:00.000Z', 'operator_cancelled');
assert.equal(cancelled.trade.status, 'CLOSED'); assert.equal(cancelled.trade.closure_reason, 'CANCELLED');
const invalidCancel = cancelPaperTrade(tp2.trade, '2025-01-01T13:00:00.000Z', 'too_late'); assert.equal(invalidCancel.diagnostics.invalid_transitions, 1);

const malformed = evaluatePaperTrade(first, [candle('2025-01-01T12:00:00.000Z', 100, 90, 110, 100)], at); assert.equal(malformed.diagnostics.malformed_candles, 1);
const future = evaluatePaperTrade(first, [candle('2025-01-01T15:00:00.000Z', 100, 101, 99, 100)], at); assert.equal(future.diagnostics.future_candles, 1);
const unclosed = evaluatePaperTrade(first, [candle('2025-01-01T12:00:00.000Z', 100, 101, 99, 100, { closed: false })], at); assert.equal(unclosed.diagnostics.unclosed_candles, 1);
const duplicateCandle = candle('2025-01-01T12:00:00.000Z', 100, 101, 99.5, 100);
const duplicates = evaluatePaperTrade(first, [duplicateCandle, duplicateCandle], at); assert.equal(duplicates.diagnostics.duplicate_candles, 1);
const replay = evaluatePaperTrade(opened.trade, [duplicateCandle], at); assert.equal(replay.events.length, 0); assert.equal(replay.diagnostics.duplicate_candles, 1);
const outOfOrder = evaluatePaperTrade(first, [candle('2025-01-01T12:15:00.000Z', 101, 102, 100, 101), duplicateCandle], at); assert.equal(outOfOrder.trade.latest_evaluated_candle, '2025-01-01T12:15:00.000Z');

for (const [market, symbol, expected] of [['crypto', 'BTCUSDT', 2], ['forex', 'EURUSD', 5], ['forex', 'USDJPY', 3], ['gold', 'XAUUSD', 2]] as const) {
  const trade = createPaperTrade({ ...base, signal_id: `${market}-${symbol}`, market, symbol }); const payload = persistedPaperIntentUpdate(trade); assert.equal(payload.stop_loss.toFixed(expected), trade.stop_loss.toFixed(expected));
}

const certification = certifyPaperTrade(tp2.trade); assert.equal(certification.passed, true); assert.ok(certification.fingerprint);
assert.equal(certifyPaperTrade({ ...tp2.trade, status: null as never }).passed, false);
assert.equal(certifyPaperTrade({ ...tp2.trade, transition_keys: [...tp2.trade.transition_keys, tp2.trade.transition_keys[0]] }).failures.includes('duplicate_lifecycle_event'), true);
assert.equal(certifyPaperTrade(tp2.trade, ['same', 'same']).failures.includes('duplicate_telegram_publication'), true);

const transition = tp2.events[0];
const lifecycleMessage = messageFromPaperTransition({ signalId: base.signal_id, tradeId: tp2.trade.paper_trade_id, market: base.market, symbol: base.symbol, side: base.side, strategyName: 'Micro Scalper', strategyVersion: base.strategy_version, timeframe: base.timeframe, event: transition, closureReason: tp2.trade.closure_reason, realizedR: tp2.trade.realized_r });
const rendered = renderProfessionalTelegramMessage(lifecycleMessage);
assert.match(rendered, /Reference: HS-/); assert.doesNotMatch(rendered, /signal-internal-123/); assert.match(rendered, /Not financial advice/);
assert.equal(telegramTypeForSignalStatus('tp1_hit'), 'TP1_HIT'); assert.deepEqual(channelsForProfessionalMessage('TP1_HIT'), ['vip']); assert.deepEqual(channelsForProfessionalMessage('OPERATIONAL_WARNING'), ['admin']);
const initialText = renderProfessionalTelegramMessage({ type: 'NEW_SIGNAL', signal_reference: publicSignalReference(base.signal_id), market: base.market, symbol: base.symbol, side: base.side, strategy_display_name: 'Micro Scalper', strategy_version: base.strategy_version, timeframe: base.timeframe, grade: 'A', confidence: 82, entry_low: base.entry_low, entry_high: base.entry_high, stop_loss: base.stop_loss, tp1: base.tp1, tp2: base.tp2, risk_reward: base.risk_reward, expires_at: base.expires_at, evidence: ['closed-candle confirmation'], occurred_at: at });
assert.match(initialText, /NEW SIGNAL/); assert.match(initialText, /Entry:/); assert.match(initialText, /Stop Loss:/); assert.match(initialText, /TP1:/); assert.match(initialText, /TP2:/);

const ledger = new TelegramDeliveryLedger(), intent = ledger.enqueue(lifecycleMessage, transition.lifecycle_version, 'vip'), duplicateIntent = ledger.enqueue(lifecycleMessage, transition.lifecycle_version, 'vip');
assert.equal(intent.idempotency_key, duplicateIntent.idempotency_key); assert.equal(ledger.snapshot().length, 1);
const retry = ledger.recordFailure(intent.idempotency_key, 'timeout', '2025-01-01T12:00:00.000Z'); assert.equal(retry.status, 'RETRY_PENDING'); assert.ok(retry.next_attempt_at);
const sent = ledger.recordSuccess(intent.idempotency_key); assert.equal(sent.status, 'SENT'); assert.equal(ledger.recordFailure(intent.idempotency_key, 'timeout', at).status, 'SENT');
assert.equal(telegramLifecycleKey(publicSignalReference(base.signal_id), lifecycleMessage.type, transition.lifecycle_version, 'vip'), intent.idempotency_key);
assert.equal(publicationAllowed({ research: true, shadow: true }), false); assert.equal(publicationAllowed({ publicationAllowed: true }), true);

const scanner = readFileSync('supabase/functions/market-scanner/index.ts', 'utf8');
const outcomes = readFileSync('supabase/functions/evaluate-signal-outcomes/index.ts', 'utf8');
const router = readFileSync('supabase/functions/_shared/telegram-router.ts', 'utf8');
const preparedMigration = readFileSync('supabase/migrations/prepared/20260721000000_phase3_paper_intent_idempotency.sql', 'utf8');
assert.match(scanner, /paper_execution_intents[\s\S]*\.eq\("signal_id", signalId\)[\s\S]*if \(existing\?\.id\) return/, 'paper intent creation suppresses duplicate signal intents');
assert.match(scanner, /if \(!evaluation\.publishable\) continue;/, 'research strategies remain publication blocked');
assert.match(outcomes, /truthTimestamp[\s\S]*from\("signals"\)\.update[\s\S]*from\("signal_updates"\)\.insert[\s\S]*await sendOutcomeNotification/, 'signal truth persists before Telegram delivery');
assert.match(outcomes, /event_id: `\$\{sig\.id\}:\$\{newStatus\}`/); assert.match(outcomes, /dedupe: true/);
assert.match(router, /\.eq\("event_id", event\.event_id\)/); assert.match(router, /\.eq\("signal_id", event\.signal_id\)/);
assert.match(preparedMigration, /duplicate paper intents exist for signal_id \+ mode_slug/); assert.match(preparedMigration, /unique index[\s\S]*\(signal_id, mode_slug\)/);
assert.match(readFileSync('src/pages/admin/Performance.tsx', 'utf8'), /signal_analytics_view/);

console.log('Phase 3 paper lifecycle and Telegram tests passed');
