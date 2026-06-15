# Bybit V5 Signature Fix — Phase X-D.2

## Official V5 authentication contract audited

Bybit V5 authenticated REST requests must send these headers:

- `X-BAPI-API-KEY`
- `X-BAPI-TIMESTAMP` as UTC milliseconds
- `X-BAPI-RECV-WINDOW`, defaulting to `5000` ms
- `X-BAPI-SIGN`

The signed payload is method-specific:

- GET: `timestamp + api_key + recv_window + queryString`
- POST: `timestamp + api_key + recv_window + requestBody`

The signature is HMAC SHA256 over that payload using the API secret, lower-case hex encoded. The timestamp must be within Bybit's accepted receive window relative to server time, so hosts should keep their clocks NTP-synchronized.

## Changes made

- Shared `ExchangeProviderBybit` now constructs a named `preSign` string that exactly matches the V5 GET/POST rules.
- GET query strings are filtered and sorted deterministically before both URL construction and signing.
- POST requests sign the exact JSON request body string sent to Bybit.
- HMAC SHA256 output remains lower-case hex encoded with expected length 64.
- Authenticated headers are explicitly set as `X-BAPI-API-KEY`, `X-BAPI-TIMESTAMP`, `X-BAPI-RECV-WINDOW`, and `X-BAPI-SIGN`.
- Optional auth debug logging was added without API secrets. It records endpoint, method, timestamp, recv window, pre-sign string, and signature length only.
- Supabase Bybit diagnostics now use the same sorted query-string behavior and safe debug logging through `BYBIT_DEBUG_AUTH=true`.
- Provider-control status is only marked `connected` after successful authenticated wallet, position, and realtime-order responses.

## Authenticated endpoints verified in diagnostics

- `/v5/account/wallet-balance` with `accountType=UNIFIED`
- `/v5/position/list` with `category=linear&settleCoin=USDT`
- `/v5/order/realtime` with `category=linear&openOnly=0`

## Debug mode

For Supabase diagnostics, set:

```bash
BYBIT_DEBUG_AUTH=true
```

Debug logs intentionally never include the API key or API secret. Because Bybit's official pre-sign formula includes the key, the logged pre-sign string redacts that segment as `[REDACTED_API_KEY]` while preserving endpoint parameters and payload shape for troubleshooting.
