# Admin UI productization audit (current main, 2026-09-12)

## Current-code mapping and disposition

| Capability | Current implementation | Operator disposition |
| --- | --- | --- |
| Dashboard / control room | `OperatorPanel`, `MissionControl`, legacy `ControlRoom` | **Keep** Dashboard and Operations Center; legacy route remains compatible but is removed from primary navigation. |
| Provider health | `ProviderHealth`, provider operation workspaces | **Merge** operator entry into Provider Overview; retain feed details under Advanced Diagnostics. |
| MT5 | `MT5OperationsCenter` and its account, bridge, runtime, command, certification, reconciliation, event, diagnostic, and setting tabs | **Keep and consolidate** at Providers → MT5. Personal/Prop aliases remain compatible and are not primary navigation. |
| Visual Bridge | admin/customer visual bridge pages and local telemetry | **Diagnostic / legacy**; not linked as canonical provider truth. |
| Research | `BacktestLab`, `ResearchValidationWorkspace`, historical adapters/context, canonical candidate replay, full/rolling Prop replay, qualification, freeze and forward handoff | **Merge** under Research & Qualification, with a seven-step operator path. Legacy single-strategy and simulation tools remain explicitly advanced/test-only. |
| Strategies | `StrategyConfig` plus canonical strategy definitions | **Keep** under Research; mutation functionality is unchanged. |
| Trading | signal truth, execution, positions, protection, risk, capital pages | **Keep**, with consolidated primary labels and drill-down routes. |
| Customers | customer management, fleet/accounts, access requests | **Keep**, relabeled around customer, provisioning and approval purposes. |
| Communications | Telegram links/logs/tests and performance/reporting | **Keep** Telegram and Reporting as primary entries; specialist tools remain reachable by routes. |
| System | runtime truth, recovery, audit, provider diagnostics, settings | **Keep** runtime truth/recovery; group specialist surfaces as System/Advanced. |

## Canonical machinery verified

The merged frontend already contains `HistoricalDataService`, browser-local IndexedDB caching, MT5/Binance/Bybit adapters, `SharedResearchContext`, raw-bar candidate and portfolio replay, Full Prop Pipeline Replay, Rolling Multi-Challenge, qualification campaigns, frozen-forward handoff, provider certification views, account execution controllers, MT5 heartbeat/status, provider health, runtime truth and recovery. Productization therefore reuses these contracts and does not add a strategy, replay, execution, risk, capital, or database truth engine.

## Known contract gaps

* Binance and Bybit have no single canonical admin-read model that jointly reports authenticated account, execution, protection, certification, last success and last error. Provider Overview consequently reports those facts as `UNKNOWN`/`NOT CONFIGURED` rather than inferring them from public historical adapters.
* MT5 history capability is presently derived from the existence of a canonical safe account and the deployed `FETCH_HISTORY` transport contract. A durable per-account capability/last-history-success field would allow richer readiness reporting.
* Backend availability depends on the configured Supabase project being active and the safe views/migrations being deployed. Browser-cached canonical bars remain local and must remain labeled cached real data.
