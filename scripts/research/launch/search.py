"""Frozen causal family screen on original native futures candles. Never production authority."""
import argparse,ctypes,hashlib,itertools,json,pathlib,subprocess
import numpy as np
import pandas as pd
ROOT=pathlib.Path(__file__).resolve().parents[3]
FAMILIES=['donchian','ema_cross','trend_pullback','bollinger','rsi2','momentum','vwap_reclaim','failed_breakout','squeeze']
SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','LINKUSDT','AVAXUSDT','LTCUSDT']
STEPS=[.001,.001,.1,.01,1,1,1,.01,.01,.001];TICKS=[.1,.01,.01,.01,.0001,.0001,.00001,.001,.001,.01]
GRID=[dict(family=f,timeframe=tf,lookback=n,stopAtr=stop,rewardR=rr) for f,tf,n,stop,rr in itertools.product(FAMILIES,[15,60,240],[12,24,48],[1.5,2.,3.],[1.5,3.,5.])]
def stamp(s):return pd.Timestamp(s,tz='UTC').value//1000000
class Data:
 def __init__(self,folder,months,symbols=SYMBOLS):
  self.symbols=symbols;frames=[];self.manifests=[]
  for symbol in symbols:
   values=[]
   for month in months:
    name=f'{symbol}-5m-{month}.zip';manifest=json.loads((folder/(name+'.manifest.json')).read_text());raw=(folder/(name+'.rows.json')).read_bytes();archive=(folder/name).read_bytes()
    if manifest['instrument']!='USDT_PERPETUAL' or not manifest.get('vendorChecksum') or hashlib.sha256(archive).hexdigest()!=manifest['sha256'] or hashlib.sha256(raw).hexdigest()!=manifest['rowsSha256']:raise ValueError('NATIVE_SOURCE_INTEGRITY_FAILED:'+name)
    values.extend(json.loads(raw));self.manifests.append(manifest)
   a=np.asarray(values,dtype=np.float64);ms=np.where(a[:,0]>1e14,a[:,0]/1000,a[:,0]).astype(np.int64);df=pd.DataFrame(a[:,[1,2,3,4,5,7]],index=pd.to_datetime(ms,unit='ms',utc=True),columns=['o','h','l','c','v','qv']).sort_index()
   if df.index.has_duplicates or not np.all(np.diff(df.index.asi8)==300_000_000_000):raise ValueError('CANDLE_GAP_OR_DUPLICATE:'+symbol)
   frames.append(df)
  if any(not frames[0].index.equals(f.index) for f in frames):raise ValueError('CROSS_ASSET_CLOCK_MISMATCH')
  self.frames=frames;self.clock=frames[0].index;self.t=np.ascontiguousarray(self.clock.asi8/1e6,dtype=np.float64);self.monthKeys=list(dict.fromkeys(self.clock.strftime('%Y-%m')));self.month=np.ascontiguousarray([self.monthKeys.index(x) for x in self.clock.strftime('%Y-%m')],dtype=np.int32)
  self.price=[np.ascontiguousarray(np.column_stack([f[k] for f in frames]),dtype=np.float64) for k in ['o','h','l','c']];self.cache={};self.atr={}
 def feature(self,family,minutes,n):
  key=(family,minutes,n)
  if key in self.cache:return self.cache[key],self.atr[minutes]
  signals=[];atrs=[]
  for base in self.frames:
   tf=base.resample(f'{minutes}min',label='right',closed='left').agg({'o':'first','h':'max','l':'min','c':'last','v':'sum','qv':'sum'}).dropna();c=tf.c;prev=c.shift();tr=pd.concat([tf.h-tf.l,(tf.h-prev).abs(),(tf.l-prev).abs()],axis=1).max(axis=1);atr=tr.ewm(alpha=1/14,adjust=False,min_periods=20).mean();fast=c.ewm(span=n,adjust=False,min_periods=n).mean();slow=c.ewm(span=n*3,adjust=False,min_periods=n*3).mean();hi=tf.h.shift().rolling(n).max();lo=tf.l.shift().rolling(n).min();side=pd.Series(0,index=tf.index,dtype=np.int8)
   change=c.diff();gain=change.clip(lower=0).ewm(alpha=.5,adjust=False,min_periods=5).mean();loss=(-change.clip(upper=0)).ewm(alpha=.5,adjust=False,min_periods=5).mean();rsi=100-100/(1+gain/loss.replace(0,np.nan));trend=(fast-slow)/atr
   if family=='donchian':buy=(c>hi)&(fast>slow);sell=(c<lo)&(fast<slow)
   elif family=='ema_cross':buy=(fast>slow)&(fast.shift()<=slow.shift());sell=(fast<slow)&(fast.shift()>=slow.shift())
   elif family=='trend_pullback':buy=(trend>.5)&(tf.l<fast)&(c>fast)&(c>tf.o);sell=(trend<-.5)&(tf.h>fast)&(c<fast)&(c<tf.o)
   elif family=='bollinger':mean=c.rolling(n).mean();std=c.rolling(n).std(ddof=0);buy=(c<mean-2*std)&(trend.abs()<1);sell=(c>mean+2*std)&(trend.abs()<1)
   elif family=='rsi2':buy=(c>slow)&(rsi<10);sell=(c<slow)&(rsi>90)
   elif family=='momentum':roc=(c-c.shift(n))/atr;buy=(roc>1.5)&(roc.shift()<=1.5)&(c>slow);sell=(roc<-1.5)&(roc.shift()>=-1.5)&(c<slow)
   elif family=='vwap_reclaim':day=(tf.index-pd.Timedelta(minutes=minutes)).floor('D');vwap=tf.qv.groupby(day).cumsum()/tf.v.groupby(day).cumsum();buy=(c>vwap)&(c.shift()<=vwap.shift())&(fast>slow);sell=(c<vwap)&(c.shift()>=vwap.shift())&(fast<slow)
   elif family=='failed_breakout':buy=(tf.l<lo)&(c>lo)&(c>tf.o)&(trend.abs()<1);sell=(tf.h>hi)&(c<hi)&(c<tf.o)&(trend.abs()<1)
   elif family=='squeeze':std=c.rolling(n).std(ddof=0);width=std/atr;ready=width.shift().rolling(n).min()<.8;buy=(c>hi)&ready&(tf.v>tf.v.shift().rolling(n).mean());sell=(c<lo)&ready&(tf.v>tf.v.shift().rolling(n).mean())
   else:raise ValueError(family)
   side.loc[buy.fillna(False)]=1;side.loc[sell.fillna(False)]=-1;signals.append(side.reindex(self.clock,fill_value=0).to_numpy(dtype=np.int8));atrs.append(atr.reindex(self.clock,method='ffill').to_numpy())
  self.cache[key]=np.ascontiguousarray(np.column_stack(signals),dtype=np.int8);self.atr[minutes]=np.ascontiguousarray(np.column_stack(atrs),dtype=np.float64);return self.cache[key],self.atr[minutes]
