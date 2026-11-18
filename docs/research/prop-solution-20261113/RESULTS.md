# Prop: practical passing and payout plan

Prepared 2026-11-13. Historical scenarios, not firm-approved passes, cash payouts or forecasts. This work does not activate accounts.

The reviewed seven-configuration Forex/Gold bundle remains the stronger demo candidate. The practical service-sized scenario uses **$25,000 original capital**, 0.50% evaluation risk, 0.25% funded risk, at most two positions, leverage ceiling 5, existing internal 4% daily / 8% high-water loss controls, and a 2% funded cutoff. Gains above $25k do not violate the original-capital cap. The account's approved program rules and actual terms still govern eligibility.

## Passing and first request

Higher-cost replay (1.5×), $25k, evaluation 0.50% → funded 0.25%, 2% funded target. Twelve weekly starts March 1–May 17, 2025, observed until September 1 exclusive. These overlapping starts are correlated, not independent estimates of pass probability.

| Numerical rules | Passes | First 2% request opportunity | Funding days: min / median / max | Days from challenge to first request: min / median / max |
| --- | --- | --- | --- | --- |
| 8% + 5%, five entry days per phase, 21-day first wait | 12/12 (100%) | 12/12 (100%) | 35.6 / 70.7 / 130.5 | 58.5 / 95.3 / 164.5 |
| 10% + 5%, four entry days per phase, 14-day first wait | 8/12 (66.7%) | 8/12 (66.7%) | 63.6 / 72.6 / 91.6 | 80.3 / 97.8 / 108.5 |

Timing summaries include completed outcomes only. The four unresolved 10/5 cases must not disappear from the denominator. The 8/5 case is a numerical sensitivity template; it retains the reference engine's conservative restrictions and is **not full FundedNext program qualification**. The 10/5 case uses the existing FTMO Swing reference profile. No one-month funding commitment is supported. In the 8/5 case, 10/12 funded within 90 days, 11/12 within 120; only 5/12 reached a first request within 90 days.

Raising funded risk from 0.25% to 0.50% moved the 8/5 median first request only from 95.3 to 92.0 days. That small time gain does not justify making the higher funded risk the default suggestion.

## Meaningful income and fees

A meaningful modeled reward is at least **$100 remaining after a $100 fee per 30 days**, assuming an 80% reward share. These are fee sensitivity assumptions, not changes to HashiBot billing. Challenge purchase fees, taxes, VPS costs and bank processing are excluded.

At $25k, 2% is $500 gross / $400 at an 80% share before service fees. At $10k it is only $200 / $160. This makes a fixed $100 monthly fee materially harder to support on smaller accounts.

For the 8/5 first-request scenarios, funded-stage-only fees leave **$201–$327**, with 12/12 retaining at least $100. Charging from challenge start reduces that count to **5/12**. The strict 10/5 cases have 8/12 meaningful rewards with funded-stage fees, or 3/12 with challenge-stage fees. These are simulated customer economics, not actual charges or receipts.

## Already funded

Reviewed full bundle, $25k, 0.25% risk, 2% target, 1.5× costs, 14-day wait: **13/17 (76.5%)** starts reached a request opportunity by the data boundary. Completed timings were **15.9 / 19.2 / 46.6 days** min / median / max. All twelve March–May starts resolved; only one of five July/August starts resolved. This is why a recurring biweekly guarantee would be misleading.

Within 30 days: 10/17 (58.8%). Within 45: 12/15, with two starts lacking 45 days of follow-up. Within 60: 13/14, with three censored starts. Do not present 13/14 as an unconditional overall success rate. Null outcomes with short follow-up are censored, not silently counted as deadline failures or successes.

## Repeated reward cycles

$25k, 0.25% risk, 2% goal, 1.5× costs; each modeled completed target waits 14 days from the first trade plus a 24-hour processing handoff, removes the full gross profit and resumes from the original capital. Each observed calendar month incurs the assumed $100 fee, including months with no reward.

| Funded start | Observation months | Net after modeled fees |
| --- | --- | --- |
| March 1 | 6 | $1,429 |
| April 1 | 5 | $1,930 |
| May 1 | 4 | $1,612 |
| June 1 | 3 | $515 |
| July 1 | 2 | -$200 |

These campaigns overlap. The capital reset is a withdrawal model, not a reset of the live drawdown ledger. The actual account cycle reset never restarts trading or clears observed losses. Other 1%/5% goals and 0.40%/0.50% risk cases remain in the full evidence, including every zero month. The 1% cutoff is research-only; operational options remain 2% or 5%.

## New strategy exploration

Screened 864 parameter configurations / 1,728 short-period cases across Gold, EURUSD and USDJPY, including trend pullback, failed breakout, Donchian and London range breakout ideas. EURUSD produced no survivor meeting the screen's positive-both-periods, drawdown and participation conditions. The selected Gold trend pullback and Yen London breakout were independently implemented and run through the actual shared scanner/watch/confirmation path over March–August (264,960 minute ticks each).

Gold produced 193 confirmed entries; Yen produced 106. Both datasets' native row hashes and both canonical source hashes were checked. In the higher-cost 0.50% evaluation → 0.25% funded cases, **each single strategy and the combined selection passed 0/7** starts for either 8/5 or 10/5. Among six already-funded later starts, Gold reached one request, Yen zero, and the combination one. Short-window positive screens did not survive canonical portfolio evaluation. These configurations remain disabled research candidates and do not replace the reviewed bundle.

## Practical decision

Proceed toward a demo forward test of the reviewed bundle, with separate evaluation and funded risk settings and the firm's real payout clock. Favor serving already-funded accounts when modeling a fixed monthly fee; challenge customers need transparent multi-month expectations and fee economics. Plan for roughly 2–4 months to funding in this history, with slower cases, and a variable 2–7 week first request after funding when the target resolves. Weak market periods can last longer with no reward. Neither a one-month pass nor reliable 5% monthly / 2% biweekly income has been established.

## Official terms checked

- [FTMO withdrawal rules](https://ftmo.com/faq/how-do-i-withdraw-my-profits/): request from day 14 after first trade, flat exposure; approval and payment processing add time.
- [FundedNext Stellar 2-Step](https://fundednext.com/cfds/stellar-2-step): 8/5 targets, five trading days per phase, standard first 21-day reward cycle then 14 days.
- [FundedNext reward frequency](https://help.fundednext.com/en/articles/10701585-how-often-will-i-receive-my-performance-reward): alternative reward programs have additional conditions; they are not modeled as automatic eligibility here.

`summary.json` is the complete dashboard report; `all-scenarios.json.gz` retains the completed parameter/campaign outputs. The two compressed scanner reports and `canonical-source.tar.gz` preserve the new candidate entries and exact canonical engine source. No GitHub Actions runs are needed to reproduce the local checks.
