# Strategy coverage — 13 November 2026

Current code is in PR #271, not deployed to production. The original Gold releases remain in the exact signal/demo activation bundle. Eight configurations have positive costed account outcomes in two separate complete canonical scanner/arbitration/account replays. These are forward-demo approvals, not live-account approval or a guaranteed monthly return.

| Market | Strategy | Frame | Allowed symbols |
| --- | --- | --- | --- |
| Crypto | Trend pullback, 1.5 ATR / 5R | 4h | BTC, ETH, SOL, BNB, XRP, ADA, DOGE, LINK, AVAX, LTC (USDT perpetuals) |
| Crypto | Trend pullback, 2 ATR / 3R, 72-bar holding limit | 4h | Same ten native perpetuals |
| Gold | Momentum, 2 ATR / 5R | 15m | XAUUSD |
| Gold | Momentum, 2 ATR / 5R | 1h | XAUUSD |
| Gold | Range re-entry, 3 ATR / 5R | 15m | XAUUSD |
| Forex | Range re-entry, 2 ATR / 5R | 1h | USDJPY |
| Forex | Liquidity sweep and retest, 2 ATR / 5R, 72-bar limit | 1h | USDJPY |
| Forex | Compression breakout, 2 ATR / 3R, 12-bar limit | 15m | USDJPY |

The two crypto pullbacks are configurations of one opportunity family; they must not be sold as two independent market regimes. Additional native EURUSD/GBPUSD swing entries, a crypto channel breakout and crypto RSI swing are registered for research and not included merely because an initial screen passed. Crypto scalp and the remaining Forex-pair coverage are still being improved. No blanket all-regime coverage claim is supported.

## Automatic routing

Fresh closed candles drive named entries. Conditional watches confirm automatically when their original market rule is fulfilled. No person must approve each trade. The customer/account chooses exact strategy IDs, allowed canonical assets and risk. Capital-aware sizing, provider placement and existing position management retain the selected fixed target and holding contract; demo release authority cannot authorize live money.

Batch arbitration selects the higher-ranked eligible direction per symbol, allows compatible scalp/intraday/swing tracks, and ranks winners across different symbols. Equal opposing directional scores abstain. A stale or geometrically invalid opposing idea cannot veto a fresh valid winner. Atomic admission and account risk still resolve existing position conflicts and capacity. The batch does not impose one global winner for the entire universe.

## Evidence and remaining work

`../research/launch-20261113/positive-canonical-reviews.json` contains exact complete-period metrics and report/source hashes. New approved reports are preserved as compressed JSON under `canonical/`; tests verify their hashes and metrics against server-owned activation reviews. Early USDJPY scalp evidence includes March–May after the original positive April–May run closed nine trades. That extension is disclosed as retrospective sampling, not a new holdout.

Scalp and swing are screened independently, including individual customer-selected assets. An expanded scalp search covers momentum, pullbacks, compression/channel breakouts, sweeps, range re-entry, RSI, Bollinger, failed breaks and London range opportunities; native crypto also tests VWAP reclaim. The next crypto scalp screen adds explicit closed-candle ATR/price floors, preserving fees, spread, slippage, leverage and holding rules. Screens do not auto-promote.

Supabase activation, applying migrations/deploying functions and connecting provider demos and Telegram are operational integration steps. No broker account or channel was connected by this change. Activate/deploy this branch for controlled demo integration testing of the approved bundle; paid live execution still needs actual provider verification. Automatic closure of all owned positions at subscription expiry remains separate work; expiry currently blocks new entries.