def engine():
 so=ROOT/'.tmp/launch-research/account_screen.so';so.parent.mkdir(parents=True,exist_ok=True);subprocess.run(['g++','-O3','-std=c++17','-shared','-fPIC',str(ROOT/'scripts/research/launch/account_screen.cpp'),'-o',str(so)],check=True);lib=ctypes.CDLL(str(so));f=lib.simulate;D=ctypes.POINTER(ctypes.c_double);I=ctypes.POINTER(ctypes.c_int);B=ctypes.POINTER(ctypes.c_byte);f.argtypes=[ctypes.c_int,ctypes.c_int,D,D,D,D,D,B,D,I,D,D,ctypes.c_int,ctypes.c_int]+[ctypes.c_double]*4+[ctypes.c_int]+[ctypes.c_double]*5+[ctypes.c_int,ctypes.c_double]+[D]*5+[ctypes.c_int];f.restype=ctypes.c_int;return f
def simulate(data,config,start,end,run,risk=.5,leverage=3,fee=5,slip=2,detail=False):
 signal,atr=data.feature(config['family'],config['timeframe'],config['lookback']);begin=int(np.searchsorted(data.t,stamp(start)));finish=int(np.searchsorted(data.t,stamp(end)));n,m=data.price[0].shape;steps=np.asarray([STEPS[SYMBOLS.index(s)] for s in data.symbols],dtype=np.float64);ticks=np.asarray([TICKS[SYMBOLS.index(s)] for s in data.symbols],dtype=np.float64);out=np.zeros(10);monthly=np.full(len(data.monthKeys),np.nan);daily=np.full(2000,np.nan);equity=np.full(n,np.nan);trades=np.zeros((20000,9));D=ctypes.POINTER(ctypes.c_double);ptr=lambda a:a.ctypes.data_as(D)
 rc=run(n,m,*[ptr(a) for a in data.price],ptr(atr),signal.ctypes.data_as(ctypes.POINTER(ctypes.c_byte)),ptr(data.t),data.month.ctypes.data_as(ctypes.POINTER(ctypes.c_int)),ptr(steps),ptr(ticks),begin,finish,risk,leverage,config['stopAtr'],config['rewardR'],int(config['lookback']*4*config['timeframe']/5),fee,2,slip,1,3 if risk<=1 else 8,6,20 if risk<=1 else 40,ptr(out),ptr(monthly),ptr(daily),ptr(equity),ptr(trades),len(trades))
 if rc:raise ValueError('SCREEN_FAILED:'+str(rc))
 result={'equityReturnPct':(out[0]/1000-1)*100,'maximumDrawdownPct':out[1],'profitFactor':out[2]/out[3] if out[3]>0 else None,'closedTrades':int(out[4]),'entries':int(out[5]),'blockedEntries':int(out[6]),'accountFailed':bool(out[7]),'costs':out[8],'openPositions':int(out[9]),'monthly':{month:float(value) for month,value in zip(data.monthKeys,monthly) if np.isfinite(value)},'riskPct':risk,'leverage':leverage}
 if detail:result.update({'trades':trades[:int(out[4])].tolist(),'equityPath':[[int(t),float(e)] for t,e in zip(data.t[begin:finish],equity[begin:finish])]})
 return result
