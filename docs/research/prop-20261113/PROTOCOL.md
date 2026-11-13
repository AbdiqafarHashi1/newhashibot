# Prop mode protocol — 13 November 2026

## Declared campaign

- Reuse the seven exact Forex/Gold strategies in the reviewed launch bundle. Run them together through the existing canonical scanner, conditional confirmation, arbitration and lifecycle. No shuffled or fabricated returns, extra strategy search, or crypto venue substitution.
- Quote source: existing hash-checked Exness native bid/ask archives, January–August 2025. January–February supply warmup. Simulated account observation window: 1 March–1 September 2025 (end exclusive). This is a retrospective campaign on a selected strategy bundle, not a new untouched holdout.
- Program: FTMO 2-Step Swing. Challenge target 10%, verification target 5%, four distinct entry days in each evaluation phase, 5% daily loss amount based on original capital below midnight Prague balance, 10% static original-capital overall loss floor. Swing news/weekend permissions are explicit. Original program pages were checked on 13 November 2026.
- Compare the full seven-strategy account selection with an exploratory intraday selection (Gold 15m momentum, USDJPY 15m compression breakout, GBPUSD 15m RSI pullback). The global scanner/arbitration stream remains the same; only the customer account allowlist changes. This is a retrospective comparator, not a new untouched holdout.
- Account capitals: USD 10,000 and USD 100,000. Twelve weekly starts per arm, from 1 March through 17 May 2025. Overlapping starts are correlated scenarios, never independent probabilities or separate market samples.
- Challenge risk arms: 0.25%, 0.40%, 0.50% maximum per trade. Funded risk: 0.25%. Separate already-funded cohorts begin at their declared start to measure 30/60/90/180-day survival without conflating survival with passing the challenge.
- Compare two and three maximum concurrent positions. Both retain the same 1.5% maximum portfolio risk, one position per symbol, per-position leverage ceiling five, capital/lot/margin checks, internal 4% daily and 8% total conservative high-water controls. Existing buyer defaults stay at two positions; three requires explicit account configuration.
- Native observed spreads are retained. Stress multiplies modeled commissions, slippage and carry by 1.5. Baseline multiplier one. No claim that historical FTMO commissions, contracts, swaps or fills were observed.
- Each phase passes only when net realized balance meets target, all positions are closed and genuine entry-day requirements are met. Liquidation uses contemporaneous bid/ask and costs. A separate capital reset and assumed 24-hour administrative handoff precede the next phase. Signals during handoff are missed rather than replayed.
- Process conservative intrabar equity and adverse gaps before authorizing subsequent orders. Failed accounts stop, unfinished phases remain unfinished, insufficient horizons are censored. Keep all cohorts and cost arms. Idle funded accounts are identified separately from trading funded accounts.
- No withdrawals/payout cycles are simulated. Surviving a horizon is not a payout record. No account, entitlement, Telegram channel, schedule or provider order is activated by research.

## Implementation decisions

`HistoricalAccountLedger` has an opt-in Prop context projection matching the buyer runtime's conservative high-water calculations. Its default Personal-account behavior is unchanged. A diagnostic caught a daily reset defect: forcing the original-capital floor into each day could turn cumulative sub-limit losses into a permanent daily lock. Buyer and historical contexts now start each day from its actual midnight balance/peak and divide the daily allowance by initial Prop capital; overall high-water drawdown is preserved. The official firm observer separately checks the static FTMO limits.

Prop Brain 1.1.0 reduces requested risk when margin cannot support the full size. It uses observed MT5 contract/tick/currency values and preserves a 5% margin reserve. Final lot, margin and risk validation remains authoritative; no minimum lot or leverage is increased to force participation. Only an approved matching FTMO Swing profile can override generic news/weekend defaults; custom/unknown programs retain their existing restrictions.

Buyer setup records Challenge, Verification and Funded as distinct account setups. Funded drafts select the funded policy before Brain assignment. Phase configuration may affect only a fresh, unconnected, unassigned draft; compare-and-set guards and idempotency prevent changing an active account into another phase or resetting its observed capital. Existing accounts, protective monitoring and credentials remain separate. A real firm's new account is connected separately after phase review.

## Sources

- https://ftmo.com/en/trading-objectives/
- https://ftmo.com/en/faq/ftmo-swing-account-type/
- https://ftmo.com/en/faq/which-instruments-can-i-trade-and-what-strategies-am-i-allowed-to-use/
- https://ftmo.com/faq/how-many-accounts-can-i-have/

FTMO permits algorithmic strategies subject to its terms. Its current general allocation limit is USD 400,000 per trader or strategy before scaling; identical or substantially similar third-party-source trading across accounts is included. Do not market unlimited replicated FTMO capacity or firm-approved challenge passing. Distinct strategy IDs alone do not establish substantively different trading.

## Reproduction and budget

Use `scripts/research/run-frequency-audit.ts` once for the combined seven-strategy stream, then `scripts/research/launch/run-prop-campaign.ts` for independent account Brains. Warm archives and the canonical stream are reused. All computation and verification in this continuation run locally. Publish the result and code in one commit with `[skip ci]`; do not dispatch broad Actions research campaigns. A skipped remote check must never be described as passing.
