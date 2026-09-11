# Professional Prop Product

## 1. Product overview

Prop Operations is now available on the existing `/admin/prop` page. It adds a generic, profile-driven rule engine and an operator workspace without replacing the canonical strategy, risk, capital, execution, or trade-management components. The shipped workflow is a local historical-account workspace; connected and real-prop capabilities remain deliberately gated as described below.

## 2. Actual operator workflow

An operator can create an account, select FTMO 2-Step, FundedNext Stellar Two-Step, or Custom, select a supported account size and mode, select a persisted canonical Backtest run, and run the complete two-step challenge, repeated attempts, or a funded-state replay. Manual PnL is retained only behind an explicit `DEBUG/CUSTOM MANUAL PNL` switch.

## 3. Prop profiles

Profiles are versioned data consumed by the generic engine. FTMO is `PARTIALLY_VERIFIED`; its core numerical challenge limits are repository reference values, while payout timing and account-specific restrictions are explicitly pending. FundedNext is `PENDING_VERIFICATION` and therefore produces an incomplete simulation rather than invented results. Custom is labelled `CUSTOM / USER CONFIGURED`.

## 4. $100K configuration

The reference account is configurable at $100,000. The profile's percentages derive $5,000 daily-loss and $10,000 maximum-loss amounts. Changing account size recomputes monetary limits; supported presets are $5K, $10K, $25K, $50K, $100K, and $200K.

## 5. Challenge engine

The challenge simulator consumes chronological trade evidence, updates balance and daily loss, tracks drawdown and distinct trading days, and returns `PASSED`, `FAILED`, or `INCOMPLETE` with a challenge state and reason codes. Phase 1 and Verification use their own target and minimum-day profile records.

## 6. Funded engine

Funded evaluation is account-specific. Hard loss, operator control, realized objective, and soft-guard conditions are evaluated in safety order. Every result keeps existing-position management enabled and explicitly reports that it does not force-close positions.

## 7. 2% profit policy

`monthlyIncomeObjectivePct`, `softProfitGuardPct`, and `noNewEntriesPct` are configurable HashiBot account-policy values, separate from firm rules. The reference account uses 2.00%, 1.70%, and 2.00% respectively.

## 8. 1.98% behavior

At $1,820 closed profit plus $160 floating profit on $100K with an open position, the account enters `SOFT_PROFIT_GUARD`, returns `REDUCE`, continues management, does not force close, and is not payout-ready. At $2,070 realized with an open position, new entries are blocked and state is `MANAGE_EXISTING_POSITIONS_ONLY`. Flat state requires both zero positions and zero executable pending orders.

## 9. Payout state

Eligibility checks positive closed profit, flat-account truth, profile verification, and the configured waiting date. The calculator separates eligible profit, firm share, trader reward, requested reward, retained buffer, and remaining profit. Its recommendation is explicitly `POLICY_BASED_NOT_STATISTICALLY_CERTIFIED`. Confirmation requires an operator evidence identifier; simulation and virtual MT5 evidence cannot claim a verified real payout.

## 10. Multi-account behavior

Shared signals can be evaluated independently against multiple account snapshots. Each account returns `ALLOW`, `REDUCE`, or `BLOCK`; one account's control does not mutate global scanner state or another account.

## 11. Historical challenge

The canonical Single Strategy Backtest persists its `CanonicalCompletedTradeResult` records and provenance in `backtest_runs`. Prop Operations reads only completed runs containing those records and maps their canonical close time and canonical net PnL into chronological challenge evidence. It does not recalculate outcomes. `RUN FULL CHALLENGE` automatically advances Phase 1 to Verification and exposes the funded entry timeline when both pass.

## 12. Multi-challenge

The product supports rolling, monthly, quarterly, and deterministic seeded-random windows with 10, 25, 50, or 100 attempts. It reports attempt, pass, fail, incomplete, historical pass rate, day statistics, failure categories, window dates, run hash, and worst drawdown. It labels the result `HISTORICAL PASS RATE`.

## 13. Funded survival

