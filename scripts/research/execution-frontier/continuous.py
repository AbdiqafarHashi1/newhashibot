"""Continuous account replay: no month-end resets, one symbol, explicit arbitration."""
import ctypes,hashlib,json,pathlib,zipfile
import numpy as np
import pandas as pd
from features import Data,ROOT
from study import OUT,ptr,D,B,dump
from literature_native import setup
import tick_verify as t
class Combined(Data):
 def features(self,family,minutes,n):
  if family!='ARBITRATED':return super().features(family,minutes,n)
  a=super().features('rsi_exhaustion',15,12);b=super().features('compression_expand',15,24);r,c=a[0],b[0];sig=np.where((r!=0)&(c!=0)&(r!=c),0,np.where(r!=0,r,3*c));return np.ascontiguousarray(sig,dtype=np.int8),a[1],np.ascontiguousarray(np.where(r!=0,a[2],b[2]),dtype=float)
if __name__=='__main__':
 protocol=json.loads((OUT/'continuous-protocol.json').read_text());assert hashlib.sha256(pathlib.Path(__file__).with_name('continuous-ticks.cpp').read_bytes()).hexdigest()==protocol['sourceSha256'];setup('continuous-ticks.cpp');lib=t.lib;lib.snapshot.argtypes=lib.summary.argtypes;lib.snapshot.restype=ctypes.c_int;months=['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11'];data=Combined('XAUUSD',months);results=[]
 for name,c in [('RSI',protocol['rsi']),('COMPRESSION',protocol['compression']),('ARBITRATED',{**protocol['rsi'],'family':'ARBITRATED'})]:
  sig,atr,st=data.features(c['family'],c['minutes'],c['n']);time=np.ascontiguousarray(data.x[:,0]);cfg=np.ascontiguousarray([[100,.01,5.25,.075,a['risk'],a['leverage'],c['stop'],c['rr'],c['hold'],c['style'],25000,0,3000,a['prop']] for a in protocol['profiles']],dtype=float);h=lib.create(len(time),ptr(time),sig.ctypes.data_as(B),ptr(atr),ptr(st),len(cfg),ptr(cfg));assert h;periods=[];prior_time=-1;prior_bal=[25000.]*len(cfg);prior_eq=[25000.]*len(cfg)
  try:
   for month in months:
    archive=OUT/f'data/XAUUSD-{month}.zip';manifest=next(m for m in data.manifests if m['month']==month);assert hashlib.sha256(archive.read_bytes()).hexdigest()==manifest['archiveSha256'];ticks=0
    with zipfile.ZipFile(archive) as z:
     files=[n for n in z.namelist() if n.endswith('.csv')];assert len(files)==1
     for f in pd.read_csv(z.open(files[0]),usecols=['Timestamp','Bid','Ask'],chunksize=250000):
      tt=np.ascontiguousarray(pd.to_datetime(f.Timestamp,utc=True,format='mixed').astype('int64')//1000000,dtype=float);bid=np.ascontiguousarray(f.Bid,dtype=float);ask=np.ascontiguousarray(f.Ask,dtype=float);assert tt[0]>=prior_time;prior_time=tt[-1];assert lib.feed(h,len(tt),ptr(tt),ptr(bid),ptr(ask))==0;ticks+=len(tt)
    assert ticks==manifest['ticks'];cases=[]
    for i,p in enumerate(protocol['profiles']):
     o=np.zeros(12);tr=np.zeros((10000,12));n=lib.snapshot(h,i,ptr(o),ptr(tr),len(tr));assert n>=0;cases.append(dict(profile=p,balance=o[5],equity=o[9],realizedChangePctOriginal=(o[5]-prior_bal[i])/25000*100,equityChangePctOriginal=(o[9]-prior_eq[i])/25000*100,closedTrades=n,drawdownPct=o[1],failed=bool(o[8]),openSide=o[10],openLots=o[11]));prior_bal[i]=o[5];prior_eq[i]=o[9]
    periods.append(dict(month=month,lastTick=manifest['lastTick'],cases=cases));print('CONTINUOUS',name,month,[(x['profile']['profile'],x['profile']['risk'],round(x['equityChangePctOriginal'],3)) for x in cases],flush=True)
   final=[]
   for i,p in enumerate(protocol['profiles']):
    o=np.zeros(12);tr=np.zeros((10000,12));n=lib.summary(h,i,ptr(o),ptr(tr),len(tr));assert n>=0;assert abs(25000+tr[:n,6].sum()-o[5])<1e-5;final.append(dict(profile=p,returnPct=o[0],drawdownPct=o[1],closedTrades=n,profitFactor=o[3]/o[4] if o[4] else None,endingBalance=o[5],costsIncludingCarry=o[6],blocked=o[7],failed=bool(o[8]),trades=tr[:n].tolist()))
   results.append(dict(name=name,config=c,months=periods,final=final));dump(OUT/'continuous.partial.json.gz',dict(protocol=protocol,results=results,manifests=data.manifests))
  finally:lib.destroy(h)
 dump(OUT/'continuous.json.gz',dict(protocol=protocol,results=results,manifests=data.manifests));print('COMPLETE',len(results),flush=True)
