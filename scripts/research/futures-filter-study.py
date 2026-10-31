"""Fixed structural-filter research. Offline; no publication, execution or promotion."""
import concurrent.futures as cf, gzip, hashlib, importlib.util, json, math, pathlib, sys
import numpy as np
spec=importlib.util.spec_from_file_location('base',pathlib.Path(__file__).with_name('futures-trend-study.py'));base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
spot=base.spot;STEP=base.STEP;sha=base.sha;epoch=base.epoch
def simulate_filtered(a,start,end,enabled=True):
 atr=spot.atr14(a);ema=spot.ema(a[:,4],200);fast=spot.ema(a[:,4],50);trades=[];pos=None;pending=None
 def close(i,price,reason):
  nonlocal pos
  gross=pos['sign']*(price-pos['entry'])/pos['entry'];bars=i-pos['index']+1;cost=(16+3*math.ceil(bars/2))/10000
  trades.append(dict(**pos,exitBarOpen=int(a[i,0]),exitKnownAt=int(a[i,0]+STEP),exit=float(price),reason=reason,bars=int(bars),cost=float(cost),grossReturn=float(gross),netReturn=float(gross-cost),stressReturn=float(gross-1.5*cost)));pos=None
 indices=np.flatnonzero((a[:,0]>=start)&(a[:,0]<end))
 for i in indices:
  exited=False
  if pos is None and pending:
   sign=pending['sign'];stop=pending['stop']
   if (a[i,1]-stop)*sign>0:pos=dict(sign=sign,entryAt=int(a[i,0]),entry=float(a[i,1]),signalAt=int(a[i,0]),initialStop=float(stop),stop=float(stop),index=int(i))
   pending=None
  if pos is not None:
   sign=pos['sign'];channel=float(a[i-20:i,3].min()) if sign==1 else float(a[i-20:i,2].max());pos['stop']=max(pos['stop'],channel) if sign==1 else min(pos['stop'],channel)
   if (sign==1 and a[i,3]<=pos['stop']) or (sign==-1 and a[i,2]>=pos['stop']):close(i,min(pos['stop'],a[i,1]) if sign==1 else max(pos['stop'],a[i,1]),'STOP_OR_CHANNEL');exited=True
  if pos is not None:
   trail=float(a[i,4]-pos['sign']*3*atr[i]);pos['stop']=max(pos['stop'],trail) if pos['sign']==1 else min(pos['stop'],trail)
  elif i>=200 and not exited:
   sign=1 if a[i,4]>a[i-55:i,2].max() and a[i,4]>ema[i] else -1 if a[i,4]<a[i-55:i,3].min() and a[i,4]<ema[i] else 0
   if enabled and sign and not (sign*(fast[i]-ema[i])>0 and sign*(ema[i]-ema[i-6])>0):sign=0
   if sign and np.isfinite(atr[i]) and atr[i]>0:pending=dict(sign=sign,stop=float(a[i,4]-sign*2*atr[i]))
 if pos is not None and len(indices):close(int(indices[-1]),a[indices[-1],4],'DECLARED_STAGE_END_LIQUIDATION')
 return trades
def run(root):
 pfile=pathlib.Path('scripts/research/futures-filter-protocol.json');p=json.loads(pfile.read_text());files=[pfile,pathlib.Path(__file__),pathlib.Path(__file__).with_name('futures-trend-study.py'),pathlib.Path(__file__).with_name('spot-swing-study.py')];frozen={str(f):sha(f.read_bytes()) for f in files};history={};sources=[];results=[];passed=True;baseline_checks=0
 for stage in p['stages']:
  if not passed:results.append(dict(stage=stage['name'],status='BLOCKED_PREVIOUS_STAGE'));continue
  if any(sha(pathlib.Path(f).read_bytes())!=h for f,h in frozen.items()):raise ValueError('FROZEN_ENGINE_CHANGED')
  jobs=[(symbol,m) for symbol in p['assets'] for m in base.months(stage['from'],stage['until'])]
  with cf.ThreadPoolExecutor(max_workers=6) as ex:parts=list(ex.map(lambda j:base.acquire(root,*j),jobs))
  for symbol in p['assets']:
   part=np.vstack([a for a,meta in parts if meta['symbol']==symbol]);history[symbol]=np.vstack([history[symbol],part]) if symbol in history else part
  sources +=[meta for _,meta in parts];cases=[]
  for symbol in p['assets']:
   a=history[symbol];start,end=epoch(stage['from']),epoch(stage['until'])
   if stage['name']=='DEVELOPMENT':
    original=base.simulate(a,start,end);replica=simulate_filtered(a,start,end,False)
    if original!=replica:raise ValueError('BASELINE_ACCOUNTING_PARITY')
    baseline_checks+=len(original)
   trades=simulate_filtered(a,start,end);cases.append(dict(symbol=symbol,metrics=spot.metrics(trades),directions={side:spot.metrics([t for t in trades if t['sign']==sign]) for side,sign in [('BUY',1),('SELL',-1)]},trades=trades))
  trades=[t for c in cases for t in c['trades']];pooled=spot.metrics(trades);directions={side:spot.metrics([t for t in trades if t['sign']==sign]) for side,sign in [('BUY',1),('SELL',-1)]};fail=[]
  if pooled['trades']<50:fail.append('POOLED_SAMPLE')
  if (pooled['netPF'] or 0)<1.2:fail.append('NET_PF')
  if (pooled['meanStress'] or -math.inf)<=0:fail.append('COST_STRESS')
  if any(c['metrics']['trades']<15 or (c['metrics']['meanNet'] or -math.inf)<=0 for c in cases):fail.append('ASSET_EVIDENCE')
  if any(m['trades']<15 or (m['meanNet'] or -math.inf)<=0 for m in directions.values()):fail.append('DIRECTION_EVIDENCE')
  results.append(dict(stage=stage['name'],status='EVALUATED',pooled=pooled,directions=directions,cases=cases,failures=fail));passed=not fail;print(json.dumps(dict(stage=stage['name'],pooled=pooled,directions=directions,failures=fail)),flush=True)
 report=dict(protocol=p,sourceHashes=frozen,sources=sources,baselineParityTrades=baseline_checks,results=results,publication=False,execution=False,promotion=False);folder=pathlib.Path('docs/research/futures-trend-filter');folder.mkdir(parents=True,exist_ok=True);raw=(json.dumps(report,indent=2)+'\n').encode();z=gzip.compress(raw,mtime=0);(folder/'evidence.json.gz').write_bytes(z);summary={**report,'results':[{**r,'cases':[{k:v for k,v in c.items() if k!='trades'} for c in r.get('cases',[])]} for r in results],'compressedSha256':sha(z),'uncompressedSha256':sha(raw)};(folder/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
if __name__=='__main__':run(pathlib.Path(sys.argv[1]))
