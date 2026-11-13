"""Ordered native tick verification, actual spread, delayed fills and delayed management."""
import ctypes,hashlib,json,pathlib,subprocess,zipfile
import numpy as np
import pandas as pd
from features import Data,ROOT
D=ctypes.POINTER(ctypes.c_double);B=ctypes.POINTER(ctypes.c_byte);ptr=lambda x:x.ctypes.data_as(D)
def library():
 source=pathlib.Path(__file__).with_name('ticks.cpp');so=ROOT/f'.tmp/gold-micro/ticks-{hashlib.sha256(source.read_bytes()).hexdigest()[:12]}.so'
 if not so.exists():
  import os
  tmp=so.with_name(so.name+f'.{os.getpid()}.tmp');subprocess.run(['g++','-O3','-std=c++17','-shared','-fPIC',str(source),'-o',str(tmp)],check=True);tmp.replace(so)
 lib=ctypes.CDLL(str(so));lib.micro_create.argtypes=[ctypes.c_int]*3+[D,B]+[D]*5;lib.micro_create.restype=ctypes.c_void_p;lib.micro_ticks.argtypes=[ctypes.c_void_p,ctypes.c_int,D,D,D];lib.micro_ticks.restype=ctypes.c_int;lib.micro_summary.argtypes=[ctypes.c_void_p,ctypes.c_int,D,ctypes.c_bool];lib.micro_trades.argtypes=[ctypes.c_void_p,ctypes.c_int,D,ctypes.c_int];lib.micro_destroy.argtypes=[ctypes.c_void_p];return lib
class Replay:
 def __init__(self,data,candidates,arms):
  self.data=data;self.arms=arms;self.lib=library();self.cfg=np.ascontiguousarray([[c[k] for k in ['stop','rr','hold','style','session']]+[c.get('mode',0)] for c in candidates],dtype=np.float64);features=[data.features(c['family'],c['n']) for c in candidates];self.signal=np.ascontiguousarray(np.column_stack([x[0] for x in features]),dtype=np.int8);self.arr=[np.ascontiguousarray(np.column_stack([x[k] for x in features]),dtype=np.float64) for k in [1,2,3]];self.spec=np.ascontiguousarray([[a['candidate'],a['risk'],a['leverage'],a['commission'],a['slip'],a['delayMs'],a['manageMs'],a['capital'],a.get('sampleMs',0),0] for a in arms],dtype=np.float64);self.h=self.lib.micro_create(len(candidates),len(arms),len(data.t),ptr(data.t),self.signal.ctypes.data_as(B),*[ptr(x) for x in self.arr],ptr(self.cfg),ptr(self.spec));assert self.h
 def ticks(self,t,b,a):assert self.lib.micro_ticks(self.h,len(t),ptr(t),ptr(b),ptr(a))==0
 def summary(self):
  result=[]
  for i,arm in enumerate(self.arms):
   o=np.zeros(12);self.lib.micro_summary(self.h,i,ptr(o),True);tr=np.zeros((int(o[5]),12));count=self.lib.micro_trades(self.h,i,ptr(tr),len(tr));assert count==len(tr);result.append(dict(arm=arm,returnPct=(o[0]/arm['capital']-1)*100,endingBalance=o[0],drawdownPct=o[2],closedTrades=count,winRatePct=o[7]/count*100 if count else None,expectancyR=float(tr[:,7].mean()) if count else None,profitFactor=o[3]/o[4] if o[4] else None,costs=o[8],blocked=int(o[9]),failed=bool(o[10]),meanHoldMinutes=float(tr[:,11].mean()) if count else None,trades=tr.tolist()))
  return result
 def close(self):self.lib.micro_destroy(self.h)