def main():
 p=argparse.ArgumentParser();p.add_argument('--data',default='.tmp/mission2/futures-data');p.add_argument('--months',default='2025-01,2025-02');p.add_argument('--start',default='2025-01-20');p.add_argument('--end',default='2025-03-01');p.add_argument('--out',default='.tmp/launch-research/development.json');a=p.parse_args();out=pathlib.Path(a.out);out.parent.mkdir(parents=True,exist_ok=True);source=hashlib.sha256(pathlib.Path(__file__).read_bytes()+(ROOT/'scripts/research/launch/account_screen.cpp').read_bytes()).hexdigest();frozen=json.dumps({'grid':GRID,'period':[a.start,a.end],'risk':.5,'leverage':3,'fee':5,'spread':2,'slip':2,'carry':1},sort_keys=True);out.with_suffix('.frozen.json').write_text(frozen);data=Data(pathlib.Path(a.data),a.months.split(','));run=engine();results=[]
 for i,cfg in enumerate(GRID):
  results.append({'configuration':cfg,'metrics':simulate(data,cfg,a.start,a.end,run)})
  if (i+1)%81==0:print(json.dumps({'tested':i+1}),flush=True)
 results.sort(key=lambda r:(not r['metrics']['accountFailed'],r['metrics']['equityReturnPct']/max(2,r['metrics']['maximumDrawdownPct'])),reverse=True);out.write_text(json.dumps({'schema':'launch-family-search/v2','sourceSha256':source,'gridSha256':hashlib.sha256(frozen.encode()).hexdigest(),'manifests':data.manifests,'results':results,'automaticPromotion':False},separators=(',',':')))
if __name__=='__main__':main()
