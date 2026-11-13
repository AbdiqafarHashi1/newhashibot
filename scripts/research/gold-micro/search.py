import ctypes,hashlib,itertools,json,pathlib,subprocess
import numpy as np
from features import Data,ROOT
out=ROOT/'.tmp/gold-micro';data=Data(['2026-08','2026-09']);so=out/'screen.so';subprocess.run(['g++','-O3','-std=c++17','-shared','-fPIC',str(pathlib.Path(__file__).with_name('screen.cpp')),'-o',str(so)],check=True);lib=ctypes.CDLL(str(so));run=lib.micro_screen;D=ctypes.POINTER(ctypes.c_double);B=ctypes.POINTER(ctypes.c_byte);run.argtypes=[ctypes.c_int]+[D]*12+[B,ctypes.c_int,ctypes.c_int]+[ctypes.c_double]*5+[ctypes.c_int]*2+[ctypes.c_double]*3+[D,D,ctypes.c_int];run.restype=ctypes.c_int
ptr=lambda a:a.ctypes.data_as(D)
def simulate(cfg,start,end,risk=.25,leverage=5,commission=3.5,slip=.02,details=False):
 sig,atr,level,ref=data.features(cfg['family'],cfg['n']);a=max(1,int(np.searchsorted(data.t,start)));b=int(np.searchsorted(data.t,end));o=np.zeros(10);tr=np.zeros((10000,12));rc=run(len(data.t),ptr(data.t),*[ptr(p) for p in data.price],ptr(atr),ptr(level),ptr(ref),sig.ctypes.data_as(B),a,b,risk,leverage,cfg['stop'],cfg['rr'],cfg['hold'],cfg['style'],cfg['session'],commission,slip,25000,ptr(o),ptr(tr),len(tr));assert rc==0,rc;count=int(o[4]);t=tr[:count];return dict(returnPct=(o[0]/25000-1)*100,drawdownPct=o[1],closedTrades=count,winRatePct=float((t[:,6]>0).mean()*100) if count else None,expectancyR=float(t[:,7].mean()) if count else None,profitFactor=o[2]/o[3] if o[3] else None,failed=bool(o[7]),costs=o[8],meanHoldMinutes=float(t[:,11].mean()) if count else None,**({'trades':t.tolist()} if details else {}))
import pandas as pd
months=[(pd.Timestamp('2026-08-01',tz='UTC').value//1000000,pd.Timestamp('2026-09-01',tz='UTC').value//1000000),(pd.Timestamp('2026-09-01',tz='UTC').value//1000000,pd.Timestamp('2026-10-01',tz='UTC').value//1000000)]
# No October prices are loaded before finalists are frozen.
grid=[dict(family=f,n=n,stop=s,rr=r,hold=h,style=e,session=session) for f,n,s,r,h,e,session in itertools.product(['sweep_reclaim','trend_pullback','impulse_retest','stretch_snapback','level_reclaim','momentum_burst'],[5,10,20],[.75,1.25,2],[1,1.5,2],[1,3,5,10,15],[0,1,2],[0,1])];(out/'design.json').write_text(json.dumps(dict(schema='gold-micro-design/v1',grid=grid,selectionMonths=['2026-08','2026-09'],unreadLaterMonth='2026-10',riskPct=.25,leverage=5,commissionPerLotSide=3.5,fillReserveUSDPerOunceSide=.02,entry='Next native M1 opening bid/ask after a closed-bar decision',intraMinute='Conservative stop-first OHLC screen; finalists need ordered real ticks',noPromotion=True),indent=2));results=[]
for i,cfg in enumerate(grid):
 metrics=[simulate(cfg,a,b) for a,b in months];results.append(dict(configuration=cfg,periods=metrics));
 if i%200==199:print('screened',i+1,flush=True)
valid=[r for r in results if all(m['closedTrades']>=20 and m['returnPct']>0 and (m['profitFactor'] or 0)>1 and not m['failed'] and m['drawdownPct']<8 for m in r['periods'])];valid.sort(key=lambda r: min(m['expectancyR'] for m in r['periods'])*sum(m['closedTrades'] for m in r['periods'])/max(1,max(m['drawdownPct'] for m in r['periods'])),reverse=True)
finalists=[]
for r in valid:
 if any(x['configuration']['family']==r['configuration']['family'] for x in finalists):continue
 finalists.append(r)
 if len(finalists)>=3:break
source=hashlib.sha256(pathlib.Path(__file__).read_bytes()+pathlib.Path(__file__).with_name('features.py').read_bytes()+pathlib.Path(__file__).with_name('screen.cpp').read_bytes()).hexdigest();(out/'screen.json').write_text(json.dumps(dict(schema='gold-micro-screen/v1',sourceSha256=source,classification='M1_NATIVE_BID_ASK_SCREEN_NOT_CANONICAL_EXECUTION_QUALIFICATION',configurations=len(grid),accountCases=len(grid)*2,manifests=data.manifests,results=results,finalists=finalists)));(out/'frozen-finalists.json').write_text(json.dumps(dict(sourceSha256=source,selection='Positive August and September, participation and PF floors; choose diverse family finalists before October evaluation',finalists=finalists),indent=2));print('FINALISTS',json.dumps(finalists),flush=True)
