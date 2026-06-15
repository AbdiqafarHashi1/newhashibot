# Bybit Auth Root Cause

## Finding

The isolated V5 wallet-balance validator now audits only `GET /v5/account/wallet-balance?accountType=UNIFIED` before the Bybit adapter can be considered connected.

The validator records timestamp, recv window, query string, redacted pre-sign payload, header names, signature length, HTTP status, `retCode`, and `retMsg`. It also audits API key and secret length plus spaces, quotes, and line breaks.

## Contract

Bybit V5 GET signing is implemented as:

`timestamp + apiKey + recvWindow + queryString`

with HMAC-SHA256 hex signature and the required `X-BAPI-*` headers, including sign type `2`.

## Current 10004 classification

If Bybit returns `10004 Error sign` while the validator shows deterministic sorted query, 64-character signature, valid timestamp, recv window, and required headers, the root cause is classified as:

**G — secret mismatch / stale credentials loaded**

This means the deployed API secret does not match the API key, the wrong environment secret is loaded, or the copied secret contains hidden characters.

## Acceptance

`auth_ok=true` is required before the Bybit provider may be marked connected.
