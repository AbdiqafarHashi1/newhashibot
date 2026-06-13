# Telegram Product Routing Cleanup

## 1. Current routing map

Audited Telegram-producing paths:

| Source system | Current path | Current destination before cleanup |
| --- | --- | --- |
| `market-scanner` approved signal delivery | `routeTelegramEvent` | VIP override |
| `telegram-send` manual/admin signal send | `routeTelegramEvent` | VIP override |
| `evaluate-signal-outcomes` signal lifecycle/outcome update | `routeTelegramEvent` | VIP override |
| `binance-testnet-execution` execution lifecycle message | `routeTelegramEvent` | VIP override |
| `binance-testnet-monitor` testnet monitor lifecycle message | `routeTelegramEvent` | VIP override |
| `telegram-orchestrator` scheduled intelligence | `routeTelegramEvent` | Admin + Free + VIP override |
| `intelligence-engine` direct/manual intelligence endpoint | `routeTelegramEvent` | Admin + Free + VIP override |
| `telegram-orchestrator` / `intelligence-engine` failures | `routeTelegramEvent` | Admin override |
| `telegram-test` | `routeTelegramEvent` | Admin override |

The main product routing issue was scheduled intelligence being explicitly sent to Admin, Free, and VIP. Admin should receive intelligence failures and digest summaries, not every normal customer-facing intelligence post.

## 2. New routing map

| Message family | Destination | Notes |
| --- | --- | --- |
| Scanner Signal | VIP | Paid signal room only. Existing scanner logic unchanged. |
| Signal lifecycle update | VIP | Existing outcome delivery path unchanged. |
| Execution lifecycle update | VIP | Existing execution path unchanged per scope. |
| Morning Brief | Free + VIP | Admin removed from normal customer-facing scheduled intelligence. |
| News Digest | Free + VIP | Admin removed from normal customer-facing scheduled intelligence. |
| Watchlist + Pattern | Free + VIP | Admin removed from normal customer-facing scheduled intelligence. |
| Market Wrap | Free + VIP | Admin removed from normal customer-facing scheduled intelligence. |
| Major BTC / market-wide regime shift | Free + VIP | Event intelligence broad-market rule. |
| Symbol-specific breakout watch | VIP | Event intelligence default rule. |
| Trend exhaustion alert | VIP | Event intelligence default rule. |
| Major crash / sudden risk-off alert | Free + VIP | Event intelligence broad-market rule. |
| Provider failure | Admin | Router rule for failures/provider events. |
| Cron failure | Admin | Router rule for cron/failure events. |
| Daily performance/operator digest | Admin | Planned digest-only admin family; no VIP/Free performance spam. |
| Testnet summary / internal diagnostics | Admin | Planned digest family; existing execution logic not touched. |
| Event intelligence failure | Admin | Failure rule. |

## 3. Sources audited

- `supabase/functions/_shared/telegram-router.ts`
- `supabase/functions/telegram-orchestrator/index.ts`
- `supabase/functions/intelligence-engine/index.ts`
- `supabase/functions/market-scanner/index.ts`
- `supabase/functions/telegram-send/index.ts`
- `supabase/functions/evaluate-signal-outcomes/index.ts`
- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/functions/binance-testnet-monitor/index.ts`
- `supabase/functions/telegram-test/index.ts`
- `src/pages/admin/ControlRoom.tsx`

## 4. Duplicate sources removed

No scanner, execution, Binance, intelligence calculation, or feed collection paths were rebuilt or removed.

Duplicate-prevention was centralized in the Telegram Router:

- Existing `signal_id + destination_channel + delivery_type` sent checks are enforced even if a caller passes `dedupe: false`.
- General `event_id + destination_channel` sent checks apply when `dedupe` is enabled.
- Event intelligence adds a cooldown by `event_type + symbol/market + reason + channel` so the same alert is not repeated every scan.

## 5. Scheduled intelligence routing

Normal scheduled intelligence now routes to Free + VIP only:

- Morning Brief
- News Digest
- Watchlist + Pattern
- Market Wrap

Admin receives intelligence failures and digest/health summaries, not every normal scheduled intelligence message.

The cron URL/auth/test-mode migration from the previous branch remains intact and was not removed.

## 6. Event intelligence routing

Event intelligence is now a first-class routed message family in the Telegram Router.

Supported event metadata fields:

- `event_type`
- `symbol`
- `market`
- `reason`
- `severity`
- `confidence`
- `data_source`
- `freshness`
- `channel_target`
- `cooldown_minutes`

Routing behavior:

- VIP receives event intelligence by default.
- Free receives only major broad-market event intelligence, including critical severity, high-severity BTC/ETH or broad-market alerts, risk-on/risk-off shifts, liquidation cascades, market-wide events, and major news shocks.
- Admin receives failures and digest summaries, not every normal event intelligence alert.
- Event alert messages are prefixed as `Market Intelligence Alert` when the source text does not already include that label.

## 7. Admin digest plan

Admin should receive 12-hour or 24-hour digest messages containing:

- Signals generated
- Signals won/lost
- Open signals
- Intelligence status
- Feed availability
- Provider health
- Testnet performance
- Delivery health
- Event intelligence alerts triggered
- Event intelligence alerts skipped/throttled

This cleanup prepares routing ownership for that digest mode. It does not implement new performance calculations or execution logic.

## 8. VIP message plan

VIP receives:

- All approved signals
- Signal lifecycle updates
- Execution lifecycle events already routed to VIP
- Scheduled intelligence
- VIP event intelligence alerts

VIP does not receive:

- Provider failures
- Cron failures
- Internal system health
- Testnet/operator reports
- Performance digest spam

## 9. Free message plan

Free receives:

- Morning Brief
- News Digest
- Watchlist + Pattern
- Market Wrap
- Educational / market-intelligence content through the router
- Major broad-market event intelligence
- Only explicitly selected/free signal examples, intended for a maximum of 1–2 per day

Free does not receive:

- All VIP signals
- TP/lifecycle spam
- Execution logs
- Provider failures
- Performance reports
- Small symbol-specific pattern alerts

## 10. Files changed

- `supabase/functions/_shared/telegram-router.ts`
- `supabase/functions/telegram-orchestrator/index.ts`
- `supabase/functions/intelligence-engine/index.ts`
- `src/pages/admin/ControlRoom.tsx`
- `reports/product/telegram-product-routing-cleanup.md`

## 11. Tests run

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

## 12. Remaining risks

- Event intelligence producers must pass the new metadata fields when they are implemented; this cleanup only adds routing support and does not add new market-condition detection logic.
- Free-channel selected signal limits still require the future producer to mark selected examples as `free_selected_signal` or target the Free channel intentionally; scanner strategy logic was intentionally not modified.
- Admin digest scheduling/content aggregation is documented as the ownership plan but not implemented here to avoid touching scanner, execution, Binance, or performance-calculation logic.
- Existing execution/testnet lifecycle messages still route according to their current explicit overrides because execution/Binance logic was out of scope.
