"""Native futures research, bounded public archive acquisition; no orders or promotion."""
import concurrent.futures as cf, csv, datetime as dt, gzip, hashlib, importlib.util, io, json, math, pathlib, sys, urllib.request, zipfile
import numpy as np
spec=importlib.util.spec_from_file_location('spot',pathlib.Path(__file__).with_name('spot-swing-study.py'));spot=importlib.util.module_from_spec(spec);spec.loader.exec_module(spot)
STEP=14400000
sha=lambda b:hashlib.sha256(b).hexdigest()
epoch=lambda s:int(dt.datetime.fromisoformat(s).replace(tzinfo=dt.timezone.utc).timestamp()*1000)
def simulate(a,start,end):
 atr=spot.atr14(a);ema=spot.ema(a[:,4],200);trades=[];pos=None;pending=None
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
   if sign and np.isfinite(atr[i]) and atr[i]>0:pending=dict(sign=sign,stop=float(a[i,4]-sign*2*atr[i]))
 if pos is not None and len(indices):close(int(indices[-1]),a[indices[-1],4],'DECLARED_STAGE_END_LIQUIDATION')
 return trades
def months(start,end):
 y,m=int(start[:4]),int(start[5:7]);out=[]
 while f'{y:04d}-{m:02d}-01'<end:
  out.append(f'{y:04d}-{m:02d}');m+=1
  if m==13:y+=1;m=1
 return out
def acquire(root,symbol,month):
 name=f'{symbol}-4h-{month}.zip';url=f'https://data.binance.vision/data/futures/um/monthly/klines/{symbol}/4h/{name}'
 for suffix in ['', '.CHECKSUM']:
  p=root/(name+suffix)
  if not p.exists():
   with urllib.request.urlopen(url+suffix,timeout=20) as response:raw=response.read(2000001)
   if len(raw)>2000000:raise ValueError('SOURCE_SIZE_BOUND')
   p.write_bytes(raw)
 raw=(root/name).read_bytes();checksum=(root/(name+'.CHECKSUM')).read_text().split()[0]
 if sha(raw)!=checksum:raise ValueError('VENDOR_CHECKSUM')
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  if len(z.namelist())!=1:raise ValueError('ARCHIVE_CONTENT')
  rows=list(csv.reader(io.TextIOWrapper(z.open(z.namelist()[0]))))
 if rows and not rows[0][0].isdigit():rows=rows[1:]
 start=epoch(month+'-01');y,m=map(int,month.split('-'));end=epoch(f'{y+1 if m==12 else y:04d}-{1 if m==12 else m+1:02d}-01')
 if len(rows)!=(end-start)//STEP or any(int(r[0])!=start+i*STEP or int(r[6])!=start+(i+1)*STEP-1 for i,r in enumerate(rows)):raise ValueError('SOURCE_COVERAGE')
 a=np.array([[int(r[0]),*[float(r[j]) for j in [1,2,3,4,5]]] for r in rows],float)
 if not np.isfinite(a).all() or (a[:,3]<=0).any() or (a[:,3]>np.minimum(a[:,1],a[:,4])).any() or (a[:,2]<np.maximum(a[:,1],a[:,4])).any():raise ValueError('SOURCE_OHLC')
 return a,dict(symbol=symbol,month=month,url=url,rawSha256=checksum,rows=len(rows),vendorChecksum=True)
def run(root):
 root.mkdir(parents=True,exist_ok=True);pf=pathlib.Path('scripts/research/futures-trend-protocol.json');p=json.loads(pf.read_text());files=[pf,pathlib.Path(__file__),pathlib.Path(__file__).with_name('spot-swing-study.py')];frozen={str(f):sha(f.read_bytes()) for f in files};history={};results=[];sources=[];passed=True
 for stage in p['stages']:
  if not passed:results.append(dict(stage=stage['name'],status='BLOCKED_PREVIOUS_STAGE'));continue
  if any(sha(pathlib.Path(f).read_bytes())!=v for f,v in frozen.items()):raise ValueError('FROZEN_ENGINE_CHANGED')
  jobs=[(symbol,m) for symbol in p['assets'] for m in months(stage['from'],stage['until'])]
  with cf.ThreadPoolExecutor(max_workers=6) as ex:parts=list(ex.map(lambda j:acquire(root,*j),jobs))
  for symbol in p['assets']:
   arrays=[a for a,meta in parts if meta['symbol']==symbol];part=np.vstack(arrays);history[symbol]=np.vstack([history[symbol],part]) if symbol in history else part
  sources +=[meta for _,meta in parts];cases=[]
  for symbol in p['assets']:
   trades=simulate(history[symbol],epoch(stage['from']),epoch(stage['until']));cases.append(dict(symbol=symbol,metrics=spot.metrics(trades),directions={side:spot.metrics([t for t in trades if t['sign']==sign]) for side,sign in [('BUY',1),('SELL',-1)]},trades=trades))
  trades=[t for c in cases for t in c['trades']];pooled=spot.metrics(trades);directions={side:spot.metrics([t for t in trades if t['sign']==sign]) for side,sign in [('BUY',1),('SELL',-1)]};fail=[]
  if pooled['trades']<50:fail.append('POOLED_SAMPLE')
  if (pooled['netPF'] or 0)<1.2:fail.append('NET_PF')
  if (pooled['meanStress'] or -math.inf)<=0:fail.append('COST_STRESS')
  if any(c['metrics']['trades']<15 or (c['metrics']['meanNet'] or -math.inf)<=0 for c in cases):fail.append('ASSET_EVIDENCE')
  if any(m['trades']<15 or (m['meanNet'] or -math.inf)<=0 for m in directions.values()):fail.append('DIRECTION_EVIDENCE')
  results.append(dict(stage=stage['name'],status='EVALUATED',pooled=pooled,directions=directions,cases=cases,failures=fail));passed=not fail;print(json.dumps(dict(stage=stage['name'],pooled=pooled,directions=directions,failures=fail)),flush=True)
 report=dict(protocol=p,sourceHashes=frozen,sources=sources,results=results,publication=False,execution=False,promotion=False);folder=pathlib.Path('docs/research/futures-slow-trend');folder.mkdir(parents=True,exist_ok=True);raw=(json.dumps(report,indent=2)+'\n').encode();z=gzip.compress(raw,mtime=0);(folder/'evidence.json.gz').write_bytes(z);summary={**report,'results':[{**r,'cases':[{k:v for k,v in c.items() if k!='trades'} for c in r.get('cases',[])]} for r in results],'compressedSha256':sha(z),'uncompressedSha256':sha(raw)};(folder/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
if __name__=='__main__':run(pathlib.Path(sys.argv[1]))
