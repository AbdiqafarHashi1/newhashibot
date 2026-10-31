"""Three prespecified long/cash daily hypotheses. Offline cache; never submits orders."""
import gzip
import hashlib
import importlib.util
import json
import pathlib
import sys
import numpy as np

HERE = pathlib.Path(__file__).parent
SPEC = importlib.util.spec_from_file_location('spot', HERE.parent / 'spot-swing-study.py')
spot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(spot)
DAY = 86400000


def rsi(values, n=2):
    out = np.full(len(values), np.nan)
    changes = np.diff(values)
    gain, loss = np.maximum(changes[:n], 0).mean(), np.maximum(-changes[:n], 0).mean()
    for i in range(n, len(values)):
        if i > n:
            gain = ((n-1)*gain + max(changes[i-1], 0))/n
            loss = ((n-1)*loss + max(-changes[i-1], 0))/n
        out[i] = 100*gain/(gain+loss) if gain+loss else 50
    return out


def features(a):
    close = a[:, 4]
    band = np.full(len(a), np.nan)
    for i in range(19, len(a)):
        window = close[i-19:i+1]
        band[i] = window.mean()-2*window.std()
    return spot.ema(close, 200), spot.atr14(a), rsi(close), band


def signal(a, i, mode, f):
    ema, atr, strength, band = f
    if i < 249 or not a[i, 4] > ema[i] or not np.isfinite(atr[i]) or atr[i] <= 0:
        return False
    if mode == 'BULL_DIP':
        return strength[i] < 10 and a[i, 4] < a[i-1, 4]
    if mode == 'REJECTED_SELLOFF':
        return a[i-1, 4] < band[i-1] and a[i, 4] > band[i] and a[i, 4] > a[i, 1]
    if mode == 'SLOW_BREAKOUT':
        return a[i, 4] > a[i-55:i, 2].max()
    raise ValueError('UNKNOWN_MODE')


def simulate(a, mode, rule, start, end):
    f = features(a)
    selected = []
    excluded = []
    busy_until = -1
    for i in range(249, len(a)-1):
        at = int(a[i, 0])+DAY
        if at < start or at >= end or i <= busy_until or not signal(a, i, mode, f):
            continue
        entry = float(a[i+1, 1])
        stop = float(a[i, 4]-rule['stopATR']*f[1][i])
        target = float(a[i, 4]+rule['targetATR']*f[1][i])
        if stop <= 0 or entry <= stop or entry >= target:
            excluded.append(dict(signalAt=at, reason='GAP_GEOMETRY'))
            continue
        risk = entry-stop
        path = [j for j in range(i+1, min(len(a), i+1+rule['maxBars'])) if a[j, 0] < end]
        outcome = dict(signalAt=at, entryAt=int(a[i+1, 0]), entry=entry, stop=stop, target=target, risk=risk, status='OPEN', netR=None, stressR=None)
        busy_until = path[-1] if path else i
        for j in path:
            fill = None
            if a[j, 3] <= stop:
                fill, reason = min(stop, float(a[j, 1])), 'STOP'
            elif a[j, 2] >= target:
                fill, reason = target, 'TARGET'
            elif j == path[-1] and len(path) == rule['maxBars']:
                fill, reason = float(a[j, 4]), 'TIMEOUT'
            if fill is not None:
                gross = (fill-entry)/risk
                cost = entry*.0026/risk
                outcome.update(exitAt=int(a[j, 0])+DAY, exit=fill, status=reason, grossR=gross, costR=cost, netR=gross-cost, stressR=gross-1.5*cost, bars=j-i)
                busy_until = j  # No same-bar reentry.
                break
        selected.append(outcome)
    return selected, excluded


def metrics(rows):
    values = [r['netR'] for r in rows if r['netR'] is not None]
    stress = [r['stressR'] for r in rows if r['stressR'] is not None]
    def pf(v):
        loss = -sum(x for x in v if x < 0)
        return sum(x for x in v if x > 0)/loss if loss else None
    return dict(selected=len(rows), resolved=len(values), open=len(rows)-len(values), netPF=pf(values), stressPF=pf(stress), meanR=sum(values)/len(values) if values else None)


