"""Original broker BID/ASK minute archives; retain compressed responses and integrity hashes."""
import argparse,concurrent.futures,datetime,hashlib,json,lzma,pathlib,struct,urllib.request,urllib.error
p=argparse.ArgumentParser();p.add_argument('--start',default='2025-01-01');p.add_argument('--end',default='2025-09-01');p.add_argument('--symbols',default='EURUSD,GBPUSD,AUDUSD,USDCAD,USDJPY,XAUUSD');p.add_argument('--workers',type=int,default=8);p.add_argument('--out',default='.tmp/launch-research/broker-data');a=p.parse_args();folder=pathlib.Path(a.out);folder.mkdir(parents=True,exist_ok=True)
scales={'EURUSD':100000,'GBPUSD':100000,'AUDUSD':100000,'NZDUSD':100000,'USDCAD':100000,'USDJPY':1000,'XAUUSD':1000}
def acquire(job):
 symbol,day=job;dest=folder/f'{symbol}-{day}.json'
 if dest.exists():return
 archives={};sides={}
 for side in ['BID','ASK']:
  url=f'https://datafeed.dukascopy.com/datafeed/{symbol}/{day.year}/{day.month-1:02}/{day.day:02}/{side}_candles_min_1.bi5';rawpath=folder/f'{symbol}-{day}-{side}.bi5'
  if rawpath.exists():compressed=rawpath.read_bytes()
  else:
   try:compressed=urllib.request.urlopen(url,timeout=20).read()
   except urllib.error.HTTPError as e:
    if e.code!=404:raise
    compressed=b''
   rawpath.write_bytes(compressed)
  payload=lzma.decompress(compressed) if compressed else b''
  if len(payload)%24:raise ValueError('BROKER_RECORD_LENGTH')
  values={}
  for i in range(0,len(payload),24):
   second,op,close,low,high,volume=struct.unpack('>IIIIIf',payload[i:i+24]);scale=scales[symbol]
   if second%60 or not 0<=second<86400 or second in values:raise ValueError('BROKER_CLOCK_INVALID')
   if not volume:continue
   if not(0<low<=min(op,close)<=max(op,close)<=high):raise ValueError('BROKER_OHLC_INVALID')
   values[second]=[op/scale,high/scale,low/scale,close/scale,volume]
  sides[side]=values;archives[side]={'url':url,'sha256':hashlib.sha256(compressed).hexdigest(),'bytes':len(compressed),'vendorChecksum':None,'integrityScope':'Downloaded response SHA256; no vendor checksum published'}
 rows=[]
 for t in sorted(sides['BID'].keys()&sides['ASK'].keys()):
  bid=sides['BID'][t];ask=sides['ASK'][t]
  if ask[0]<bid[0] or ask[3]<bid[3]:raise ValueError('CROSSED_BROKER_QUOTE')
  rows.append([int(datetime.datetime.combine(day,datetime.time(),datetime.timezone.utc).timestamp()*1000)+t*1000,*bid,*ask])
 dest.write_text(json.dumps({'schema':'dukascopy-minute-bid-ask/v1','symbol':symbol,'day':str(day),'scale':scales[symbol],'provenance':archives,'droppedUnpairedMinutes':len(sides['BID'].keys()^sides['ASK'].keys()),'rows':rows},separators=(',',':')))
# Fail promptly if the original provider is unreachable, before creating thousands of requests.
acquire(('EURUSD',datetime.date(2025,1,20)))
start=datetime.date.fromisoformat(a.start);end=datetime.date.fromisoformat(a.end);jobs=[(s,start+datetime.timedelta(days=d)) for d in range((end-start).days) for s in a.symbols.split(',')];errors=[];complete=0
with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
 futures={pool.submit(acquire,j):j for j in jobs}
 for f in concurrent.futures.as_completed(futures):
  try:f.result();complete+=1
  except Exception as e:errors.append({'job':str(futures[f]),'error':type(e).__name__+':'+str(e)[:120]})
  if (complete+len(errors))%60==0:print(json.dumps({'completed':complete,'errors':len(errors),'total':len(jobs)}),flush=True)
(folder/'acquisition.json').write_text(json.dumps({'completed':complete,'errors':errors,'start':a.start,'end':a.end,'symbols':a.symbols.split(',')}))
if errors:raise RuntimeError(f'{len(errors)} broker archive failures; partial coverage retained, never filled synthetically')
