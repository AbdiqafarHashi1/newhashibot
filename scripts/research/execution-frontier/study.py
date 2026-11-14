"""Bounded cross-asset entry/management comparison; July stays unopened until freeze."""
import ctypes,gzip,hashlib,itertools,json,pathlib,subprocess,sys
import numpy as np
import pandas as pd
from features import Data,ROOT
OUT=ROOT/'.tmp/execution-frontier';OUT.mkdir(parents=True,exist_ok=True)
source=pathlib.Path(__file__).with_name('engine.cpp');so=OUT/f'engine-{hashlib.sha256(source.read_bytes()).hexdigest()[:12]}.so'
if not so.exists():subprocess.run(['g++','-O3','-std=c++17','-shared','-fPIC',str(source),'-o',str(so)],check=True)
lib=ctypes.CDLL(str(so));D=ctypes.POINTER(ctypes.c_double);B=ctypes.POINTER(ctypes.c_byte);lib.frontier.argtypes=[ctypes.c_int,D,B,D,D,D,D,D,ctypes.c_int];lib.frontier.restype=ctypes.c_int
ptr=lambda a:a.ctypes.data_as(D)
def simulate(data,c,month,profile='PERSONAL',stress=1,capital=25000,details=False):
 start=pd.Timestamp(month+'-01',tz='UTC').value//1000000;end=(pd.Timestamp(month+'-01',tz='UTC')+pd.offsets.MonthBegin(1)).value//1000000;a=int(np.searchsorted(data.x[:,0],start));b=int(np.searchsorted(data.x[:,0],end));sig,atr,st=data.features(c['family'],c['minutes'],c['n']);jpy=data.symbol=='USDJPY';gold=data.symbol=='XAUUSD';tick=.01 if gold else .001 if jpy else .00001;contract=100 if gold else 100000
 cfg=np.ascontiguousarray([contract,tick,3.5*stress,(.05 if gold else tick*2)*stress,.5 if profile=='PERSONAL' else .25,10 if profile=='PERSONAL' else 5,c['stop'],c['rr'],c['hold'],c['style'],capital,jpy],dtype=float);o=np.zeros(12);tr=np.zeros((10000,12));rc=lib.frontier(b-a,ptr(data.x[a:b]),sig[a:b].ctypes.data_as(B),ptr(atr[a:b]),ptr(st[a:b]),ptr(cfg),ptr(o),ptr(tr),len(tr));assert rc==0,rc;n=int(o[4]);tr=tr[:n];assert abs(capital+tr[:,6].sum()-o[10])<1e-5
 return dict(month=month,profile=profile,stress=stress,capital=capital,returnPct=o[0],drawdownPct=o[1],closedTrades=n,profitFactor=o[2]/o[3] if o[3] else None,winRatePct=o[5]/n*100 if n else None,expectancyR=float(tr[:,7].mean()) if n else None,blocked=int(o[6]),failed=bool(o[7]),commission=o[8],losingStreak=int(o[9]),endingBalance=o[10],meanWinR=float(tr[tr[:,6]>0,7].mean()) if np.any(tr[:,6]>0) else None,meanLossR=float(tr[tr[:,6]<=0,7].mean()) if np.any(tr[:,6]<=0) else None,**({'trades':tr.tolist()} if details else {}))
def dump(path,obj):
 with gzip.GzipFile(filename=str(path),mode='wb',mtime=0) as f:f.write(json.dumps(obj,separators=(',',':')).encode())
if __name__=='__main__':
 stage=sys.argv[1];symbols=['EURUSD','GBPUSD','USDJPY','XAUUSD']
 if stage=='develop':
  grid=[dict(family=f,minutes=m,n=n,stop=s,rr=r,hold=h,style=e) for f,m,n,s,r,h,e in itertools.product(['channel_break','pullback_resume','failed_break','band_reentry','rsi_exhaustion','compression_expand','session_break'],[5,15,60],[12,24],[1.5,2.5],[2,3,5,8],[30,120,360],[0,1,2,3])];protocol=dict(grid=grid,selectionMonths=['2026-05','2026-06'],untouchedMonth='2026-07',selection='positive each development month, >=12 trades per month, stress1.5 positive each, then family diversity; July unopened until freeze',profiles={'PERSONAL':{'riskPct':.5,'leverage':10},'PROP':{'riskPct':.25,'leverage':5}},noPromotion=True);(OUT/'protocol.json').write_text(json.dumps(protocol,indent=2));finalists=[];manifests=[]
  for symbol in symbols:
   data=Data(symbol,protocol['selectionMonths']);manifests+=data.manifests;rows=[]
   for i,c in enumerate(grid):
    metrics=[simulate(data,c,m) for m in protocol['selectionMonths']];rows.append(dict(config=c,metrics=metrics))
    if i%1000==999:print('SCREEN',symbol,i+1,flush=True)
   valid=[r for r in rows if all(m['returnPct']>0 and m['closedTrades']>=12 and (m['profitFactor'] or 0)>=1.1 and not m['failed'] for m in r['metrics'])];valid.sort(key=lambda r:min(m['expectancyR'] for m in r['metrics'])*sum(m['closedTrades'] for m in r['metrics'])/(1+max(m['drawdownPct'] for m in r['metrics'])),reverse=True)
   selected=[]
   for r in valid:
    if any(x['config']['family']==r['config']['family'] for x in selected):continue
    stress=[simulate(data,r['config'],m,stress=1.5) for m in protocol['selectionMonths']]
    if not all(m['returnPct']>0 and not m['failed'] for m in stress):continue
    selected.append(dict(symbol=symbol,config=r['config'],development=r['metrics'],stress=stress))
    if len(selected)==3:break
   finalists+=selected;dump(OUT/f'develop-{symbol}.json.gz',dict(symbol=symbol,manifests=data.manifests,grid=grid,results=rows,selected=selected));print('FINALISTS',symbol,json.dumps(selected),flush=True)
  files=['features.py','engine.cpp','study.py'];hashes={n:hashlib.sha256(pathlib.Path(__file__).with_name(n).read_bytes()).hexdigest() for n in files};(OUT/'frozen.json').write_text(json.dumps(dict(protocol=protocol,sourceHashes=hashes,finalists=finalists,manifests=manifests),indent=2));print('FROZEN',len(finalists),flush=True)
 elif stage=='holdout':
  frozen=json.loads((OUT/'frozen.json').read_text());results=[]
  for n,sha in frozen['sourceHashes'].items():assert hashlib.sha256(pathlib.Path(__file__).with_name(n).read_bytes()).hexdigest()==sha
  for symbol in symbols:
   candidates=[c for c in frozen['finalists'] if c['symbol']==symbol]
   if not candidates:continue
   data=Data(symbol,['2026-05','2026-06','2026-07'])
   for c in candidates:
    cases=[simulate(data,c['config'],m,p,stress,capital,True) for m,p,stress,capital in itertools.product(['2026-05','2026-06','2026-07'],['PERSONAL','PROP'],[1,1.5],[25000])]
    cases += [simulate(data,c['config'],'2026-07','PERSONAL',1.5,capital,True) for capital in [500,1000,5000]]
    results.append(dict(candidate=c,cases=cases,manifests=data.manifests));print('HOLDOUT',symbol,c['config'],[(x['profile'],x['stress'],round(x['returnPct'],3)) for x in cases if x['month']=='2026-07'],flush=True)
  dump(OUT/'holdout.json.gz',dict(frozen=frozen,results=results));print('COMPLETE',len(results),flush=True)
 else:raise ValueError(stage)