def run_month(data,month,candidates,arms):
 p=ROOT/f'.tmp/gold-micro/data/XAUUSD-{month}.zip';manifest=next(m for m in data.manifests if m['month']==month);assert hashlib.sha256(p.read_bytes()).hexdigest()==manifest['archiveSha256'];replay=Replay(data,candidates,arms);ticks=0;prior=-1
 with zipfile.ZipFile(p) as z:
  members=[n for n in z.namelist() if n.lower().endswith('.csv')];assert len(members)==1
  for c in pd.read_csv(z.open(members[0]),chunksize=250000,usecols=['Timestamp','Bid','Ask'],dtype={'Bid':'float64','Ask':'float64'}):
   t=np.ascontiguousarray(pd.to_datetime(c.Timestamp,utc=True,format='mixed').astype('int64').to_numpy()//1000000,dtype=np.float64);b=np.ascontiguousarray(c.Bid,dtype=np.float64);a=np.ascontiguousarray(c.Ask,dtype=np.float64);assert t[0]>=prior and np.all(np.diff(t)>=0);prior=t[-1];replay.ticks(t,b,a);ticks+=len(c)
   if ticks%1000000==0:print('ticks',month,ticks,flush=True)
 result=replay.summary();replay.close();assert ticks==manifest['ticks'];return dict(month=month,ticks=ticks,results=result)
if __name__=='__main__':
 import sys
 stage=sys.argv[1];root=ROOT/'.tmp/gold-micro'
 if stage in ['DEVELOPMENT','WATCH','WATCH_NATIVE','CONTEXT','EXITS','M2']:
  frozen=json.loads((root/'frozen-finalists.json').read_text());candidates=[]
  for r in frozen['finalists']:
   c=r['configuration'];candidates.append(c)
   if c['style']!=2:candidates.append({**c,'style':2})
  # Exact M1 entry evidence and tick-managed variant are frozen before reading October.
  if stage.startswith('WATCH') or stage=='CONTEXT':
   import itertools
   candidates=[dict(family=f,n=n,stop=st,rr=rr,hold=hold,style=2,session=1,mode=2 if f=='watch_reversal' else 1) for f,n,st,rr,hold in itertools.product(['watch_reversal','watch_trend','watch_breakout'],[10,20],[1,1.5],[1.5,2],[3,10])]
  if stage=='CONTEXT':
   import itertools
   candidates=[dict(family=f,n=n,stop=st,rr=rr,hold=hold,style=2,session=session,mode=3 if f=='watch_support_reversal' else 1) for f,n,st,rr,hold,session in itertools.product(['watch_support_reversal','watch_two_bar_resume'],[10,20],[1,1.5],[1.5,2],[5,10],[1,2,3])]
  if stage=='EXITS':
   import itertools
   candidates=[dict(family='watch_strong_resume',n=n,stop=st,rr=2,hold=10,style=style,session=session,mode=1) for n,st,style,session in itertools.product([10,20],[1,1.5],[0,1,3],[1,3])]+[dict(family='watch_two_bar_resume',n=10,stop=st,rr=rr,hold=10,style=style,session=3,mode=1) for st,rr,style in itertools.product([1,1.5],[1.5,2],[0,1,3])]
  if stage=='M2':
   candidates=[dict(family=f,n=10,stop=1.5,rr=2,hold=10,style=style,session=3,mode=1) for f,style in [('watch_two_bar_resume',3),('watch_adaptive_resume',4),('watch_aligned_resume',3),('watch_strong_resume',1)]]+[dict(family='impulse_retest',n=20,stop=2,rr=2,hold=10,style=1,session=1,mode=0)]
  assert candidates;arms=[]
  for i in range(len(candidates)):
   for profile,risk,lev in ([('PERSONAL',.5,10)] if stage.startswith('WATCH') or stage in ['CONTEXT','EXITS','M2'] else [('PROP',.25,5),('PERSONAL',.5,10)]):
    for case,commission,slip,delay in ([('NORMAL',3.5,.02,1000),('STANDARD',5.25,.05,3000),('CLOUD15',5.25,.05,15000)] if stage=='M2' else [('NORMAL',3.5,.02,1000)] if stage.startswith('WATCH') or stage in ['CONTEXT','EXITS','M2'] else [('FAST',3.5,.02,250),('STANDARD',5.25,.05,1000),('SLOW',5.25,.1,3000),('CLOUD15',5.25,.05,15000)]):arms.append(dict(candidate=i,profile=profile,case=case,risk=risk,leverage=lev,commission=commission,slip=slip,delayMs=delay,manageMs=1000,capital=25000))
  (root/('frozen-model2-design.json' if stage=='M2' else 'frozen-exits-design.json' if stage=='EXITS' else 'frozen-context-design.json' if stage=='CONTEXT' else 'frozen-watch-native-design.json' if stage=='WATCH_NATIVE' else 'frozen-watch-design.json' if stage=='WATCH' else 'frozen-tick-design.json')).write_text(json.dumps(dict(candidates=candidates,arms=arms,selectionPeriod=['2026-08','2026-09'],unreadPeriod='2026-10'),indent=2));data=Data(['2026-08','2026-09']);results=[]
  for month in ['2026-08','2026-09']:
   results.append(run_month(data,month,candidates,arms));print('COMPLETE',month,flush=True)
  (root/('ticks-model2.json' if stage=='M2' else 'ticks-exits.json' if stage=='EXITS' else 'ticks-context.json' if stage=='CONTEXT' else 'ticks-watch-native.json' if stage=='WATCH_NATIVE' else 'ticks-watch.json' if stage=='WATCH' else 'ticks-development.json')).write_text(json.dumps(dict(schema='gold-micro-ticks/v1',stage=stage,candidates=candidates,results=results,manifests=data.manifests)));print('DONE',len(arms),flush=True)
 else:raise ValueError('STAGE_REQUIRED')
