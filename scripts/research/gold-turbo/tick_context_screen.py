"""One frozen true-tick context experiment; September fit, October evaluation."""
import sys,importlib.util,ctypes,subprocess,hashlib,json,gzip,zipfile
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
sys.path=[p for p in sys.path if Path(p).resolve()!=HERE];sys.path.insert(0,str(ROOT/'mt5-agent'))
spec=importlib.util.spec_from_file_location('contextual',HERE/'contextual_gold_screen.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
OUT=ROOT/'docs/research/gold-tick-context-20261127'
EXTRA_NAMES=('move_5','move_15','move_30','acceleration','persistence_5','range_5','position_5','quote_intensity','spread_relative','distance_last_close','developing_body','developing_wick_imbalance','minute_fraction')

def build_month(data,month,training):
    manifest=next(v for v in data.manifests if v['month']==month);archive=ROOT/f'.tmp/gold-micro/data/XAUUSD-{month}.zip'
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=manifest['archiveSha256']:raise ValueError('SOURCE_CHANGED')
    count=manifest['ticks'];t=np.empty(count);bid=np.empty(count);ask=np.empty(count);at=0
    with zipfile.ZipFile(archive) as z:
        member=next(v for v in z.namelist() if v.lower().endswith('.csv'))
        for chunk in pd.read_csv(z.open(member),usecols=['Timestamp','Bid','Ask'],chunksize=250000):
            n=len(chunk);t[at:at+n]=pd.to_datetime(chunk.Timestamp,utc=True,format='mixed').astype('int64').to_numpy()//1000000;bid[at:at+n]=chunk.Bid;ask[at:at+n]=chunk.Ask;at+=n
    if at!=count or np.any(np.diff(t)<0):raise ValueError('TICK_COUNT_OR_ORDER')
    src=HERE/'tick_context.cpp';so=ROOT/'.tmp/gold-simple'/('tick-context-'+hashlib.sha256(src.read_bytes()).hexdigest()[:12]+'.so')
    if not so.exists():subprocess.run(['g++','-O3','-std=c++17','-shared','-fPIC',str(src),'-o',str(so)],check=True)
    lib=ctypes.CDLL(str(so));D=ctypes.POINTER(ctypes.c_double);ptr=lambda a:a.ctypes.data_as(D)
    lib.build_context.argtypes=[ctypes.c_int,D,D,D,ctypes.c_int,D,D,D,D,ctypes.c_bool];lib.build_context.restype=ctypes.c_void_p;lib.context_count.argtypes=[ctypes.c_void_p];lib.context_count.restype=ctypes.c_int;lib.context_copy.argtypes=[ctypes.c_void_p,D,D,D,D,D];lib.context_destroy.argtypes=[ctypes.c_void_p]
    X=np.ascontiguousarray(data.X);av=np.ascontiguousarray(data.av);close=np.ascontiguousarray(data.f.close.to_numpy())
    h=lib.build_context(count,ptr(t),ptr(bid),ptr(ask),len(data.t),ptr(data.t),ptr(X),ptr(av),ptr(close),training);n=lib.context_count(h)
    out=[np.empty(n),np.empty((n,28)),np.empty(n),np.empty(n),np.empty((n,2))];lib.context_copy(h,*[ptr(a) for a in out]);lib.context_destroy(h)
    if not n or not np.isfinite(out[1]).all():raise ValueError('NO_VALID_TICK_CONTEXT')
    if not training and np.isfinite(out[4]).any():raise ValueError('TEST_LABEL_LEAK')
    print('CONTEXT',month,n,flush=True);return out

class TickData:
    def features(self,family,n):
        model,period=family.split(':');signal=self.arrays[model][0].copy();lo,hi={'whole':('2026-10-01','2026-11-01'),'validation':('2026-10-01','2026-10-17'),'test':('2026-10-19','2026-11-01')}[period]
        signal[(self.t<pd.Timestamp(lo,tz='UTC').value//1000000)|(self.t>=pd.Timestamp(hi,tz='UTC').value//1000000)]=0
        return (signal,)+self.arrays[model][1:]

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    protocol=dict(train='September 2026 only; labels on real tick paths',validation='October 1–16',test='October 19–30',whole='Full October account',query='First observed quote at least 5s after preceding observation; past tick windows and completed-M1 context only; 08:00–15:55 UTC',features=list(m.FEATURE_NAMES)+list(EXTRA_NAMES),models={'ridge':{'alpha':100},'context_tree':{'max_iter':80,'max_depth':3,'max_leaf_nodes':7,'min_samples_leaf':500,'l2_regularization':10,'learning_rate':.05,'early_stopping':False,'random_state':7}},entry='Higher predicted long/short net R >0.10 and >opposite+0.05; no quota',stop_atr=.6,reward_r=1.5,hold_minutes=2,reentry_cooldown_seconds=5,risk_pct=[1,2,5],capital=[100,500,1000,25000],guards='Observed gap warmup, volatility-shock cooldown and spread spikes; execution stop/cost/margin/volume checks; 15% daily / 60% peak experimental account limits, no default changes',limitations=['New features/objective frozen before October results; October has already been used in prior research, not pristine market data.','Independent native execution screen, not broker-native certification or integrated local runtime profitability.','Training labels use observed bid/ask barriers or timeout, 200ms delay, adverse rounding/slippage and fees; no future labels calculated for October.','All quotes are reference Exness data; no historical news calendar, partial-fill or financing qualification. No annualization.'])
    (OUT/'protocol.json').write_text(json.dumps(protocol,indent=2)+'\n')
    base=m.ContextData(['2026-09','2026-10']);parts=[build_month(base,'2026-09',True),build_month(base,'2026-10',False)]
    d=TickData();d.t=np.ascontiguousarray(np.concatenate([p[0] for p in parts]));X=np.concatenate([p[1] for p in parts]);reference=np.ascontiguousarray(np.concatenate([p[2] for p in parts]));av=np.ascontiguousarray(np.concatenate([p[3] for p in parts]));labels=np.concatenate([p[4] for p in parts]);d.manifests=base.manifests;d.arrays={}
    train=d.t<pd.Timestamp('2026-10-01T00:00Z').value//1000000-121000;scaler=StandardScaler().fit(X[train]);X=scaler.transform(X)
    models={'ridge':Ridge(alpha=100),'context_tree':HistGradientBoostingRegressor(**protocol['models']['context_tree'])};info={};counts={}
    from sklearn.base import clone
    for name,model in models.items():
        pred=[];info[name]=[]
        for side in (0,1):
            mask=train&np.isfinite(labels[:,side])
            if mask.sum()<1000:raise ValueError('INSUFFICIENT_TRAINING_LABELS')
            fit=clone(model).fit(X[mask],np.clip(labels[mask,side],-5,5));pred.append(fit.predict(X))
            if name=='ridge':info[name].append(dict(coefficients=fit.coef_.tolist(),intercept=float(fit.intercept_)))
            else:info[name].append(dict(baseline=float(fit._baseline_prediction.ravel()[0]),trees=[p[0].nodes.tolist() for p in fit._predictors],node_dtype=str(fit._predictors[0][0].nodes.dtype)))
        long,short=pred;signal=np.where((long>.10)&(long>short+.05),1,np.where((short>.10)&(short>long+.05),-1,0)).astype(np.int8)
        counts[name]=int(np.count_nonzero(signal&(~train)))
        level=reference-signal*.6*av;d.arrays[name]=tuple(np.ascontiguousarray(a) for a in (signal,av,level,reference))
    source=(HERE/'personal_gold_ticks.cpp').read_text();needle='int(c[5])==3?300000:60000'
    if source.count(needle)!=1:raise ValueError('COOLDOWN_PATCH_DRIFT')
    engine=HERE/'tick_context_execution.cpp';engine.write_text(source.replace(needle,'int(c[5])==3?300000:5000'))
    m.n.s.tick_replay.library=lambda:m.n.s.library('tick_context_execution.cpp');m.n.s.tick_replay.Replay=m.n.s.MarginReplay
    candidates=[dict(family=name+':'+period,n=20,stop=.6,rr=1.5,hold=2,style=0,session=2,mode=0) for name in models for period in ('whole','validation','test')]
    arms=[dict(candidate=i,family=c['family'],risk=r,leverage=100,commission=3.5,slip=.05 if stress else .02,delayMs=500 if stress else 200,manageMs=500 if stress else 200,sampleMs=200,capital=cap,stress=stress) for i,c in enumerate(candidates) for r in protocol['risk_pct'] for cap in protocol['capital'] for stress in (False,True)]
    result=m.n.s.tick_replay.run_month(d,'2026-10',candidates,arms)
    for r in result['results']:
        if abs(r['endingBalance']-r['arm']['capital']-sum(t[6] for t in r['trades']))>1e-6:raise ValueError('CASH_AUDIT')
    payload=dict(protocol=protocol,training_observations=int(train.sum()),october_observations=int((~train).sum()),candidate_counts=counts,models=info,scaler=dict(mean=scaler.mean_.tolist(),scale=scaler.scale_.tolist()),source_manifests=d.manifests,feature_sha256=hashlib.sha256((HERE/'tick_context.cpp').read_bytes()).hexdigest(),execution_sha256=hashlib.sha256(engine.read_bytes()).hexdigest(),result=result)
    (OUT/'receipts.json.gz').write_bytes(gzip.compress(json.dumps(payload,separators=(',',':'),allow_nan=False).encode(),mtime=0));payload['result']['results']=[{k:v for k,v in r.items() if k!='trades'} for r in result['results']];(OUT/'summary.json').write_text(json.dumps(payload,indent=2,allow_nan=False)+'\n')
    for r in result['results']:
        if r['arm']['capital']==500:print(r['arm']['family'],r['arm']['risk'],r['arm']['stress'],round(r['returnPct'],2),round(r['drawdownPct'],2),r['closedTrades'],r['profitFactor'])

if __name__=='__main__':main()
