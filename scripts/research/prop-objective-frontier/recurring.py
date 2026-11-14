"""Repeat funded cutoffs with modeled approval waits and cash-flow-aware guards."""
import ctypes,hashlib,itertools,json,pathlib,subprocess,sys,zipfile
import numpy as np
import pandas as pd
from run import ROOT,OUT,D,B,ptr,dump
from features import Data
source=pathlib.Path(__file__).with_name('recurring.cpp');sha=hashlib.sha256(source.read_bytes()).hexdigest();so=OUT/f'recurring-{sha[:12]}.so'
if not so.exists():subprocess.run(['g++','-std=c++17','-O3','-shared','-fPIC',str(source),'-o',str(so)],check=True)
lib=ctypes.CDLL(str(so));lib.create.argtypes=[ctypes.c_int,D,B,D,D,ctypes.c_int,D];lib.create.restype=ctypes.c_void_p;lib.feed.argtypes=[ctypes.c_void_p,ctypes.c_int,D,D,D];lib.feed.restype=ctypes.c_int;lib.summary.argtypes=[ctypes.c_void_p,ctypes.c_int,D,D,ctypes.c_int];lib.summary.restype=ctypes.c_int;lib.events.argtypes=[ctypes.c_void_p,ctypes.c_int,D,ctypes.c_int];lib.events.restype=ctypes.c_int;lib.destroy.argtypes=[ctypes.c_void_p]
if __name__=='__main__':
 end=pd.Timestamp('2026-11-13',tz='UTC').value//1000000
 cases=[dict(date=f'2026-{m:02d}-01',start=pd.Timestamp(f'2026-{m:02d}-01',tz='UTC').value//1000000,end=end,guard=g,risk=r,goal=goal) for m,g,r,goal in itertools.product(range(5,12),['MATCHED_PRODUCT','STATIC_9_DAILY_4_5'],[.25,.4,.5],[2,5])]
 protocol=dict(schema='native-funded-recurring/v1',engineSha256=sha,cases=cases,capital=25000,entryRiskPct='Per scenario, no production policy change',goalPct='Per scenario',firstAndRepeatWaitDays=14,modeledApprovalDelayDays=1,minimumCycleSpacingDays={'2%':14,'5%':30},profitSplit=.8,serviceFeeSensitivityUSDPerCalendarMonth=100,cashFlowRule='Only after a flat eligible modeled request, withdraw the full trading profit, allocate 80% hypothetical customer reward, reset balance to original capital and subtract the SAME verified withdrawal from peak/day-start. This preserves drawdown distance; losses are not reset.',limitations=['Assumed payout approval/withdrawal for simulation; no actual firm approvals or payouts.','All source periods reused; retrospective research, not independent validation.','Fees are economic sensitivity, not an entitlement/billing mutation.','Neither actual news restrictions nor provider fills are verified.','Partial November and staggered starts remain censored.']);(OUT/'protocol-recurring.json').write_text(json.dumps(protocol,indent=2))
 data=Data('XAUUSD',[f'2026-{m:02d}' for m in range(5,12)]);sig,atr,st=data.features('rsi_exhaustion',15,12);times=np.ascontiguousarray(data.x[:,0]);cfg=np.ascontiguousarray([[100,.01,5.25,.075,a['risk'],5,1.5,5,1440,2,25000,0,3000,a['start'],a['end'],2,10,a['goal'],2 if a['guard']=='MATCHED_PRODUCT' else 1,4,a['risk'],1] for a in cases],dtype=float);h=lib.create(len(times),ptr(times),sig.ctypes.data_as(B),ptr(atr),ptr(st),len(cfg),ptr(cfg));assert h;prior=-1
 try:
  for m in data.manifests:
   p=ROOT/f".tmp/execution-frontier/data/XAUUSD-{m['month']}.zip";assert hashlib.sha256(p.read_bytes()).hexdigest()==m['archiveSha256'];count=0
   with zipfile.ZipFile(p) as z:
    names=[n for n in z.namelist() if n.endswith('.csv')];assert len(names)==1
    for f in pd.read_csv(z.open(names[0]),usecols=['Timestamp','Bid','Ask'],chunksize=250000):
     t=np.ascontiguousarray(pd.to_datetime(f.Timestamp,utc=True,format='mixed').astype('int64')//1000000,dtype=float);bid=np.ascontiguousarray(f.Bid,dtype=float);ask=np.ascontiguousarray(f.Ask,dtype=float);assert t[0]>=prior;prior=t[-1];assert lib.feed(h,len(t),ptr(t),ptr(bid),ptr(ask))==0;count+=len(t)
   assert count==m['ticks'];print('MONTH',m['month'],count,flush=True)
  results=[]
  for i,a in enumerate(cases):
   o=np.zeros(18);tr=np.zeros((20000,12));n=lib.summary(h,i,ptr(o),ptr(tr),len(tr));assert n>=0;ev=np.zeros((2000,7));ne=lib.events(h,i,ptr(ev),len(ev));assert ne>=0;events=ev[:ne].tolist();assert sum(e[1]==4 for e in events)==o[14]
   rewards=[dict(at=e[0],accountProfit=e[3]-25000,customerReward=(e[3]-25000)*.8) for e in events if e[1]==4];assert abs(sum(r['customerReward'] for r in rewards)-o[16])<1e-5;assert abs(25000+tr[:n,6].sum()-o[15]-o[17]-o[5])<1e-5
   results.append(dict(scenario=a,rewardCycles=int(o[14]),withdrawnProfit=o[15],hypotheticalCustomerRewards=o[16],failed=bool(o[4]),balance=o[5],openPositionCosts=o[17],equity=o[6],worstPeakDrawdownPct=o[7],closedTrades=n,blocked=int(o[11]),observedUntil=prior,rewards=rewards,events=events,trades=tr[:n].tolist()))
  dump('recurring-results.json.gz',dict(protocol=protocol,manifests=data.manifests,results=results));print('COMPLETE',len(results),flush=True)
 finally:lib.destroy(h)
