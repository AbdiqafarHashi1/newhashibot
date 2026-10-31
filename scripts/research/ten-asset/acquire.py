import asyncio,aiohttp,csv,datetime,hashlib,io,json,math,os,pathlib,sys,zipfile,shutil
root=pathlib.Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
p=json.loads(pathlib.Path('scripts/research/ten-asset/protocol.json').read_text());months=[f'{y}-{m:02d}'for y in [2025,2026]for m in range(1,10 if y==2026 else 13)];jobs=[(s,m)for s in ['BTCUSDT',*p['altAssets']]for m in months]
def sha(b):return hashlib.sha256(b).hexdigest()
def atomic(path,b):
 t=path.with_name(path.name+'.part-'+str(os.getpid()));t.write_bytes(b);t.replace(path)
def normalize(reader,symbol,kind):
 out=[]
 if kind=='fundingRate':
  for r in csv.DictReader(reader):
   t=int(r['calc_time']);interval=int(r['funding_interval_hours']);rate=float(r['last_funding_rate'])
   if t<=0 or not 1<=interval<=24 or not math.isfinite(rate)or abs(rate)>1:raise ValueError('FUNDING_SCHEMA')
   out.append({'symbol':symbol,'calcTimeMs':t,'intervalHours':interval,'rate':rate})
 else:
  for r in csv.reader(reader):
   if not r or r[0]=='open_time':continue
   t=int(r[0]);t=t//1000 if t>=100000000000000 else t;o,h,l,c,v,q,n,b,bq=[float(r[i])for i in [1,2,3,4,5,7,8,9,10]]
   if t%900000 or not all(math.isfinite(x)for x in [o,h,l,c,v,q,n,b,bq])or l<=0 or l>min(o,c)or h<max(o,c)or v<0 or q<0 or not 0<=b<=v or not 0<=bq<=q or not n.is_integer()or n<0:raise ValueError('KLINE_SCHEMA')
   out.append({'symbol':symbol,'market_type':'crypto','timeframe':'15m','open_time':datetime.datetime.fromtimestamp(t/1000,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'),'open':o,'high':h,'low':l,'close':c,'volume':v,'quote_volume':q,'trade_count':int(n),'taker_buy_volume':b,'taker_buy_quote_volume':bq,'source':'BINANCE_USDM_KLINES','instrument_type':'USDT_PERPETUAL'})
 if not out:raise ValueError('EMPTY_ARCHIVE')
 return out
async def main():
 sem=asyncio.Semaphore(8)
 async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=25),connector=aiohttp.TCPConnector(limit=8),trust_env=True)as session:
  async def fetch(url):
   for attempt in range(2):
    try:
     async with session.get(url)as r:
      r.raise_for_status();parts=[];size=0
      async for chunk in r.content.iter_chunked(65536):
       size+=len(chunk)
       if size>2000000:raise ValueError('BODY_BOUND')
       parts.append(chunk)
      return b''.join(parts)
    except aiohttp.ClientResponseError as e:
     if e.status in [401,403,404]or attempt:raise
    except Exception:
     if attempt:raise
  async def job(item):
   async with sem:
    symbol,month=item;name=f'{symbol}-15m-{month}';url=f'https://data.binance.vision/data/futures/um/monthly/klines/{symbol}/15m/{name}.zip';a=root/(name+'.zip');cp=root/(name+'.zip.CHECKSUM')
    for folder in ['crypto-development','signal-extended','alt-universe']:
     prior=root.parent/folder
     if not a.exists()and(prior/a.name).exists():shutil.copyfile(prior/a.name,a);shutil.copyfile(prior/cp.name,cp)
    raw=a.read_bytes()if a.exists()else await fetch(url);check=cp.read_bytes()if cp.exists()else await fetch(url+'.CHECKSUM')
    if sha(raw)!=check.decode().split()[0]:raise ValueError('CHECKSUM_MISMATCH:'+name)
    with zipfile.ZipFile(io.BytesIO(raw))as z:
     if z.namelist()!=[name+'.csv']:raise ValueError('ARCHIVE_IDENTITY')
     rows=normalize(io.TextIOWrapper(z.open(name+'.csv')),symbol,'klines')
    b=(json.dumps(rows,separators=(',',':'))+'\n').encode();meta={'sourceUrl':url,'rawSha256':sha(raw),'datasetSha256':sha(b),'rows':len(rows),'symbol':symbol,'timeframe':'15m'}
    for path,body in [(a,raw),(cp,check),(root/(name+'.json'),b),(root/(name+'.manifest.json'),json.dumps(meta).encode())]:atomic(path,body)
    print(json.dumps({'name':name,'rows':len(rows)}),flush=True);return meta
  sources=await asyncio.gather(*(job(j)for j in jobs));atomic(root/'sources.json',json.dumps(sources).encode());print('COMPLETE',len(sources),flush=True)
asyncio.run(main())
