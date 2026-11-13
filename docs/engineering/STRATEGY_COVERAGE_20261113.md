# Strategy coverage — 13 November 2026

Current code is in PR #271, not deployed to production. The original Gold releases remain in the exact signal/demo activation bundle. Twelve configurations have positive costed account outcomes in two separate complete canonical scanner/arbitration/account replays. These are forward-demo approvals, not live-account approval or a guaranteed monthly return.

| Market | Strategy | Frame | Allowed symbols |
| --- | --- | --- | --- |
| Crypto | Trend pullback, 1.5 ATR / 5R | 4h | BTC, ETH, SOL, BNB, XRP, ADA, DOGE, LINK, AVAX, LTC (USDT perpetuals) |
| Crypto | Trend pullback, 2 ATR / 3R, 72-bar holding limit | 4h | Same ten native perpetuals |
| Crypto | RSI pullback, 3 ATR / 3R, 72-bar limit | 4h | Same ten native perpetuals |
| Crypto | Volatility-aware VWAP reclaim, 2 ATR / 1.5R, 12-bar limit | 5m | DOGEUSDT perpetual |
| Crypto | Volatility-aware range reversal, 3 ATR / 1.5R, 24-bar limit | 15m | LTCUSDT perpetual |
| Gold | Momentum, 2 ATR / 5R | 15m | XAUUSD |
| Gold | Momentum, 2 ATR / 5R | 1h | XAUUSD |
| Gold | Range re-entry, 3 ATR / 5R | 15m | XAUUSD |
| Forex | Range re-entry, 2 ATR / 5R | 1h | USDJPY |
| Forex | Liquidity sweep and retest, 2 ATR / 5R, 72-bar limit | 1h | USDJPY |
| Forex | Compression breakout, 2 ATR / 3R, 12-bar limit | 15m | USDJPY |
| Forex | Volatility-aware RSI pullback, 2 ATR / 5R, 24-bar limit | 15m | GBPUSD |

The two crypto pullbacks are configurations of one opportunity family; they must not be sold as two independent market regimes. Additional native EURUSD/GBPUSD swing entries, a crypto channel breakout are registered for research and not included merely because an initial screen passed. Six cost-aware crypto scalp configurations completed full native replay. DOGE VWAP reclaim passed both complete costed periods and entered the demo bundle. Four configurations with negative canonical account results were removed from the customer strategy catalogue; LTC range reversal passed separate April–May and June–August 2025 canonical periods with 23 and 25 closed trades. A further positive August–October 2026 observation closed nine trades and is retained as supporting evidence, not a minimum-sample qualifying period. GBPUSD RSI pullback also passed both native canonical periods; unsuccessful exact cost-aware EURUSD/AUDUSD/GBPUSD range configurations were removed from the customer catalogue. Additional pair coverage remains research. No blanket all-regime coverage claim is supported.

## Automatic routing

Fresh closed candles drive named entries. Conditional watches confirm automatically when their original market rule is fulfilled. No person must approve each trade. The customer/account chooses exact strategy IDs, allowed canonical assets and risk. Capital-aware sizing, provider placement and existing position management retain the selected fixed target and holding contract; demo release authority cannot authorize live money.

Batch arbitration selects the higher-ranked eligible direction per symbol, allows compatible scalp/intraday/swing tracks, and ranks winners across different symbols. Equal opposing directional scores abstain. A stale or geometrically invalid opposing idea cannot veto a fresh valid winner. Activation also disables enabled legacy defaults that have no resolved measured release; valid measured legacy releases remain available. If retirement fails, activation stops before installing anything. Atomic admission and account risk still resolve existing position conflicts and capacity. The batch does not impose one global winner for the entire universe.

## Evidence and remaining work

`../research/launch-20261113/positive-canonical-reviews.json` contains exact complete-period metrics and report/source hashes. New approved reports are preserved as compressed JSON under `canonical/`; tests verify their hashes and metrics against server-owned activation reviews. Early USDJPY scalp evidence includes March–May after the original positive April–May run closed nine trades. That extension is disclosed as retrospective sampling, not a new holdout.

Scalp and swing are screened independently, including individual customer-selected assets. An expanded scalp search covers momentum, pullbacks, compression/channel breakouts, sweeps, range re-entry, RSI, Bollinger, failed breaks and London range opportunities; native crypto also tests VWAP reclaim. The crypto and Forex scalp screens include explicit closed-candle ATR/price floors, preserving fees, spread, slippage, leverage and holding rules. Screens do not auto-promote.

Supabase activation, applying migrations/deploying functions and connecting provider demos and Telegram are operational integration steps. No broker account or channel was connected by this change. Activate/deploy this branch for controlled demo integration testing of the approved bundle; paid live execution still needs actual provider verification. Automatic closure of all owned positions at subscription expiry remains separate work; expiry currently blocks new entries.

## Small-account participation

The frozen USDJPY scalp stream was replayed through independent $500/$1,000/$10,000 accounts at 0.5% and 1% risk. Baseline $10,000 results reproduce exactly. At $500 / 0.5%, the scalp accepted 14 of 17 entries in March–May and all 31 in June–August; the wider hourly sweep accepted none of 16 at the same smaller budget. Quantity floors and risk remain authoritative; onboarding should choose a strategy that fits the account instead of increasing size to force participation. These are costed historical account scenarios, not broker demo fills or promised returns. See the three `capital-scenarios-*.json` reports.
