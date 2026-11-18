# Reproduction and implementation

Research source: `scripts/research/gold-micro/`. Requires Python 3, numpy, pandas, g++ and network access to the first-party archive URLs. Raw ZIPs and derived M1 bars stay in `.tmp/gold-micro/data/`; large market data is not committed.

```
python scripts/research/gold-micro/acquire.py
python scripts/research/gold-micro/search.py
python scripts/research/gold-micro/tick_replay.py M2
python scripts/research/gold-micro/holdout.py
python scripts/research/gold-micro/publish.py
python -m unittest discover -s tests/goldMicro -v
```

Historical stages must use their archived source snapshots when exact reproduction is required. `search.py` is the final six-family grid, while the initial four-family search is preserved in `initial-source.tar.gz`. Full completed stage outputs are in `completed-studies.json.gz`. Running these commands again after reading October does not restore its original untouched status. No production environment variables or trading credentials are needed.

`features.py` creates only closed complete M5/M15 context and shifts M1 feature decisions to the following minute. Missing intervals are not filled. Causality tests mutate later prices and verify that earlier features for all fourteen families are identical. ATR/SMA and context calculations are research definitions, not production-catalog strategy implementations.

`ticks.cpp` replays the actual ordered bid/ask stream. Pending entries retain their original feature index, stop and target across minute changes. Stops/targets are frozen before delay; stale entries, crossed protection, excessive chase, spread, cost, insufficient margin, minimum-lot and leverage violations are rejected. Stop/target processing remains active on every quote even when client analysis is sampled once/second or every thirty seconds. Intrabar confirmation means two observed qualifying quotes separated by at least 250ms, not an assertion about unobserved continuous prices. Both price and lot rounding are explicit. Trade management waits for simulated latency and cannot receive a historical better fill after the proposed stop was already crossed.

Engine snapshots before model2 used different planned-stop semantics and are exploratory only. The final frozen holdout is the evidence for the reported candidate; it must not be confused with earlier favorable variants. Compiled shared libraries are content-addressed and atomically created to avoid replacing a library mapped by another research process.

Profile guards in this standalone engine use numerical daily/peak limits chosen from scenario risk, not the production account/prop authority. Daily locking blocks new entries; it is not a full firm-specific breach/liquidation simulator. There is one asset/one position, no correlation arbitration, no actual firm rules, no payout approval and no integration into the canonical production scanner. Fee reserve is additional to real spread. Dynamic contract rules, rejections, live partial fills and provider outages need connected evidence.

Trade-array columns: openedAtMs, closedAtMs, side, entryPrice, exitPrice, quantityLots, netUSD, netR, exitReason, initialStopRiskUSD, bestObservedFavorableUSDPerOz, holdingMinutes. Exit reasons include 1 stop, 2 target, 3 delayed timeout/stall/session exit, 7 end-of-window marking, 8 delayed protective stop already crossed. Final ledgers reconcile net P&L, fees, lot steps, risk budget, timestamps and account balances. End-of-period closure is explicit and must not be represented as an observed provider fill.

Validation: ten deterministic Python/native-engine tests pass. These cover ordered quote outcomes, delayed fills and protection, minute-boundary pending state, frozen targets/stops, slow-client broker protection, chunking equivalence and no future feature reads. Synthetic fixtures are correctness tests only. Production TypeScript/UI/SQL/agent code is unchanged; no new browser or connected provider pass is claimed. No Actions run is requested; the research commit uses `[skip ci]`.
