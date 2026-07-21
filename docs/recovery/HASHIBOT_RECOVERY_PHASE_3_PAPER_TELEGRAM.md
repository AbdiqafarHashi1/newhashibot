# HashiBot Recovery Phase 3 — Deterministic Paper Lifecycle and Professional Telegram

## Status and boundaries

Implemented in root-owned shared modules and the existing root scanner/outcome/Telegram path. No V2 runtime import, deployment, SQL execution, migration, cron change, exchange execution change, customer-access change, subscription change, new Telegram destination, or research-strategy promotion occurred.

## V2 references translated

- `v2/services/signal-mode/index.ts`
- `v2/packages/telegram-platform/index.ts`
- `v2/services/crypto-certification/index.ts`
- `v2/tests/execution/crypto-certification.test.ts`
- `v2/tests/signal-mode/forex-signal-mode.test.ts`
- `v2/tests/telegram/telegram-platform.test.ts`
- `v2/tests/execution/trade-truth-store.test.ts`
- `v2/docs/IMMUTABLE_SIGNAL.md`, `STATE_MACHINES.md`, and `PROFESSIONAL_TELEGRAM_PHASE3.md`

The implementation translates deterministic identity, lifecycle, paper outcome, lifecycle-version delivery keys, retry/dead-letter concepts, and professional templates. It does not import these files or reproduce V2 tables/routes.

## Root files changed

- `supabase/functions/_shared/paper-trade-lifecycle.ts` — canonical paper contract, matrix, evaluator, persistence vocabulary adapter and certification.
- `supabase/functions/_shared/professional-telegram.ts` — message types, safe formatter, public references, lifecycle idempotency keys and retry ledger.
- `supabase/functions/market-scanner/index.ts` — idempotent paper-intent lookup before insert, stable Telegram references and router dedupe.
- `supabase/functions/evaluate-signal-outcomes/index.ts` — professional lifecycle messages, truth-before-Telegram ordering, paper-intent status synchronization and response diagnostics.
- `supabase/migrations/prepared/20260721000000_phase3_paper_intent_idempotency.sql` — unexecuted preflight plus partial unique index for concurrency-safe signal/mode intent identity.
- `tests/runtime/paperTelegramPhase3.test.ts` — Phase 3 characterization and deterministic lifecycle/Telegram coverage.
- `package.json` — `npm run test:paper-telegram`.
- this document.

## Existing root behavior characterized

The scanner creates signals first and optionally inserts `paper_execution_intents`. The table uses `direction`, `entry_price`, `stop_loss`, `tp1`, `tp2`, non-null `status`, `block_reason`, and timestamps. Before this phase, creation used `simulated`/`blocked`, did not look up an existing signal/mode intent, and no executable writer advanced paper intents. Signal outcomes were evaluated separately in `evaluate-signal-outcomes`; Forex used ordered candle highs/lows with stop-first ambiguity, while Crypto used latest price. Telegram initial and outcome delivery already targeted VIP, used `telegram_deliveries` duplicate queries, and retained root feature flags/destination IDs. Outcome Telegram was attempted before the status/update write.

Phase 3 keeps these database columns and signal states. It adds a pre-insert signal/mode lookup, synchronizes existing intent status after persisted signal truth, moves outcome Telegram after signal/update persistence, uses stable lifecycle event IDs with router dedupe, and never lets Telegram failure roll back truth.

## Canonical paper contract

`PaperTrade` uses `side` in the domain and explicitly adapts it to the existing database `direction` column. It includes paper/signal/strategy identities, strategy version, market/provider/symbol/timeframe, entry range/effective entry, stop, TP1/TP2/later targets, RR, normalized size, open/close/expiry times, non-null lifecycle status, closure reason, realized R, MFE/MAE, latest evaluated candle, evidence, lifecycle version, transition keys and creation idempotency key.

## Transition matrix

| From | Allowed next states |
|---|---|
| `PENDING_ENTRY` | `OPEN`, `EXPIRED`, `CANCELLED` |
| `OPEN` | `PROTECTED`, `TP1_HIT`, `TP2_HIT`, `STOPPED`, `EXPIRED`, `CANCELLED` |
| `PROTECTED` | `TP1_HIT`, `TP2_HIT`, `STOPPED`, `EXPIRED`, `CANCELLED` |
| `TP1_HIT` | `BREAK_EVEN`, `TP2_HIT`, `STOPPED`, `EXPIRED`, `CANCELLED` |
| `BREAK_EVEN` | `TP2_HIT`, `STOPPED`, `EXPIRED`, `CANCELLED` |
| `TP2_HIT`, `STOPPED`, `EXPIRED`, `CANCELLED` | `CLOSED` |
| `CLOSED` | none |

Every accepted transition increments `lifecycle_version` and appends timestamped, reasoned, candle-linked evidence plus a deterministic key. Invalid transitions do not mutate state. Terminal events are followed by exactly one `CLOSED` event, and replayed candles cannot regress or duplicate a closed trade.

## Candle and ambiguity policy

The evaluator sorts candles chronologically, validates OHLC, requires closed candles, rejects future candles, detects duplicates/gaps, and skips every candle at or before `latest_evaluated_candle`. It supports long/short entry zones, effective entry, ATR-independent price levels, expiry, MFE/MAE, and Crypto/Forex/JPY/Gold precision.

