"""Final evidence audit and explicit product/risk separation; never promotion."""
import gzip,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/research/edge-evidence-20261127'


def main():
    card=json.loads((OUT/'scorecard.json').read_text())
    simple=json.loads(gzip.decompress((OUT/'simple-scalp-receipts.json.gz').read_bytes()))
    native=json.loads(gzip.decompress((OUT/'native-gold-receipts.json.gz').read_bytes()))
    if hashlib.sha256((ROOT/'supabase/functions/_shared/broker-strategy-families.ts').read_bytes()).hexdigest()!=native['production_entry_sha256']:raise ValueError('PRODUCTION_ENTRY_SOURCE_CHANGED')
    audited=0
    for run in (simple,native):
        source='simple_ticks.cpp' if run is simple else 'native_gold_ticks.cpp'
        if hashlib.sha256((ROOT/'scripts/research/gold-turbo'/source).read_bytes()).hexdigest()!=run['engine_sha256']:raise ValueError('EXECUTION_SOURCE_CHANGED')
        if run['result']['ticks']!=5910062:raise ValueError('PARTIAL_TICK_MONTH')
        for r in run['result']['results']:
            if abs(r['endingBalance']-r['arm']['capital']-sum(t[6] for t in r['trades']))>1e-6:raise ValueError('CASH_MISMATCH')
            if len(r['trades'])!=r['closedTrades'] or any(t[1]<t[0] or t[5]<.01-1e-8 for t in r['trades']):raise ValueError('INVALID_RECEIPTS')
            audited+=1
    for r in card['configurations']:
        if abs(sum(m['net_r'] for m in r['months'])-r['net_r'])>1e-7:raise ValueError('MONTHLY_R_MISMATCH')
    status=dict(schema='edge-evidence-audit/v1',verified_source_reports=card['source_reports_verified'],retained_trade_count=1159,existing_configuration_count=16,turbo_configuration_count=5,real_tick_count=5910062,account_cases=audited,monthly_r_reconciled=True,account_cash_reconciled=True,production_source_unchanged=True,activation=False)
    (OUT/'audit.json').write_text(json.dumps(status,indent=2)+'\n')
    lines=['# Evidence-first HashiBot qualification: November 27, 2026','',
'No paid/live execution, account configuration, product defaults or strategy IDs were changed. This work reuses the retained ledger and October ticks; no additional data download or optimization sweep. All 21 configurations are accounted for: 16 retained configurations and five Turbo additions.', '',
'## Existing evidence was stronger than the recent Turbo results suggested','',
'All 16 retained configurations have positive net R after their recorded source costs. The strongest evidence candidates include Crypto 4h trend pullback (109 decisions, +42.45R, PF 1.49, both chronological halves positive), Gold 15m momentum (101, +32.37R, PF 1.44, both halves positive) and GBPUSD RSI2 (37, +12.46R, PF 1.91, both halves positive). These are selected historical ledgers, not new tests or proof of future profitability. Crypto trend pullback also had a -11.79R complete month, so aggregate gains must not hide losing periods.', '',
'SCORECARD.md and scorecard.json preserve every available month in net R, exact covered intervals, partial-month labels, chronological halves, expectancy, win rate, holding time and closed-trade R drawdown. Thirty decompressed source-report hashes and all 1,159 unique ledger decisions were verified. No customer percentage returns were invented from R. Closed-trade R drawdown is not account equity drawdown.', '',
'## One simple Turbo idea was rejected rather than optimized until positive','',
'The fixed new hypothesis was previous-bar RSI2 exhaustion, a completed M1 reversal and M5 EMA9/21 trend alignment. One 1R target, two-bar structural stop with .5 ATR floor / 1.5 ATR ceiling, five-minute timeout, 08:00–16:00 UTC. No grids, hedging, scaling or compounding recovery. Base costs: observed spread, $3.50/lot/side commission, .02 USD/oz adverse slippage per side, 200ms order/management latency. Stress: .05 slippage / 500ms. Four account sizes, whole month and independent earlier/later accounts: 24 cases.', '',
'After final execution checks, $25k at .15% decision risk returned **-6.68%** over October, PF .63, 240 decisions, about 2.08 minutes average hold. Stress was -7.21%. Both earlier and later partitions lost. It is not integrated into the five Turbo engines or promoted. The previous provisional -6.79% result was superseded by pending-order expiry/quote-gap and account-guard reconciliation; the final complete receipts are retained.', '',
'## New test of three frozen existing Gold Standard configurations','',
'Actual evaluateBrokerFamily production entry functions generated candidates from observed M15/H1 native quote candles, with the existing frozen parameters. Both sides are supported. Every one of the 5,910,062 October bid/ask ticks drives an isolated delayed-fill, one-position execution screen. No saved-ledger trade path was reused as fresh entries. Full original stop/TP geometry is preserved; source TP is not moved to improve results. Production entry bundle, source and execution-engine hashes are retained.', '',
'These are existing Gold Standard intraday/swing rules, not redesigned Turbo scalps. Their original 48/96-hour maximum holding limits were preserved. The Turbo code and holding limits are unchanged by this work.', '',
'Risk scenarios are explicit and separate: QUALIFICATION_025 = .25% risk / 1.5% daily / 8% peak; RESTRICTED_1 = 1% / 1.5% / 8%; STANDARD_LIMITS_FIXED_1 = fixed 1% risk / existing Standard 4% daily / 18% peak. The last scenario reads/verifies repository Standard limits but does NOT simulate dynamic House-Money risk changes. This is a policy compatibility comparison, not authorization to raise any customer or Turbo limits.', '',
'Contract scenario: USD, 100 oz/lot, .01 minimum/step, cent rounding, 1:100 leverage, 20% entry-margin budget, observed bid/ask, stated commission/slippage and delayed quote fills. Daily baselines include unrealized equity at the first observed tick of the UTC day; loss guards mark every tick and schedule closure. Stops and daily locks do not guarantee gap-free execution.', '',
'All returns below are for one full October 2026 account, $25,000, after observed spread, scenario commission and slippage, **before unverified financing and subscription**. Every configuration is a separate account; do not add these returns as a portfolio.', '',
'| Existing Gold configuration | Risk/limits scenario | Base return | Stressed return | Base equity DD | Base decisions |',
'| --- | --- | ---: | ---: | ---: | ---: |']
    rows=[r for r in native['result']['results'] if r['arm']['capital']==25000]
    for r in rows:
        if r['arm']['stress']:continue
        stress=next(x for x in rows if x['arm']['strategy_id']==r['arm']['strategy_id'] and x['arm']['profile']==r['arm']['profile'] and x['arm']['stress'])
        lines.append(f"| {r['arm']['strategy_id']} | {r['arm']['profile']} | {r['returnPct']:+.2f}% | {stress['returnPct']:+.2f}% | {r['drawdownPct']:.2f}% | {r['closedTrades']} |")
    lines += ['',
'**Correction of the provisional update:** band reentry at 1% risk under the 1.5% daily restriction did not retain the provisional +7.55% once overnight floating equity was handled correctly; its final result is -0.66%. This negative case is retained. The +6.22% result uses the separately disclosed existing Standard-limit scenario. It must not be presented as +6.22% under a 1.5% daily limit. The conservative .25% / 1.5% result is +1.20%.', '',
'Increasing per-trade risk without matching the account guard changed which trades survived and were admitted. At fixed 1% with the tight 1.5% daily restriction, all three configurations lost. The conservative .25% case was positive for all three. No automatic escalation or replacement of Turbo protection was introduced.', '',
'Financing is unavailable and was set to zero. Native summaries explicitly name profit before financing after an illustrative $100 monthly fee and include financing exposure in lot-days and an algebraic break-even continuous financing budget. These are sensitivity quantities, not actual broker swap charges or a re-simulation with financing. Actual swap timing, triple charges, contract specifications, historical news and full live execution still need qualification. Do not advertise results as after all real broker costs.', '',
'For band reentry, the Standard-limit $25k case left approximately $1,453.89 after the illustrative $100 fee, before financing, with 6.45% equity drawdown. The conservative case left $201.15 before financing. This supports prioritizing native demo qualification at suitable capital, not a guarantee or a 20% monthly forecast.', '',
'$100/$500 native Standard cases could not execute minimum volume under these scenarios. At $1,000, only some momentum cases filled, with negative observed Standard-limit outcome; band/h1 configurations remained inactive. Do not sell a $100/month small-account Gold automation promise from these results. Compatible cent contracts and subscription-adjusted small-account profitability remain unverified.', '',
'## Data-preparation issue found and corrected in this screen','',
'An initial native-entry extraction incorrectly required a quote-bearing M1 row in every minute of an M15/H1 bucket. That dropped valid observed session-edge candles and repeatedly prevented the required warmup. It was not evidence that the production strategy never trades. The corrected preparer aggregates every nonempty native quote bucket, creates no empty bars, and keeps production market-calendar continuity validation active. Candidate counts after correction: 93 M15 momentum, 24 H1 momentum, 41 M15 band reentry. Counts of incomplete wall-clock buckets and normalized-data hash are preserved.', '',
'The prior Python Turbo replay has a stricter complete-M1-bucket preparation policy. Its published outputs are retained as protocol-specific screens, not silently replaced. A future like-for-like Turbo qualification comparison should explicitly review native session-edge handling before accepting a full-month result. This work does not claim that correcting this preparation makes Turbo profitable.', '',
'## What this supports next','',
'Prioritize native broker demo matching for the existing Gold band-reentry and conservatively sized momentum configurations, while separately validating Crypto trend pullback and GBPUSD RSI2 on retained/new genuinely missing market history. Use the scorecard to avoid giving weak configurations equal commercial weight merely to offer 21. Preserve all five Turbo implementations, but their positive-edge requirement remains open; the failed simple M1 hypothesis is not a replacement.', '',
'One October month cannot establish stable median monthly returns, profitable-month percentage, survival probability or commercial qualification. October was already observed in other research; this is not pristine untouched out-of-sample validation. The frozen existing entry parameters were not optimized on these new account outcomes. Positive source and tick-screen results are evidence worth further qualification, not paid/live activation.', '',
'## Verification and reproducibility','',
'Nine new targeted screening tests pass: long/short stop gaps, fees/cash conservation, delayed entry, stale pending cancellation, minimum-lot risk rejection, margin entry budget, daily lock after gaps, overnight floating-equity baseline, explicit separation of Standard limits, prefix-invariant causal features and retaining native session-edge candles without empty filling (some tests cover multiple assertions). Both C++ engines compile with g++ and the production-entry TypeScript script bundles with esbuild. Ninety-six complete-account receipt/cash audits pass (24 fixed-hypothesis + 72 existing-Gold scenario cases); all ledger monthly R sums reconcile. No full-repository suite or actual broker session was run.', '',
'Commands: evidence_scorecard.py; prepare_native_gold.py; bundle/run native_gold_signals.ts; simple_edge.py; native_gold_edge.py; test_simple_edge.py; edge_report.py. Input October archives/M1 rows are the previously preserved data; no new download. The .tmp outputs are reproducible, complete receipts/summary/configuration/source hashes are committed, and neither the 1,159-trade source ledger nor production strategies were modified.', '']
    (OUT/'FINDINGS.md').write_text('\n'.join(lines))
    print(json.dumps(status,indent=2))

if __name__=='__main__':main()
