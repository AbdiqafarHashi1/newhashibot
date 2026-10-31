"""Local cached official-source replay fixture; no acquisition or trading calls."""
import gzip,hashlib,importlib.util,json,pathlib,sys
root=pathlib.Path(sys.argv[1]);out=pathlib.Path('docs/research/daily-connected');out.mkdir(exist_ok=True,parents=True)
spec=importlib.util.spec_from_file_location('spot','scripts/research/spot-swing-study.py');spot=importlib.util.module_from_spec(spec);spec.loader.exec_module(spot)
assets=[];sources=[]
for symbol in ['BTCUSDT','ETHUSDT']:
 rows=[]
 for stage in ['DEVELOPMENT','VALIDATION','RECENT_EXTENSION']:
  for p in sorted(root.glob(f'{symbol}-{stage}-*.json')):
   raw=p.read_bytes();part=json.loads(raw);rows.extend(part);sources.append({'symbol':symbol,'file':p.name,'rawSha256':hashlib.sha256(raw).hexdigest(),'rows':len(part),'origin':'https://data-api.binance.vision/api/v3/klines','vendorChecksum':False})
 reset=max([int(r[0])+spot.DAY for r in rows if int(r[6])!=int(r[0])+spot.DAY-1],default=int(rows[0][0]));rows=[r for r in rows if int(r[0])>=reset]
 assert all(int(r[0])==int(rows[0][0])+i*spot.DAY for i,r in enumerate(rows))
 candles=[dict(symbol=symbol,market_type='crypto',timeframe='1d',open_time=__import__('datetime').datetime.fromtimestamp(int(r[0])/1000,__import__('datetime').timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'),open=float(r[1]),high=float(r[2]),low=float(r[3]),close=float(r[4]),volume=float(r[5]),source='BINANCE_KLINES',instrument_type='SPOT')for r in rows]
 a=__import__('numpy').array([[int(r[0]),*[float(r[k])for k in [1,2,3,4,5]]]for r in rows])
 expected=spot.simulate(a,'EMA20_50_REGIME',spot.epoch('2025-01-01'),spot.epoch('2026-10-01'))
 assets.append({'symbol':symbol,'candles':candles,'originalExpected':expected,'excludedPrefixThrough':reset})
result={'sources':sources,'assets':assets,'from':'2025-01-01T00:00:00.000Z','until':'2026-10-01T00:00:00.000Z','classification':'ALREADY_OBSERVED_GENUINE_CANDLES_NOT_FRESH_HOLDOUT','production':False}
(out/'native-fixtures.json.gz').write_bytes(gzip.compress(json.dumps(result).encode(),mtime=0));print('prepared',sum(len(a['candles'])for a in assets),'real daily candles')
