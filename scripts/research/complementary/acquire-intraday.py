"""Native 15m crypto and broker minute data; no hourly-bar interpolation."""
import calendar,concurrent.futures,csv,datetime,hashlib,io,json,lzma,pathlib,struct,sys,urllib.request,zipfile
from acquire import fetch,iso,UTC
root=pathlib.Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
months=[(2026,m) for m in [8,9,10]]
def crypto_job(spec):
 s,y,m=spec;name=f'{s}-15m-{y}-{m:02d}.zip';url=f'https://data.binance.vision/data/futures/um/monthly/klines/{s}/15m/{name}';raw=fetch(url,root/name);check=fetch(url+'.CHECKSUM',root/(name+'.CHECKSUM')).decode().split()[0]
 if hashlib.sha256(raw).hexdigest()!=check:raise ValueError('CHECKSUM_MISMATCH')
 with zipfile.ZipFile(io.BytesIO(raw)) as z: rows=list(csv.reader(io.StringIO(z.read(name[:-4]+'.csv').decode())))
 out=[]
 for r in rows:
  if r[0]=='open_time':continue
  out.append(dict(symbol=s,market_type='crypto',timeframe='15m',open_time=iso(int(r[0])/1000),open=float(r[1]),high=float(r[2]),low=float(r[3]),close=float(r[4]),volume=float(r[5]),quote_volume=float(r[7]),source='BINANCE_USDM_KLINES',instrument_type='USDT_PERPETUAL'))
 return s,y,m,out,[dict(url=url,sha256=check,vendorChecksum=True)]
def fx_job(spec):
 s,y,m,day=spec;start=datetime.datetime(y,m,day,tzinfo=UTC).timestamp();parts=[];sources=[];scale=1000 if s=='XAUUSD' else 100000
 for side in ['BID','ASK']:
  name=f'{s}-{y}-{m:02d}-{day:02d}-{side}-1m.bi5';url=f'https://datafeed.dukascopy.com/datafeed/{s}/{y}/{m-1:02d}/{day:02d}/{side}_candles_min_1.bi5';raw=fetch(url,root/name);payload=lzma.decompress(raw)
  if len(payload)%24:raise ValueError('BROKER_RECORD_LENGTH')
  part={}
  for t,o,c,l,h,v in struct.iter_unpack('>5if',payload):
   if not (0<=t<86400 and t%60==0 and 0<l<=min(o,c)<=max(o,c)<=h and v>=0):raise ValueError('BROKER_RECORD_GEOMETRY')
   part[start+t]=dict(open=o/scale,high=h/scale,low=l/scale,close=c/scale,volume=v)
  parts.append(part);sources.append(dict(url=url,sha256=hashlib.sha256(raw).hexdigest(),vendorChecksum=False,side=side))
 out=[]
 for minute in range(0,1440,15):
  times=[start+(minute+i)*60 for i in range(15)]
  if not all(t in parts[0] and t in parts[1] for t in times):continue
  bid=[parts[0][t] for t in times];ask=[parts[1][t] for t in times]
  def aggregate(a):return dict(open=a[0]['open'],high=max(x['high'] for x in a),low=min(x['low'] for x in a),close=a[-1]['close'],volume=sum(x['volume'] for x in a))
  b,a=aggregate(bid),aggregate(ask)
  if any(a[k]<b[k] for k in ['open','high','low','close']):raise ValueError('CROSSED_QUOTES')
  out.append(dict(symbol=s,market_type='forex',timeframe='15m',open_time=iso(times[0]),**b,**{f'ask_{k}':a[k] for k in ['open','high','low','close']},source='DUKASCOPY_BROKER_BID_ASK'))
 return s,y,m,day,out,sources
jobs=[(crypto_job,(s,y,m)) for s in ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT'] for y,m in months]
jobs += [(fx_job,(s,y,m,day)) for s in ['EURUSD','XAUUSD'] for y,m in months for day in range(1,calendar.monthrange(y,m)[1]+1) if datetime.date(y,m,day).weekday()!=5]
results={};failures=[];sources=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 fut={pool.submit(fn,spec):(fn,spec) for fn,spec in jobs}
 for f in concurrent.futures.as_completed(fut):
  fn,spec=fut[f]
  try:
   data=f.result();results[spec]=data[-2];sources+=data[-1]
  except Exception as e:failures.append(dict(spec=spec,error=str(e)))
  if (len(results)+len(failures))%25==0:print(json.dumps(dict(completed=len(results),failed=len(failures))),flush=True)
for s in ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','EURUSD','XAUUSD']:
 missing=[spec for fn,spec in jobs if spec[0]==s and spec not in results];rows=[r for fn,spec in jobs if spec[0]==s and spec in results for r in results[spec]]
 if missing:continue
 payload=json.dumps(rows,separators=(',',':'))+'\n';(root/f'{s}-15m.json').write_text(payload);(root/f'{s}-15m.manifest.json').write_text(json.dumps(dict(datasetSha256=hashlib.sha256(payload.encode()).hexdigest(),source=rows[0]['source'],records=len(rows),first=rows[0]['open_time'],last=rows[-1]['open_time'],missing=missing),indent=2))
(root/'sources-intraday.json').write_text(json.dumps(sources,indent=2));(root/'health-intraday.json').write_text(json.dumps(dict(expected=len(jobs),completed=len(results),failures=failures),indent=2));print(json.dumps(dict(completed=len(results),failed=len(failures))),flush=True)
