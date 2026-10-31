"""Public broker development history only. Never downloads reserved test periods or trades.
Dukascopy hourly candle binary records are decoded strictly and bid/ask matched.
"""
import argparse,calendar,concurrent.futures,datetime,hashlib,json,lzma,math,pathlib,struct,urllib.request,time
SYMBOLS=['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD']
def fetch(url):
 for attempt in range(2):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'HashiBot-research/1.0'}),timeout=15) as r:return r.read()
  except Exception:
   if attempt:raise
   time.sleep(1)
def decode(raw,symbol,year,month):
 payload=lzma.decompress(raw)
 if len(payload)%24:raise ValueError('INVALID_CANDLE_RECORD_LENGTH')
 start=int(datetime.datetime(year,month,1,tzinfo=datetime.timezone.utc).timestamp());seconds=calendar.monthrange(year,month)[1]*86400;scale=1000 if symbol.endswith('JPY') else 100000;rows=[]
 for t,o,c,l,h,v in struct.iter_unpack('>5if',payload):
  if not 0<=t<seconds or t%3600 or l<=0 or l>min(o,c) or h<max(o,c) or not math.isfinite(v) or v<0:raise ValueError('INVALID_HOURLY_BROKER_RECORD')
  if rows and rows[-1]['open_time']>=datetime.datetime.fromtimestamp(start+t,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'):raise ValueError('UNORDERED_CANDLES')
  rows.append(dict(symbol=symbol,market_type='forex',timeframe='1h',open_time=datetime.datetime.fromtimestamp(start+t,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'),open=o/scale,high=h/scale,low=l/scale,close=c/scale,volume=v,source='DUKASCOPY_BROKER_BID_ASK'))
 return rows
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args();root=pathlib.Path(args.output);root.mkdir(parents=True,exist_ok=True)
 sources=[];health=[]
 probe='https://datafeed.dukascopy.com/datafeed/EURUSD/2025/00/BID_candles_hour_1.bi5'
 try:decode(fetch(probe),'EURUSD',2025,1)
 except Exception as e:
  (root/'health.json').write_text(json.dumps({'status':'UNAVAILABLE','source':probe,'error':str(e),'pricesFabricated':False},indent=2));print('BROKER_ARCHIVE_UNAVAILABLE:'+str(e),flush=True);return 2
 def job(spec):
  symbol,year,month,side=spec;url=f'https://datafeed.dukascopy.com/datafeed/{symbol}/{year}/{month-1:02d}/{side}_candles_hour_1.bi5';file=root/f'{symbol}-{year}-{month:02d}-{side}.bi5';raw=file.read_bytes() if file.exists() else fetch(url);rows=decode(raw,symbol,year,month);file.write_bytes(raw);return spec,rows,{'url':url,'rawSha256':hashlib.sha256(raw).hexdigest(),'records':len(rows),'side':side}
 months=[(2025,m) for m in range(1,13)]+[(2026,m) for m in range(1,5)];specs=[(s,y,m,side) for s in SYMBOLS for y,m in months for side in ['BID','ASK']];parts={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  futures={pool.submit(job,spec):spec for spec in specs}
  for future in concurrent.futures.as_completed(futures):
   spec=futures[future]
   try:
    spec,rows,meta=future.result();parts[spec]=rows;sources.append(meta)
    print(json.dumps({'symbol':spec[0],'year':spec[1],'month':spec[2],'side':spec[3],'records':len(rows)}),flush=True)
   except Exception as e:health.append({'symbol':spec[0],'year':spec[1],'month':spec[2],'side':spec[3],'error':str(e)})
 (root/'sources.json').write_text(json.dumps(sources,indent=2))
 if health:
  (root/'health.json').write_text(json.dumps({'status':'INCOMPLETE','completedArchives':len(sources),'expectedArchives':len(specs),'failures':health,'pricesFabricated':False,'noHeldoutPricesRequested':True},indent=2));return 2
 for symbol in SYMBOLS:
  bid=[r for y,m in months for r in parts[(symbol,y,m,'BID')]];ask=[r for y,m in months for r in parts[(symbol,y,m,'ASK')]];askmap={r['open_time']:r for r in ask};paired=[(b,askmap[b['open_time']]) for b in bid if b['open_time'] in askmap]
  if any(any(a[k]<b[k] for k in ['open','high','low','close']) for b,a in paired):raise ValueError('CROSSED_BID_ASK_ARCHIVE:'+symbol)
  bp=json.dumps([b for b,a in paired],separators=(',',':'))+'\n';ap=json.dumps([a for b,a in paired],separators=(',',':'))+'\n';(root/f'{symbol}-1h.json').write_text(bp);(root/f'{symbol}-1h.ask.json').write_text(ap)
  (root/f'{symbol}-1h.manifest.json').write_text(json.dumps({'source':'DUKASCOPY_BROKER_BID_ASK','datasetSha256':hashlib.sha256(bp.encode()).hexdigest(),'askFile':f'{symbol}-1h.ask.json','askSha256':hashlib.sha256(ap.encode()).hexdigest(),'pairedRows':len(paired),'unpairedBidRows':len(bid)-len(paired),'unpairedAskRows':len(ask)-len(paired),'period':'2025-01 through 2026-04 DEVELOPMENT ONLY','publisherChecksumAvailable':False,'brokerExecutionCertified':False},indent=2))
 (root/'sources.json').write_text(json.dumps(sources,indent=2));(root/'health.json').write_text(json.dumps({'status':'DOWNLOADED','archiveCount':len(sources),'noHeldoutPricesRequested':True},indent=2));return 0
if __name__=='__main__':raise SystemExit(main())
