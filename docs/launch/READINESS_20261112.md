# HashiBot launch evidence — 12 November 2026

This is the engineering handoff for PR #271, not a declaration that the production service has been activated.

## Delivered in this branch

- Real scanner discovery → entry decision → conditional watcher → arbitration → immutable lifecycle integration. Fixed duplicate single-target prices being rejected by arbitration. Research authorizations remain separate from customer execution permissions.
- Five native USD-M 4h configurations implemented: squeeze 24/3 ATR/1.5R; squeeze 24/1.5 ATR/3R; EMA cross 24/1.5 ATR/3R; Donchian 48/1.5 ATR/3R; trend pullback 48/1.5 ATR/5R. Registered in the scanner catalogue; default research status, rather than forged promotion.
- Development grid: 729 configurations across nine strategy families. Fifty-four validation candidates, fourteen later-period candidates, five positive equity/PF>1 configurations in both later periods. These are fixed-rule account screens. They do not establish profitability of the arbitrated production portfolio.
- Actual scanner/Brain seven-day crypto replay persisted under `docs/research/launch-20261112/canonical-week*`. Full-period individual and combined scanner replays are separate CI jobs. A successful job means the simulation completed, not that its trading result passed.
- Six native Forex/Gold markets acquired from Exness public Raw Spread tick archives, Jan–Aug 2025. Both bid and ask preserved; source/decoded hashes recorded; no synthetic candles. Reference broker data is not JustMarkets execution history.
- Native bid/ask adapter runs all six existing production Forex/Gold strategy definitions through the actual scanner/Brain and lot/commission ledger. First two-day reference replay is persisted under `broker-native-two-days*`; it is a short integration experiment, not a qualification period. Longer independent weeks are queued in the broker workflow.
- MT5 research identities use MT5_PERSONAL, contract sizes/lot steps and quote-currency conversion. Broker leverage is separated from the account policy's maximum effective leverage. Commission and carry are explicit scenario assumptions.
- Exact per-account strategy selection in account detail and policy controls; preserves risk policy and other customers' selections. Research choices restricted to demo/testnet. Selection does not bypass release/entitlement/provider authorization.
- Presentation-only admin workspace entry without fictional customer accounts or yellow preview banner. Real backend authorization still controls saves, credentials and execution.
- Admin Whop and M-Pesa Buy Goods/Till credential import from JSON or .env, provider field allowlist, confirmed-save clearing and failure-safe retention.
- Rich public Home, Features and Signals pages restored. Results present measured historical studies and monthly breakdowns. Broken simulator calls now lead to the actual studies. No fabricated customer profitability or prop pass claims.
- FTMO daily cash allowance corrected to initial account capital, including floating equity in funded assessment. Reviewed golden fixtures updated for the deliberate rule/version change; other programs retain their own calculations.
- Launch offer, two-day content/distribution plan and funnel metrics in `MARKETING_20261112.md`. No campaign messages sent.

## Strategy coverage versus evidence

| Market | Registered strategy families | Evidence status |
| --- | --- | --- |
| Crypto | MicroScalper, QuickScalp, CompressionBreakout, SwingContinuation | Existing production implementations; current account qualification must follow actual scanner replay, not prior claims |
| Crypto | Two squeezes, EMA cross, Donchian, trend pullback | Five positive independent screens; real scanner integration tested; full portfolio qualification not granted |
| Forex | MicroScalper, SwingContinuation, LondonBreakout, NewYorkContinuation, TrendPullback | Native bid/ask integration completed; longer account evidence still required |
| Gold | VolatilityBreakout | Native bid/ask runner includes Gold; short reference period produced no admitted Gold signals |
| Range/chop and exceptional markets | Other research catalogue definitions | No claim of an approved strategy in every condition; no-trade remains a valid decision |

## Production activation still outstanding

Supabase project `uqiwbzfcntlcyyewawfc` was checked through the connected project API and is **INACTIVE**. This branch has not been merged into main or published at hashibot.app. The admin workspace shell is not an activated database or a provider connection.

The paid customer journey still needs actual activation evidence: deploy migrations/functions; create the real admin; enter payment and Telegram settings; verify payment → entitlement → channel membership → renewal/expiry; verify scanner delivery and lifecycle updates; connect each authorized demo/testnet provider; observe order acknowledgement, protection, reconciliation and expiry behavior. Real provider demo credentials have not been supplied in this task.

A 100-cohort empirical challenge → verification → funded survival study is not complete. Unit-tested phase transitions are not historical funded pass rates. Neither five percent every month nor ten-to-fifty percent prop returns have been established. Research selection, leverage, small samples and different broker fills must not be represented as guaranteed results.

Go-ahead currently means internal engineering/research and configuring the launch. It does not mean accepting payment for an already operating signal or automatic execution service.
