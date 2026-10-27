# Structural-filter adaptation: failed validation retained

27 October 2026. One new, symmetric filter was fixed after the original long/short futures model failed its direction gate. It adds EMA50/200 ordering and the sign of the EMA200 change over6 completed4h bars. No entry channel, exit, cost, sizing, stage or qualification gate was changed. The original code/protocol/evidence remains intact.

## Outcome

| Group | Development2020–2022 PF / closed | Validation2023–2024 PF / closed |
|---|---:|---:|
| Pooled | 1.255 /150 | 1.209 /92 |
| Long | 1.346 /93 | 1.483 /60 |
| Short | 1.136 /57 | **0.661 /32** |

Development passes the declared screen; validation fails ASSET_EVIDENCE and DIRECTION_EVIDENCE. Positive pooled validation cannot qualify this model. Stressed validation PF: combined1.067; long1.313; short0.575.

The complete breakdown prevents favorable-cell selection: BTC validation long29/PF2.660, short17/PF0.568; ETH long31/PF0.873, short15/PF0.748. BTC development shorts already lost despite a positive combined direction result; every cell is retained. BTC long is a post-inspection research lead, not a certified replacement or permission to drop ETH after validation. No model/asset is automatically promoted.

## Source, freeze and reproduction

72 original vendor-checksummed native4h development archives (13,152candles) were reused. Only after development passed,48 additional official futures archive/checksum pairs for2023–2024 were acquired (8,772candles). Exact new ZIP bytes, source identities and vendor checksum texts are downloadable in `validation-sources.json.gz`; original72 snapshots remain in `../futures-slow-trend/`. Total source coverage21,924native4h bars.

The new protocol and engine were hashed before evaluation/acquisition and checked before each stage. This is a prospective **rule adaptation**, not a wholly untouched project-wide price test: the project previously viewed spot data for2023–2024, and previous development experiments informed the choice to require structural trend agreement. No parameter sweep or tuning after validation was done. The original sample/date gates are unchanged.

The filtered offline simulator preserves the original simulator's management/accounting. Before filtered development, every193 original native-data outcome was required to match the unfiltered adapter exactly. The implementation is isolated research, **not active-scanner registry/indicator/selection-policy parity**, a new live runtime or conditional-exit production integration. Rule scores are not probabilities. No public-page, price, account, migration, schedule, publication or execution authority was altered.

Next-open entries; previous-bar channel/close-based trails; adverse gap fills; declared stage-end liquidation. Equal initial quote-exposure returns;16bp roundtrip fee/spread/slippage plus adverse3bp per commenced8h of holding, stress1.5 times all costs. These are declared reserves, not observed fills or actual settled funding. Both assets/directions overlap; results are not independent portfolio returns. There is no claim of consistently positive rolling performance.

```bash
python3 scripts/research/futures-filter-study.py /path/to/futures-slow-trend-cache
python3 -m unittest discover -s tests/research -p 'test_futures_filter.py'
```

The Backtest Lab shows the frozen stages and asset/direction breakdown, with complete evidence downloads. Tests independently check future invariance, symmetric suppression of countertrend entries, signed P&L/holding costs, original management parity, source/engine hashes and all48 new native archives. The first evidence test was invoked before the runner had written its final report and failed on the missing file; after acquisition/completion it was rerun against the actual report. A subsequent independent PF check differed by2e-16 because Python and NumPy sum in different orders; its comparison was corrected to a12-decimal tolerance, without changing the report or trading code. No fixture substituted for missing market data.

Publication, execution and promotion remain false. No release certificate, real forward observation or provider fills were produced. Genuine forward validation and authenticated visual review NOT_RUN. No merge or manual deployment.

Final local verification: all38 Python research tests, application typecheck, explicit changed-component lint, production build, Python compilation and changed-text whitespace passed. Parent8238932 remote verify/browser/lint/source and PostgreSQL15/17 checks passed; its separate broker-data acquisition check remained failed. Those parent checks are not represented as new-head CI or genuine strategy/forward validation.
