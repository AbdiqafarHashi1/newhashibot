"""Frozen linear/nonlinear context comparison, chronologically separated.

Offline estimation only; real retained bid/ask tick execution screening. No
customer defaults or permissions are modified, and no parameter sweep occurs.
"""
import sys,importlib.util,json,gzip,hashlib,argparse
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
sys.path=[p for p in sys.path if Path(p).resolve()!=HERE];sys.path.insert(0,str(ROOT/'mt5-agent'))
from gold_turbo.contracts import Candle
from gold_turbo.context_features import context_features,FEATURE_NAMES
spec=importlib.util.spec_from_file_location('native',HERE/'native_gold_edge.py');n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import Ridge
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
OUT=ROOT/'docs/research/gold-context-20261127'

class ContextData(n.s.Data):
    def initialize_frame(self,f):
        super().initialize_frame(f)
        bars=[Candle('XAUUSD','EXNESS_OCTOBER',60000,int(at.value//1000000),float(r.open),float(r.high),float(r.low),float(r.close),int(r.volume),'BROKER_COMPLETED_BAR') for at,r in f.iterrows()]
        self.X=np.full((len(f),len(FEATURE_NAMES)),np.nan);self.av=np.full(len(f),np.nan)
        for i in range(31,len(f)):
            v=context_features(bars[i-31:i+1],float(f.ask_close.iloc[i]-f.close.iloc[i]),bars[i].end_ms)
            if v:self.X[i],self.av[i]=v
        self.arrays={};self.predictions={}
    def features(self,family,n):
        model,period=family.split(':');signal=self.arrays[model][0].copy()
        lo,hi=getattr(self,'periods',{'validation':('2026-10-19','2026-10-24'),'test':('2026-10-26','2026-11-01')})[period]
        signal[(self.t<pd.Timestamp(lo,tz='UTC').value//1000000)|(self.t>=pd.Timestamp(hi,tz='UTC').value//1000000)]=0
        return (signal,)+self.arrays[model][1:]

def main():
    global OUT
    parser=argparse.ArgumentParser();parser.add_argument('--execution-labels',action='store_true');parser.add_argument('--september-train',action='store_true');args=parser.parse_args()
    if args.september_train and not args.execution_labels:raise ValueError('EXECUTION_LABELS_REQUIRED')
    if args.execution_labels:OUT=ROOT/'docs/research/gold-context-execution-20261127'
    if args.september_train:OUT=ROOT/'docs/research/gold-context-september-20261127'
    OUT.mkdir(parents=True,exist_ok=True)
    protocol=dict(train='2026-10-01 through 2026-10-16; purge labels crossing 17 October',validation='19–23 October',test='26–30 October',features=list(FEATURE_NAMES),target='Five-minute future BID close movement divided by current ATR; future values used only as training labels',models={'ridge':{'alpha':100},'context_tree':{'max_iter':80,'max_depth':3,'max_leaf_nodes':7,'min_samples_leaf':150,'l2_regularization':10,'learning_rate':.05,'early_stopping':False,'random_state':7}},entry='Forecast absolute mean exceeds current observed spread + $0.07 commission + $0.10 adverse slippage + 0.05 ATR. No trade quota.',risk_pct=[1,2,5],capital=[100,500,1000,25000],stop_atr=1,target_r=1.5,maximum_hold_minutes=5,session_utc='08:00–15:50 entries',execution='Retained original bid/ask ticks; 200/500ms delays, commission3.5/lot/side, slippage.02/.05, .01 lot floors,100oz contract,100x leverage,50%entrymargin,15%daily/60%peak experimental limits',acceptance='At $500/1%: positive net expectancy >=0.15R and PF>=1.4 in BOTH validation and test under base and stressed costs; >=5 decisions per observed weekday in each. These are product screening criteria, never entry quotas.',limitations=['October was viewed in earlier research; new model fitting is chronologically separated but market period is not pristine unseen data.','No feature/threshold/hyperparameter selection using validation or test results. No defaults promotion based on one month.','Conditional-return estimation does not itself establish a tradeable edge. No annualization or monthly growth guarantee.'])
    if args.execution_labels:protocol.update(target='Independent long/short net R from observed bid/ask tick barrier or five-minute timeout; labels calculated ONLY for training rows',entry='Choose higher predicted long/short net R if >0.10R and exceeds opposite prediction by >0.05R; no quota',label_limitations='Fixed200ms entry delay, adverse .02 tick rounding and .07/oz round-trip commission; timeout first quote after hold+200ms. Independent labels omit account admission and are not exact native broker execution.',objective_change='Execution-aligned objective, same fixed feature set, hyperparameters, geometry and dates; prior close-price-target failures preserved.')
    if args.september_train:protocol.update(train='September 2026 only; purge labels crossing October',validation='1–16 October',test='19–30 October',models={'ridge':{'alpha':100}},reason='Chronological month-to-month test of the same fixed linear execution-value model; nonlinear model rejected, no hyperparameter retuning. September source restored to the exact previously recorded hash.')
    (OUT/'protocol.json').write_text(json.dumps(protocol,indent=2)+'\n')
    data=ContextData(['2026-09','2026-10'] if args.september_train else ['2026-10']);f=data.f
    future=f.close.shift(-5);future_t=pd.Series(data.t,index=f.index).shift(-5)
    y=(future-f.close)/data.av
    # Require an observed consecutive five-minute label, including across day/session boundaries.
    finite=np.isfinite(data.X).all(axis=1)&np.isfinite(y.to_numpy())&((future_t.to_numpy()-data.t)==300000)
    hours=f.index.hour*60+f.index.minute;session=(hours>=480)&(hours<=950)
    train=finite&session&(data.t<pd.Timestamp('2026-10-01T00:00Z' if args.september_train else '2026-10-17T00:00Z').value//1000000-360000)
    if train.sum()<1000:raise ValueError('INSUFFICIENT_TRAINING_DATA')
    labels=None
    if args.execution_labels:
        label_spec=importlib.util.spec_from_file_location('context_labels',HERE/'context_labels.py');label_module=importlib.util.module_from_spec(label_spec);label_spec.loader.exec_module(label_module)
        labels=label_module.execution_labels(data,train)
        np.savez_compressed(OUT/'training-labels.npz',at=data.t,labels=labels,train_mask=train)
    scaler=StandardScaler().fit(data.X[train]);transformed=np.zeros_like(data.X);valid=np.isfinite(data.X).all(axis=1);transformed[valid]=scaler.transform(data.X[valid])
    models={'ridge':Ridge(alpha=100)}
    if not args.september_train:models['context_tree']=HistGradientBoostingRegressor(**protocol['models']['context_tree'])
    if args.september_train:models={'ridge':models['ridge']};data.periods={'whole':('2026-10-01','2026-11-01'),'validation':('2026-10-01','2026-10-17'),'test':('2026-10-19','2026-11-01')}
    counts={};model_info={}
    for name,model in models.items():
        allowed=valid&session&((f.high-f.low).to_numpy()<=3*data.av)
        fitted=[]
        if args.execution_labels:
            from sklearn.base import clone
            predictions=[]
            for column in (0,1):
                mask=train&np.isfinite(labels[:,column])
                if mask.sum()<500:raise ValueError('INSUFFICIENT_EXECUTION_LABELS')
                fitted_model=clone(model).fit(transformed[mask],np.clip(labels[mask,column],-5,5));fitted.append(fitted_model)
                pr=np.full(len(f),np.nan);pr[valid]=fitted_model.predict(transformed[valid]);predictions.append(pr)
            long,short=predictions
            side=np.where(allowed&(long>.10)&(long>short+.05),1,np.where(allowed&(short>.10)&(short>long+.05),-1,0)).astype(np.int8)
        else:
            model.fit(transformed[train],np.clip(y.to_numpy()[train],-5,5));fitted=[model]
            pred=np.full(len(f),np.nan);pred[valid]=model.predict(transformed[valid]);data.predictions[name]=pred
            floor=(f.ask_close-f.close+.07+.10).to_numpy()/data.av+.05
            side=np.where(allowed&(pred>floor),1,np.where(allowed&(pred< -floor),-1,0)).astype(np.int8)
        signal=np.roll(side,1);signal[0]=0;signal[np.r_[True,np.diff(data.t)!=60000]]=0
        av=np.roll(data.av,1);reference=np.roll(f.close.to_numpy(),1);level=reference-signal*av
        data.arrays[name]=tuple(np.ascontiguousarray(v) for v in (signal,av,level,reference))
        counts[name]=int(np.count_nonzero(signal))
        model_info[name]=[]
        for fitted_model in fitted:
            if name=='ridge':model_info[name].append(dict(coefficients=fitted_model.coef_.tolist(),intercept=float(fitted_model.intercept_)))
            else:model_info[name].append(dict(baseline=float(fitted_model._baseline_prediction.ravel()[0]),trees=[p[0].nodes.tolist() for p in fitted_model._predictors],node_dtype=str(fitted_model._predictors[0][0].nodes.dtype)))
    candidates=[dict(family=name+':'+period,n=20,stop=1,rr=1.5,hold=5,style=0,session=2,mode=0) for name in models for period in (('whole','validation','test') if args.september_train else ('validation','test'))]
    arms=[dict(candidate=i,family=c['family'],risk=risk,leverage=100,commission=3.5,slip=.05 if stress else .02,delayMs=500 if stress else 200,manageMs=500 if stress else 200,sampleMs=200,capital=cap,stress=stress) for i,c in enumerate(candidates) for risk in protocol['risk_pct'] for cap in protocol['capital'] for stress in (False,True)]
    n.s.tick_replay.library=lambda:n.s.library('personal_gold_ticks.cpp');n.s.tick_replay.Replay=n.s.MarginReplay
    result=n.s.tick_replay.run_month(data,'2026-10',candidates,arms)
    for r in result['results']:
        if abs(r['endingBalance']-r['arm']['capital']-sum(t[6] for t in r['trades']))>1e-6:raise ValueError('CASH_AUDIT')
    payload=dict(protocol=protocol,training_rows=int(train.sum()),training_last_feature_ms=float(data.t[train][-1]),candidate_counts=counts,models=model_info,scaler=dict(mean=scaler.mean_.tolist(),scale=scaler.scale_.tolist()),sklearn_version=sklearn.__version__,feature_module_sha256=hashlib.sha256((ROOT/'mt5-agent/gold_turbo/context_features.py').read_bytes()).hexdigest(),script_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),source_manifests=data.manifests,result=result)
    (OUT/'receipts.json.gz').write_bytes(gzip.compress(json.dumps(payload,separators=(',',':'),allow_nan=False).encode(),mtime=0))
    compact={**payload,'result':{**result,'results':[{k:v for k,v in r.items() if k!='trades'} for r in result['results']]}}
    (OUT/'summary.json').write_text(json.dumps(compact,indent=2,allow_nan=False)+'\n')
    for r in result['results']:
        if r['arm']['capital']==500:print(r['arm']['family'],r['arm']['risk'],r['arm']['stress'],round(r['returnPct'],2),round(r['drawdownPct'],2),r['closedTrades'],r['profitFactor'])

if __name__=='__main__':main()
