"""Read-only public OHLCV acquisition with official archive checksums. Never trades.
Raw archives and provenance stay outside git; normalized data is hashed in reports.
"""
import argparse,csv,datetime,hashlib,io,json,pathlib,urllib.request,zipfile,concurrent.futures,time
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--phase',choices=['development','validation','holdout'],required=True);p.add_argument('--frozen-manifest');a=p.parse_args();root=pathlib.Path(a.output);root.mkdir(parents=True,exist_ok=True)
if a.phase=='holdout':
 if not a.frozen_manifest:raise SystemExit('Frozen manifest required BEFORE fetching holdout')
 frozen=json.loads(pathlib.Path(a.frozen_manifest).read_text())
 for path,expected in frozen['engineSha256'].items():
  if hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()!=expected:raise SystemExit('FROZEN_ENGINE_CHANGED:'+path)
 if frozen.get('validationApproved') is not True:raise SystemExit('Validation must pass before fetching holdout')
 if frozen.get('holdoutConsumed'):raise SystemExit('HOLDOUT_ALREADY_CONSUMED')
months=[f'{y}-{m:02d}' for y in [2025,2026] for m in range(1,13) if (y,m)<=(2026,6)] if a.phase=='development' else ['2026-07','2026-08','2026-09'] if a.phase=='validation' else [f'2026-10-{d:02d}' for d in range(1,21)]
kind='daily' if a.phase=='holdout' else 'monthly'
def fetch(url):
 for attempt in range(3):
  try:
   with urllib.request.urlopen(url,timeout=30) as r:return r.read()
  except Exception:
   if attempt==2:raise
   time.sleep(attempt+1)
def job(spec):
 symbol,period=spec;name=f'{symbol}-1h-{period}.zip';url=f'https://data.binance.vision/data/futures/um/{kind}/klines/{symbol}/1h/{name}';raw=root/name;checksum=root/(name+'.CHECKSUM')
 if not checksum.exists():checksum.write_bytes(fetch(url+'.CHECKSUM'))
 if not raw.exists():raw.write_bytes(fetch(url))
 content=raw.read_bytes();digest=hashlib.sha256(content).hexdigest();expected=checksum.read_text().split()[0]
 if digest!=expected:raise ValueError('OFFICIAL_CHECKSUM_MISMATCH:'+name)
 with zipfile.ZipFile(io.BytesIO(content)) as z:
  names=z.namelist()
  if len(names)!=1 or not names[0].endswith('.csv'):raise ValueError('INVALID_ARCHIVE')
  records=list(csv.reader(io.TextIOWrapper(z.open(names[0]))))
 rows=[]
 for row in records:
  if not row or row[0]=='open_time':continue
  t=int(row[0]);t=t//1000 if t>10**14 else t
  rows.append(dict(symbol=symbol,market_type='crypto',timeframe='1h',open_time=datetime.datetime.fromtimestamp(t/1000,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'),open=float(row[1]),high=float(row[2]),low=float(row[3]),close=float(row[4]),volume=float(row[5]),source='BINANCE_UM_FUTURES_ARCHIVE'))
 output=root/(name.replace('.zip','.json'));text=json.dumps(rows,separators=(',',':'));output.write_text(text);meta=dict(url=url,officialZipSha256=digest,normalizedSha256=hashlib.sha256(text.encode()).hexdigest(),bars=len(rows),downloadedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),phase=a.phase)
 (root/(output.name+'.manifest.json')).write_text(json.dumps(meta,indent=2));return dict(file=output.name,**meta)
specs=[(s,d) for s in ['BTCUSDT','ETHUSDT'] for d in months]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 results=[]
 for r in pool.map(job,specs):results.append(r);print(json.dumps({'file':r['file'],'verifiedBars':r['bars']}),flush=True)
(root/'manifest.json').write_text(json.dumps(dict(phase=a.phase,sources=results),indent=2))
