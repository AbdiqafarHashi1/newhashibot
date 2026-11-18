"""Native shorter-timeframe Gold sizing test; frozen research settings, not a release."""
import ctypes,hashlib,itertools,json,pathlib,zipfile
import numpy as np
import pandas as pd
from run import ROOT,OUT,Combined,lib,ptr,B,snapshot,dump
if __name__=='__main__':
 months=[f'2026-{m:02}' for m in range(5,12)];d=Combined('XAUUSD',months);cases=[dict(kind='PERSONAL_STRESS',capital=c,risk=r,leverage=l,assets=1) for c,r,l in itertools.product([100,500],[.5,1,2,3,5],[10,20,50,100])];engines=[];keep=[];specs=[]
 for minutes,hold in [(1,15),(5,60)]:
  sig,atr,st=d.features('rsi_exhaustion',minutes,12);tm=np.ascontiguousarray(d.x[:,0]);zero=np.zeros(len(tm),dtype=np.int8);cfg=np.ascontiguousarray([[100,.01,5.25,.075,a['risk'],a['leverage'],1.5,5,hold,2,a['capital'],0,3000,0,1] for a in cases],float);keep.extend([tm,sig,atr,st,zero,cfg]);h=lib.create(len(tm),ptr(tm),sig.ctypes.data_as(B),ptr(atr),ptr(st),len(tm),ptr(tm),zero.ctypes.data_as(B),ptr(atr),ptr(st),len(cfg),ptr(cfg));assert h;engines.append(h);specs.append(dict(minutes=minutes,maxHoldMinutes=hold,cases=cases,months=[]))
 protocol=dict(schema='native-small-gold/v1',cases=80,family='rsi_exhaustion',stopAtr=1.5,targetR=5,trailing='After2R by2 closed ATR',entryDelayMs=3000,models=[dict(minutes=s['minutes'],maxHoldMinutes=s['maxHoldMinutes']) for s in specs],guards='Same broad personal 10% daily / 50% original from peak stress guards, not production defaults.',selection='Fixed two short-frame comparisons after M15 minimum-lot inactivity observed. All periods reused; no independent validation claim.',costs='Same observed RawSpread bid/ask,5.25USD/lot/side,0.075USD/oz/side adverse fill,1.5bps notional/calendar-day financing;minimum0.01lot/100oz contract.',sourceSha256=hashlib.sha256((pathlib.Path(__file__).with_name('engine.cpp')).read_bytes()).hexdigest(),manifests=d.manifests)
 try:
  empty=np.zeros(0,float)
  for m in d.manifests:
   p=ROOT/f".tmp/execution-frontier/data/XAUUSD-{m['month']}.zip";assert hashlib.sha256(p.read_bytes()).hexdigest()==m['archiveSha256'];count=0
   with zipfile.ZipFile(p) as z:
    names=[n for n in z.namelist() if n.endswith('.csv')];assert len(names)==1
    for f in pd.read_csv(z.open(names[0]),usecols=['Timestamp','Bid','Ask'],chunksize=250000):
     t=np.ascontiguousarray(pd.to_datetime(f.Timestamp,utc=True,format='mixed').astype('int64')//1000000,dtype=float);b=np.ascontiguousarray(f.Bid,float);a=np.ascontiguousarray(f.Ask,float)
     for h in engines:assert lib.feed2(h,len(t),ptr(t),ptr(b),ptr(a),0,ptr(empty),ptr(empty),ptr(empty))==0
     count+=len(t)
   assert count==m['ticks']
   for h,s in zip(engines,specs):
    marks=[]
    for i,a in enumerate(cases):r=snapshot(h,i,a['capital']);r.pop('trades');marks.append(r)
    s['months'].append(dict(month=m['month'],partial=m['month']=='2026-11',cases=marks))
   print('MONTH',m['month'],flush=True)
  for h,s in zip(engines,specs):s['final']=[snapshot(h,i,a['capital']) for i,a in enumerate(cases)]
  dump(OUT/'small-gold-results.json.gz',dict(protocol=protocol,results=specs));print('COMPLETE',80,flush=True)
 finally:
  for h in engines:lib.destroy(h)
