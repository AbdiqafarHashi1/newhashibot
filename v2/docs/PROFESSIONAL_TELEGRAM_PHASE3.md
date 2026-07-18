# HashiBot V2 Phase 3 — Professional Telegram Certification

Repository-only audit completed on 2026-07-18. No deployment, SQL, cron, Scanner, Strategies, Binance, Bybit, Protection execution, MT5, Forex, Google Cloud, Customer Management, or Runtime changes were performed.

## 1. Telegram Notification Inventory

| Origin | Event | Channel | Template | Why sent | Duplicate/obsolete assessment |
| --- | --- | --- | --- | --- | --- |
| Certified crypto signal flow | `signal.sample` | FREE | `free_sample_signal` | Public preview that demonstrates value without exposing the full plan. | Valid; not duplicated with VIP full signal because the purpose differs. |
| Free content desk | `market.education` | FREE | `free_market_education` | Education, psychology, risk, or structure lesson. | New professional content route; should be scheduled manually or by existing publisher only. |
| Certified trade truth recap | `trade.recap` | FREE | `free_trade_recap` | Verified winning example after the fact. | Must only use verified trade truth; no invented performance. |
| News pipeline | `news.published` | FREE | `news_digest` | Source-attributed market context. | Consolidates news into one formatted route to reduce duplicate headline spam. |
| Market summary publisher | `market.daily_summary` | FREE | `daily_market_summary` | Daily market context and levels. | Valid; should not repeat news digest content. |
| Certified crypto performance | `performance.weekly_summary` | FREE | `weekly_performance_summary` | Weekly verified performance teaser/report. | Valid only when certified stats exist. |
| Certified crypto signal flow | `signal.created` | VIP | `vip_full_signal` | Full trading plan with entry, SL, TP1, TP2, risk, reason, and signal ID. | Replaces terse MVP copy; must include `signal_id`. |
| Certified signal lifecycle | `signal.entry_triggered` | VIP | `entry_triggered` | Original setup reached planned entry area. | Missing before Phase 3; now specified. |
| Execution truth event | `trade.opened` | VIP | `trade_opened` | Position became active. | Valid; references original `signal_id`. |
| Protection truth event | `protection.confirmed` | VIP | `protection_confirmed` | Stop/protection state verified for an active VIP trade. | Missing before Phase 3; now specified for VIP lifecycle. |
| Trade truth event | `trade.tp_hit` | VIP | `tp_hit` | TP1 or TP2 progress update. | Valid; `target` distinguishes TP1 vs TP2 to avoid duplicate templates. |
| Trade truth event | `trade.be_moved` | VIP | `be_moved` | Risk changed to break-even. | Valid; references original `signal_id`. |
| Trade truth event | `trade.trailing_updated` | VIP | `trailing_updated` | Trailing stop changed. | Missing before Phase 3; now specified. |
| Trade truth event | `trade.partial_close` | VIP | `partial_close` | Partial close or scale-out occurred. | Missing before Phase 3; now specified. |
| Trade truth event | `trade.closed` | VIP | `trade_closed` | Final trade closure. | Valid; closes story with result and reason. |
| Trade truth event | `trade.sl_hit` | VIP | `sl_hit` | Trade stopped out. | Valid terminal state; no separate marketing copy. |
| Certified signal flow | `signal.cancelled` | VIP | `signal_cancelled` | Setup invalidated or unfilled. | Missing before Phase 3; now specified. |
| Protection operations | `protection.repaired` | ADMIN_OPS | `protection_repaired` | Operator visibility into repair/recovery. | Operational only; severity threshold remains warning+. |
| Runtime/edge/admin operations | `admin.error` | ADMIN_OPS | `admin_error` | Operator attention required. | Valid; severity threshold remains error+. |
| Provider monitoring | `provider.health_alert` | ADMIN_OPS | `provider_health_alert` | Provider degradation/outage. | Valid; admin only. |
| Queue monitoring | `queue.backlog` | ADMIN_OPS | `queue_backlog_alert` | Delivery/command queue backlog visibility. | Valid; admin only. |
| Billing operations | `payment.approved` | ADMIN_OPS | `payment_approval` | Operator confirmation of customer activation. | Operational audit, not customer marketing. |
| Subscription service | `subscription.expiry` | VIP | `subscription_expiry` | VIP access continuity notice. | Valid but should be rate-limited by existing preference/business rules. |

## 2. Channel Purpose Report

