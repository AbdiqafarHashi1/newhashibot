"""Fixed bounded32-archive public acquisition for cross-universe diagnostics."""
import concurrent.futures,csv,hashlib,importlib.util,io,json,pathlib,sys,urllib.request,zipfile
root=pathlib.Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True);pfile=pathlib.Path('scripts/research/alt-universe-protocol.json');p=json.loads(pfile.read_text());frozen={str(f):hashlib.sha256(f.read_bytes()).hexdigest() for f in [pfile,pathlib.Path('scripts/research/alt-universe-rules.ts'),pathlib.Path(__file__)]}
(root/'frozen-acquisition.json').write_text(json.dumps(frozen,indent=2)+'\n')
spec=importlib.util.spec_from_file_location('native','scripts/research/cost-aware/download.py');native=importlib.util.module_from_spec(spec);spec.loader.exec_module(native)
def fetch(url):
 with urllib.request.urlopen(url,timeout=25) as r:b=r.read(20000001)
 if len(b)>20000000:raise ValueError('SIZE_BOUND')
 return b
def job(j):
 symbol,month=j;name=f'{symbol}-15m-2026-{month:02d}';url=f'https://data.binance.vision/data/futures/um/monthly/klines/{symbol}/15m/{name}.zip';a=root/(name+'.zip');cp=root/(name+'.zip.CHECKSUM');raw=a.read_bytes() if a.exists() else fetch(url);check=cp.read_bytes() if cp.exists() else fetch(url+'.CHECKSUM');digest=hashlib.sha256(raw).hexdigest()
 if digest!=check.decode().split()[0]:raise ValueError('CHECKSUM')
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  if z.namelist()!=[name+'.csv']:raise ValueError('ARCHIVE_IDENTITY')
  rows=native.normalize(csv.reader(io.TextIOWrapper(z.open(name+'.csv'))),symbol)
 text=json.dumps(rows,separators=(',',':'))+'\n';a.write_bytes(raw);cp.write_bytes(check);(root/(name+'.json')).write_text(text);meta=dict(sourceUrl=url,rawSha256=digest,datasetSha256=hashlib.sha256(text.encode()).hexdigest(),rows=len(rows),nativeFlow=True);(root/(name+'.manifest.json')).write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(dict(symbol=symbol,month=month,rows=len(rows))),flush=True);return meta
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:sources=list(ex.map(job,[(s,m)for s in p['newAssets']for m in [6,7,8,9]]))
if any(hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest()!=h for f,h in frozen.items()):raise ValueError('FROZEN_ENGINE_CHANGED')
(root/'sources.json').write_text(json.dumps(sources,indent=2)+'\n')
