"""Finite-window, causal M1 price action. The signal at i uses bars closed before i."""
import hashlib,json,pathlib
import numpy as np
import pandas as pd
ROOT=pathlib.Path(__file__).resolve().parents[3]
class Data:
 def __init__(self,months):
  values=[];self.manifests=[]
  for month in months:
   p=ROOT/f'.tmp/gold-micro/data/XAUUSD-1m-{month}.json';raw=p.read_bytes();m=json.loads(p.with_suffix('.manifest.json').read_text());assert hashlib.sha256(raw).hexdigest()==m['rowsSha256'];assert m['timeframe']=='1m';values+=json.loads(raw);self.manifests.append(m)
  f=pd.DataFrame(values);f.index=pd.to_datetime(f.open_time,utc=True);self.initialize_frame(f)
 def initialize_frame(self,f):
  assert f.index.is_monotonic_increasing and not f.index.has_duplicates;self.f=f;self.t=np.ascontiguousarray(f.index.asi8//1000000,dtype=np.float64);self.price=[np.ascontiguousarray(f[k],dtype=np.float64) for k in ['open','ask_open','high','low','ask_high','ask_low','close','ask_close']];self.cache={}
  prev=f.close.shift();tr=pd.concat([f.high-f.low,(f.high-prev).abs(),(f.low-prev).abs()],axis=1).max(axis=1);self.atr=tr.rolling(14,min_periods=14).mean()
  m5=f.resample('5min',closed='left',label='right').agg({'open':'first','high':'max','low':'min','close':'last','volume':'count'});m5=m5[m5.volume==5];a5=pd.concat([m5.high-m5.low,(m5.high-m5.close.shift()).abs(),(m5.low-m5.close.shift()).abs()],axis=1).max(axis=1).rolling(14).mean();fast=m5.close.rolling(9).mean();slow=m5.close.rolling(21).mean();c5=pd.DataFrame({'fast':fast,'slow':slow,'slope':(fast-fast.shift(2))/a5,'slowSlope':(slow-slow.shift(2))/a5,'atr5':a5,'closed':m5.index.asi8//1000000});self.context=c5.reindex(f.index+pd.Timedelta(minutes=1),method='ffill');self.context.index=f.index
  m15=f.resample('15min',closed='left',label='right').agg({'open':'first','high':'max','low':'min','close':'last','volume':'count'});m15=m15[m15.volume==15];c15=pd.DataFrame({'fast':m15.close.rolling(8).mean(),'slow':m15.close.rolling(21).mean(),'closed':m15.index.asi8//1000000});self.context15=c15.reindex(f.index+pd.Timedelta(minutes=1),method='ffill');self.context15.index=f.index
 def features(self,family,n):
  key=(family,n)
  if key in self.cache:return self.cache[key]
  f=self.f;c=f.close;a=self.atr;fast=c.rolling(n).mean();slow=c.rolling(3*n).mean();priorHigh=f.high.shift().rolling(n).max();priorLow=f.low.shift().rolling(n).min();width=f.high-f.low;pos=(c-f.low)/width.replace(0,np.nan);ct=self.context;up=(ct.fast>ct.slow)&(ct.slope>.1);down=(ct.fast<ct.slow)&(ct.slope<-.1)
  if family.startswith('watch_'):
   if family=='watch_support_reversal':
    macroUp=(ct.fast>ct.slow)&(ct.slowSlope>0)&(c>ct.slow);macroDown=(ct.fast<ct.slow)&(ct.slowSlope<0)&(c<ct.slow);red=(c<f.open)&(c.shift()<f.open.shift());green=(c>f.open)&(c.shift()>f.open.shift());lower=f.low.rolling(n).min();upper=f.high.rolling(n).max()
    buy=macroUp&red&(ct.fast-lower>1.5*a);sell=macroDown&green&(upper-ct.fast>1.5*a);side=pd.Series(np.where(buy,1,np.where(sell,-1,0)),index=f.index,dtype=np.int8);stop=pd.Series(np.where(side>=0,lower,upper),index=f.index);trigger=ct.fast
   elif family in ['watch_two_bar_resume','watch_strong_resume','watch_adaptive_resume','watch_aligned_resume']:
    macroUp=(ct.fast>ct.slow)&(ct.slowSlope>0)&(c>ct.slow);macroDown=(ct.fast<ct.slow)&(ct.slowSlope<0)&(c<ct.slow);red=(c<f.open)&(c.shift()<f.open.shift());green=(c>f.open)&(c.shift()>f.open.shift());buy=macroUp&red&(f.high.rolling(n).max()-c>a);sell=macroDown&green&(c-f.low.rolling(n).min()>a)
    if family=='watch_strong_resume':buy=buy&((ct.fast-ct.slow)>.5*ct.atr5)&(ct.slowSlope>.05);sell=sell&((ct.slow-ct.fast)>.5*ct.atr5)&(ct.slowSlope<-.05)
    if family=='watch_aligned_resume':buy=buy&(self.context15.fast>self.context15.slow);sell=sell&(self.context15.fast<self.context15.slow)
    side=pd.Series(np.where(buy,1,np.where(sell,-1,0)),index=f.index,dtype=np.int8);stop=pd.Series(np.where(side>=0,f.low.rolling(3).min()-.1*a,f.high.rolling(3).max()+.1*a),index=f.index);trigger=pd.Series(np.where(side>=0,f.high.rolling(2).max()+.05*a,f.low.rolling(2).min()-.05*a),index=f.index)
   elif family=='watch_reversal':
    buy=ct.slope>-.4;sell=ct.slope<.4;lower=f.low.rolling(n*3).min();upper=f.high.rolling(n*3).max()
    side=pd.Series(np.where(buy&sell,2,np.where(buy,1,np.where(sell,-1,0))),index=f.index,dtype=np.int8);stop=lower;trigger=upper
   else:
    if family=='watch_trend':
     buy=up&(c<=fast+.25*a);sell=down&(c>=fast-.25*a);lower=f.low.rolling(2).min()-.1*a;upper=f.high.rolling(2).max()+.1*a;trigger=pd.Series(np.where(buy,f.high+.05*a,f.low-.05*a),index=f.index)
    elif family=='watch_breakout':
     highest=f.high.rolling(n).max();lowest=f.low.rolling(n).min();tight=(f.high.rolling(3).max()-f.low.rolling(3).min())<2.5*a;buy=up&tight&(highest-c<a);sell=down&tight&(c-lowest<a);lower=f.low.rolling(3).min()-.1*a;upper=f.high.rolling(3).max()+.1*a;trigger=pd.Series(np.where(buy,highest+.05*a,lowest-.05*a),index=f.index)
    else:raise ValueError(family)
    side=pd.Series(np.where(buy,1,np.where(sell,-1,0)),index=f.index,dtype=np.int8);stop=pd.Series(np.where(side>=0,lower,upper),index=f.index)
   if family=='watch_adaptive_resume':side=pd.Series(np.where((side==1)&((ct.fast-ct.slow)>.5*ct.atr5)&(ct.slowSlope>.05),3,np.where((side==-1)&((ct.slow-ct.fast)>.5*ct.atr5)&(ct.slowSlope<-.05),-3,side)),index=f.index,dtype=np.int8)
   valid=(f.index.to_series().diff().dt.total_seconds().rolling(20).max()==60)&a.notna()&(f.index.asi8//1000000+60000-ct.closed<=300000);side[~valid]=0;entry=side.shift(1).fillna(0);entry[f.index.to_series().diff().dt.total_seconds()!=60]=0
   result=(np.ascontiguousarray(entry,dtype=np.int8),np.ascontiguousarray(a.shift(1),dtype=np.float64),np.ascontiguousarray(stop.shift(1),dtype=np.float64),np.ascontiguousarray(trigger.shift(1),dtype=np.float64));self.cache[key]=result;return result
  if family=='sweep_reclaim':
   buy=(f.low<priorLow-.05*a)&(c>priorLow)&(pos>.65)&(c>f.open)&(ct.slope>-.25);sell=(f.high>priorHigh+.05*a)&(c<priorHigh)&(pos<.35)&(c<f.open)&(ct.slope<.25)
  elif family=='trend_pullback':
   buy=up&(f.low<=fast)&(c>fast)&(c>f.high.shift())&(c-fast<1.2*a);sell=down&(f.high>=fast)&(c<fast)&(c<f.low.shift())&(fast-c<1.2*a)
  elif family=='impulse_retest':
   buy=up&(c.shift()>priorHigh.shift())&(f.low<=priorHigh.shift()+.15*a)&(c>priorHigh.shift())&(c>f.open)&(c-priorHigh.shift()<a);sell=down&(c.shift()<priorLow.shift())&(f.high>=priorLow.shift()-.15*a)&(c<priorLow.shift())&(c<f.open)&(priorLow.shift()-c<a)
  elif family=='stretch_snapback':
   buy=(c.shift()<slow.shift()-1.5*a.shift())&(c>c.shift())&(c>f.open)&(pos>.65)&(ct.slope>-.25);sell=(c.shift()>slow.shift()+1.5*a.shift())&(c<c.shift())&(c<f.open)&(pos<.35)&(ct.slope<.25)
  elif family=='level_reclaim':
   upper=f.high.shift().rolling(n*6).max();lower=f.low.shift().rolling(n*6).min();sweptUp=(f.low.shift()<lower.shift())&(c.shift()>lower.shift());sweptDown=(f.high.shift()>upper.shift())&(c.shift()<upper.shift())
   buy=sweptUp&(c>f.high.shift())&(c>f.open)&(pos>.6);sell=sweptDown&(c<f.low.shift())&(c<f.open)&(pos<.4)
  elif family=='momentum_burst':
   body=(c-f.open)/a;buy=up&(c>priorHigh)&(body>.7)&(pos>.8)&(c-ct.fast<2.5*a);sell=down&(c<priorLow)&(body<-.7)&(pos<.2)&(ct.fast-c<2.5*a)
  else:raise ValueError(family)
  complete=(f.index.to_series().diff().dt.total_seconds().rolling(max(n,20)).max()==60)&(f.index.asi8//1000000+60000-ct.closed<=300000)&a.notna()&(width<=2.5*a)
  side=pd.Series(0,index=f.index,dtype=np.int8);side[buy.fillna(False)&complete]=1;side[sell.fillna(False)&complete]=-1
  # No stale Friday signal can be filled on Monday or after a quote gap.
  validEntry=f.index.to_series().diff().dt.total_seconds()==60;signal=side.shift(1).fillna(0);signal[~validEntry]=0
  low=f.low.rolling(2).min()-.1*a;high=f.high.rolling(2).max()+.1*a;level=pd.Series(np.where(side>=0,low,high),index=f.index)
  result=(np.ascontiguousarray(signal,dtype=np.int8),np.ascontiguousarray(a.shift(1),dtype=np.float64),np.ascontiguousarray(level.shift(1),dtype=np.float64),np.ascontiguousarray(c.shift(1),dtype=np.float64));self.cache[key]=result;return result
