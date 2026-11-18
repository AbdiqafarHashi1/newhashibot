"""Native Gold RSI challenge/funded objectives. Retrospective research only."""
import ctypes,gzip,hashlib,itertools,json,pathlib,subprocess,sys,zipfile
import numpy as np
import pandas as pd
ROOT=pathlib.Path(__file__).resolve().parents[3];sys.path.insert(0,str(ROOT/'scripts/research/execution-frontier'))
from features import Data
D=ctypes.POINTER(ctypes.c_double);B=ctypes.POINTER(ctypes.c_byte);ptr=lambda a:a.ctypes.data_as(D)
OUT=ROOT/'.tmp/continuous-income/challenge';OUT.mkdir(parents=True,exist_ok=True)
source=ROOT/'scripts/research/prop-objective-frontier/engine.cpp';sha=hashlib.sha256(source.read_bytes()).hexdigest();so=OUT/f'engine-{sha[:12]}.so'
if not so.exists():subprocess.run(['g++','-std=c++17','-O3','-shared','-fPIC',str(source),'-o',str(so)],check=True)
lib=ctypes.CDLL(str(so));lib.create.argtypes=[ctypes.c_int,D,B,D,D,ctypes.c_int,D];lib.create.restype=ctypes.c_void_p;lib.feed.argtypes=[ctypes.c_void_p,ctypes.c_int,D,D,D];lib.feed.restype=ctypes.c_int;lib.summary.argtypes=[ctypes.c_void_p,ctypes.c_int,D,D,ctypes.c_int];lib.summary.restype=ctypes.c_int;lib.events.argtypes=[ctypes.c_void_p,ctypes.c_int,D,ctypes.c_int];lib.events.restype=ctypes.c_int;lib.destroy.argtypes=[ctypes.c_void_p]
def dump(name,obj):
 with gzip.GzipFile(filename=str(OUT/name),mode='wb',mtime=0) as f:f.write(json.dumps(obj,separators=(',',':'),default=lambda x:x.item()).encode())
