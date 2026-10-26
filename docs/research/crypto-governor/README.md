# Evidence-based strategy controller — 26 October 2026

**Rejected research policy. Not approved for live eligibility or calibration.**

This experiment tests conditional strategy admission using only previously completed, matching-market evidence. It reuses the existing `observeAdaptiveMarket` classifier and canonical arbitrator. It adds no live scanner, new classifier, account-sizing authority or release permission.

| Policy | Resolved simulated outcomes | Net profit factor | Mean net R |
|---|---:|---:|---:|
| Unfiltered five-hypothesis comparison | 321 | 0.869 | -0.0574 |
| Evidence/state-governed | 10 | 0.555 | -0.0987 |

Admission reduced activity but **did not establish an edge or improve mean R**. Neither the ten-outcome sample nor the comparison is live evidence. This failed policy cannot certify the altcoin candidate or compensate for failed trend/range strategies.

## Policy tested

Before viewing this policy's results, the protocol fixed: trailing180-day strategy/state outcomes; at least30 resolved observations across8 UTC week clusters; PF>=1.15; mean net R>=0.03; positive stressed expectancy; positive matching-asset mean with at least10 outcomes; positive one-sided weekly-cluster lower mean estimate. Strategy/state mappings are explicit. SHOCK/INVALID are no-trade states. Scores are not win probabilities.

Labels become available only after their simulated exit candle closes. Same-time/future labels cannot qualify the current candidate. Duplicates are idempotent; conflicts, source mismatch, invalid time, inadequate coverage and unsupported states withhold eligibility. The weekly-cluster standard-error calculation is an approximate normal diagnostic, not a guarantee or correction for the full research search history.

The pure `strategy-evidence-governor.ts` component is **unwired from production because this measured policy failed**. It cannot change parameters, risk, quantity or release approval. A successful future policy would still need release review and connected production-path verification.

## Evidence boundary

Input is stored development evidence for all five hypotheses; combined duplicate scenarios are excluded.526 candidate events provide labels when completed. Prices are the same checksum-verified five-asset native15m histories, aggregated to closed hourly observations. The classifier and indicator constructor are existing shared production modules. Both policies arbitrate same-time candidates per asset and retain one active position per asset. No entries are invented when no strategy proposes a trade.

Comparison runs July2025–June2026 after earlier labels become available. **The strategy definitions were researched using this interval already.** This is chronological policy testing on reused development data, not independent strategy validation. Unselected candidates provide counterfactual simulated labels, not provider fills. Stored-event filtering is not full scanner-registry/selection-policy parity. Scenarios are not portfolio/account returns.

No July–September altcoin validation data entered this experiment. Its positive26-outcome result remains intact, below the frozen minimum50; October prices remain unconsumed by these experiments. Earlier losing strategies and failed policies were not deleted.

## Reproduction

```bash
node --import tsx scripts/research/crypto-governor-study.ts /path/crypto-development
node --import tsx tests/phaseL/strategyEvidenceGovernor.test.ts
node --import tsx tests/phaseL/governorEvidence.test.ts
```

`evidence.json.gz` retains every assessment, label, selected outcome, input fingerprint, module hash and limitation. `summary.json` contains metrics, state coverage and compressed/uncompressed SHA256. Unit tests check a known positive mean, future/duplicate invariance, conflicts, expiry, insufficient coverage, stressed costs, source/asset isolation and no-trade states. The archive test recomputes chronological assessments and selected metrics.

No deployment, SQL, scheduling, messages, payments or orders. No changes to public pages, offers, account policy or live execution. This is a completed **failed research experiment**, not a market-ready calibration product. Strategies for every market condition have not been established; unsupported conditions remain no-trade.

Final local checks passed: PhaseL (including680 recomputed chronological assessments), application typecheck, focused new research/test TypeScript, build and changed-file whitespace. New-head remote CI and authenticated browser visual review remain unverified/NOT_RUN.
