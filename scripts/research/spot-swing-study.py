"""Fixed spot long/cash research; stage-gated acquisition, no execution or promotion."""
import datetime as dt, hashlib, json, math, pathlib, sys, urllib.parse, urllib.request, gzip
import numpy as np

DAY=86400000
def epoch(s):return int(dt.datetime.fromisoformat(s).replace(tzinfo=dt.timezone.utc).timestamp()*1000)
def sha(b):return hashlib.sha256(b).hexdigest()
def ema(v,n):
    out=np.empty(len(v));out[0]=v[0]
    for i in range(1,len(v)):out[i]=out[i-1]+2/(n+1)*(v[i]-out[i-1])
    return out
def atr14(a):
    tr=np.maximum(a[1:,2]-a[1:,3],np.maximum(abs(a[1:,2]-a[:-1,4]),abs(a[1:,3]-a[:-1,4])))
    out=np.full(len(a),np.nan)
    if len(a)<15:return out
    out[14]=tr[:14].mean()
    for i in range(15,len(a)):out[i]=(13*out[i-1]+tr[i-1])/14
    return out
def simulate(a,mode,start,end,cost=.0026):
    fast,slow,regime=ema(a[:,4],20),ema(a[:,4],50),ema(a[:,4],200);atr=atr14(a)
    trades=[];pos=None;pending=None;exit_next=False
    def close(i,price,reason):
        nonlocal pos
        gross=price/pos['entry']-1
        known_at=int(a[i,0]) if reason=='TREND_EXIT_NEXT_OPEN' else int(a[i,0]+DAY)
        trades.append(dict(**pos,exitBarOpen=int(a[i,0]),exitAt=known_at,exit=float(price),reason=reason,grossReturn=float(gross),netReturn=float(gross-cost),stressReturn=float(gross-1.5*cost),bars=int(i-pos['index']+1)))
        pos=None
    indices=np.flatnonzero((a[:,0]>=start)&(a[:,0]<end))
    for i in indices:
        exited=False
        if pos is not None and exit_next:
            close(i,a[i,1],'TREND_EXIT_NEXT_OPEN');exited=True;exit_next=False
        if pos is None and pending is not None and not exited:
            stop=pending['stop']
            if a[i,1]>stop and stop>0:
                pos=dict(entryAt=int(a[i,0]),entry=float(a[i,1]),signalAt=int(a[i-1,0]+DAY),initialStop=float(stop),stop=float(stop),index=int(i))
            pending=None
        if pos is not None:
            if mode=='CHANNEL20_10_TREND':pos['stop']=max(pos['stop'],float(a[max(0,i-10):i,3].min()))
            if a[i,3]<=pos['stop']:
                close(i,min(pos['stop'],a[i,1]),'PROTECTIVE_OR_CHANNEL_STOP');exited=True
        if pos is not None:
            pos['stop']=max(pos['stop'],float(a[i,4]-3*atr[i]))
            if mode=='EMA20_50_REGIME' and (fast[i]<=slow[i] or a[i,4]<regime[i]):exit_next=True
        elif i>=200:
            eligible=(a[i,4]>a[i-20:i,2].max() if mode=='CHANNEL20_10_TREND' else fast[i]>slow[i]) and a[i,4]>regime[i]
            if eligible and np.isfinite(atr[i]) and atr[i]>0:pending=dict(stop=float(a[i,4]-2*atr[i]))
    if pos is not None and len(indices):close(int(indices[-1]),a[indices[-1],4],'DECLARED_STAGE_END_LIQUIDATION')
    return trades
def metrics(trades):
    a=np.array([t['netReturn'] for t in trades]);s=np.array([t['stressReturn'] for t in trades]);g=np.array([t['grossReturn'] for t in trades])
    pf=lambda x:float(x[x>0].sum()/-x[x<0].sum()) if (x<0).any() else None
    return dict(trades=len(trades),netPF=pf(a),stressPF=pf(s),grossPF=pf(g),meanNet=float(a.mean()) if len(a) else None,meanStress=float(s.mean()) if len(s) else None)
