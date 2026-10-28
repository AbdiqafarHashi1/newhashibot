import os
import concurrent.futures,csv,hashlib,importlib.util,io,json,pathlib,sys,time,urllib.request,zipfile
root=pathlib.Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True);protocol_path=pathlib.Path('scripts/research/signal-ensemble/extended-protocol.json');p=json.loads(protocol_path.read_text());spec=importlib.util.spec_from_file_location('native','scripts/research/cost-aware/download.py');native=importlib.util.module_from_spec(spec);spec.loader.exec_module(native)
months=[f'{y}-{m:02d}'for y in p['newAcquisition']['years']for m in range(1,13)]+p['newAcquisition']['recentMonths'];jobs=[(s,m)for s in p['scope']for m in months]
if len(jobs)!=p['newAcquisition']['maxArchives']:raise ValueError('ACQUISITION_BOUND')
def atomic(path,raw):
 temp=path.with_name(path.name+'.part-'+str(os.getpid()));temp.write_bytes(raw);temp.replace(path)
def fetch(url):
 for attempt in range(2):
  try:
   with urllib.request.urlopen(url,timeout=25) as r:raw=r.read(2000001)
   if len(raw)>2000000:raise ValueError('BODY_BOUND')
   return raw
  except Exception:
   if attempt:raise
   time.sleep(.2)
def job(item):
 symbol,month=item;name=f'{symbol}-15m-{month}';url=f'https://data.binance.vision/data/futures/um/monthly/klines/{symbol}/15m/{name}.zip';a=root/(name+'.zip');cp=root/(name+'.zip.CHECKSUM');raw=a.read_bytes()if a.exists()else fetch(url);check=cp.read_bytes()if cp.exists()else fetch(url+'.CHECKSUM');digest=hashlib.sha256(raw).hexdigest()
 if check.decode().split()[0]!=digest:raise ValueError('VENDOR_CHECKSUM_MISMATCH')
 with zipfile.ZipFile(io.BytesIO(raw))as z:
  if z.namelist()!=[name+'.csv']:raise ValueError('ARCHIVE_IDENTITY')
  rows=native.normalize(csv.reader(io.TextIOWrapper(z.open(name+'.csv'))),symbol)
 text=json.dumps(rows,separators=(',',':'))+'\n';atomic(a,raw);atomic(cp,check);atomic(root/(name+'.json'),text.encode());meta={'sourceUrl':url,'rawSha256':digest,'datasetSha256':hashlib.sha256(text.encode()).hexdigest(),'rows':len(rows),'nativeFlow':True};(root/(name+'.manifest.json')).write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps({'file':name,'rows':len(rows)}),flush=True);return meta
with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:sources=list(pool.map(job,jobs))
(root/'sources.json').write_text(json.dumps(sources,indent=2)+'\n');print(json.dumps({'status':'COMPLETE','archives':len(sources)}),flush=True)
