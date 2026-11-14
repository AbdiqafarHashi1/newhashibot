"""Longer-lived trend sleeve; financing explicitly charged, not an intraday proxy."""
import ctypes,hashlib,itertools,json,pathlib,subprocess
import numpy as np
import study
from features import Data,ROOT
from study import OUT,D,B,dump,simulate
source=pathlib.Path(__file__).with_name('swing-engine.cpp');so=OUT/f'swing-{hashlib.sha256(source.read_bytes()).hexdigest()[:12]}.so';subprocess.run(['g++','-O3','-std=c++17','-shared','-fPIC',str(source),'-o',str(so)],check=True);lib=ctypes.CDLL(str(so));lib.frontier.argtypes=[ctypes.c_int,D,B,D,D,D,D,D,ctypes.c_int];lib.frontier.restype=ctypes.c_int;study.lib=lib
months=['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10'];grid=[dict(family=f,minutes=m,n=n,stop=s,rr=rr,hold=h,style=style) for f,m,n,s,rr,h,style in itertools.product(['channel_break','pullback_resume','rsi_exhaustion','compression_expand'],[15,60],[12,24],[1.5,2.5],[3,5,8],[1440,4320],[0,1,2])];protocol=dict(months=months,grid=grid,carry='Adverse 1.5 basis points of notional per calendar day, both directions. Scenario, not known broker swaps. Weekend days included.',selection='All prices are development. Positive compound total, >=4/6 positive months, >=40 closed total, no failed account, max monthly DD<8. Select diverse family top two per symbol. November remains unopened.');(OUT/'swing-protocol.json').write_text(json.dumps(protocol,indent=2));selected=[]
for symbol in ['EURUSD','USDJPY','XAUUSD']:
 data=Data(symbol,months);rows=[]
 for c in grid:
  cases=[simulate(data,c,m,stress=1.5) for m in months];rows.append(dict(config=c,cases=cases))
 valid=[r for r in rows if np.prod([1+m['returnPct']/100 for m in r['cases']])>1 and sum(m['returnPct']>0 for m in r['cases'])>=4 and sum(m['closedTrades'] for m in r['cases'])>=40 and max(m['drawdownPct'] for m in r['cases'])<8 and not any(m['failed'] for m in r['cases'])];valid.sort(key=lambda r:sum(m['returnPct'] for m in r['cases'])/(1+max(m['drawdownPct'] for m in r['cases'])),reverse=True);picks=[]
 for r in valid:
  if any(p['config']['family']==r['config']['family'] for p in picks):continue
  picks.append(dict(symbol=symbol,**r))
  if len(picks)==2:break
 selected+=picks;dump(OUT/f'swing-{symbol}.json.gz',dict(protocol=protocol,results=rows,selected=picks,manifests=data.manifests));print('SWING',symbol,[(p['config'],[round(m['returnPct'],2) for m in p['cases']]) for p in picks],flush=True)
(OUT/'swing-frozen.json').write_text(json.dumps(dict(protocol=protocol,selected=selected),indent=2));print('FROZEN',len(selected),flush=True)
