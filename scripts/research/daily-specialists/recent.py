"""Frozen recent-date corroboration for the one fixed-bracket candidate."""
import gzip
import importlib.util
import json
import pathlib
import sys
import numpy as np

HERE = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('bracket', HERE/'ema-bracket.py')
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)


def run(root):
    protocol = json.loads((HERE/'recent-protocol.json').read_text())
    files = [pathlib.Path(__file__), HERE/'recent-protocol.json', HERE/'ema-bracket.py', HERE/'ema-bracket-protocol.json', HERE/'study.py', HERE.parent/'spot-swing-study.py']
    hashes = {str(f): model.daily.spot.sha(f.read_bytes()) for f in files}
    sources, assets = [], []
    for symbol in protocol['assets']:
        stages = [dict(name='DEVELOPMENT', **{'from':'2018-01-01', 'until':'2022-01-01'}), dict(name='VALIDATION', **{'from':'2022-01-01', 'until':'2025-01-01'}), protocol['period']]
        a = np.vstack([model.daily.spot.fetch_stage(root, symbol, stage, sources) for stage in stages])
        rows, excluded = model.daily.simulate(a, 'EMA_BRACKET', dict(stopATR=2, targetATR=6, maxBars=30), model.daily.spot.epoch(protocol['period']['from']), model.daily.spot.epoch(protocol['period']['until']))
        assets.append(dict(symbol=symbol, metrics=model.daily.metrics(rows), outcomes=rows, excluded=excluded))
    pooled = model.daily.metrics([r for a in assets for r in a['outcomes']])
    failures = []
    if pooled['resolved'] < 30:
        failures.append('SAMPLE')
    if pooled['netPF'] is None or pooled['netPF'] < 1.2:
        failures.append('NET_PF')
    if pooled['stressPF'] is None or pooled['stressPF'] <= 1:
        failures.append('COST_STRESS')
    if any(a['metrics']['resolved'] < 10 or (a['metrics']['meanR'] or -1) <= 0 for a in assets):
        failures.append('ASSET_EVIDENCE')
    assert all(model.daily.spot.sha(pathlib.Path(f).read_bytes()) == h for f, h in hashes.items()), 'FROZEN_ENGINE_CHANGED'
    report = dict(protocol=protocol, sourceHashes=hashes, sources=sources, pooled=pooled, assets=assets, failures=failures, publication=False, execution=False)
    path = pathlib.Path('docs/research/daily-specialists/recent-evidence.json.gz')
    path.write_bytes(gzip.compress((json.dumps(report, indent=2)+'\n').encode(), mtime=0))
    print(json.dumps(dict(pooled=pooled, failures=failures)), flush=True)


if __name__ == '__main__':
    run(pathlib.Path(sys.argv[1]))
