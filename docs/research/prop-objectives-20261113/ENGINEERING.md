# Reproduce and activate the Prop cutoff

## Canonical revised Gold replay

Native data is the existing hash-checked Exness archive, January–August 2025. January/February are warmup. The exact source used is in canonical-source.tar.gz; its shared TypeScript plus runner path/content digest matches the completed report's engineSourceSha256. Candidate ordering was later changed to append new definitions so existing catalogue indices remain stable; their relative order in this two-strategy stream is unchanged.

```sh
node --import tsx scripts/research/run-frequency-audit.ts venue=exness data=.tmp/launch-research/exness-data frames=5,15,60,240 months=2025-01,2025-02,2025-03,2025-04,2025-05,2025-06,2025-07,2025-08 symbols=XAUUSD start=2025-03-01T00:00:00Z end=2025-09-01T00:00:00Z strategyIds=gold.native-band-reentry-15-48-1.5-3-xauusd-h48,gold.native-squeeze-15-48-1-2-xauusd-h24 entry=COMBINED risks=.5 balances=10000 checkpointEvery=1440 out=.tmp/prop-objectives/fast-gold-scanner.json
```

Run eight `search-prop-objectives.ts` shards for the existing seven-strategy stream at default .5/5 and at arguments `1 10`. The three frozen account masks are 25/one position, 95/one position and 116/two positions; validate with `validate-prop-objectives.ts`. Use `prop_fast_screen.py SYMBOL` for the approximate parameter screens. Run `evaluate-fast-gold.ts MASK` for masks 1, 2 and 3 after the revised scanner completes. Run `prop-income-cycles.ts PROFILE` for REVIEWED_FULL, GOLD_RANGE, GOLD_SQUEEZE and GOLD_BOTH. `publish-prop-objectives.ts` checks row counts and realized target profits, then writes evidence and the compact public projection.

## Deployment dependencies

No activation is performed by this change. Restore the intended Supabase project and apply migration **20261113140000_prop_funded_profit_cutoff.sql**, deploy current functions/frontend, and update each execution terminal to agent **1.2.0-prop-profit-cutoff**, including prop_profit_guard.py. A previous agent lacks the new close-only authorization handler and must not be represented as having verified cutoff management. An incomplete deployment remains visible as an unavailable cycle or a pending CLOSING state; fresh provider flat observations are required for completion.

The cutoff is snapshot-driven, not dependent on an analysis signal arriving. Dedicated data-only feed terminals cannot receive this management permission. MT5 funded accounts need the existing owned terminal, fresh snapshot, valid original capital/currency and observed risk tracking. A new cycle begins only from flat observations, not from invented earlier account history. Entries are denied until an active cycle exists; restarting account controls does not erase a closing latch.

Apply the next-cycle 2%/5% setting in account firm rules. A new funded cycle defaults to 5%. Changing a form does not change the target of a running cycle. After reviewing a payout or other cycle completion, an admin can record a reference and prepare a new cycle from the observed balance. This records a review rather than verifying a bank receipt, preserves loss/drawdown history and leaves entries paused. If a firm issues a new account, onboard that separate account; the recurring simulation's new-account risk reset is not a runtime permission to erase losses on an existing account.

The implementation operates on the dedicated connected account's entire observed position/order inventory, as requested. Market closure, trade permission loss, provider failures and slippage can delay or reduce closing results. Close/cancel requests deduplicate and back off after repeated failed attempts; monitoring and entry pause continue. Provider reconciliation uncertainty prevents a payout-ready state or cycle reset. A genuinely observed late fill is closed on a subsequent snapshot.

## Validation

- 80 historical-engine tests, including both revised native fixtures and 2%/5% target stopping; 139 operations tests; 25 PostgreSQL endpoint/authority tests including the new cutoff migration; 31 Python agent tests.
- Targeted checks cover ownership, duplicate commands, later drawdown after trigger, flat confirmation, 14-day waiting, management authorization scope, review/reset, old-cycle rejection and preserved entry pause.
- Production and historical boundaries are distinct. Higher-risk research input needs an isolated synthetic customer and historical identity. A real account cannot request that flag through production authorization. Normal Prop policy bounds and customer defaults remain unchanged.
- App TypeScript, 39 edge dependency bundles and production build are checked locally. Browser execution remains blocked in this host by Chromium's singleton-socket restriction; no browser pass is claimed for these changes.
- No GitHub Actions research jobs or provider orders are run. The final commit uses [skip ci].
