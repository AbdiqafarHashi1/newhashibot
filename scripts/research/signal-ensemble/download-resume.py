"""Bounded persistent HTTP resume; same immutable official files, no hypothesis change."""
import asyncio,aiohttp,csv,hashlib,importlib.util,io,json,os,pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]);p=json.loads(pathlib.Path('scripts/research/signal-ensemble/extended-protocol.json').read_text());spec=importlib.util.spec_from_file_location('native','scripts/research/cost-aware/download.py');native=importlib.util.module_from_spec(spec);spec.loader.exec_module(native)
months=[f'{y}-{m:02d}'for y in p['newAcquisition']['years']for m in range(1,13)]+p['newAcquisition']['recentMonths'];jobs=[(s,m)for s in p['scope']for m in months]
if len(jobs)!=255:raise ValueError('ACQUISITION_BOUND')
def atomic(path,raw):
 temp=path.with_name(path.name+'.resume-'+str(os.getpid()));temp.write_bytes(raw);temp.replace(path)
async def main():
 sem=asyncio.Semaphore(8)
 async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=25),connector=aiohttp.TCPConnector(limit=8),trust_env=True)as session:
  async def fetch(url):
   for attempt in range(2):
    try:
     async with session.get(url)as r:
      r.raise_for_status();parts=[];size=0
      async for part in r.content.iter_chunked(65536):
       size+=len(part)
       if size>2000000:raise ValueError('BODY_BOUND')
       parts.append(part)
      return b''.join(parts)
    except Exception:
     if attempt:raise
     await asyncio.sleep(.2)
  async def job(item):
   async with sem:
    symbol,month=item;name=f'{symbol}-15m-{month}';url=f'https://data.binance.vision/data/futures/um/monthly/klines/{symbol}/15m/{name}.zip';a=root/(name+'.zip');cp=root/(name+'.zip.CHECKSUM');raw=a.read_bytes()if a.exists()else await fetch(url);check=cp.read_bytes()if cp.exists()else await fetch(url+'.CHECKSUM');digest=hashlib.sha256(raw).hexdigest()
    if digest!=check.decode().split()[0]:raise ValueError('CHECKSUM_MISMATCH')
    with zipfile.ZipFile(io.BytesIO(raw))as z:
     if z.namelist()!=[name+'.csv']:raise ValueError('ARCHIVE_IDENTITY')
     rows=native.normalize(csv.reader(io.TextIOWrapper(z.open(name+'.csv'))),symbol)
    text=json.dumps(rows,separators=(',',':'))+'\n';meta={'sourceUrl':url,'rawSha256':digest,'datasetSha256':hashlib.sha256(text.encode()).hexdigest(),'rows':len(rows),'nativeFlow':True};atomic(a,raw);atomic(cp,check);atomic(root/(name+'.json'),text.encode());atomic(root/(name+'.manifest.json'),(json.dumps(meta,indent=2)+'\n').encode());print(json.dumps({'file':name,'rows':len(rows)}),flush=True);return meta
  sources=await asyncio.gather(*(job(item)for item in reversed(jobs)));atomic(root/'sources-resume.json',(json.dumps(sources,indent=2)+'\n').encode());print(json.dumps({'status':'COMPLETE','archives':len(sources)}),flush=True)
asyncio.run(main())