OHLC cannot prove intrabar order. If a candle touches stop and any target, the conservative rule is **stop wins**. This is recorded as `conservative_ambiguity: true`. A direct TP2 without an earlier observable TP1 is supported and closes at TP2. TP1 produces `TP1_HIT` followed by `BREAK_EVEN`; a later entry-price stop realizes `0R`. Expiry produces `EXPIRED` then `CLOSED` with `0R`.

## Persisted vocabulary

The domain never writes its uppercase states directly. The adapter maps them to existing paper-intent vocabulary:

- pending → `simulated`
- open/protected/break-even → `active`
- TP1 → `tp1_hit`
- TP2/closed → `completed`
- stopped → `stopped`
- expired → `expired`
- cancelled → `cancelled`

The persisted payload uses `direction`, never a nonexistent `side` column, and always supplies non-null `status`. The outcome writer updates only existing columns. No conflict target or check constraint was invented, and no exchange status vocabulary was touched.

## Idempotency boundaries

- Creation: stable domain creation key plus scanner lookup on existing `signal_id` + `mode_slug` before insert. A prepared, unexecuted partial unique index supplies the database-level concurrency boundary after duplicate preflight and explicit approval.
- Transitions: trade/state/version/candle key, explicit matrix, stored transition-key set and latest-candle guard.
- Closure: terminal-to-closed matrix and closed state with no outgoing transitions.
- Signal outcomes: existing `signal_updates(signal_id,new_status)` lookup suppresses replay and is counted diagnostically.
- Telegram: `signal reference + message type + lifecycle version + channel`; root database checks continue to use signal/event/type/channel sent rows.
- Retry: the root-owned ledger preserves one intent, applies bounded exponential retry, classifies permanent errors, and never retries an already sent intent.

The prepared migration was **not executed**. Until it is reviewed and applied, sequential retries are idempotent but simultaneous scanner invocations can still race between lookup and insert.

## Professional Telegram contract and routing

Supported types are `NEW_SIGNAL`, `ENTRY_TRIGGERED`, `TP1_HIT`, `BREAK_EVEN_SET`, `TP2_HIT`, `STOP_HIT`, `SIGNAL_EXPIRED`, `SIGNAL_CANCELLED`, `TRADE_CLOSED`, and `OPERATIONAL_WARNING`. Messages support market, symbol, side, strategy/version, timeframe, grade/confidence, entry, stop, targets, RR, expiry, Forex session, concise evidence, event/result/closure, a disclaimer and a hashed stable reference. Internal database IDs and credential-like text are not rendered.

Existing initial message layouts remain in place but now include the stable public reference and use router dedupe. Lifecycle messages use the professional formatter. Signal/lifecycle messages route only to existing VIP destinations; warnings route to Admin. Free rules, VIP IDs, execution-buyer behavior and customer permissions are unchanged. Research/shadow publication remains blocked before scanner `allEvals`.

Signal status and `signal_updates` are persisted before lifecycle Telegram. A Telegram skip/failure is diagnostic only and cannot undo signal or paper truth. After a successful send, `signal_updates.telegram_sent` is updated.

## Certification and diagnostics

Runtime certification checks non-null/valid status, stop/targets, unique trade and lifecycle identity, matrix-valid evidence, no future latest candle, complete closure/reason/R, finite realized R, unique Telegram keys and complete transition evidence. It certifies deterministic runtime correctness only, never profitability.

The outcome response now reports paper intents updated, lifecycle events, invalid transitions, duplicate events suppressed, Telegram duplicates suppressed, sends/skips/failures, and existing signal/candle/provider counters. Pure evaluator diagnostics count processed/skipped, duplicate, future, unclosed and malformed candles plus gaps and invalid/duplicate transitions. No reporting UI or permanent high-volume table was added.

## Tests and limitations

`npm run test:paper-telegram` covers creation, long/short paths, no entry, expiry, cancellation, stop, TP1→BE, BE stop, TP1→TP2, direct TP2, same-candle ambiguity, malformed/future/unclosed/out-of-order/duplicate candles, replay, invalid transitions, persisted status/side mapping, realized R, MFE/MAE, market precision, initial/lifecycle messages, public references, channel routing, duplicate/retry behavior, research blocking, certification pass/fail, database-writer source characterization, truth-before-Telegram, router duplicate queries and reporting reads.

Known limitations:

- Rich domain evidence remains in memory because the existing paper-intent table has no evidence/version/MFE/MAE columns; only safe existing fields are synchronized. A future durable rollout requires another reviewed migration and is not performed here.
- The prepared uniqueness migration is unapplied, so concurrency-safe database creation is not production-active yet.
- Crypto root outcome evaluation remains latest-price based; the new closed-candle evaluator is available for a later explicitly approved writer consolidation.
- The pure retry ledger establishes semantics, while production retries continue through existing `telegram_deliveries`/router behavior; no new worker or bot was created.
- Break-even is represented in domain evidence, while the existing signal status vocabulary has no dedicated persisted break-even state.
- Research strategies remain uncertified and non-publishable.

## Readiness

The deterministic domain, certification boundary and professional Telegram contract are ready for root use and focused tests. Existing signal outcome delivery is safer and paper-intent status now follows persisted signal outcomes. Full durable paper lifecycle certification is **not** complete until a separately reviewed schema migration can retain lifecycle evidence/version/MFE/MAE and the writer is explicitly authorized to use the closed-candle domain evaluator end to end. No research strategy or exchange execution change is authorized by this phase.
