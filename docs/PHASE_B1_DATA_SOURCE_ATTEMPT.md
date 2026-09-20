# Phase B.1 public-data execution record

## Status

`DATA_SOURCE_BLOCKED`

On 2026-09-20 the acquisition command attempted the precommitted two-year range
`2024-09-20T00:00:00.000Z` through `2026-09-19T23:59:59.999Z` for all 37 requested
symbol/timeframe datasets.

* Dukascopy was attempted for all Forex and Metals datasets.
* Binance was attempted first for every Crypto dataset.
* Bybit was attempted after each Binance failure.
* Twelve Data was skipped because no API key existed in the environment.
* No trusted real CSV files were present in the repository.

All 37 requested datasets failed acquisition. Node's direct HTTPS requests failed
with `ENETUNREACH`; a separate `curl` probe through the configured proxy failed
with `CONNECT tunnel failed, response 403`. Direct `curl` with proxy variables
removed also failed to connect. Consequently no bars, certifiable DatasetCampaign,
strategy outcomes, product results, portfolio, or frozen survivors were produced.

The complete machine-readable attempt is written locally to
`.research-cache/phase-b/acquisition-report.json`. The cache is deliberately not
tracked because successful runs can contain millions of real bars. The follow-on
command writes `.research-cache/phase-b/certification-report.json` and refuses to
run certification when acquisition is incomplete.

## Reproduction

```bash
npm run research:acquire-real-data
npm run research:phase-b-certify
```

These commands do not modify production scanner defaults, customer configuration,
cron state, Telegram state, or live execution state.
