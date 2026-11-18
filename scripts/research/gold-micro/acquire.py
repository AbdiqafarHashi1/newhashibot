"""First-party native Gold ticks -> closed one-minute bid/ask bars. No gap filling."""
import concurrent.futures,hashlib,json,pathlib,time,urllib.request,zipfile
import numpy as np
import pandas as pd
ROOT=pathlib.Path(__file__).resolve().parents[3];out=ROOT/'.tmp/gold-micro/data';out.mkdir(parents=True,exist_ok=True)
def acquire(month):
 year,mo=month.split('-');url=f'https://ticks.ex2archive.com/ticks/XAUUSD_Raw_Spread/{year}/{mo}/Exness_XAUUSD_Raw_Spread_{year}_{mo}.zip';archive=out/f'XAUUSD-{month}.zip';result=out/f'XAUUSD-1m-{month}.json';mp=result.with_suffix('.manifest.json')
 if result.exists() and mp.exists():
  m=json.loads(mp.read_text())
  if hashlib.sha256(result.read_bytes()).hexdigest()==m['rowsSha256']:return m
 if not archive.exists():
  print('downloading',month,flush=True);request=urllib.request.Request(url,headers={'User-Agent':'HashiBot-research/1.0'})
  with urllib.request.urlopen(request,timeout=120) as r,archive.with_suffix('.part').open('wb') as f:
   count=0
   while chunk:=r.read(1<<20):
    f.write(chunk);count+=len(chunk)
    if count%(32<<20)==0:print('downloaded',month,count//(1<<20),'MiB',flush=True)
  archive.with_suffix('.part').replace(archive)
 digest=hashlib.sha256()
 with archive.open('rb') as f:
  while chunk:=f.read(1<<20):digest.update(chunk)
 bars={};last=-1;ticks=0;first=None;start=pd.Timestamp(month+'-01',tz='UTC');end=start+pd.offsets.MonthBegin(1)
 with zipfile.ZipFile(archive) as z:
  members=[n for n in z.namelist() if n.lower().endswith('.csv')]
  if len(members)!=1:raise ValueError('EXPECTED_ONE_ORIGINAL_TICK_CSV')
  for chunk in pd.read_csv(z.open(members[0]),chunksize=200000,usecols=['Symbol','Timestamp','Bid','Ask'],dtype={'Bid':'float64','Ask':'float64'}):
   t=pd.to_datetime(chunk.Timestamp,utc=True,format='mixed',errors='raise');bid=chunk.Bid.to_numpy();ask=chunk.Ask.to_numpy();ms=t.astype('int64').to_numpy()//1000000
   if not chunk.Symbol.astype(str).str.startswith('XAUUSD').all() or np.any(~np.isfinite(bid)) or np.any(~np.isfinite(ask)) or np.any(bid<=0) or np.any(ask<bid) or np.any(np.diff(ms)<0) or ms[0]<last or t.min()<start or t.max()>=end:raise ValueError('INVALID_OR_WRONG_PERIOD_NATIVE_TICKS')
   last=int(ms[-1]);first=int(ms[0]) if first is None else first;ticks+=len(chunk)
   frame=pd.DataFrame({'bid':bid,'ask':ask},index=pd.DatetimeIndex(t));g=frame.groupby(frame.index.floor('1min')).agg({'bid':['first','max','min','last','count'],'ask':['first','max','min','last']})
   for at,row in g.iterrows():
    key=int(at.value//1000000);v=[float(x) for x in row.to_list()]
    if key not in bars:bars[key]=v
    else:
     old=bars[key];old[1]=max(old[1],v[1]);old[2]=min(old[2],v[2]);old[3]=v[3];old[4]+=v[4];old[6]=max(old[6],v[6]);old[7]=min(old[7],v[7]);old[8]=v[8]
 rows=[dict(symbol='XAUUSD',market_type='forex',timeframe='1m',open_time=pd.Timestamp(t,unit='ms',tz='UTC').isoformat().replace('+00:00','Z'),open=v[0],high=v[1],low=v[2],close=v[3],volume=v[4],ask_open=v[5],ask_high=v[6],ask_low=v[7],ask_close=v[8],source='EXNESS_BROKER_BID_ASK') for t,v in sorted(bars.items())];payload=json.dumps(rows,separators=(',',':')).encode();result.write_bytes(payload)
 m=dict(schema='gold-micro-native/v1',source='EXNESS_BROKER_BID_ASK',sourceUrl=url,month=month,symbol='XAUUSD',timeframe='1m',archiveSha256=digest.hexdigest(),rowsSha256=hashlib.sha256(payload).hexdigest(),archiveBytes=archive.stat().st_size,rows=len(rows),ticks=ticks,firstTick=first,lastTick=last,vendorChecksum=False,volumeMeaning='Observed quote count, not traded volume',limitations=['Exness Raw Spread reference; not JustMarkets or a prop firm fill record','No invented quotes, spreads or weekend bars','Commission, latency, fill reserve and lot/margin rules are scenarios']);mp.write_text(json.dumps(m,indent=2));print('COMPLETE',month,len(rows),ticks,flush=True);return m
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:manifests=list(pool.map(acquire,['2026-08','2026-09','2026-10']))
 (out/'index.json').write_text(json.dumps(manifests,indent=2))
