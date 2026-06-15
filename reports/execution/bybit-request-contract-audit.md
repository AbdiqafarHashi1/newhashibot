# Bybit Request Contract Audit

## Finding
Bybit authentication is no longer the active blocker. The failing diagnostic request was a validly signed request with an invalid V5 parameter contract: `/v5/order/realtime` was called without `symbol` or `settleCoin`, which can produce `10001 Missing some parameters that must be filled in: symbol or settleCoin or baseCoin`.

## Endpoint audit

| Endpoint | Method | Required params | Actual params before fix | Actual params after fix | Status |
|---|---:|---|---|---|---|
| `/v5/account/wallet-balance` | GET | `accountType=UNIFIED` | `accountType=UNIFIED` | `accountType=UNIFIED` | valid |
| `/v5/position/list` | GET | `category=linear` plus one of `settleCoin`, `baseCoin`, or `symbol` | `category=linear&settleCoin=USDT` | `category=linear&settleCoin=USDT` | valid |
| `/v5/order/realtime` | GET | `category=linear` plus one of `symbol` or `settleCoin` | Edge diagnostic sent `category=linear&openOnly=0`; adapter sent `symbol` only when caller supplied one | Diagnostics now send `category=linear&settleCoin=USDT&openOnly=0`; adapter sends `symbol` when supplied or `settleCoin=USDT` fallback | fixed |
| `/v5/market/instruments-info` | GET | `category=linear` | `category=linear` | `category=linear` | valid diagnostic support request |

## Code changes

- The shared Bybit adapter now falls back to `settleCoin=USDT` for open-order diagnostics when no symbol is supplied.
- The Supabase Bybit diagnostic endpoint now sends `settleCoin=USDT` to `/v5/order/realtime`.
- The diagnostic response now includes a `checks.request_contract` object showing endpoint, method, required params, and actual params for the wallet, position, and open-order calls.

## Expected result

A Bybit account with valid testnet credentials and read permissions should no longer fail the positions/orders diagnostic due to missing `symbol`, `settleCoin`, or `baseCoin`. Any remaining failure should now be a true credential, permission, timestamp, network, or exchange-health issue.
