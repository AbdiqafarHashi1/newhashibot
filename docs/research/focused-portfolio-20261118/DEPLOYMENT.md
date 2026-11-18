# Personal and signal deployment — 18 November 2026

The previous count-based 16-engine Personal / 14-engine VIP defaults are replaced by product-specific selection. Original releases and historical reports remain intact; this change does not turn a sizing replay into a new native provider backtest. EXPANSION.md and expansion-results.json.gz preserve all earlier configurations, risk scenarios and failures.

| Product | Current default |
|---|---|
| Crypto Personal | `crypto.launch-trend-pullback-48-1.5-5` across its ten released symbols |
| Forex/Gold Personal | `gold.native-momentum-15-48-2-5`, `gold.native-band-reentry-15-48-3-5`, `forex.native-squeeze-15-48-2-3-usdjpy-h12`, `gold.rsi-trailing-15-48-1.5-5-h96` |
| VIP Crypto | Primary trend engine, `crypto.launch-trend-pullback-48-2-3-h72`, `crypto.complementary-ema-pullback`, `crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006` |
| VIP Forex/Gold | Same four sources as Forex/Gold Personal |
| Prop | Existing eight Forex/Gold defaults and existing Challenge/Funded risk rules |

Gold RSI Personal/VIP entries additionally require the original setup's recorded relative volume >= 1, observed no later than entry. Missing or future evidence fails admission. The loader reads the persisted conditional setup linked by the canonical signal, not a client-supplied volume. Existing releases and evaluator parameters are not rewritten to claim that filter was in the original backtest. Prop default exclusions are unchanged. All earlier reviewed engines remain available for explicit Admin comparisons; retired engines require explicit scanner enablement and can never bypass the VIP allowlist.

The scanner's default union is **13 engines**, serving different consumers. Crypto RSI reversal, DOGE VWAP and Gold compression are disabled by the new activation function. Scanner arbitration and confirmation remain in place; account selection and one-position-per-symbol still govern execution independently. Previously delivered conditional watches retain their closing/management updates after a strategy is retired; a prior durable Telegram delivery is required. New watches still use the current allowlist. No artificial daily signal quota is introduced. This preserves Prop's broader scope without sending every scanner engine to every subscriber.

## Admin risk profiles

| Profile | Stop-risk / entry | Portfolio / shared-factor risk | Daily / peak entry lock | Entry margin budget |
|---|---:|---:|---:|---:|
| Standard | Existing dynamic House-Money | Existing 6% / 3% | Existing 4% / 18% | Existing provider limits |
| Growth 2 | 2% | 8% / 6% | 8% / 40% | 50% of fresh equity |
| Aggressive 5 | 5% | 15% / 10% | 15% / 60% | 50% of fresh equity |

Growth and Aggressive are selectable **Personal demo/testnet** profiles, not automatic live customer changes. They use fresh account facts (<=60 seconds), preserve durable daily/peak locks, and apply 0.75x weekend crypto risk. All core crypto symbols are eligible for these Personal profiles at weekends; Forex/Metals entry restrictions remain. Default leverage ceilings are 15x Crypto / 100x MT5; actual broker/exchange limits and available margin can reduce or reject a position. Leverage changes buying power, not stop-risk arithmetic. Existing live authorization and provider restrictions remain in place. Selecting a profile does not start execution.

Admin: open account operations, apply the default tier strategy preset, then select **Growth 2** or **Aggressive 5** in account execution limits and save. This requires Admin authority, records the account configuration, pauses entries and retains existing position monitoring. Restart through the existing demo account controls after checking the saved limits. Customer views remain read-only and show the existing persisted equity phase. Stricter explicit account limits continue to bind. Old peak/daily locks are not cleared by changing risk profiles.

On migration, exact broad Personal demo/testnet selections are narrowed to the new defaults with an audit event and entries disabled; custom selections and Prop assignments are preserved. Risk is not raised automatically. New profile persistence is scoped to the assigned account and cannot grant 5% sizing to Prop or live accounts. Legacy Python's Prop breaker remains 4%; Personal growth uses the canonical TypeScript sandbox authorization path.

## Replay results and limits

The wider four-engine Crypto basket at 2% returned +6.81% in the 62-day 2025 window but -1.66% after extra costs. Personal therefore defaults to the primary trend engine, whose same window returned +16.46% (+11.46% with extra costs), and whose 46-day 2026 replay returned +33.58% (+29.39% with extra costs). The 2026 primary-engine realized drawdown was 20.74%, so these are materially higher-risk results than the earlier focused pairing. At 5%, primary-engine returns were +47.42% / +79.35%, with 24.20% / 34.14% realized DD. No risk setting improves every interval: the 2025 primary engine returned +19.33% at 1% sizing, higher than its +16.46% at 2% because admission changed.

Forex/Gold's three covered 2025 engines returned +59.47% at 2% over 92 days, realized DD 15.27%, extra-cost return +32.86%. Filtered Gold's separate 119-day 2026 window returned +28.66%, DD 8.44%, extra-cost return +21.46%. These are separate accounts/periods, not one combined track record. Only one of the four Forex/Gold defaults has source coverage in the later Gold window. Forex support in the default lineup is USDJPY; this study does not establish a new profitable GBPUSD or EURUSD configuration.

All figures are interval realized-close returns on reused research history, not monthly forecasts or fresh holdouts. The roster was selected after inspecting these histories. Floating/intratrade loss, venue liquidation and future execution are not proven. The leverage study includes a spot-reference ETH source; it is hypothetical financing, not validated perpetual fills. Saved source account admissions limit participation; full scanner/Telegram frequency cannot be inferred. Extra costs deduct 0.10R per closed trade. Subscriber manual 1.5R breakeven guidance was not replayed; scenarios retain source exits. Prop passing evidence has not improved in this study.

## Activation and verification

Follow `docs/launch/CONNECTED_DEMO_RUNBOOK.md`: push the new migration, deploy market-scanner, conditional-watch, phase-h-authority, evaluate-signal-outcomes, telegram-orchestrator and the provider workers used by the deployment. The migration/activation function installs the 13-engine union; the old Admin action is retained as an alias to the new function. No hosted activation or live broker test occurred while Supabase was paused.

Reproduce expansion: `node --import tsx scripts/research/focused-portfolio/expansion.ts`. Run only the targeted tests listed in the PR. The compressed result includes source report hashes and research-code hashes, complete single-engine rows, old subscriber-risk sensitivities, the new lineup comparison, and the selected Crypto core.
