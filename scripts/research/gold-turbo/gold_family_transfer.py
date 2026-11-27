"""Two frozen intraday adaptations of existing Gold families, not an optimization grid."""
import sys,importlib.util,json,gzip,hashlib
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];sys.path=[p for p in sys.path if Path(p).resolve()!=HERE]
spec=importlib.util.spec_from_file_location('native',HERE/'native_gold_edge.py');n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
import numpy as np
import pandas as pd
OUT=ROOT/'docs/research/gold-family-transfer-20261127'

class TransferData(n.s.Data):
    def initialize_frame(self,f):
        super().initialize_frame(f);self.arrays={};self.signal_counts={}
        for name,minutes,lookback,stop,rr in [('M5_MOMENTUM',5,48,1.5,2),('M1_BAND_REENTRY',1,20,1,1)]:
            b=f.resample(f'{minutes}min').agg(dict(open='first',high='max',low='min',close='last',volume='sum'));b=b[b.close.notna()]
            previous=b.close.shift();tr=pd.concat([b.high-b.low,(b.high-previous).abs(),(b.low-previous).abs()],axis=1).max(axis=1);av=tr.ewm(alpha=1/14,adjust=False).mean();fast=b.close.ewm(span=lookback,adjust=False).mean();slow=b.close.ewm(span=lookback*3,adjust=False).mean()
            if name=='M5_MOMENTUM':
                momentum=(b.close-b.close.shift(lookback))/av;prior=momentum.shift();buy=(momentum>1.5)&(prior<=1.5)&(b.close>slow);sell=(momentum< -1.5)&(prior>=-1.5)&(b.close<slow)
            else:
                mean=b.close.rolling(lookback).mean();std=b.close.rolling(lookback).std(ddof=0);lower=mean-2*std;upper=mean+2*std;ranging=(fast-slow).abs()/av<1
                buy=(b.close.shift()<lower.shift())&(b.close>lower)&(b.close>b.open)&ranging;sell=(b.close.shift()>upper.shift())&(b.close<upper)&(b.close<b.open)&ranging
            # Hard prerequisites, not a quota: sufficient closed history and no giant impulse.
            ready=pd.Series(np.arange(len(b))>=max(100,lookback*3),index=b.index)&(b.high-b.low<3.5*av)
            sides=np.where(buy&ready,1,np.where(sell&ready,-1,0)).astype(np.int8)
            sig=np.zeros(len(f),dtype=np.int8);atr=np.full(len(f),np.nan);level=atr.copy();reference=atr.copy()
            for i in np.flatnonzero(sides):
                at=b.index[i]+pd.Timedelta(minutes=minutes);clock=at.hour*60+at.minute
                if not 360<=clock<=1180:continue
                j=int(np.searchsorted(self.t,at.value//1000000))
                if j>=len(self.t) or self.t[j]!=at.value//1000000:continue
                sig[j]=sides[i];atr[j]=av.iloc[i];reference[j]=b.close.iloc[i];level[j]=reference[j]-sig[j]*stop*atr[j]
            self.arrays[name]=tuple(np.ascontiguousarray(a) for a in (sig,atr,level,reference));self.signal_counts[name]=int(np.count_nonzero(sig))
    def features(self,family,lookback):return self.arrays[family]

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    protocol=dict(selection='Two prespecified family transfers; no candidate/parameter sweep. All results retained. Rules frozen before development/validation comparison.',models={'M5_MOMENTUM':dict(lookback=48,cross_atr=1.5,slow_ema=144,stop_atr=1.5,reward_r=2,hold_minutes=20),'M1_BAND_REENTRY':dict(lookback=20,bands_std=2,range_ema_gap_atr_max=1,stop_atr=1,reward_r=1,hold_minutes=5)},source_families=['gold.native-momentum-15-48-2-5','gold.native-band-reentry-15-48-3-5'],changes='M5/M1 closed execution, explicit shorter 20/5-minute holds and smaller fixed stop/target; original configurations unchanged. New performance is not inferred from old family performance.',development='September 2026',validation='October 2026, known market period from prior research',entry_hours_utc='06:00–19:40',risk_pct=[1,2,5],capital=[100,500,1000,25000],costs='Real retained bid/ask ticks, $3.50/lot/side, .02/.05 slippage, 200/500ms delays, .01lot floors,100oz/lot,100x leverage',limits='Experimental Personal 15%daily/60%peak/50%entrymargin; no customer/default/Prop changes',acceptance='Strong positive expectancy and cost stress resilience in both months, adequate independent decisions, viable after $100 fee; no promotion of 1–10% monthly small-account cases as meeting the aggressive objective.')
    (OUT/'protocol.json').write_text(json.dumps(protocol,indent=2)+'\n');data=TransferData(['2026-09','2026-10'])
    candidates=[dict(family=name,n=48 if name=='M5_MOMENTUM' else 20,stop=1.5 if name=='M5_MOMENTUM' else 1,rr=2 if name=='M5_MOMENTUM' else 1,hold=20 if name=='M5_MOMENTUM' else 5,style=0,session=2,mode=0) for name in ('M5_MOMENTUM','M1_BAND_REENTRY')]
    arms=[dict(candidate=i,family=c['family'],risk=risk,leverage=100,commission=3.5,slip=.05 if stress else .02,delayMs=500 if stress else 200,manageMs=500 if stress else 200,sampleMs=200,capital=cap,stress=stress) for i,c in enumerate(candidates) for risk in protocol['risk_pct'] for cap in protocol['capital'] for stress in (False,True)]
    n.s.tick_replay.library=lambda:n.s.library('personal_gold_ticks.cpp');n.s.tick_replay.Replay=n.s.MarginReplay
    result=[n.s.tick_replay.run_month(data,month,candidates,arms) for month in ('2026-09','2026-10')]
    for month in result:
        for r in month['results']:
            if abs(r['endingBalance']-r['arm']['capital']-sum(t[6] for t in r['trades']))>1e-6:raise ValueError('CASH_AUDIT')
            r['after_full_100_subscription']=r['endingBalance']-r['arm']['capital']-100;r['decisions_per_weekday']=r['closedTrades']/(22 if month['month']=='2026-10' else 22)
    payload=dict(protocol=protocol,source_manifests=data.manifests,script_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),signal_counts=data.signal_counts,results=result)
    (OUT/'receipts.json.gz').write_bytes(gzip.compress(json.dumps(payload,separators=(',',':'),allow_nan=False).encode(),mtime=0))
    for month in payload['results']:
        for r in month['results']:
            r.pop('trades')
            if r['arm']['capital']==500:print(month['month'],r['arm']['family'],r['arm']['risk'],r['arm']['stress'],round(r['returnPct'],2),round(r['drawdownPct'],2),r['closedTrades'],r['profitFactor'])
    (OUT/'summary.json').write_text(json.dumps(payload,indent=2,allow_nan=False)+'\n')

if __name__=='__main__':main()
