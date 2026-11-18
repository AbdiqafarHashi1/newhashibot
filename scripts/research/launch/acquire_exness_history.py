"""Aggregate first-party Exness bid/ask ticks into genuine 5m candles.
Published source: https://www.exness.com/tick-history/ . No login, invented spread or synthetic gap bars.
"""
import argparse,concurrent.futures,hashlib,io,json,pathlib,urllib.request,zipfile
import numpy as np
import pandas as pd
p=argparse.ArgumentParser();p.add_argument('--symbols',default='EURUSD,GBPUSD,USDJPY,AUDUSD,USDCAD,XAUUSD');p.add_argument('--months',default='2025-01,2025-02,2025-03,2025-04,2025-05,2025-06,2025-07,2025-08');p.add_argument('--out',default='.tmp/launch-research/exness-data');a=p.parse_args();root=pathlib.Path(a.out);root.mkdir(parents=True,exist_ok=True)
def acquire(job):
 symbol,month=job;year,mo=month.split('-');variant=symbol+'_Raw_Spread';name=f'Exness_{variant}_{year}_{mo}.zip';url=f'https://ticks.ex2archive.com/ticks/{variant}/{year}/{mo}/{name}';archive=root/name;result=root/f'{symbol}-5m-{month}.json';manifest=root/f'{symbol}-5m-{month}.manifest.json'
 if result.exists() and manifest.exists():
  m=json.loads(manifest.read_text())
  if hashlib.sha256(result.read_bytes()).hexdigest()==m['rowsSha256']:return m
 if not archive.exists():
  request=urllib.request.Request(url,headers={'User-Agent':'HashiBot-research/1.0'})
  with urllib.request.urlopen(request,timeout=120) as response,archive.with_suffix('.part').open('wb') as out:
   while block:=response.read(1<<20):out.write(block)
  archive.with_suffix('.part').replace(archive)
 digest=hashlib.sha256()
 with archive.open('rb') as f:
  while block:=f.read(1<<20):digest.update(block)
 bars={};last_time=-1;tick_count=0;first=None;last=None;start=pd.Timestamp(month+'-01',tz='UTC');end=start+pd.offsets.MonthBegin(1)
 with zipfile.ZipFile(archive) as z:
  members=[n for n in z.namelist() if n.lower().endswith('.csv')]
  if len(members)!=1:raise ValueError('EXPECTED_ONE_TICK_CSV')
  for chunk in pd.read_csv(z.open(members[0]),chunksize=200000,usecols=['Symbol','Timestamp','Bid','Ask'],dtype={'Bid':'float64','Ask':'float64'}):
   if not chunk['Symbol'].astype(str).str.startswith(symbol).all():raise ValueError('BROKER_INSTRUMENT_MISMATCH')
   t=pd.to_datetime(chunk.Timestamp,utc=True,format='mixed',errors='raise');bid=chunk.Bid.to_numpy();ask=chunk.Ask.to_numpy();ms=t.astype('int64').to_numpy()//1000000
   if np.any(~np.isfinite(bid)) or np.any(~np.isfinite(ask)) or np.any(bid<=0) or np.any(ask<bid) or np.any(np.diff(ms)<0) or ms[0]<last_time or t.min()<start or t.max()>=end:raise ValueError('BROKER_QUOTE_OR_CLOCK_INVALID')
   last_time=int(ms[-1]);first=int(ms[0]) if first is None else first;last=last_time;tick_count+=len(chunk)
   frame=pd.DataFrame({'bid':bid,'ask':ask},index=pd.DatetimeIndex(t));grouped=frame.groupby(frame.index.floor('5min'));b=grouped.agg({'bid':['first','max','min','last','count'],'ask':['first','max','min','last']})
   for at,row in b.iterrows():
    key=int(at.value//1000000);v=[float(x) for x in row.to_list()]
    if key not in bars:bars[key]=v
    else:
     old=bars[key];old[1]=max(old[1],v[1]);old[2]=min(old[2],v[2]);old[3]=v[3];old[4]+=v[4];old[6]=max(old[6],v[6]);old[7]=min(old[7],v[7]);old[8]=v[8]
 rows=[dict(symbol=symbol,market_type='forex',timeframe='5m',open_time=pd.Timestamp(t,unit='ms',tz='UTC').isoformat().replace('+00:00','Z'),open=v[0],high=v[1],low=v[2],close=v[3],volume=v[4],ask_open=v[5],ask_high=v[6],ask_low=v[7],ask_close=v[8],source='EXNESS_BROKER_BID_ASK') for t,v in sorted(bars.items())]
 payload=json.dumps(rows,separators=(',',':'));result.write_text(payload);m={'sourceUrl':url,'source':'EXNESS_BROKER_BID_ASK','variant':variant,'symbol':symbol,'month':month,'archiveSha256':digest.hexdigest(),'rowsSha256':hashlib.sha256(payload.encode()).hexdigest(),'rows':len(rows),'ticks':tick_count,'firstTick':first,'lastTick':last,'vendorChecksum':False,'volumeMeaning':'Observed quote tick count; not traded volume','limitations':['Exness reference prices, not a JustMarkets account execution record','Broker spread is observed; commission, swap and contract filters remain explicit scenario assumptions','No synthetic quotes or weekend candles']};manifest.write_text(json.dumps(m,indent=2));print(json.dumps({'symbol':symbol,'month':month,'rows':len(rows),'ticks':tick_count}),flush=True);return m
jobs=[(s,m) for s in a.symbols.split(',') for m in a.months.split(',')]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:manifests=list(pool.map(acquire,jobs))
(root/'index.json').write_text(json.dumps({'manifests':manifests},indent=2));print('All original broker tick archives validated and aggregated',flush=True)
