"""Verify the three positive July candidates on ordered quotes; no retuning."""
import ctypes,gzip,hashlib,itertools,json,pathlib,subprocess,zipfile
import numpy as np
import pandas as pd
from features import Data,ROOT
from study import OUT,dump,ptr,D,B
source=pathlib.Path(__file__).with_name('ticks.cpp');so=OUT/f'ticks-{hashlib.sha256(source.read_bytes()).hexdigest()[:12]}.so'
if not so.exists():subprocess.run(['g++','-O3','-std=c++17','-shared','-fPIC',str(source),'-o',str(so)],check=True)
lib=ctypes.CDLL(str(so));lib.create.argtypes=[ctypes.c_int,D,B,D,D,ctypes.c_int,D];lib.create.restype=ctypes.c_void_p;lib.feed.argtypes=[ctypes.c_void_p,ctypes.c_int,D,D,D];lib.feed.restype=ctypes.c_int;lib.summary.argtypes=[ctypes.c_void_p,ctypes.c_int,D,D,ctypes.c_int];lib.summary.restype=ctypes.c_int;lib.destroy.argtypes=[ctypes.c_void_p]
def run(data,c,month,arms):
 sig,atr,st=data.features(c['family'],c['minutes'],c['n']);times=np.ascontiguousarray(data.x[:,0]);gold=data.symbol=='XAUUSD';jpy=data.symbol=='USDJPY';tick=.01 if gold else .001 if jpy else .00001;contract=100 if gold else 100000
 cfg=np.ascontiguousarray([[contract,tick,3.5*a['stress'],(.05 if gold else 2*tick)*a['stress'],a['risk'],a['leverage'],c['stop'],c['rr'],c['hold'],c['style'],a['capital'],jpy,a['delayMs'],0] for a in arms],dtype=float);h=lib.create(len(times),ptr(times),sig.ctypes.data_as(B),ptr(atr),ptr(st),len(arms),ptr(cfg));assert h
 archive=ROOT/f'.tmp/execution-frontier/data/{data.symbol}-{month}.zip';manifest=next(m for m in data.manifests if m['month']==month);assert hashlib.sha256(archive.read_bytes()).hexdigest()==manifest['archiveSha256'];count=0;prior=-1
 try:
  with zipfile.ZipFile(archive) as z:
   files=[n for n in z.namelist() if n.endswith('.csv')];assert len(files)==1
   for f in pd.read_csv(z.open(files[0]),usecols=['Timestamp','Bid','Ask'],chunksize=250000):
    t=np.ascontiguousarray(pd.to_datetime(f.Timestamp,utc=True,format='mixed').astype('int64')//1000000,dtype=float);bid=np.ascontiguousarray(f.Bid,dtype=float);ask=np.ascontiguousarray(f.Ask,dtype=float);assert t[0]>=prior;prior=t[-1];assert lib.feed(h,len(t),ptr(t),ptr(bid),ptr(ask))==0;count+=len(t)
  assert count==manifest['ticks'];results=[]
  for i,a in enumerate(arms):
   o=np.zeros(12);tr=np.zeros((10000,12));n=lib.summary(h,i,ptr(o),ptr(tr),len(tr));assert n>=0;tr=tr[:n];assert abs(a['capital']+sum(tr[:,6])-o[5])<1e-5
   results.append(dict(arm=a,returnPct=o[0],drawdownPct=o[1],closedTrades=n,profitFactor=o[3]/o[4] if o[4] else None,endingBalance=o[5],commission=o[6],blocked=int(o[7]),failed=bool(o[8]),trades=tr.tolist()))
  return dict(month=month,ticks=count,results=results)
 finally:lib.destroy(h)
if __name__=='__main__':
 original=json.load(gzip.open(OUT/'holdout.json.gz'));selected=[r['candidate'] for r in original['results'] if all(x['returnPct']>0 and not x['failed'] for x in r['cases'] if x['month']=='2026-07' and x['capital']==25000 and x['stress']==1.5)];assert len(selected)==3
 arms=[dict(profile=p,risk=r,leverage=l,capital=25000,stress=s,delayMs=d) for (p,r,l),s,d in itertools.product([('PERSONAL',.5,10),('PROP',.25,5)],[1,1.5],[1000,3000,15000])]
 arms += [dict(profile='PERSONAL',risk=.5,leverage=10,capital=c,stress=1.5,delayMs=3000) for c in [500,1000,5000]]
 (OUT/'tick-protocol.json').write_text(json.dumps(dict(selected=selected,arms=arms,periods=['2026-05','2026-06','2026-07'],selection='Two all-cost July survivors plus a cost-sensitive Yen diagnostic: Yen loses at baseline and gains at higher-cost admission. July was used to choose these; no new holdout claim.'),indent=2));all_results=[]
 for c in selected:
  data=Data(c['symbol'],['2026-05','2026-06','2026-07']);results=[]
  for month in ['2026-05','2026-06','2026-07']:
   r=run(data,c['config'],month,arms);results.append(r);print('TICKS',c['symbol'],month,[(x['arm']['profile'],round(x['returnPct'],3)) for x in r['results'] if x['arm']['capital']==25000 and x['arm']['stress']==1.5 and x['arm']['delayMs']==3000],flush=True)
  all_results.append(dict(candidate=c,results=results,manifests=data.manifests));dump(OUT/'ticks.partial.json.gz',all_results)
 dump(OUT/'ticks.json.gz',all_results);print('COMPLETE',len(all_results),flush=True)
