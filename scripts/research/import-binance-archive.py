"""Import a checksum-verified Binance monthly SPOT archive; no credentials or DB."""
import argparse, csv, hashlib, io, json, urllib.request, zipfile
from datetime import datetime, timezone
from pathlib import Path
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--symbol', required=True, choices=['BTCUSDT', 'ETHUSDT'])
p.add_argument('--month', required=True)
p.add_argument('--timeframe', default='1h', choices=['15m', '1h'])
p.add_argument('--output', required=True)
a = p.parse_args()
datetime.strptime(a.month, '%Y-%m')
name = f'{a.symbol}-{a.timeframe}-{a.month}.zip'
url = f'https://data.binance.vision/data/spot/monthly/klines/{a.symbol}/{a.timeframe}/{name}'
def fetch(u):
    with urllib.request.urlopen(u, timeout=45) as r:
        return r.read()
blob = fetch(url)
expected = fetch(url + '.CHECKSUM').decode().split()[0]
actual = hashlib.sha256(blob).hexdigest()
if actual != expected:
    raise ValueError('ARCHIVE_CHECKSUM_MISMATCH')
with zipfile.ZipFile(io.BytesIO(blob)) as z:
    if z.namelist() != [name[:-4] + '.csv']:
        raise ValueError('UNEXPECTED_ARCHIVE_CONTENTS')
    rows = list(csv.reader(io.StringIO(z.read(z.namelist()[0]).decode())))
# Binance switched SPOT timestamps from milliseconds to microseconds in 2025.
candles = []
for row in rows:
    stamp = int(row[0])
    seconds = stamp / (1_000_000 if stamp >= 100_000_000_000_000 else 1000)
    candles.append(dict(symbol=a.symbol, market_type='crypto', timeframe=a.timeframe,
        open_time=datetime.fromtimestamp(seconds, timezone.utc).isoformat().replace('+00:00', 'Z'),
        open=float(row[1]), high=float(row[2]), low=float(row[3]), close=float(row[4]),
        volume=float(row[5]), source='BINANCE_SPOT_ARCHIVE'))
out = Path(a.output)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(candles, separators=(',', ':')) + '\n')
manifest = dict(sourceUrl=url, checksumUrl=url+'.CHECKSUM', archiveSha256=actual,
    datasetSha256=hashlib.sha256(out.read_bytes()).hexdigest(), rows=len(candles),
    instrumentType='SPOT', warning='Spot bars do not certify futures execution or funding costs.')
out.with_suffix('.manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(json.dumps(manifest))
