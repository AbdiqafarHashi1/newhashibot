"""One fixed RSI2/M5 pullback scalp hypothesis, real tick screening, no grids.

Separate research execution model: not production integration/qualification.
"""
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path=[p for p in sys.path if Path(p).resolve()!=HERE]
import ctypes
import gzip
import hashlib
import json
import subprocess
import numpy as np
import pandas as pd
ROOT=HERE.parents[2]
OLD=ROOT/'scripts/research/gold-micro';sys.path.insert(0,str(OLD))
import tick_replay
from features import Data


def library(source='simple_ticks.cpp'):
    src=HERE/source;out=ROOT/'.tmp/gold-simple';out.mkdir(parents=True,exist_ok=True)
    so=out/(hashlib.sha256(src.read_bytes()).hexdigest()[:12]+'.so')
    if not so.exists():subprocess.run(['g++','-O3','-std=c++17','-shared','-fPIC',str(src),'-o',str(so)],check=True)
    lib=ctypes.CDLL(str(so));D=ctypes.POINTER(ctypes.c_double);B=ctypes.POINTER(ctypes.c_byte)
    lib.micro_create.argtypes=[ctypes.c_int]*3+[D,B]+[D]*5;lib.micro_create.restype=ctypes.c_void_p
    lib.micro_ticks.argtypes=[ctypes.c_void_p,ctypes.c_int,D,D,D];lib.micro_ticks.restype=ctypes.c_int
    lib.micro_summary.argtypes=[ctypes.c_void_p,ctypes.c_int,D,ctypes.c_bool]
    lib.micro_trades.argtypes=[ctypes.c_void_p,ctypes.c_int,D,ctypes.c_int];lib.micro_destroy.argtypes=[ctypes.c_void_p]
    return lib


BaseReplay=tick_replay.Replay
class MarginReplay(BaseReplay):
    def summary(self):
        rows=super().summary()
        for i,row in enumerate(rows):
            out=np.zeros(12);self.lib.micro_summary(self.h,i,tick_replay.ptr(out),False)
            row['maximumMarginPct']=float(out[11])
        return rows


