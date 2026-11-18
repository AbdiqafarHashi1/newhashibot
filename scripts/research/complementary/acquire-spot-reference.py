"""Compare ETH candidate against the app's existing native SPOT reference venue."""
import concurrent.futures,csv,hashlib,io,json,pathlib,sys,zipfile
from acquire import fetch,iso,months
root=pathlib.Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
def job(spec):
 y,m=spec;s='ETHUSDT';name=f'{s}-1h-{y}-{m:02d}.zip';url=f'https://data.binance.vision/data/spot/monthly/klines/{s}/1h/{name}';raw=fetch(url,root/name);check=fetch(url+'.CHECKSUM',root/(name+'.CHECKSUM')).decode().split()[0]
 if hashlib.sha256(raw).hexdigest()!=check:raise ValueError('CHECKSUM_MISMATCH')
 with zipfile.ZipFile(io.BytesIO(raw)) as z:rows=list(csv.reader(io.StringIO(z.read(name[:-4]+'.csv').decode())))
 out=[]
 for r in rows:
  if r[0]=='open_time':continue
  t=int(r[0]);out.append(dict(symbol=s,market_type='crypto',timeframe='1h',open_time=iso(t/(1000000 if t>=100000000000000 else 1000)),open=float(r[1]),high=float(r[2]),low=float(r[3]),close=float(r[4]),volume=float(r[5]),quote_volume=float(r[7]),source='BINANCE_SPOT_KLINES',instrument_type='SPOT'))
 return out,dict(url=url,sha256=check,vendorChecksum=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:parts=list(pool.map(job,months))
rows=[r for part,meta in parts for r in part];raw=json.dumps(rows,separators=(',',':'))+'\n';(root/'ETHUSDT-1h.json').write_text(raw);(root/'ETHUSDT-1h.manifest.json').write_text(json.dumps(dict(datasetSha256=hashlib.sha256(raw.encode()).hexdigest(),source='BINANCE_SPOT_KLINES',records=len(rows),first=rows[0]['open_time'],last=rows[-1]['open_time']),indent=2));(root/'sources.json').write_text(json.dumps([meta for part,meta in parts],indent=2));print(len(rows),flush=True)
