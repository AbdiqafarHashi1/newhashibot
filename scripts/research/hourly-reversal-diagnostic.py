"""Distinguish statistical return reversal from tradeable net performance."""
import gzip, hashlib, json, pathlib, sys
import numpy as np

root=pathlib.Path(sys.argv[1]);source=pathlib.Path('scripts/research/hourly-reversal-diagnostic-protocol.json')
protocol=json.loads(source.read_text());studies=[];sources=[]
sha=lambda b:hashlib.sha256(b).hexdigest()
pf=lambda r:float(r[r>0].sum()/-r[r<0].sum()) if (r<0).any() else None
for symbol in protocol['assets']:
    rows=[]
    for offset in range(18):
        name=f'{symbol}-15m-{2025+offset//12}-{offset%12+1:02d}'
        raw=(root/(name+'.json')).read_bytes();meta=json.loads((root/(name+'.manifest.json')).read_text())
        if sha(raw)!=meta['datasetSha256']:raise ValueError('SOURCE_HASH')
        rows.extend(json.loads(raw));sources.append(dict(name=name,**meta))
    if len(rows)!=52416 or any(r['symbol']!=symbol or r['instrument_type']!='USDT_PERPETUAL' for r in rows):raise ValueError('SOURCE_IDENTITY')
    from datetime import datetime
    times=np.array([datetime.fromisoformat(r['open_time'].replace('Z','+00:00')).timestamp() for r in rows])
    if not np.all(np.diff(times)==900):raise ValueError('SOURCE_COVERAGE')
    opens=np.array([r['open'] for r in rows],float)[::4];closes=np.array([r['close'] for r in rows],float)[3::4]
    returns=closes/opens-1;x,y=returns[:-1],returns[1:]
    if not np.isfinite(returns).all():raise ValueError('NONFINITE_RETURNS')
    X=np.column_stack([np.ones(len(x)),x]);beta=np.linalg.lstsq(X,y,rcond=None)[0];residual=y-X@beta;score=X*residual[:,None];meat=score.T@score
    for lag in range(1,5):
        cross=score[lag:].T@score[:-lag];meat+=(1-lag/5)*(cross+cross.T)
    bread=np.linalg.inv(X.T@X);cov=bread@meat@bread;se=float(np.sqrt(max(0,cov[1,1])));gross=-np.sign(x)*y;active=x!=0;net=gross-active*.0019;stress=gross-active*.00285
    paired=[dict(at=rows[(i+1)*4]['open_time'],lagReturn=float(x[i]),nextReturn=float(y[i]),fadeGross=float(gross[i]),fadeNet=float(net[i]),fadeStress=float(stress[i])) for i in range(len(x))]
    result=dict(symbol=symbol,observations=len(x),benchmarkTrades=int(active.sum()),coefficient=float(beta[1]),hacSE=se,hacT=float(beta[1]/se) if se else None,grossPF=pf(gross),netPF=pf(net),stressPF=pf(stress),meanGrossBps=float(gross[active].mean()*10000),meanNetBps=float(net[active].mean()*10000),paired=paired)
    studies.append(result);print(json.dumps({k:v for k,v in result.items() if k!='paired'}),flush=True)
files=[str(source),'scripts/research/hourly-reversal-diagnostic.py'];report=dict(protocol=protocol,sources=sources,studies=studies,sourceHashes={f:sha(pathlib.Path(f).read_bytes()) for f in files},publication=False,execution=False,promotion=False)
folder=pathlib.Path('docs/research/hourly-reversal-diagnostic');folder.mkdir(parents=True,exist_ok=True)
raw=(json.dumps(report,indent=2)+'\n').encode();compressed=gzip.compress(raw,compresslevel=9,mtime=0);(folder/'evidence.json.gz').write_bytes(compressed)
summary=dict(protocol=protocol,compressedSha256=sha(compressed),uncompressedSha256=sha(raw),studies=[{k:v for k,v in s.items() if k!='paired'} for s in studies],publication=False,execution=False,promotion=False)
(folder/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
