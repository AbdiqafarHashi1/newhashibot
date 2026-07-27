# Phase 1F exact adoption-boundary audit

## Active ownership map

`scanner → arbitrator → legacy trigger → [disabled certified-plan boundary] → existing provider executor → existing persistence → existing monitor/recovery → Telegram/reporting`.

| Domain | Active entry/submission | Planning or mutation still owned by legacy path | Existing safeguards retained |
|---|---|---|---|
| Binance | `supabase/functions/binance-testnet-execution/index.ts` | leverage/margin calls, precision, quantity, entry and protection payloads | duplicate checks, monitor, recovery and reporting |
| Bybit | `supabase/functions/bybit-demo-execution/index.ts` | V5 order translation, quantity/price formatting and protection | order-link lookup and Bybit-specific monitoring |
| MT5 Personal / Prop | `supabase/functions/mt5-bridge/index.ts` and terminal agent queue | symbol mapping, lots, subtype, fill policy and attached stops | queue acknowledgement, terminal tickets and recovery |

The adoption seam is deliberately not imported by those consumers. Legacy sizing, leverage, entry, SL, TP and precision calculations remain active; in `SHADOW_COMPARE` they become comparison/defense checks rather than certified truth. Executor owns submission, current provider monitor owns observations, the verifier classifies protection, recovery owns ambiguity, and reporting projects events. No second scanner, executor, monitor, or recovery writer was added.

Canonical writers must use `side`, a non-null normalized execution state, separate protection result, deterministic identity keys, and append-only provider facts. Raw provider status is evidence, never canonical state.