def run(root):
    protocol = json.loads((HERE/'protocol.json').read_text())
    files = [HERE/'protocol.json', pathlib.Path(__file__), HERE.parent/'spot-swing-study.py']
    hashes = {str(f): spot.sha(f.read_bytes()) for f in files}
    cases, sources, history = [], [], {}
    eligible = list(protocol['rules'])
    for stage in protocol['stages']:
        if not eligible:
            cases.append(dict(stage=stage['name'], status='BLOCKED_PREVIOUS_STAGE'))
            break
        for symbol in protocol['assets']:
            # No network in this study: archived responses already acquired and retained.
            if not (root/f"{symbol}-{stage['name']}-0.json").exists():
                raise ValueError('VERIFIED_CACHE_REQUIRED')
            part = spot.fetch_stage(root, symbol, stage, sources)
            history[symbol] = np.vstack([history[symbol], part]) if symbol in history else part
        next_eligible = []
        for mode in eligible:
            assets = []
            for symbol in protocol['assets']:
                a = history[symbol]
                rows, excluded = simulate(a, mode, protocol['rules'][mode], spot.epoch(stage['from']), spot.epoch(stage['until']))
                admitted = a[(a[:, 0] >= spot.epoch(stage['from'])) & (a[:, 0] < spot.epoch(stage['until']))]
                if stage['name'] == 'DEVELOPMENT':
                    admitted = admitted[249:]
                baseline = float(admitted[-1, 4]/admitted[0, 1]-1-.0026)
                assets.append(dict(symbol=symbol, metrics=metrics(rows), outcomes=rows, excluded=excluded, buyHoldNetReturn=baseline))
            pooled = metrics([r for a in assets for r in a['outcomes']])
            minimum = protocol['gates']['developmentTrades' if stage['name'] == 'DEVELOPMENT' else 'validationTrades']
            failures = []
            if pooled['resolved'] < minimum:
                failures.append('SAMPLE')
            if pooled['netPF'] is None or pooled['netPF'] < protocol['gates']['netPF']:
                failures.append('NET_PF')
            if pooled['stressPF'] is None or pooled['stressPF'] <= protocol['gates']['stressPF']:
                failures.append('COST_STRESS')
            if any(a['metrics']['resolved'] < protocol['gates']['minEachAsset'] or (a['metrics']['meanR'] or -1) <= 0 for a in assets):
                failures.append('ASSET_EVIDENCE')
            cases.append(dict(stage=stage['name'], mode=mode, pooled=pooled, failures=failures, assets=assets))
            if not failures:
                next_eligible.append(mode)
            print(json.dumps(dict(stage=stage['name'], mode=mode, pooled=pooled, failures=failures)), flush=True)
        eligible = next_eligible
    if any(spot.sha(pathlib.Path(f).read_bytes()) != h for f, h in hashes.items()):
        raise ValueError('FROZEN_ENGINE_CHANGED')
    report = dict(protocol=protocol, sourceHashes=hashes, sources=sources, cases=cases, eligibleResearchModes=eligible, publication=False, execution=False)
    folder = pathlib.Path('docs/research/daily-specialists')
    folder.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(report, indent=2)+'\n').encode()
    z = gzip.compress(raw, compresslevel=9, mtime=0)
    (folder/'evidence.json.gz').write_bytes(z)
    (folder/'summary.json').write_text(json.dumps(dict(protocol=protocol, sourceHashes=hashes, cases=[{**c, 'assets':[{k:v for k,v in a.items() if k not in ['outcomes', 'excluded']} for a in c.get('assets', [])]} for c in cases], eligibleResearchModes=eligible, compressedSha256=spot.sha(z), uncompressedSha256=spot.sha(raw)), indent=2)+'\n')


if __name__ == '__main__':
    run(pathlib.Path(sys.argv[1]))
