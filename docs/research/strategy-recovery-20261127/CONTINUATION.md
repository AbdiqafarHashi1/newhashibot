# Gold continuation: acceptance decision

No new candidate in this continuation passes the requested small-account Gold Turbo standard. These are rejected offline experiments, not customer selections or live integrations. Existing curated placements in DECISIONS.md remain unchanged. The five Turbo engines remain demo-only; their implementation is not proof of profitability.

## Costed results

All figures below are percentage account returns at $500 starting capital and 1% experimental risk allowance, after simulated trading costs, before subscription fees. Stress results use the corresponding higher-cost scenario. Each directory retains its exact protocol, account assumptions, summaries and compressed execution receipts. Independent replay does not establish production-manager or broker-fill parity.

| Fixed experiment | Development/validation evidence | Decision |
|---|---|---|
| M1 close-move Ridge forecast | October 19–23: -5.73% base / -9.64% stress; October 26–30: -6.26% / -7.22% | Reject; forecasting a close does not establish executable payoff |
| M1 execution-payoff Ridge forecast | Same periods: +1.24% / +0.90%, then +2.16% / +1.61%; $25,000 counterpart loses in the later period | Reject; thin, capital-dependent result, not a robust improvement |
| September-trained M1 execution forecast | October: -1.18% base / +0.25% stress; 32/33 decisions | Reject; inadequate return and participation |
| September-trained five-second tick Ridge forecast | October: -6.68% / -8.33%; 18 decisions | Reject |
| September-trained five-second tick tree forecast | October: -7.08% / -13.85%; 80/73 decisions | Reject; more participation did not rescue expectancy |
| M5 momentum family transfer | September: no executable fills at 1%; October: -5.47% / -4.51%; 20 decisions | Reject; at 5% risk September +29.40% becomes October -58.47% |
| M1 band-reentry family transfer | September -26.08% / -28.51%; October -41.22% / -45.56%; 471 / 524 base decisions | Reject; frequent losing entries |

Higher lot sizes did not repair these strategies. The momentum transfer's September gain accompanied roughly 29% drawdown and reversed in October. No parameter or risk profile is promoted on that favorable month. Differences between stressed and base account returns can reflect different admitted trades, minimum-volume and account-lock paths; they are not paired identical-fill cost deductions.

October was already a known research period before these experiments. Chronological partitions constrain fitting but do not turn this repeatedly inspected month into a pristine unseen validation set. September-only fits provide a stricter time boundary, not commercial qualification. No monthly median, profitable-month probability, or sustainable return estimate is justified by these short samples.

## Reproducibility and checks

- September raw data restored once and matched the earlier retained manifest: 6,591,051 real bid/ask ticks, 30,157 normalized M1 bars. Raw ZIP SHA-256 `3d874f6fa28dadcd8954bd385452200258f638a66b8cc30976baadeb85e98491`; normalized rows SHA-256 `2b968fb3b06a7e112f163c306c9a7b14b09313c81c1c4a53d1e8d53f8ec73e90`. Durable file references are recorded in `../gold-context-september-20261127/data-preservation.json`.
- Reused October ticks; no duplicate October or August download.
- Five feature tests pass: closed-time/gap checks, dimensional/cost checks, affine price invariance, prefix stability and invalid inputs.
- Four execution-label tests pass: observed-side prices and fees, stop-gap adverse fills, invalid/non-training labels, and tick-feature prefix stability with no October training labels.
- Targeted commands: `PYTHONPATH=mt5-agent python -m unittest discover -s mt5-agent/tests -p test_gold_turbo_context_features.py`; `python -m unittest discover -s scripts/research/gold-turbo -p test_context_labels.py`.
- Replay scripts audit ending cash against their retained individual executions. No new native MT5 compilation, real broker execution, forward-demo proof or commercial qualification is claimed.

## Customer consequence

No failed candidate is added to customer defaults. No payment/VIP service was disabled by this work, and no paid/live execution was activated. Existing Crypto evidence and curated FX/Gold placements are separate from the failed Turbo challengers. Their prior limitations still apply. The request for a strong, frequent, small-account Gold strategy remains unmet; calling these results acceptable would misrepresent the evidence.

The next defensible development step is to inspect trade-level failure clusters and test a single structurally justified change against preserved baselines, then use genuinely fresh data or forward demo before promotion. Further tuning on October alone cannot establish a new edge.