class FixedData(Data):
    def initialize_frame(self,f):
        super().initialize_frame(f)
        d=f.close.diff();up=d.clip(lower=0).ewm(alpha=.5,adjust=False,min_periods=2).mean();down=(-d.clip(upper=0)).ewm(alpha=.5,adjust=False,min_periods=2).mean()
        rsi=100-100/(1+up/down);rsi=rsi.where(down!=0,100).where((up+down)!=0,50)
        m=f.resample('5min',label='right',closed='left').agg(dict(open='first',high='max',low='min',close='last',volume='count'));m=m[m.volume==5]
        ema9=m.close.ewm(span=9,adjust=False,min_periods=21).mean();ema21=m.close.ewm(span=21,adjust=False,min_periods=21).mean()
        ctx=pd.DataFrame(dict(fast=ema9,slow=ema21,slope=ema21-ema21.shift(3),closed=m.index.asi8//1000000))
        ctx=ctx.reindex(f.index+pd.Timedelta(minutes=1),method='ffill');ctx.index=f.index
        long=(ctx.fast>ctx.slow)&(ctx.slope>0)&(rsi.shift()<=10)&(f.close>f.close.shift())&(f.close>f.open)&(f.close<=ctx.fast)
        short=(ctx.fast<ctx.slow)&(ctx.slope<0)&(rsi.shift()>=90)&(f.close<f.close.shift())&(f.close<f.open)&(f.close>=ctx.fast)
        continuous=f.index.to_series().diff().dt.total_seconds().rolling(22).max()==60
        fresh=(f.index.asi8//1000000+60000-ctx.closed<=300000)
        valid=continuous&fresh&self.atr.notna()&((f.high-f.low)<=3*self.atr)
        side=pd.Series(np.where(long&valid,1,np.where(short&valid,-1,0)),index=f.index,dtype=np.int8)
        level=pd.Series(np.where(side>=0,f.low.rolling(2).min()-.1*self.atr,f.high.rolling(2).max()+.1*self.atr),index=f.index)
        entry=side.shift().fillna(0);entry[f.index.to_series().diff().dt.total_seconds()!=60]=0
        self.fixed=(np.ascontiguousarray(entry,dtype=np.int8),np.ascontiguousarray(self.atr.shift(),dtype=np.float64),np.ascontiguousarray(level.shift(),dtype=np.float64),np.ascontiguousarray(f.close.shift(),dtype=np.float64))
    def features(self,family,n):
        lo,hi={'whole':('2026-10-01','2026-11-01'),'earlier':('2026-10-01','2026-10-17'),'later':('2026-10-19','2026-11-01')}[family]
        signal=self.fixed[0].copy();signal[(self.t<pd.Timestamp(lo,tz='UTC').value//1000000)|(self.t>=pd.Timestamp(hi,tz='UTC').value//1000000)]=0
        return (signal,)+self.fixed[1:]


def main():
    data=FixedData(['2026-10']);tick_replay.library=library;tick_replay.Replay=MarginReplay
    candidates=[dict(family=period,n=0,stop=.5,rr=1.,hold=5,style=0,session=1,mode=0) for period in ('whole','earlier','later')]
    arms=[]
    for i in range(3):
        for capital in (100,500,1000,25000):
            for stress in (False,True):arms.append(dict(candidate=i,risk=.25 if capital<=500 else .2 if capital<=5000 else .15,leverage=100,commission=3.5,slip=.05 if stress else .02,delayMs=500 if stress else 200,manageMs=500 if stress else 200,sampleMs=200,capital=capital,stress=stress,period=candidates[i]['family']))
    result=tick_replay.run_month(data,'2026-10',candidates,arms)
    for row in result['results']:
        row['commissionMoney']=row.pop('costs')
        row['independentDecisions']=row['closedTrades']
    payload=dict(schema='single-fixed-gold-hypothesis/v1',candidate='RSI2 previous-bar pullback, completed M1 reversal in M5 EMA9/21 trend; 1R target; 5-minute timeout',fixed_parameters=dict(rsi_long_max=10,rsi_short_min=90,m1_atr_period=14,minimum_stop_atr=.5,maximum_stop_atr=1.5,structural_stop_lookback_m1=2,stop_buffer_atr=.1,rr=1,maximum_hold_minutes=5,session_utc='08:00-16:00',daily_loss_pct=1.5,peak_loss_pct=8,maximum_margin_pct=20,contract_size=100,volume_min=.01,volume_step=.01,account_currency='USD'),engine_sha256=hashlib.sha256((HERE/'simple_ticks.cpp').read_bytes()).hexdigest(),source_manifest=data.manifests[0],result=result,limitations=['Screening engine, not production HashiBridge/basket execution; no integration/profitability claim','October was already explored; chronological earlier/later partitions are diagnostic, not untouched out-of-sample validation','Real bid/ask ticks, actual-quote delayed fills, adverse slippage and commissions; broker specs are scenarios','Historical news unavailable; explicit clear-news scenario. No swaps because sessions close intraday','No optimization sweep: one hypothesis and one fixed stressed-cost scenario','Full-month account path and independent earlier/later accounts are separate; do not sum their returns','Stop gaps can exceed planned loss; survival in one month is not a survival probability'])
    out=ROOT/'docs/research/edge-evidence-20261127';out.mkdir(parents=True,exist_ok=True)
    (out/'simple-scalp-receipts.json.gz').write_bytes(gzip.compress(json.dumps(payload,separators=(',',':'),allow_nan=False).encode(),mtime=0))
    compact={**payload,'result':{**result,'results':[{k:v for k,v in row.items() if k!='trades'} for row in result['results']]}}
    (out/'simple-scalp-summary.json').write_text(json.dumps(compact,indent=2,allow_nan=False)+'\n')
    for row in result['results']:
        if row['arm']['capital']==25000:print(row['arm']['period'],row['arm']['stress'],round(row['returnPct'],3),row['closedTrades'],row['profitFactor'],row['meanHoldMinutes'])

if __name__=='__main__':main()