if __name__=='__main__':
 expanded=True
 scenarios=[]
 dates=([f'2026-{m:02d}-{day:02d}' for m in range(5,11) for day in [1,15]]+['2026-11-01']) if expanded else [f'2026-{m:02d}-01' for m in range(5,12)]
 for date,guard,initial in itertools.product(dates,['MATCHED_PRODUCT'] if expanded else ['PEAK_8_DAILY_2','STATIC_9_DAILY_4_5'],['CHALLENGE']):
  for challengeTarget,fundedTarget,risk in itertools.product([8,10] if initial=='CHALLENGE' else [10],[2],([.5,.625,.75,1] if initial=='CHALLENGE' else [.25,.4,.5]) if expanded else ([.5] if initial=='CHALLENGE' else [.25])):
   start=pd.Timestamp(date,tz='UTC').value//1000000;scenarios.append(dict(date=date,start=start,end=start+90*86400000,guard=guard,initial=initial,challengeTarget=challengeTarget,fundedTarget=fundedTarget,risk=risk,fundedRisk=.25 if initial=='CHALLENGE' else risk,researchRiskAboveProduction=risk>.5))
 protocol=dict(schema='native-prop-objectives/v1',engineSha256=sha,strategy=dict(family='rsi_exhaustion',minutes=15,n=12,stop=1.5,rr=5,hold=1440,style=2),scenarios=scenarios,capital=25000,evaluationRisk=.5,fundedRisk=.25,leverageCeiling=5,minimumEntryDaysPerEvaluationPhase=4,phaseDelayHours=24,payoutWaitDaysFromFirstFundedTrade=14,costs=dict(commissionPerLotSide=5.25,adverseFillUSDPerOzSide=.075,entryDelayMs=3000,managementDelayMs=1000,carryBpsNotionalPerCalendarDay=1.5),guardProfiles={'PEAK_8_DAILY_2':'Historical stress: daily2%, overall8% of original capital from peak','MATCHED_PRODUCT':'Evaluation daily4.5%/overall9%, funded daily4%/overall8%, peak-based internal model','STATIC_9_DAILY_4_5':'Numerical reference daily4.5% and static initial9%, not default HashiBot funded policy'},selection='Strategy was selected on prior May–October research. All goals/guard scenarios are now prespecified retrospective comparisons; no untouched holdout claim.',limitations=['Numerical reference programs, not firm-specific certification. No news/calendar or personal-use agreement verification.','Profit target banking requests closure; net target must survive costs before passing. Minimum days use genuine later signals at 0.05% preservation risk.','A first modeled request opportunity is not an approved payout or money withdrawn.','Funding and target-horizon denominators retain partial-history censoring.','Only evaluation/funded account research, not production execution authorization.']);(OUT/('protocol-expanded.json' if expanded else 'protocol.json')).write_text(json.dumps(protocol,indent=2))
 data=Data('XAUUSD',[f'2026-{m:02d}' for m in range(5,12)]);sig,atr,st=data.features('rsi_exhaustion',15,12);times=np.ascontiguousarray(data.x[:,0]);cfg=np.ascontiguousarray([[100,.01,5.25,.075,a['risk'],5,1.5,5,1440,2,25000,0,3000,a['start'],a['end'],0 if a['initial']=='CHALLENGE' else 2,a['challengeTarget'],a['fundedTarget'],(1 if a['guard'].startswith('STATIC') else 2 if a['guard']=='MATCHED_PRODUCT' else 0),4,a['fundedRisk']] for a in scenarios],dtype=float);h=lib.create(len(times),ptr(times),sig.ctypes.data_as(B),ptr(atr),ptr(st),len(cfg),ptr(cfg));assert h;prior=-1
 try:
  for manifest in data.manifests:
   p=ROOT/f".tmp/execution-frontier/data/XAUUSD-{manifest['month']}.zip";assert hashlib.sha256(p.read_bytes()).hexdigest()==manifest['archiveSha256'];ticks=0
   with zipfile.ZipFile(p) as z:
    names=[n for n in z.namelist() if n.endswith('.csv')];assert len(names)==1
    for f in pd.read_csv(z.open(names[0]),usecols=['Timestamp','Bid','Ask'],chunksize=250000):
     t=np.ascontiguousarray(pd.to_datetime(f.Timestamp,utc=True,format='mixed').astype('int64')//1000000,dtype=float);bid=np.ascontiguousarray(f.Bid,dtype=float);ask=np.ascontiguousarray(f.Ask,dtype=float);assert t[0]>=prior;prior=t[-1];assert lib.feed(h,len(t),ptr(t),ptr(bid),ptr(ask))==0;ticks+=len(t)
   assert ticks==manifest['ticks'];print('MONTH',manifest['month'],ticks,flush=True)
  results=[]
  for i,a in enumerate(scenarios):
   o=np.zeros(14);tr=np.zeros((20000,12));n=lib.summary(h,i,ptr(o),ptr(tr),len(tr));assert n>=0;ev=np.zeros((1000,7));ne=lib.events(h,i,ptr(ev),len(ev));assert ne>=0;events=ev[:ne].tolist();observed=min(a['end'],prior);fundedAt=o[1] if o[1] and o[1]<=observed else None;firstFundedTrade=o[12] if o[0]>=2 else None;qualified=next((e[0] for e in events if e[1]==4),None)
   results.append(dict(scenario=a,phase=int(o[0]),fundedAt=fundedAt,financialTargetAt=o[2] or None,plannedRequestAt=o[3] or None,requestQualifiedAt=qualified,failed=bool(o[4]),balance=o[5],equity=o[6],worstPhasePeakDrawdownPct=o[7],closedTrades=n,finished=bool(o[9]),entryDays=int(o[10]),blocked=int(o[11]),firstFundedTrade=firstFundedTrade,observedUntil=observed,passesWithin30Days=fundedAt is not None and fundedAt-a['start']<=30*86400000,full30DaysObserved=observed-a['start']>=30*86400000,targetWithinGoalHorizon=bool(o[2] and firstFundedTrade and o[2]-firstFundedTrade<=(14 if a['fundedTarget']==2 else 30)*86400000),events=events,trades=tr[:n].tolist()))
  dump('results-expanded.json.gz' if expanded else 'results.json.gz',dict(protocol=protocol,manifests=data.manifests,results=results));print('COMPLETE',len(results),flush=True)
 finally:lib.destroy(h)
