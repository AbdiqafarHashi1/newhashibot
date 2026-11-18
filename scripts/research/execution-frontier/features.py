"""Closed-candle signals mapped to the following native minute. Never fill missing bars."""
import hashlib,json,pathlib
import numpy as np
import pandas as pd
ROOT=pathlib.Path(__file__).resolve().parents[3]
class Data:
 def __init__(self,symbol,months):
  self.symbol=symbol;self.manifests=[];rows=[]
  for month in months:
   p=ROOT/f'.tmp/execution-frontier/data/{symbol}-1m-{month}.json';raw=p.read_bytes();m=json.loads(p.with_suffix('.manifest.json').read_text());assert hashlib.sha256(raw).hexdigest()==m['rowsSha256'];rows+=json.loads(raw);self.manifests.append(m)
  f=pd.DataFrame(rows);f.index=pd.to_datetime(f.open_time,utc=True);self.initialize(f)
 def initialize(self,f):
  assert f.index.is_monotonic_increasing and not f.index.has_duplicates
  self.f=f;self.x=np.ascontiguousarray(np.column_stack([f.index.asi8//1000000]+[f[k] for k in ['open','ask_open','high','low','ask_high','ask_low','close','ask_close']]),dtype=float);self.cache={}
 def features(self,family,minutes,n):
  key=(family,minutes,n)
  if key in self.cache:return self.cache[key]
  f=self.f.resample(f'{minutes}min',closed='left',label='right').agg({'open':'first','high':'max','low':'min','close':'last','volume':'count'});f=f[f.volume==minutes];c=f.close
  a=pd.concat([f.high-f.low,(f.high-c.shift()).abs(),(f.low-c.shift()).abs()],axis=1).max(axis=1).rolling(14).mean();hi=f.high.shift().rolling(n).max();lo=f.low.shift().rolling(n).min();fast=c.ewm(span=12,adjust=False,min_periods=24).mean();slow=c.ewm(span=48,adjust=False,min_periods=96).mean();pos=(c-f.low)/(f.high-f.low).replace(0,np.nan)
  if family=='channel_break':buy=(c>hi)&(fast>slow);sell=(c<lo)&(fast<slow)
  elif family=='pullback_resume':buy=(fast>slow)&(f.low<fast)&(c>f.high.shift())&(c>fast);sell=(fast<slow)&(f.high>fast)&(c<f.low.shift())&(c<fast)
  elif family=='failed_break':buy=(f.low<lo)&(c>lo)&(pos>.65)&(c>f.open);sell=(f.high>hi)&(c<hi)&(pos<.35)&(c<f.open)
  elif family=='band_reentry':
   mean=c.rolling(n).mean();sd=c.rolling(n).std(ddof=0);buy=(c.shift()<mean.shift()-2*sd.shift())&(c>mean-2*sd)&(pos>.6);sell=(c.shift()>mean.shift()+2*sd.shift())&(c<mean+2*sd)&(pos<.4)
  elif family=='rsi_exhaustion':
   delta=c.diff();gain=delta.clip(lower=0).ewm(alpha=.5,adjust=False).mean();loss=(-delta.clip(upper=0)).ewm(alpha=.5,adjust=False).mean();rsi=100-100/(1+gain/loss.replace(0,np.nan));buy=(fast>slow)&(rsi.shift()<15)&(c>f.open)&(c>c.shift());sell=(fast<slow)&(rsi.shift()>85)&(c<f.open)&(c<c.shift())
  elif family=='compression_expand':
   compressed=(f.high.rolling(3).max()-f.low.rolling(3).min())<2*a;buy=compressed.shift().fillna(False)&(c>hi)&(pos>.75);sell=compressed.shift().fillna(False)&(c<lo)&(pos<.25)
  elif family=='session_break':
   day=f.index.floor('D');clock=f.index.hour*60+f.index.minute;rangebars=f[(clock>360)&(clock<=420)];r=rangebars.groupby(rangebars.index.floor('D')).agg({'high':'max','low':'min','volume':'count'});r=r[r.volume==60//minutes];h=pd.Series(day.map(r.high),index=f.index);l=pd.Series(day.map(r.low),index=f.index);buy=(clock>420)&(clock<=660)&(c>h)&(c.shift()<=h)&(pos>.65);sell=(clock>420)&(clock<=660)&(c<l)&(c.shift()>=l)&(pos<.35)
  else:raise ValueError(family)
  valid=a.notna()&(f.index.to_series().diff().dt.total_seconds().rolling(max(n,20)).max()==minutes*60)&(f.high-f.low<3*a)
  side=pd.Series(np.where(buy&valid,1,np.where(sell&valid,-1,0)),index=f.index,dtype=np.int8);level=pd.Series(np.where(side>=0,f.low.rolling(2).min()-.1*a,f.high.rolling(2).max()+.1*a),index=f.index)
  # A signal is emitted only at the next actual minute, never forward-filled.
  sig=side.reindex(self.f.index).fillna(0);av=a.reindex(self.f.index,method='ffill');st=level.reindex(self.f.index,method='ffill');prior=self.f.index.to_series().diff().dt.total_seconds();sig[prior!=60]=0
  result=(np.ascontiguousarray(sig,dtype=np.int8),np.ascontiguousarray(av,dtype=float),np.ascontiguousarray(st,dtype=float));self.cache[key]=result;return result
