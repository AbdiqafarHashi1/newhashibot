"""Shared-cash native one/two-asset continuous accounts; never a payout promise."""
import ctypes,gzip,hashlib,json,os,pathlib,subprocess,sys,zipfile
import numpy as np
import pandas as pd
ROOT=pathlib.Path(__file__).resolve().parents[3];sys.path.insert(0,str(ROOT/'scripts/research/execution-frontier'))
from continuous import Combined
OUT=ROOT/'.tmp/continuous-income/selected-income';OUT.mkdir(parents=True,exist_ok=True)
D=ctypes.POINTER(ctypes.c_double);B=ctypes.POINTER(ctypes.c_byte);ptr=lambda a:a.ctypes.data_as(D)
source=pathlib.Path(__file__).with_name('selected-income.cpp');sha=hashlib.sha256(source.read_bytes()).hexdigest();so=OUT/f'engine-{sha[:12]}.so'
if not so.exists():
 build=so.with_suffix(f'.{os.getpid()}.build.so');subprocess.run(['g++','-std=c++17','-O3','-shared','-fPIC',str(source),'-o',str(build)],check=True);os.replace(build,so)
lib=ctypes.CDLL(str(so));lib.create.argtypes=[ctypes.c_int,D,B,D,D,ctypes.c_int,D,B,D,D,ctypes.c_int,D];lib.create.restype=ctypes.c_void_p;lib.feed2.argtypes=[ctypes.c_void_p,ctypes.c_int,D,D,D,ctypes.c_int,D,D,D];lib.feed2.restype=ctypes.c_int;lib.snapshot.argtypes=[ctypes.c_void_p,ctypes.c_int,D,D,ctypes.c_int];lib.snapshot.restype=ctypes.c_int;lib.destroy.argtypes=[ctypes.c_void_p]
def dump(p,x):
 with gzip.GzipFile(filename=str(p),mode='wb',mtime=0) as f:f.write(json.dumps(x,separators=(',',':'),default=lambda v:v.item()).encode())
def snapshot(h,i,capital):
 o=np.zeros(13);tr=np.zeros((20000,12));n=lib.snapshot(h,i,ptr(o),ptr(tr),len(tr));assert n>=0;assert abs(capital+tr[:n,6].sum()-o[12]-o[5])<1e-5
 return dict(balance=o[5],equity=o[9],netPct=(o[9]/capital-1)*100,drawdownPct=o[1],closedTrades=n,profitFactor=o[3]/o[4] if o[4] else None,costs=o[6],blocked=int(o[7]),failed=bool(o[8]),openSide=o[10],openLots=o[11],openCosts=o[12],trades=tr[:n].tolist())
