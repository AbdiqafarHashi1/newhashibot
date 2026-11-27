# HashiBot strategy placement decisions

These are explicit default selections and development decisions, not claims of validated future profits. All 16 existing configurations plus five Turbo engines are preserved. No customer account, payment, Telegram destination or live provider was activated.

- **CRYPTO_PERSONAL:** crypto.launch-trend-pullback-48-1.5-5
- **FOREX_GOLD_PERSONAL:** gold.native-momentum-15-48-2-5, gold.native-band-reentry-15-48-3-5, forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, forex.native-band-reentry-60-12-2-5
- **PROP_CHALLENGE:** forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, forex.native-band-reentry-60-12-2-5
- **PROP_FUNDED:** forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, forex.native-band-reentry-60-12-2-5
- **VIP_SIGNALS:** crypto.launch-trend-pullback-48-1.5-5, crypto.launch-trend-pullback-48-2-3-h72, crypto.complementary-ema-pullback, crypto.launch-rsi2-48-3-3-h72, gold.native-momentum-15-48-2-5, gold.native-band-reentry-15-48-3-5, forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, forex.native-band-reentry-60-12-2-5

| Strategy | Decision | Destination | Default for | Reason |
|---|---|---|---|---|
| crypto.launch-trend-pullback-48-1.5-5 | CORE | CRYPTO_PERSONAL_SIGNALS | CRYPTO_PERSONAL, VIP_SIGNALS | Keep primary: positive chronological halves and fresh costed November screen. |
| crypto.launch-trend-pullback-48-2-3-h72 | ALTERNATIVE | CRYPTO_PERSONAL_SIGNALS | VIP_SIGNALS | Compare against the primary; do not assume two correlated variants diversify. |
| crypto.launch-rsi2-48-3-3-h72 | ALTERNATIVE | CRYPTO_PERSONAL_SIGNALS | VIP_SIGNALS | Replace LTC in the optional roster; fresh positive screen with material drawdown. |
| crypto.complementary-ema-pullback | ALTERNATIVE | CRYPTO_PERSONAL_SIGNALS | VIP_SIGNALS | ETH-only Personal option; perpetual execution screen differs from older spot ledger. |
| crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006 | ALTERNATIVE | ADMIN_COMPARISON | Explicit Admin comparison / Turbo demo only | Retain; only two fresh decisions, insufficient evidence for default promotion. |
| crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006 | PAUSED | ADMIN_COMPARISON | Explicit Admin comparison / Turbo demo only | Remove from commercial presets; fresh screen negative. |
| forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008 | CORE | FOREX_PERSONAL_PROP_SIGNALS | FOREX_GOLD_PERSONAL, PROP_CHALLENGE, PROP_FUNDED, VIP_SIGNALS | Curated Forex candidate; fresh FX and firm-rule qualification remain required. |
| forex.native-band-reentry-60-12-2-5 | CORE | FOREX_PERSONAL_PROP_SIGNALS | FOREX_GOLD_PERSONAL, PROP_CHALLENGE, PROP_FUNDED, VIP_SIGNALS | USDJPY H1 reversal; use with GBPUSD under shared account limits. |
| forex.complementary-ema-pullback | ALTERNATIVE | FOREX_PERSONAL | Explicit Admin comparison / Turbo demo only | Actually XAUUSD H1; do not count as independent FX diversification. |
| forex.native-squeeze-15-48-2-3-usdjpy-h12 | ALTERNATIVE | ADMIN_COMPARISON | Explicit Admin comparison / Turbo demo only | Remove from defaults; second chronological half only +0.31R. |
| forex.native-sweep-retest-60-16-2-5-usdjpy-h72 | PAUSED | ADMIN_COMPARISON | Explicit Admin comparison / Turbo demo only | PF 1.09 leaves thin cost headroom; retain baseline rather than sell it. |
| gold.native-momentum-15-48-2-5 | CORE | GOLD_PERSONAL_SIGNALS | FOREX_GOLD_PERSONAL, VIP_SIGNALS | Retain primary Gold trend rule; positive halves and October tick screen. |
| gold.native-band-reentry-15-48-3-5 | CORE | GOLD_PERSONAL_SIGNALS | FOREX_GOLD_PERSONAL, VIP_SIGNALS | Retain complementary reversal rule; October positive before unverified financing. |
| gold.native-momentum-60-24-2-5 | ALTERNATIVE | FOREX_PERSONAL | Explicit Admin comparison / Turbo demo only | Older second half approximately flat; do not promote on aggregate alone. |
| gold.rsi-trailing-15-48-1.5-5-h96 | ALTERNATIVE | FOREX_PERSONAL | Explicit Admin comparison / Turbo demo only | Retain existing source-bound activity guard; exclude from default Prop and signals. |
| gold.frontier-compression-15-24-1.5-5-h96 | PAUSED | ADMIN_COMPARISON | Explicit Admin comparison / Turbo demo only | PF 1.08; replace only if a simpler challenger beats the preserved baseline. |
| gold.turbo-micro-scalper | REBUILD | TURBO_DEMO | Explicit Admin comparison / Turbo demo only | Repair production-cadence execution/entry evidence; no default promotion. |
| gold.turbo-momentum-scalper | REBUILD | TURBO_DEMO | Explicit Admin comparison / Turbo demo only | Challenge restrictive retest entry with simple bounded intraday models. |
| gold.turbo-range-scalper | REBUILD | TURBO_DEMO | Explicit Admin comparison / Turbo demo only | Participation exists; improve reversal classification and payoff. |
| gold.turbo-trend-scalper | REBUILD | TURBO_DEMO | Explicit Admin comparison / Turbo demo only | Isolate native exits from shared equity-target clipping; preserve scalp horizon. |
| gold.turbo-price-action-basket | REBUILD | TURBO_DEMO | Explicit Admin comparison / Turbo demo only | Keep accounting/protections; qualify entry models separately before combining. |

Existing saved account choices remain untouched. Admin must explicitly apply the updated preset to a demo/testnet account; that action still follows the existing pause, ownership and entitlement flow. Code selection is separate from deployment and customer-account activation.

Customer holding descriptions now acknowledge overnight/multi-day exposure. The older 1–3-day wording understated the longest Crypto rules.
