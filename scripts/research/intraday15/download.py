"""Only the declared DEVELOPMENT interval; official futures archives, no trading APIs."""
import concurrent.futures
import json
import pathlib
import subprocess
import sys

if len(sys.argv) != 2:
    raise SystemExit('Usage: download.py <development-directory>')
root = pathlib.Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
protocol = json.loads(pathlib.Path('scripts/research/intraday15/protocol.json').read_text())
if protocol['developmentFrom'] != '2025-01-01T00:00:00.000Z' or protocol['developmentToExclusive'] != '2026-07-01T00:00:00.000Z':
    raise SystemExit('REVIEW_REQUIRED_FOR_CHANGED_DEVELOPMENT_INTERVAL')
months = [f'{year}-{month:02d}' for year in [2025, 2026] for month in range(1, 13) if (year, month) <= (2026, 6)]

def job(spec):
    symbol, month = spec
    output = root / f'{symbol}-15m-{month}.json'
    # Cached outputs are verified again by the runner; never declare a partial batch complete.
    if not output.exists() or not output.with_suffix('.manifest.json').exists():
        subprocess.run([sys.executable, 'scripts/research/import-binance-archive.py', '--symbol', symbol,
                        '--month', month, '--market', 'futures/um', '--timeframe', '15m', '--output', str(output)],
                       check=True, capture_output=True, text=True, timeout=100)
    print(output.name, flush=True)
    return output.name

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    names = list(pool.map(job, [(s, m) for s in protocol['symbols'] for m in months]))
print(json.dumps({'completedFiles': len(names), 'phase': 'DEVELOPMENT_ONLY'}))
