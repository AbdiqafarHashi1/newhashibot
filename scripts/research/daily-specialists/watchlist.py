"""Fixed-scope corroboration of the original slow EMA model, not a new scanner."""
import concurrent.futures
import gzip
import hashlib
import importlib.util
import json
import pathlib
import sys
import urllib.parse
import urllib.request
import numpy as np

HERE = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('spot', HERE.parent/'spot-swing-study.py')
spot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spot)


def acquire(root, symbol, stage):
    start, end = spot.epoch(stage['from']), spot.epoch(stage['until'])
    cursor, all_rows, sources, seen = start, [], [], False
    reset = start
    for page in range(4):
        if cursor >= end:
            break
        url = 'https://data-api.binance.vision/api/v3/klines?'+urllib.parse.urlencode(dict(symbol=symbol, interval='1d', startTime=cursor, endTime=end-1, limit=1000))
        path = root/f"{symbol}-{stage['name']}-{page}.json"
        old = root.parent/'spot-daily'/path.name
        if not path.exists() and old.exists():
            path.write_bytes(old.read_bytes())
        if not path.exists():
            with urllib.request.urlopen(url, timeout=25) as response:
                raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise ValueError('SOURCE_SIZE_BOUND')
            path.write_bytes(raw)
        raw = path.read_bytes()
        rows = json.loads(raw)
        if not isinstance(rows, list) or not rows:
            raise ValueError('SOURCE_EMPTY')
        first = int(rows[0][0])
        if first != cursor:
            if seen or stage['name'] != 'DEVELOPMENT' or first < cursor or first >= end:
                raise ValueError('SOURCE_GAP')
            reset = first
        if any(int(r[0]) != first+i*spot.DAY or int(r[0]) >= end for i, r in enumerate(rows)):
            raise ValueError('SOURCE_CADENCE')
        unusual = [int(r[0]) for r in rows if int(r[6]) != int(r[0])+spot.DAY-1]
        if unusual:
            if stage['name'] != 'DEVELOPMENT' or any(t >= start+250*spot.DAY for t in unusual):
                raise ValueError('NONSTANDARD_CLOSE')
            reset = max(reset, max(unusual)+spot.DAY)
        sources.append(dict(symbol=symbol, stage=stage['name'], url=url, rawSha256=spot.sha(raw), rows=len(rows), vendorChecksum=False, initialPrelistingGap=first-cursor if not seen else 0, excludedPrefixThrough=reset, nonstandardCloses=unusual))
        all_rows.extend([[int(r[0]), *[float(r[j]) for j in [1, 2, 3, 4, 5]]] for r in rows])
        cursor, seen = int(rows[-1][0])+spot.DAY, True
    a = np.asarray(all_rows, float)
    if cursor != end or not np.isfinite(a).all() or (a[:, 3] <= 0).any() or (a[:, 3] > np.minimum(a[:, 1], a[:, 4])).any() or (a[:, 2] < np.maximum(a[:, 1], a[:, 4])).any() or (a[:, 5] < 0).any():
        raise ValueError('SOURCE_ADMISSION')
    return a[a[:, 0] >= reset], sources


def run(root):
    root.mkdir(parents=True, exist_ok=True)
    protocol = json.loads((HERE/'watchlist-protocol.json').read_text())
    files = [HERE/'watchlist-protocol.json', pathlib.Path(__file__), HERE.parent/'spot-swing-study.py']
    frozen = {str(f): spot.sha(f.read_bytes()) for f in files}
    history, cases, sources = {}, [], []
    for si, stage in enumerate(protocol['stages']):
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            parts = list(executor.map(lambda symbol: acquire(root, symbol, stage), protocol['assets']))
        assets = []
        for symbol, (part, metadata) in zip(protocol['assets'], parts):
            sources.extend(metadata)
            history[symbol] = np.vstack([history[symbol], part]) if symbol in history else part
            # Original model requires200bar warmup. Never reset the indicator history at stage boundaries.
            trades = spot.simulate(history[symbol], 'EMA20_50_REGIME', spot.epoch(stage['from']), spot.epoch(stage['until']))
            assets.append(dict(symbol=symbol, metrics=spot.metrics(trades), trades=trades))
        pooled = spot.metrics([t for a in assets for t in a['trades']])
        minimum = protocol['gates'][['developmentTrades', 'validationTrades', 'recentTrades'][si]]
        failures = []
        if pooled['trades'] < minimum:
            failures.append('SAMPLE')
        if pooled['netPF'] is None or pooled['netPF'] < 1.2:
            failures.append('NET_PF')
        if pooled['stressPF'] is None or pooled['stressPF'] <= 1:
            failures.append('COST_STRESS')
        if any(a['metrics']['trades'] < protocol['gates']['assetMinimums'][si] or (a['metrics']['meanNet'] or -1) <= 0 for a in assets):
            failures.append('ASSET_EVIDENCE')
        case = dict(stage=stage['name'], pooled=pooled, failures=failures, assets=assets)
        cases.append(case)
        print(json.dumps({**case, 'assets':[{'symbol':a['symbol'], 'metrics':a['metrics']} for a in assets]}), flush=True)
        if failures:
            break
    if any(spot.sha(pathlib.Path(f).read_bytes()) != digest for f, digest in frozen.items()):
        raise ValueError('FROZEN_ENGINE_CHANGED')
    report = dict(protocol=protocol, sourceHashes=frozen, sources=sources, cases=cases, publication=False, execution=False)
    folder = pathlib.Path('docs/research/daily-specialists')
    folder.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(report, indent=2)+'\n').encode()
    z = gzip.compress(raw, mtime=0)
    (folder/'watchlist-evidence.json.gz').write_bytes(z)
    (folder/'watchlist-summary.json').write_text(json.dumps(dict(protocol=protocol, sourceHashes=frozen, cases=[{**c, 'assets':[{'symbol':a['symbol'], 'metrics':a['metrics']} for a in c['assets']]} for c in cases], compressedSha256=spot.sha(z), uncompressedSha256=spot.sha(raw)), indent=2)+'\n')
    bundle = dict(sources={p.name:p.read_text() for p in sorted(root.glob('*.json'))})
    (folder/'watchlist-source-responses.json.gz').write_bytes(gzip.compress(json.dumps(bundle).encode(), mtime=0))


if __name__ == '__main__':
    run(pathlib.Path(sys.argv[1]))
