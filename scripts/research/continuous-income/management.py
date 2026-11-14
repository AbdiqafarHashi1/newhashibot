"""Bounded predeclared management comparison; all reused-period variants retained."""
import ctypes,hashlib,itertools,json,pathlib,subprocess,zipfile
import numpy as np
import pandas as pd
from run import ROOT,OUT,Combined,D,B,ptr,dump
src=pathlib.Path(__file__).with_name('management.cpp');sha=hashlib.sha256(src.read_bytes()).hexdigest();so=OUT/f'management-{sha[:12]}.so';subprocess.run(['g++','-O3','-std=c++17','-shared','-fPIC',str(src),'-o',str(so)],check=True);lib=ctypes.CDLL(str(so));lib.create.argtypes=[ctypes.c_int,D,B,D,D,ctypes.c_int,D,B,D,D,ctypes.c_int,D];lib.create.restype=ctypes.c_void_p;lib.feed2.argtypes=[ctypes.c_void_p,ctypes.c_int,D,D,D,ctypes.c_int,D,D,D];lib.feed2.restype=ctypes.c_int;lib.snapshot.argtypes=[ctypes.c_void_p,ctypes.c_int,D,D,ctypes.c_int];lib.snapshot.restype=ctypes.c_int;lib.destroy.argtypes=[ctypes.c_void_p]
if __name__=='__main__':
 cases=[dict(risk=r,trigger=trigger,trailATR=trail,holdMinutes=hold) for r,trigger,trail,hold in itertools.product([.4,.5],[1,1.5,2],[1,1.5,2],[240,1440])];protocol=dict(schema='native-gold-management/v1',sourceSha256=sha,cases=cases,capital=25000,guard='STATIC8% / daily4% at UTC reset; no target cutoff; leverage5',entry='Fixed M15 RSI exhaustion,n12,1.5ATR/structural stop,5R target; only management variables change',trailing='At the selected triggerR, tighten monotonically to max(+0.5R,bestMove-trailATR*latestClosedATR), delayed1s. Stops never widen.',selection='Predeclare 36 management cases after baseline and short-frame results. All data reused; results remain development selection, not independent validation.',costs='Same ordered Exness RawSpread bid/ask,commission5.25/lot/side,adversefill0.075/oz/side,entry3s,management1s,1.5bps/day adverse carry.');(OUT/'management-protocol.json').write_text(json.dumps(protocol,indent=2));d=Combined('XAUUSD',[f'2026-{m:02}' for m in range(5,12)]);sig,atr,st=d.features('rsi_exhaustion',15,12);tm=np.ascontiguousarray(d.x[:,0]);zero=np.zeros(len(tm),np.int8);cfg=np.ascontiguousarray([[100,.01,5.25,.075,a['risk'],5,1.5,5,a['holdMinutes'],2,25000,0,3000,3,1,a['trigger'],a['trailATR']] for a in cases],float);h=lib.create(len(tm),ptr(tm),sig.ctypes.data_as(B),ptr(atr),ptr(st),len(tm),ptr(tm),zero.ctypes.data_as(B),ptr(atr),ptr(st),len(cases),ptr(cfg));assert h;empty=np.zeros(0,float);months=[]
 def snap(i,details=False):
  o=np.zeros(13);tr=np.zeros((20000,12));n=lib.snapshot(h,i,ptr(o),ptr(tr),len(tr));assert n>=0;assert abs(25000+tr[:n,6].sum()-o[12]-o[5])<1e-5;r=dict(equity=o[9],balance=o[5],netPct=(o[9]/25000-1)*100,drawdownPct=o[1],closedTrades=n,profitFactor=o[3]/o[4] if o[4] else None,failed=bool(o[8]),blocked=int(o[7]),openSide=o[10],openCosts=o[12]);
  if details:r['trades']=tr[:n].tolist()
  return r
 try:
  for m in d.manifests:
   p=ROOT/f".tmp/execution-frontier/data/XAUUSD-{m['month']}.zip";assert hashlib.sha256(p.read_bytes()).hexdigest()==m['archiveSha256'];count=0
   with zipfile.ZipFile(p) as z:
    names=[n for n in z.namelist() if n.endswith('.csv')];assert len(names)==1
    for f in pd.read_csv(z.open(names[0]),usecols=['Timestamp','Bid','Ask'],chunksize=250000):
     t=np.ascontiguousarray(pd.to_datetime(f.Timestamp,utc=True,format='mixed').astype('int64')//1000000,dtype=float);b=np.ascontiguousarray(f.Bid,float);a=np.ascontiguousarray(f.Ask,float);assert lib.feed2(h,len(t),ptr(t),ptr(b),ptr(a),0,ptr(empty),ptr(empty),ptr(empty))==0;count+=len(t)
   assert count==m['ticks'];months.append(dict(month=m['month'],partial=m['month']=='2026-11',cases=[snap(i) for i in range(len(cases))]));print('MONTH',m['month'],flush=True)
  dump(OUT/'management-results.json.gz',dict(protocol=protocol,manifests=d.manifests,months=months,results=[dict(scenario=a,final=snap(i,True)) for i,a in enumerate(cases)]));print('COMPLETE',len(cases),flush=True)
 finally:lib.destroy(h)
