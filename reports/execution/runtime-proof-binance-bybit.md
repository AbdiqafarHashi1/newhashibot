# Binance / Bybit Deployed Runtime Proof

Generated at: 2026-06-17T20:51:32.327Z

This report contains only deployed runtime invocation results. It does not claim code-path readiness.


## Runtime invocation blocker

Exact blocker: ENETUNREACH: fetch failed

## Provider runtime truth

| provider | wallet_reachable | positions_reachable | open_orders_reachable | instruments_reachable | account_reachable | provider_control_status | provider_truth_snapshot_status | last_successful_sync_time | latest_error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| binance | NO | NO | NO | NO | NO | not_returned | not_returned | not_returned | not_returned |
| bybit | NO | NO | NO | NO | NO | not_returned | not_returned | not_returned | not_returned |

## Tiny test order proof

| provider | submitted | blocker |
| --- | --- | --- |
| binance | NO | runtime_action_not_invoked |
| bybit | NO | runtime_action_not_invoked |

## Monitor proof

| provider | invoked | success | latest_error |
| --- | --- | --- | --- |
| binance | NO | NO | not_returned |
| bybit | NO | NO | not_returned |

## Raw invocation summary

```json
[
  {
    "url": "https://uqiwbzfcntlcyyewawfc.supabase.co",
    "action": "status",
    "ok": false,
    "error_name": "TypeError",
    "error_code": "ENETUNREACH",
    "error_host": null,
    "error_message": "fetch failed"
  },
  {
    "url": "https://uqiwbzfcntlcvyewawfc.supabase.co",
    "action": "status",
    "ok": false,
    "error_name": "TypeError",
    "error_code": "ENOTFOUND",
    "error_host": "uqiwbzfcntlcvyewawfc.supabase.co",
    "error_message": "fetch failed"
  }
]
```
