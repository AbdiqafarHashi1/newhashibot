"""One fixed scanner-compatible adaptation; no parameter search or promotion."""
import importlib.util
import gzip
import json
import pathlib
import sys
import numpy as np

HERE = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('daily', HERE/'study.py')
daily = importlib.util.module_from_spec(spec)
spec.loader.exec_module(daily)
original_signal = daily.signal


def ema_signal(a, i, mode, f):
    ema, atr, _, _ = f
    if mode != 'EMA_BRACKET':
        return original_signal(a, i, mode, f)
    return i >= 249 and a[i, 4] > ema[i] and atr[i] > 0 and daily.spot.ema(a[:i+1, 4], 20)[-1] > daily.spot.ema(a[:i+1, 4], 50)[-1]


daily.signal = ema_signal


def run(root):
    protocol = json.loads((HERE/'ema-bracket-protocol.json').read_text())
    files = [HERE/'ema-bracket-protocol.json', pathlib.Path(__file__), HERE/'study.py', HERE.parent/'spot-swing-study.py']
    hashes = {str(f): daily.spot.sha(f.read_bytes()) for f in files}
    history, sources, cases = {}, [], []
    for stage in protocol['stages']:
        assets = []
        for symbol in protocol['assets']:
            part = daily.spot.fetch_stage(root, symbol, stage, sources)
            history[symbol] = np.vstack([history[symbol], part]) if symbol in history else part
            rows, excluded = daily.simulate(history[symbol], 'EMA_BRACKET', protocol, daily.spot.epoch(stage['from']), daily.spot.epoch(stage['until']))
            assets.append(dict(symbol=symbol, metrics=daily.metrics(rows), outcomes=rows, excluded=excluded))
        pooled = daily.metrics([r for a in assets for r in a['outcomes']])
        failures = []
        if pooled['resolved'] < protocol['gates']['developmentTrades' if stage['name'] == 'DEVELOPMENT' else 'validationTrades']:
            failures.append('SAMPLE')
        if pooled['netPF'] is None or pooled['netPF'] < 1.2:
            failures.append('NET_PF')
        if pooled['stressPF'] is None or pooled['stressPF'] <= 1:
            failures.append('COST_STRESS')
        if any(a['metrics']['resolved'] < 10 or (a['metrics']['meanR'] or -1) <= 0 for a in assets):
            failures.append('ASSET_EVIDENCE')
        cases.append(dict(stage=stage['name'], pooled=pooled, failures=failures, assets=assets))
        print(json.dumps({k:v for k,v in cases[-1].items() if k != 'assets'}), flush=True)
        if failures:
            break
    assert all(daily.spot.sha(pathlib.Path(f).read_bytes()) == h for f, h in hashes.items()), 'FROZEN_ENGINE_CHANGED'
    report = dict(protocol=protocol, sourceHashes=hashes, sources=sources, cases=cases, publication=False, execution=False)
    folder = pathlib.Path('docs/research/daily-specialists')
    folder.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(report, indent=2)+'\n').encode()
    z = gzip.compress(raw, compresslevel=9, mtime=0)
    (folder/'ema-bracket.json.gz').write_bytes(z)
    (folder/'ema-bracket-summary.json').write_text(json.dumps(dict(protocol=protocol, cases=[{**c, 'assets':[{'symbol':a['symbol'], 'metrics':a['metrics']} for a in c['assets']]} for c in cases], compressedSha256=daily.spot.sha(z), uncompressedSha256=daily.spot.sha(raw)), indent=2)+'\n')


if __name__ == '__main__':
    run(pathlib.Path(sys.argv[1]))