if __name__=='__main__':
 months=[f'2026-{m:02}' for m in range(5,12)];data=[Combined(s,months) for s in ['XAUUSD','USDJPY']];engines=[];keep=[];specs=[]
 for model in ['RSI']:
  cases=[dict(kind='PROP_FUNDED',guard=guard,capital=25000,risk=r,leverage=5,assets=mask) for guard in ['STATIC_8_DAILY_4'] for r in [.25,.4,.5] for mask in [1]]
  if False:cases += [dict(kind='PERSONAL_STRESS',capital=c,risk=r,leverage=lev,assets=1) for c in [100,500] for r in [.5,1,2,3,5] for lev in [5,10,20,50,100]]
  args=[]
  for d in data:
   sig,atr,st=d.features('rsi_exhaustion' if model=='RSI' else 'compression_expand' if model=='COMPRESSION' else 'ARBITRATED',15,24 if model=='COMPRESSION' else 12);tm=np.ascontiguousarray(d.x[:,0]);keep.extend([tm,sig,atr,st]);args.extend([len(tm),ptr(tm),sig.ctypes.data_as(B),ptr(atr),ptr(st)])
  cfg=np.ascontiguousarray([[100,.01,5.25,.075,a['risk'],a['leverage'],1.5,5,1440,0 if model=='COMPRESSION' else 2,a['capital'],0,3000,(3 if a['guard']=='STATIC_8_DAILY_4' else 1) if a['kind']=='PROP_FUNDED' else 0,a['assets']] for a in cases],dtype=float);keep.append(cfg);h=lib.create(*args,len(cfg),ptr(cfg));assert h;engines.append(h);specs.append(dict(model=model,cases=cases,daily=[],months=[]))
 protocol=dict(schema='continuous-income/v1',sourceSha256=sha,models=[s['model'] for s in specs],cases=sum(len(s['cases']) for s in specs),profitCutoff=False,capitalReset=False,withdrawals=False,assetMasks={'1':'XAUUSD','2':'USDJPY','3':'XAUUSD + USDJPY'},arbitration='One shared cash account and at most ONE open position total across permitted assets. Same-symbol RSI/compression conflicts abstain; RSI priority on agreement. Native quotes merged chronologically; Gold wins exact timestamp tie. No separate-account return summing.',guards={'PROP_FUNDED':'Per case: numerical STATIC_8_DAILY_4. Both cap stop-risk admission by remaining room, close and permanently stop on failure. UTC reset, not certified exact firm calendar or terms.','PERSONAL_STRESS':'10% daily,50% of original capital from peak. Deliberately broad research stress guards, not customer defaults. Requested risk can be reduced by margin, remaining loss room, minimum lot and lot-step.'},leverage='Notional ceiling and entry margin; not a complete MT5 stop-out or crypto liquidation model.',selection='Selected1ATR after reused management comparison; retrospective reused May-November source; not independent validation. No claim of actual firm compliance.',costs='Gold commission5.25/lot/side, slip0.075/oz/side; JPY commission3.5/lot/side, slip0.001/side; observed bid/ask;3s entry,1s management;1.5bps notional/calendar-day adverse financing. No reset/forced close at month ends.',manifests=[m for d in data for m in d.manifests]);(OUT/'protocol.json').write_text(json.dumps(protocol,indent=2))
 try:
  for month in months:
   streams=[]
   for symbol,d in zip(['XAUUSD','USDJPY'],data):
    p=ROOT/f'.tmp/execution-frontier/data/{symbol}-{month}.zip';m=next(m for m in d.manifests if m['month']==month);assert hashlib.sha256(p.read_bytes()).hexdigest()==m['archiveSha256']
    with zipfile.ZipFile(p) as z:
     names=[n for n in z.namelist() if n.endswith('.csv')];assert len(names)==1;f=pd.read_csv(z.open(names[0]),usecols=['Timestamp','Bid','Ask']);assert len(f)==m['ticks'];t=pd.to_datetime(f.Timestamp,utc=True,format='mixed').astype('int64').to_numpy()//1000000;assert np.all(np.diff(t)>=0);streams.append([np.ascontiguousarray(t,dtype=float),np.ascontiguousarray(f.Bid,dtype=float),np.ascontiguousarray(f.Ask,dtype=float)])
   days=sorted(set(int(x//86400000) for stream in streams for x in stream[0][np.r_[True,np.diff(stream[0]//86400000)!=0]]))
   for day in days:
    args=[];arrays=[]
    for stream in streams:
     lo,hi=np.searchsorted(stream[0],[day*86400000,(day+1)*86400000]);v=[np.ascontiguousarray(a[lo:hi]) for a in stream];arrays+=v;args.extend([len(v[0]),*[ptr(a) for a in v]])
    for h,spec in zip(engines,specs):
     assert lib.feed2(h,*args)==0;marks=[]
     for i,a in enumerate(spec['cases']):
      r=snapshot(h,i,a['capital']);r.pop('trades');marks.append(r)
     spec['daily'].append(dict(day=day,at=max(v[0][-1] for v in [[np.ascontiguousarray(a[np.searchsorted(stream[0],day*86400000):np.searchsorted(stream[0],(day+1)*86400000)]) for a in stream] for stream in streams] if len(v[0])),cases=marks))
   for spec in specs:spec['months'].append(dict(month=month,partial=month=='2026-11',cases=spec['daily'][-1]['cases']))
   print('MONTH',month,flush=True)
  for h,spec in zip(engines,specs):spec['final']=[snapshot(h,i,a['capital']) for i,a in enumerate(spec['cases'])]
  dump(OUT/'results.json.gz',dict(protocol=protocol,results=specs));print('COMPLETE',protocol['cases'],flush=True)
 finally:
  for h in engines:lib.destroy(h)
