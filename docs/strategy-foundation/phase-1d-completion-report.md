# Phase 1D Completion Report and Phase 1E Handoff

## Delivered

1. Active-root capital, balance, margin, sizing, precision and UI audit.
2. Versioned allocation context and immutable plan contracts.
3. Isolated Binance, Bybit, MT5 Personal and MT5 Prop specifications/calculators.
4. Reproducible risk-to-quantity, notional, leverage and margin calculations.
5. Downward-only provider step/lot rounding with explicit adjustment records.
6. Ordered visible allocation gates and canonical rejection constraints.
7. Deterministic account selection that cannot escape RiskDecision scope.
8. Context/contract/allocation fingerprints and exact immutable risk/strategy references.
9. Real-data-only Capital UI/backend contract.
10. Golden tests for determinism, precision, minima, margin/capital failures, separation, selection, immutability and non-migration.

## Behavioral preservation

No scanner, arbitrator, RiskDecision, Binance, Bybit, MT5, protection, management, Telegram or customer path imports the new engine. Existing execution sizing and operational provider clamps remain unchanged. The plan marks adoption `PENDING_PHASE_1E`.

## Remaining boundaries

- Phase 1C authorizes one account; true multi-account allocation requires an explicitly versioned risk scope and re-evaluation of each account, not silent widening.
- Provider adapters must supply fresh real balances/margin and contract specifications; Phase 1D contains no fabricated defaults or live adapters.
- MT5 tick value must already be expressed in account currency; conversion provenance remains a provider adapter responsibility.
- Margin calculation uses explicit margin rate when supplied, otherwise permitted leverage; venue-side margin checks remain defense-in-depth.
- Open allocation reservation/persistence does not exist yet and must precede concurrent live allocation.
- Crypto inverse/quanto contracts would require a new calculator version; v1 uses explicit linear `contract_multiplier` semantics.

## Phase 1E — Execution Planning and Provider Routing

Phase 1E may consume only an immutable `ALLOCATED` plan. It must:

1. retain the exact allocation, risk and strategy references and IDs;
2. validate that provider truth/specification is still fresh before creating instructions;
3. translate certified quantity and prices into provider-native order instructions without resizing or rounding upward;
4. preserve provider/account/environment and leverage/margin mode;
5. add idempotency, order type, time-in-force, client IDs and routing diagnostics;
6. reject if current provider rules differ from the certified specification fingerprint;
7. keep existing venue execution unchanged until provider-by-provider parity is proven;
8. append submission/fill/protection facts rather than changing certified intent or allocation.

Capital routing optimization, profitability tuning, order placement, protection and live adoption remain outside Phase 1D.