### ADMIN / OPS
Only operational information: runtime, scanner/provider health, queue health, execution failures, protection failures, recovery, system alerts, deployment confirmations, and certification reports. Customer marketing is prohibited.

### FREE
Commercial education and trust-building: market education, selected previews, verified winning recaps, market summaries, risk management, psychology, source-attributed crypto news, and restrained upgrade reasons. Spam and repetitive promotions are prohibited.

### VIP
Professional trading desk: full signals, entry, stop loss, TP1, TP2, risk, trade updates, break-even, trailing stop, partial close, closed/stopped/cancelled states, performance reports, daily/weekly recaps, and market analysis.

## 3. Formatting Standards

- Title: one icon plus uppercase title on the first line.
- Spacing: blank line between title, sections, and footer.
- Time: UTC using `YYYY-MM-DD HH:mm UTC`.
- Price: symbol-aware precision from certified crypto truth; do not round manually in Telegram code when a certified formatted price exists.
- Percent: two decimals for win rate, drawdown, and percentage performance.
- Risk: account percent or fixed R; never imply guaranteed profit.
- Required context: every professional message states or implies why the recipient received it.
- Signal reference: every VIP lifecycle update includes `Signal ID`.
- Footer: `HashiBot V2` plus context-specific disclaimer when educational or performance-related.
- Length: messages must fit Telegram's 4096 character limit after formatting.

## 4. Signal Lifecycle Specification

The VIP lifecycle is locked as one connected story:

1. `signal.created` — publish full trade plan.
2. `signal.entry_triggered` — entry area reached.
3. `trade.opened` — position active.
4. `protection.confirmed` — stop/protection verified.
5. `trade.tp_hit` with `target=TP1` — first target progress.
6. `trade.be_moved` — risk reduced to break-even when certified truth says so.
7. `trade.tp_hit` with `target=TP2` — second target progress.
8. Optional `trade.trailing_updated` — trailing stop changed.
9. Optional `trade.partial_close` — partial close occurred.
10. Terminal: `trade.closed`, `trade.sl_hit`, or `signal.cancelled`.

Rules: every update must include `signal_id`, use certified crypto truth fields, and avoid disconnected messages.

## 5. News Audit

News should be categorized as Breaking, Macro, Crypto, Exchange, Regulation, Technology, or Market Impact. Required fields are headline, source, published time, category, and market impact. Broken, duplicate, delayed, or unattributed news should not be sent. If the source or published time is missing, the message is not commercially ready.

## 6. Media Recommendations

Use media only when it improves understanding:

- VIP signal chart: optional for high-conviction setups with clear entry/SL/TP zones.
- Trade snapshot: optional when TP or close is easier to understand visually.
- Weekly performance card: useful when all numbers are certified.
- Market graphic: useful for free education or market structure posts.

Do not create images for simple ops alerts, subscription notices, or routine queue/provider messages.

## 7. Reporting Templates

### Daily Report
`🌅 DAILY MARKET SUMMARY` with date, market bias, key levels, open VIP trades, closed trades, risk note, and source line. Empty fields must say `No certified data` rather than inventing numbers.

### Weekly Report
`📈 WEEKLY PERFORMANCE` with week, verified trades, win rate, net result, average R, best trade, worst trade, max drawdown, and source: certified crypto truth only.

### Monthly Report
`📊 MONTHLY DESK REPORT` with month, verified trades, win rate, net result, drawdown, strategy split, best/worst trades, lessons, and next-month focus.

### Strategy Performance
`🧠 STRATEGY PERFORMANCE` with strategy name, period, trades, win rate, net R/percent, drawdown, best setup, worst setup, and certification source.

## 8. Professional Telegram Certification Report

Current Quality Score: **86 / 100**.

Remaining Issues:

- Repository code now defines professional templates and lifecycle routes, but live database templates will still need an approved non-SQL migration/update process in a later deployment phase.
- Media generation is specified but not implemented because unnecessary images were prohibited and no chart source was provided.
- News transport freshness cannot be runtime-certified from the repository alone.

Recommended Improvements:

1. Add live delivery evidence after deployment in a future deployment phase.
2. Add certified performance-card rendering only after verified chart/trade data is available.
3. Add operational dashboards for duplicate news and lifecycle gaps without changing trading execution.

Ready / Not Ready: **Ready for repository-level Professional Telegram certification. Not ready to claim live-channel certification until deployed templates, real news freshness, and delivery logs are checked.**