The funded replay supports 30, 60, 90, 180, and 365 days. It creates chronological daily snapshots from the post-challenge evidence and reports days survived, breach state/reason, maximum drawdown, safety locks, and payout-ready events. The payout-cycle trace is explicitly simulated; it can never create a verified real payout.

## 14. Virtual MT5

`VIRTUAL_PROP_ON_MT5` reads authenticated `mt5_accounts_safe` rows and maps available balance, equity, positions, pending orders, closed PnL, and floating PnL into a broker-truth snapshot. Heartbeats older than two minutes are `STALE`; disconnected accounts are `OFFLINE`; neither is applied as live truth. The UI labels this mode “Virtual Prop on MT5”; it is never labelled a real prop account. The deployed bridge must populate those truth fields for a live snapshot to be available.

## 15. Real Prop preparation

`REAL_PROP` is selectable only as an activation-locked configuration. Activation requires explicit operator confirmation, a `VERIFIED` profile, and verified automation/platform compatibility. No bundled profile currently satisfies those requirements, so real-prop operation remains disabled rather than silently enabled.

## 16. Account controls

Start, pause new entries, resume, manage only, stop after flat, and emergency stop update `prop_account_configs` and append `prop_audit_events`. Entry restrictions retain management, protection, reconciliation, and recovery semantics. Starting directly from emergency stop is rejected by the transition. The certified MT5 Prop adoption path reads this state before provider submission: blocked states reject entry, and soft-guard state requires the reduced risk to have already been applied by planning.

## 17. Compliance

Profiles carry known compliance categories and explicit automation/VPS/platform eligibility. Unknown critical eligibility blocks real-prop activation. Qualitative firm enforcement and provider order-activity throttling are not yet connected to the Prop Operations workspace.

## 18. Prop Operations UI

The existing Prop page now includes account creation/selection, firm/program, size and mode configuration, canonical run selection, two-step timeline, multi-challenge controls, survival duration, payout-cycle trace, authenticated MT5 selection/freshness, account truth, firm/HashiBot/operator amounts, execution decision, server-persisted controls, and audit history. The pre-existing Bybit Prop panel remains below it and is not relabelled as canonical MT5 or real-prop truth.

## 19. Persistence

The narrow migration creates RLS-protected `prop_account_configs`, append-only `prop_audit_events`, and `prop_simulation_runs`. It reuses `mt5_accounts` and `backtest_runs`; it does not duplicate broker truth or store historical candles. Deployment of the migration is required before server workflows operate outside the repository test environment.

## 20. Test evidence

`tests/prop/professionalPropProduct.test.ts` covers the FTMO $100K derivation, canonical result ingestion, complete Phase 1/Verification/Funded advancement, deterministic 100-attempt windows, 90-day snapshot generation, the 1.98% case, simulated payout trace, independent account routing, controls, virtual-MT5 mapping, locked real-prop activation, persistence call sites, execution gating, and presence of the operator workspace in the real Prop page.

## 21. Unsupported/disabled combinations

- The migration and updated Edge Function must be deployed before server persistence and the MT5 execution gate are active.
- Connected Windows MT5 truth was not available in this Linux environment; live field population and forward validation remain outstanding.
- `REAL_PROP` execution is blocked because current firm rules and automation eligibility are not fully verified.
- Custom attempt counts and custom funded duration entry are not exposed yet; presets cover 10/25/50/100 and 30/60/90/180/365.
- FTMO payout timing remains pending verification, so the engine will not fabricate an FTMO payout-ready date or cycle.
- The MT5 Prop execution gate enforces persisted BLOCK and pre-planned REDUCE decisions; a connected demo forward-validation run is still required.
- No real-money submission, payout request, tax calculation, or forced liquidation was added.

## 22. Exact readiness state

**PRODUCT STATUS: PARTIAL.** Repository workflows now consume persisted canonical results, run the full two-step sequence, provide deterministic window modes and funded durations, persist Prop state, read non-stale MT5 truth, and enforce Prop state at the certified MT5 Prop submission boundary. A product PASS still requires deployment plus authenticated MT5 forward validation, custom attempt/duration inputs, and verified FTMO payout timing. Real Prop remains safely disabled.
