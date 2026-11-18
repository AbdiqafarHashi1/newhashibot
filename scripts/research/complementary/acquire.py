"""Bounded public source acquisition; no trading/private API. Restart-safe archives."""
import calendar,concurrent.futures,csv,datetime,hashlib,io,json,lzma,pathlib,struct,sys,time,urllib.request,zipfile
root=pathlib.Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
UTC=datetime.timezone.utc
months=[(2025,m) for m in range(1,13)]+[(2026,m) for m in range(1,11)]
crypto=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT']
fx=['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','XAUUSD']
def fetch(url,path):
 if path.exists(): return path.read_bytes()
 for attempt in range(3):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 HashiBot-public-research'}),timeout=25) as r: b=r.read()
   path.write_bytes(b);return b
  except Exception:
   if attempt==2: raise
   time.sleep(.5)
def iso(seconds):return datetime.datetime.fromtimestamp(seconds,UTC).isoformat(timespec='milliseconds').replace('+00:00','Z')
def job(spec):
 symbol,y,m=spec;is_crypto=symbol.endswith('USDT');stem=f'{symbol}-{y}-{m:02d}';sources=[]
 if is_crypto:
  name=f'{symbol}-1h-{y}-{m:02d}.zip';url=f'https://data.binance.vision/data/futures/um/monthly/klines/{symbol}/1h/{name}'
  raw=fetch(url,root/name);check=fetch(url+'.CHECKSUM',root/(name+'.CHECKSUM')).decode().split()[0]
  if hashlib.sha256(raw).hexdigest()!=check:raise ValueError('VENDOR_CHECKSUM_MISMATCH')
  with zipfile.ZipFile(io.BytesIO(raw)) as z: rows=list(csv.reader(io.StringIO(z.read(name[:-4]+'.csv').decode())))
  out=[]
  for r in rows:
   if r[0]=='open_time':continue
   out.append(dict(symbol=symbol,market_type='crypto',timeframe='1h',open_time=iso(int(r[0])/1000),open=float(r[1]),high=float(r[2]),low=float(r[3]),close=float(r[4]),volume=float(r[5]),quote_volume=float(r[7]),trade_count=int(r[8]),taker_buy_volume=float(r[9]),taker_buy_quote_volume=float(r[10]),source='BINANCE_USDM_KLINES',instrument_type='USDT_PERPETUAL'))
  sources.append(dict(url=url,sha256=check,vendorChecksum=True))
 else:
  decoded=[];scale=1000 if symbol.endswith('JPY') or symbol=='XAUUSD' else 100000
  for side in ['BID','ASK']:
   url=f'https://datafeed.dukascopy.com/datafeed/{symbol}/{y}/{m-1:02d}/{side}_candles_hour_1.bi5';raw=fetch(url,root/f'{stem}-{side}.bi5');payload=lzma.decompress(raw)
   if len(payload)%24:raise ValueError('BAD_BROKER_RECORD_LENGTH')
   start=datetime.datetime(y,m,1,tzinfo=UTC).timestamp();part=[]
   for t,o,c,l,h,v in struct.iter_unpack('>5if',payload):
    if not (0<=t<calendar.monthrange(y,m)[1]*86400 and t%3600==0 and 0<l<=min(o,c)<=max(o,c)<=h and v>=0):raise ValueError('BAD_BROKER_RECORD')
    part.append(dict(symbol=symbol,market_type='forex',timeframe='1h',open_time=iso(start+t),open=o/scale,high=h/scale,low=l/scale,close=c/scale,volume=v,source='DUKASCOPY_BROKER_BID_ASK'))
   decoded.append(part);sources.append(dict(url=url,sha256=hashlib.sha256(raw).hexdigest(),vendorChecksum=False,side=side))
  asks={r['open_time']:r for r in decoded[1]};out=[]
  for b in decoded[0]:
   a=asks.get(b['open_time'])
   if a is None:raise ValueError('UNPAIRED_BROKER_BAR')
   if any(a[k]<b[k] for k in ['open','high','low','close']):raise ValueError('CROSSED_BROKER_BAR')
   out.append({**b,**{f'ask_{k}':a[k] for k in ['open','high','low','close']}})
 return symbol,y,m,out,sources
def main():
 parts={};sources=[];failures=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  futures={pool.submit(job,(s,y,m)):(s,y,m) for s in crypto+fx for y,m in months}
  for future in concurrent.futures.as_completed(futures):
   spec=futures[future]
   try:
    s,y,m,rows,meta=future.result();parts[(s,y,m)]=rows;sources+=meta
   except Exception as e:failures.append(dict(spec=spec,error=str(e)))
   if len(parts)%25==0:print(json.dumps(dict(completed=len(parts),failed=len(failures))),flush=True)
 for symbol in crypto+fx:
  missing=[(y,m) for y,m in months if (symbol,y,m) not in parts]
  if missing:continue
  rows=[r for y,m in months for r in parts[(symbol,y,m)]]
  payload=json.dumps(rows,separators=(',',':'))+'\n';(root/f'{symbol}-1h.json').write_text(payload)
  (root/f'{symbol}-1h.manifest.json').write_text(json.dumps(dict(datasetSha256=hashlib.sha256(payload.encode()).hexdigest(),records=len(rows),source=rows[0]['source'],first=rows[0]['open_time'],last=rows[-1]['open_time']),indent=2))
 (root/'sources.json').write_text(json.dumps(sources,indent=2));(root/'health.json').write_text(json.dumps(dict(completed=len(parts),expected=len(crypto+fx)*len(months),failures=failures),indent=2));print(json.dumps(dict(completed=len(parts),failed=len(failures))),flush=True)
if __name__=='__main__':main()
