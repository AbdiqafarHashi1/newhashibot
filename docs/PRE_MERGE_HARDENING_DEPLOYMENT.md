# HashiBot V1 Final Pre-Merge Hardening — Deployment & Acceptance Checklist

## SQL Migration Order

1. `20260707120000_symbol_universe_execution_lifecycle_protection_retention.sql`
   - Creates: symbol_universe_groups, execution_lifecycle_events, protection_events, retention_policies, feature_flags, hashibridge_registry, hashibridge_command_queue
   - Adds columns: scanner_config.enabled_universe_group, persist_candles_enabled, persist_indicators_enabled, max_scanner_runs_retention_days, max_strategy_candidates_retention_days
   - Creates RPCs: run_retention_dry_run, run_retention_cleanup, get_retention_report, get_protection_summary, get_scanner_summary_compact, get_execution_lifecycle_summary
   - Seeds: 4 universe groups, 19 retention policies, 8 feature flags

## Edge Functions to Deploy

No edge function changes required in this phase. All changes are frontend + database.

## Secrets

No new secrets required. All existing secrets remain unchanged.

## Feature Flags (all disabled by default unless noted)

| Flag | Default | Purpose |
|------|---------|---------|
| forex_execution_enabled | false | Forex live execution — disabled until validated |
| forex_signal_mode_enabled | false | Forex signal generation — disabled until validated |
| mt5_live_execution_enabled | false | MT5 live order execution — disabled by default |
| mt5_bridge_enabled | false | MT5 HashiBridge connectivity — disabled by default |
| binance_testnet_enabled | true | Binance USD-M testnet execution |
| bybit_testnet_enabled | true | Bybit demo/testnet execution |
| persist_candles_enabled | false | Store raw candle data — disabled to save storage |
| persist_indicators_enabled | false | Store indicator snapshots — disabled to save storage |

## Cron Changes

No cron changes required. Existing scanner cron continues to work.

## Cleanup Dry-Run

```sql
SELECT * FROM run_retention_dry_run();
```

## Cleanup Execute

```sql
SELECT * FROM run_retention_cleanup();
```

## Binance Testnet Validation

1. Verify `binance_testnet_enabled` feature flag is true
2. Run a manual scan from admin scanner page
3. Verify signals are created with `data_source = 'REAL DATA'`
4. Verify execution orders are created with `execution_provider = 'binance'`
5. Verify lifecycle events are written to `execution_lifecycle_events`
6. Verify protection events are written to `protection_events`

## Bybit Demo/Testnet Validation

1. Verify `bybit_testnet_enabled` feature flag is true
2. Verify Bybit operations page loads without errors
3. Verify execution orders can be created with `execution_provider = 'bybit'`
4. Verify lifecycle events are written for Bybit orders

## MT5 Offline Readiness Validation

1. Verify `mt5_live_execution_enabled` is false
2. Verify `mt5_bridge_enabled` is false
3. Verify MT5 Bridge admin page shows "Disabled (default)" status
4. Verify no MT5 execution orders can be created
5. Verify HashiBridge registry is empty (no bridges registered)
6. Verify command queue is empty

## Rollback Plan

1. **Database rollback**: The migration is additive only (no DROP, no DELETE, no type changes). To rollback:
   - Set `persist_candles_enabled = true` and `persist_indicators_enabled = true` in scanner_config if candle/indicator persistence is needed
   - Set `enabled_universe_group = ''` in scanner_config to revert to dynamic universe
   - Set all feature flags to their previous state
   - New tables can be left in place (they are harmless if unused)

2. **Frontend rollback**: Revert to previous commit. The new admin pages (RetentionPolicies, StorageStatus, Mt5Bridge) are additive and do not affect existing pages.

3. **Edge function rollback**: No edge function changes were made.

## Validation Results

- `npm run typecheck`: PASS
- `npm run build`: PASS
- `npm run test:recovery`: PASS (3 test suites, 35 assertions)
- `npm run test:analytics`: PASS
- `npm run test:execution`: PASS (6 test suites)
