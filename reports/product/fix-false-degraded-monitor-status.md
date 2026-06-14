# Fix False Degraded Monitor Status

## Problem

The Binance testnet monitor could persist `monitor_status: degraded` even when the latest monitor proof showed a fully protected, clean run:

- `warnings = []`
- `warnings_count = 0`
- `critical_errors = []`
- `critical_errors_count = 0`
- `unsafe_positions = 0`
- `latest_monitor_error = ""`
- `latest_monitor_warning = ""`
- `protected = checked`

That incorrectly made the Execution UI and admin alert path treat a healthy protected state as degraded.

## Root Cause

The degraded calculation included stale database protection markers even when the symbol no longer had a Binance position or any Binance orders. Those local-only rows are not live Binance risk and must not downgrade the monitor.

The UI also trusted a stale `degraded` status string even when the latest result counters proved a clean protected state.

## Fix

- The monitor now classifies critical only for real critical blockers: critical errors, unsafe positions, missing required SL/open unprotected positions, unresolved critical reconciliation, account-fetch failure, or reconciliation failure.
- The monitor now classifies degraded only for real operator-action warnings: warnings, row errors, active recoverable protection degradation, duplicate/stale/orphan orders, safety close activity, or an active profit-lock replacement failure.
- Protection degradation from database rows is counted only when the row is active and the symbol still has live Binance exposure, meaning an open Binance position or open Binance order.
- Profit-lock replacement failure contributes to degraded only when it is still active.
- The shared monitor truth UI now allows a recent, fully protected, zero-warning/zero-critical result to render healthy even if an old `monitor_status: degraded` string is present in the payload.

## Acceptance Mapping

| Acceptance | Result |
| --- | --- |
| Current JSON proof becomes healthy | Clean counters with `protected == checked`, no warnings/errors, and no unsafe positions are healthy. |
| UI shows healthy when latest monitor run is recent | Shared monitor truth treats the clean protected proof as healthy after freshness checks pass. |
| No admin alert sends for healthy protected state | Monitor alert severity derives from the corrected monitor status and warning/error counters. |
| Existing degraded/critical behavior still works | Real warnings, row errors, duplicate/stale/orphan orders, active protection degradation, missing SL, unsafe positions, critical errors, account failures, and reconciliation failures still classify unhealthy. |

## Files Changed

- `supabase/functions/binance-testnet-monitor/index.ts`
- `src/lib/monitorTruth.ts`