def fetch_stage(root,symbol,stage,sources):
    cursor,end=epoch(stage['from']),epoch(stage['until']);all_rows=[];early_excluded_until=cursor
    for page in range(8):
        if cursor>=end:break
        params=dict(symbol=symbol,interval='1d',startTime=cursor,endTime=end-1,limit=1000)
        url='https://data-api.binance.vision/api/v3/klines?'+urllib.parse.urlencode(params)
        path=root/f"{symbol}-{stage['name']}-{page}.json"
        if path.exists():raw=path.read_bytes()
        else:
            with urllib.request.urlopen(url,timeout=25) as response:raw=response.read(2_000_001)
            if len(raw)>2_000_000:raise ValueError('SOURCE_SIZE_BOUND')
            path.write_bytes(raw)
        rows=json.loads(raw)
        if not isinstance(rows,list) or not rows:raise ValueError('SOURCE_EMPTY')
        if any(int(r[0])!=cursor+i*DAY or not int(r[0])<=int(r[6])<=int(r[0])+DAY-1 or int(r[0])>=end for i,r in enumerate(rows)):raise ValueError('SOURCE_INTERVAL_OR_COVERAGE')
        partial=[dict(openTime=int(r[0]),nativeCloseTime=int(r[6])) for r in rows if int(r[6])!=int(r[0])+DAY-1]
        for r in partial:
            if stage['name']!='DEVELOPMENT' or r['openTime']>=epoch(stage['from'])+200*DAY:raise ValueError('NONSTANDARD_SOURCE_CLOSE_REQUIRES_REVIEW')
            early_excluded_until=max(early_excluded_until,r['openTime']+DAY)
        sources.append(dict(symbol=symbol,stage=stage['name'],url=url,rawSha256=sha(raw),rows=len(rows),vendorChecksum=False,instrument='SPOT',nonstandardCloses=partial,warmupResetAfter=early_excluded_until if partial else None))
        all_rows.extend([[int(r[0]),*[float(r[k]) for k in [1,2,3,4,5]]] for r in rows]);cursor=int(rows[-1][0])+DAY
    a=np.asarray(all_rows,float)
    if cursor!=end or len(a)!=(end-epoch(stage['from']))//DAY or not np.isfinite(a).all() or (a[:,3]<=0).any() or (a[:,3]>np.minimum(a[:,1],a[:,4])).any() or (a[:,2]<np.maximum(a[:,1],a[:,4])).any():raise ValueError('SOURCE_ADMISSION')
    # Retain raw responses; exclude the early prefix through a nonstandard close.
    # Start indicator warmup again. Never repair the candle or cross an active-position gap.
    return a[a[:,0]>=early_excluded_until]
def run(root):
    root.mkdir(parents=True,exist_ok=True);pfile=pathlib.Path('scripts/research/spot-swing-protocol.json');p=json.loads(pfile.read_text());frozen={str(pfile):sha(pfile.read_bytes()),'scripts/research/spot-swing-study.py':sha(pathlib.Path(__file__).read_bytes())}
    sources=[];history={};results=[];eligible=list(p['modes'])
    for si,stage in enumerate(p['stages']):
        if not eligible:
            results.append(dict(stage=stage['name'],status='BLOCKED_PREVIOUS_STAGE'));continue
        for f,digest in frozen.items():
            if sha(pathlib.Path(f).read_bytes())!=digest:raise ValueError('FROZEN_ENGINE_CHANGED')
        for symbol in p['assets']:
            part=fetch_stage(root,symbol,stage,sources);history[symbol]=np.vstack([history[symbol],part]) if symbol in history else part
        next_eligible=[];cases=[]
        for mode in eligible:
            assets=[]
            for symbol in p['assets']:
                trades=simulate(history[symbol],mode,epoch(stage['from']),epoch(stage['until']));assets.append(dict(symbol=symbol,metrics=metrics(trades),trades=trades))
            pooled=metrics([t for a in assets for t in a['trades']]);minimum=30 if si==0 else 50;fail=[]
            if pooled['trades']<minimum:fail.append('POOLED_SAMPLE')
            if (pooled['netPF'] or 0)<1.2:fail.append('NET_PF')
            if (pooled['meanStress'] or -math.inf)<=0:fail.append('COST_STRESS')
            if any(a['metrics']['trades']<10 or (a['metrics']['meanNet'] or -math.inf)<=0 for a in assets):fail.append('ASSET_EVIDENCE')
            cases.append(dict(mode=mode,pooled=pooled,assets=assets,failures=fail));
            if not fail:next_eligible.append(mode)
            print(json.dumps(dict(stage=stage['name'],mode=mode,pooled=pooled,failures=fail)),flush=True)
        results.append(dict(stage=stage['name'],status='EVALUATED',cases=cases));eligible=next_eligible
    report=dict(protocol=p,sources=sources,sourceHashes=frozen,results=results,publication=False,execution=False,promotion=False)
    folder=pathlib.Path('docs/research/spot-swing');folder.mkdir(parents=True,exist_ok=True);raw=(json.dumps(report,indent=2)+'\n').encode();compressed=gzip.compress(raw,compresslevel=9,mtime=0);(folder/'evidence.json.gz').write_bytes(compressed)
    summary=dict(protocol=p,sources=sources,results=[dict(stage=r['stage'],status=r['status'],cases=[dict(mode=c['mode'],pooled=c['pooled'],failures=c['failures'],assets=[dict(symbol=a['symbol'],metrics=a['metrics']) for a in c['assets']]) for c in r.get('cases',[])]) for r in results],compressedSha256=sha(compressed),uncompressedSha256=sha(raw),publication=False,execution=False,promotion=False)
    (folder/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
if __name__=='__main__':run(pathlib.Path(sys.argv[1]))
