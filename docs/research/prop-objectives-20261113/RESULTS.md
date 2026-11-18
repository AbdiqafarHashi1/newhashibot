# Prop: 30-day passing and funded income objectives

The account-level funded profit cutoff is implemented. The requested performance package—funded within 30 calendar days plus dependable 5% monthly or 2% every fortnight—has **not** been established by this campaign. Do not replace the existing forward-test default with a configuration chosen only for its best earlier starts.

## Scope and counts

- 26,215 canonical account replays, including 24,384 combinations of the seven reviewed strategies, 360 later-period finalist checks, 1,056 revised Gold account windows and 415 sequential funded-cycle replays in 96 recurring campaigns.
- 11,664 additional approximate native bid/ask screening scenarios covering 1,944 entry/stop/target/holding configurations. These are explicitly screening results, not canonical qualifications.
- Existing-strategy search: every one of the 127 non-empty selections, one/two maximum positions, 0.50% risk with leverage ceiling five and experimental 1% with ceiling ten. Four distinct objectives: 8/5 phases within 30 days, 10/5 phases within 30 days, funded 5% within 30 days, funded 2% within 14 days.
- Twelve overlapping weekly starts March–May, ending no later than June 16. Three finalists were frozen before inspecting July–August objective outcomes. Later checks use five starts. The underlying strategy families had broader prior research, so this is temporal validation, not a newly untouched market dataset.
- Gold parameter screening used six earlier windows, then froze two revised entries before later replay: range re-entry (15m, 48 bars, 1.5 ATR stop, 3R, 48-bar hold) and squeeze breakout (15m, 48 bars, 1 ATR stop, 2R, 24-bar hold).
- Both revised definitions ran together through the full canonical scanner, automatic confirmation, arbitration and lifecycle over March–August 2025: 264,960 one-minute ticks, 64 range confirmations and 52 squeeze confirmations. Accounts selected either definition or both. They remain disabled research definitions rather than silently joining the reviewed customer bundle.

## Findings

The best earlier existing-strategy 8/5 challenge result was 5/12 within 30 days at 1% research risk. The best strict 10/5 result was 3/12. Those selected finalists passed **0/5 later starts** within 30 days. The revised Gold configurations also passed 0/5 later starts in both phase-target cases. Eventual multi-month passes from the previous campaign therefore cannot be described as one-month passes.

The strongest simple funded-income research candidate is **Gold range re-entry alone, XAUUSD, one position, 1% risk and leverage ceiling ten, closing at 2% net profit**:

| Period | Baseline 2% within 14 days | Higher costs | Worst equity drawdown under higher costs |
| --- | --- | --- | --- |
| Earlier six starts | 5/6 = 83.3% | 5/6 = 83.3% | 4.34% |
| Later five starts | 4/5 = 80.0% | 4/5 = 80.0% | 3.19% |

This is 9/11 distinct overlapping starts across the two periods, not 18/22 independent observations when costs are repeated. None of these eleven scenarios breached the modeled firm loss limits, while two missed the income deadline. It is a research candidate, not a customer default or guaranteed biweekly return. Customer risk/leverage bounds remain unchanged; the larger research policy is accepted only for an isolated non-UUID historical customer identity and never mapped from a production request.

Combining both Gold configurations at 1% reached 5% within 30 days in 6/6 earlier higher-cost starts, but only 3/5 later starts. Range re-entry alone achieved 5/6 earlier and 0/5 later for that target. A standout earlier result therefore does not justify a 5%-monthly claim.

## Repeated funded cycles: the important correction

The recurring simulation stops at the executable net target, misses new signals during the waiting period, waits at least 14 days from the first funded trade plus an assumed 24-hour processing handoff, removes the entire gross profit and starts the next hypothetical issued account at $10,000. An 80% reward split is an explicit model assumption. No real withdrawal, firm approval or bank processing was verified. Starting dates March/April/May and all costs/risk arms remain in the full report.

For Gold range re-entry, 1% risk, higher costs and March 1 start:

| Cutoff | Completed modeled cycles by August | Modeled customer reward | Monthly modeled rewards, March → August |
| --- | --- | --- | --- |
| 2% | 6 | $1,060.68 | $160.58, $171.94, $344.38, $383.79, $0, $0 |
| 5% | 4 | $1,850.29 | $417.95, $407.63, $608.33, $416.37, $0, $0 |

These are simulated rewards after the assumed split, not actual cash receipts. The zero months are retained. A favorable standalone fortnight does not imply uninterrupted fortnightly withdrawals once earlier closures, missed opportunities and account resets change the path.

## Implemented funded cutoff

- New funded cycles default to 5%; an approved 2% setting applies to a new cycle. Active targets cannot change retroactively through an admin form edit.
- Fresh USD account snapshots initialize a cycle only when flat. The initial service capital cap remains $25,000. The baseline is recorded rather than typed by the customer.
- Reaching the equity target latches the cycle, pauses new entries, rejects queued entries and enqueues account-scoped closes/cancellations. A later decline does not restart entries. Fees and slippage can put the actual closed balance below the trigger; this is shown as CLOSED_BELOW_TARGET, never a fabricated 5% result.
- Completion requires fresh observed flat positions/orders. Provider uncertainty blocks payout readiness and cycle reset. Late observed fills return the cycle to CLOSING. Commands deduplicate by cycle/ticket and use bounded retry backoff.
- A server-only authorization binds each management command to the exact account, owner, bridge, cycle, ticket and expiry. Updated Windows agent 1.2.0-prop-profit-cutoff independently verifies local identity and trading permissions. This permits protective closes during entry pause without permitting new entries or overriding data-only terminals.
- Customer account reports show the cycle. Admin controls select the next goal and require a review/reference plus fresh flat evidence to reset. Reset does not start trading or certify a withdrawal.

## Default recommendation

Keep the reviewed seven-configuration forward-test setup (two positions, 0.40% evaluation risk, 0.25% funded risk), now with the requested 5% cutoff and optional approved 2% cycle. The single-Gold 2% study is the best next research candidate, but the full speed/income package has no qualified replacement default. The new admin objective panel shows both periods and recurring zero months.

## Evidence and reproduction

- `all-scenarios.json.gz`: all account groups, parameter cases and sequential cycles, with source file hashes.
- `summary.json` and public summary: counters, earlier winners, later validation, revised Gold matrix and recurring examples. The public projection is intentionally smaller; the full evidence is retained.
- `gold-scanner.json.gz`: complete canonical replay and native source manifests.
- `canonical-source.tar.gz`: exact scanner source archive, SHA-256 verified against `7adbc0bdf261eac925a5c4a3324875bb4c5777660bf2d1793228b6804cf9313a`. Later source changes isolate higher risk to research and preserve the original production limits; the archived scanner version is retained for exact reproduction.

Runners: `search-prop-objectives.ts`, `prop_fast_screen.py`, `validate-prop-objectives.ts`, `evaluate-fast-gold.ts`, `prop-income-cycles.ts`, `publish-prop-objectives.ts`. Native archives must match their existing hashes. The exact revised scanner command is recorded in ENGINEERING.md. All computation was local; no GitHub Actions were dispatched.
