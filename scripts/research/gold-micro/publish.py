"""Preserve completed research and reconcile every final trade ledger. No activation."""
import gzip, hashlib, json, math, pathlib, shutil
from features import ROOT
src = ROOT / '.tmp/gold-micro'
out = ROOT / 'docs/research/gold-micro-20261114'
out.mkdir(parents=True, exist_ok=True)
names = ['initial-screen', 'screen', 'ticks-development', 'ticks-watch-native', 'ticks-context', 'ticks-exits', 'ticks-model2', 'holdout']
studies = {n: json.loads((src / (n + '.json')).read_text()) for n in names}
final = studies['holdout']
assert [x['month'] for x in final['results']] == ['2026-08', '2026-09', '2026-10']
checked = 0
for month in final['results']:
    assert month['ticks'] == next(m['ticks'] for m in final['manifests'] if m['month'] == month['month'])
    assert len(month['results']) == 15
    for case in month['results']:
        arm, trades = case['arm'], case['trades']
        assert len(trades) == case['closedTrades']
        balance = arm['capital']
        for t in trades:
            opened, closed, side, entry, exit_, qty, net, net_r, reason, risk, best, hold = t
            assert all(math.isfinite(v) for v in t)
            assert closed >= opened and side in [-1, 1] and qty >= .01
            assert math.isclose(qty * 100, round(qty * 100), abs_tol=1e-7)
            assert math.isclose(net, side * (exit_ - entry) * qty * 100 - 2 * qty * arm['commission'], abs_tol=1e-6)
            assert math.isclose(net_r, net / risk, abs_tol=1e-8)
            assert math.isclose(hold, (closed-opened)/60000, abs_tol=1e-8)
            assert risk <= balance * arm['risk'] / 100 + 1e-6
            balance += net
            checked += 1
        assert math.isclose(balance, case['endingBalance'], abs_tol=1e-6)
        assert math.isclose((balance / arm['capital'] - 1)*100, case['returnPct'], abs_tol=1e-7)
        assert math.isclose(sum(2*t[5]*arm['commission'] for t in trades), case['costs'], abs_tol=1e-6)
        if trades:
            gains = sum(max(0,t[6]) for t in trades)
            losses = -sum(min(0,t[6]) for t in trades)
            if losses: assert math.isclose(gains/losses, case['profitFactor'], abs_tol=1e-8)
summary = dict(schema='gold-micro-summary/v1', decision='RETAIN_DISABLED_RESEARCH_CANDIDATE_OCTOBER_HOLDOUT_FAILED',
    selected=final['frozen'], manifests=final['manifests'],
    screeningCases=sum(studies[n]['accountCases'] for n in ['initial-screen','screen']),
    orderedTickMonthCases=sum(len(m['results']) for n in names[2:] for m in studies[n]['results']),
    finalLedgerTradesReconciled=checked,
    months=[dict(month=m['month'],ticks=m['ticks'],results=[{k:v for k,v in r.items() if k!='trades'} for r in m['results']]) for m in final['results']],
    qualification=False, productionWiringChanged=False,
    caveats=['Correlated exploratory searches, not independent probabilities.',
             'October was read after selecting the aligned candidate; no replacement selected on October.',
             'Earlier engine snapshots are exploratory: final model freezes stops/targets before delayed fill.',
             'Each month/account case starts fresh. No challenge or actual payout was simulated.',
             'Exness reference quotes and hypothetical execution costs; not customer broker fills.',
             'Small account sizing failures are retained. No risk or leverage override.',
             'Research only: profile guards are numerical scenarios, not full prop firm compliance.',
             'Incomplete WATCH run excluded. No live orders, deployment or CI dispatch.'])
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(out/'data-manifests.json').write_text(json.dumps(final['manifests'],indent=2)+'\n')
archive=dict(schema='gold-micro-completed-studies/v1', studies=studies,
    interpretation='Only holdout is final frozen-decision engine evidence. Earlier studies are development/screening and may use prior engine semantics. Do not sum positive variants into success probabilities.')
with gzip.GzipFile(filename=str(out/'completed-studies.json.gz'), mode='wb',mtime=0) as f:
    f.write(json.dumps(archive,separators=(',',':')).encode())
for name in ['initial-source','closed-tick-source','watch-native-source','context-source','exits-source','model2-source','holdout-source']:
    shutil.copyfile(src/(name+'.tar.gz'),out/(name+'.tar.gz'))
files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.iterdir()) if p.is_file() and p.name!='SHA256SUMS.json'}
(out/'SHA256SUMS.json').write_text(json.dumps(files,indent=2)+'\n')
print(json.dumps({k:summary[k] for k in ['screeningCases','orderedTickMonthCases','finalLedgerTradesReconciled','decision']}))
