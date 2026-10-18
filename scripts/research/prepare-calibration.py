"""Download checksum-verified public archives for the fixed scanner calibration protocol."""
import argparse, concurrent.futures, json, subprocess, sys
from pathlib import Path
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--output', required=True)
a = p.parse_args()
root = Path(__file__).resolve().parent
protocol_raw = (root / 'calibration-protocol.json').read_text()
protocol = json.loads(protocol_raw)
out = Path(a.output)
out.mkdir(parents=True, exist_ok=True)
(out / 'protocol.json').write_text(protocol_raw)
def download(item):
    symbol, month, timeframe = item
    dest = out / f"{symbol}-{month}{'' if timeframe == '1h' else '-'+timeframe}.json"
    return subprocess.run([sys.executable, str(root / 'import-binance-archive.py'), '--symbol', symbol,
        '--month', month, '--timeframe', timeframe, '--market', protocol['market'], '--output', str(dest)],
        capture_output=True, text=True)
items = [(symbol, month, tf) for split in ['development', 'validation', 'holdout']
         for month in protocol[split] for symbol in protocol['symbols'] for tf in protocol['timeframes']]
failed = 0
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for result in pool.map(download, items):
        failed += result.returncode != 0
        print(result.stderr if result.returncode else result.stdout, end='', flush=True)
if failed:
    raise SystemExit(f'ARCHIVE_PREPARATION_FAILED: {failed}; no calibration started')
print(f'Prepared {len(items)} source-verified datasets in {out}')
