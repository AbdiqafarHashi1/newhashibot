"""Original implementations inspired by published session/noise and volatility methods.
FX/Gold have no consolidated traded volume: use TWAP, never mislabel quote counts VWAP.
All price histories through October are now development, not untouched holdout.
"""
import itertools,json,pathlib
import numpy as np
import pandas as pd
from features import Data,ROOT
from study import OUT,simulate,dump
class LiteratureData(Data):
 def features(self,family,minutes,n):
  if not family.startswith('lit_'):return super().features(family,minutes,n)
  key=(family,minutes,n)
  if key in self.cache:return self.cache[key]
  f=self.f;time=f.index;clock=time.hour*60+time.minute;anchor=360 if self.symbol!='XAUUSD' else 750;offset=(clock-anchor);day=time.floor('D');price=f.close;opening=f.open.where(clock==anchor).groupby(day).transform('first');delta=(price/opening-1).abs();table=pd.DataFrame({'day':day,'offset':offset,'move':delta},index=time);sigma=table.groupby('offset')['move'].transform(lambda s:s.shift(1).rolling(14,min_periods=14).mean());upper=opening*(1+sigma);lower=opening*(1-sigma)
  in_session=(offset>=0)&(offset<420);typical=(f.high+f.low+price)/3;running=typical.where(in_session).groupby(day).cumsum();number=pd.Series(in_session.astype(int),index=time).groupby(day).cumsum().replace(0,np.nan);twap=running/number
  bars=f.resample(f'{minutes}min',closed='left',label='right').agg({'open':'first','high':'max','low':'min','close':'last','volume':'count'});bars=bars[bars.volume==minutes];a=pd.concat([bars.high-bars.low,(bars.high-bars.close.shift()).abs(),(bars.low-bars.close.shift()).abs()],axis=1).max(axis=1).rolling(14).mean();atr=a.reindex(time,method='ffill');slow=price.rolling(240).mean();vol=atr/atr.shift(1).rolling(240).median();cadence=((offset+1)%minutes==0)&(offset>=minutes-1)&(offset<420)
  if family=='lit_noise':buy=(price>upper)&(price>twap);sell=(price<lower)&(price<twap)
  elif family=='lit_noise_regime':buy=(price>upper)&(price>twap)&(price>slow)&(vol>1);sell=(price<lower)&(price<twap)&(price<slow)&(vol>1)
  elif family=='lit_opening_impulse':
   box=f[(offset>=0)&(offset<30)].groupby(day[(offset>=0)&(offset<30)]).agg({'high':'max','low':'min','volume':'count'});box=box[box.volume==30];hi=pd.Series(day.map(box.high),index=time);lo=pd.Series(day.map(box.low),index=time);buy=(offset>=30)&(price>hi)&(price>twap)&(price>slow);sell=(offset>=30)&(price<lo)&(price<twap)&(price<slow)
  else:raise ValueError(family)
  valid=cadence&opening.notna()&atr.notna()&(time.to_series().diff().dt.total_seconds().rolling(30).max()==60)
  side=pd.Series(np.where(buy&valid,1,np.where(sell&valid,-1,0)),index=time);stop=pd.Series(np.where(side>=0,np.minimum(twap,f.low.rolling(5).min()-.1*atr),np.maximum(twap,f.high.rolling(5).max()+.1*atr)),index=time)
  sig=side.shift().fillna(0);sig[time.to_series().diff().dt.total_seconds()!=60]=0
  result=(np.ascontiguousarray(sig,dtype=np.int8),np.ascontiguousarray(atr.shift(),dtype=float),np.ascontiguousarray(stop.shift(),dtype=float));self.cache[key]=result;return result
if __name__=='__main__':
 grid=[dict(family=f,minutes=m,n=14,stop=s,rr=rr,hold=h,style=style) for f,m,s,rr,h,style in itertools.product(['lit_noise','lit_noise_regime','lit_opening_impulse'],[15,30],[2,4],[3,8],[120,360],[0,1,2])];protocol=dict(grid=grid,months=['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10'],unseen='2026-11 partial archive, do not load before freeze',selection='positive aggregate, positive >=4/6 months, worst DD<8, stress net positive, >=50 trades; choose one per distinct family; no claim all months positive',sourceNotes=['Adaptation of Concretum noise-area concept, not a SPY replication. FX/Gold quote count is not traded volume; TWAP replaces VWAP.','Fixed UTC session anchors differ from US equity session. All evaluated months now development.','Screened OHLC; native quotes required next.']);(OUT/'literature-protocol.json').write_text(json.dumps(protocol,indent=2));selected=[]
 for symbol in ['EURUSD','USDJPY','XAUUSD']:
  data=LiteratureData(symbol,protocol['months']);rows=[]
  for c in grid:
   cases=[simulate(data,c,m,stress=1.5) for m in protocol['months']];rows.append(dict(config=c,cases=cases))
  valid=[r for r in rows if sum(m['returnPct'] for m in r['cases'])>0 and sum(m['returnPct']>0 for m in r['cases'])>=4 and sum(m['closedTrades'] for m in r['cases'])>=50 and max(m['drawdownPct'] for m in r['cases'])<8 and not any(m['failed'] for m in r['cases'])];valid.sort(key=lambda r:sum(m['returnPct'] for m in r['cases'])/(1+max(m['drawdownPct'] for m in r['cases'])),reverse=True);picks=[]
  for r in valid:
   if any(p['config']['family']==r['config']['family'] for p in picks):continue
   picks.append(dict(symbol=symbol,**r))
   if len(picks)==2:break
  selected+=picks;dump(OUT/f'literature-{symbol}.json.gz',dict(protocol=protocol,manifests=data.manifests,results=rows,selected=picks));print('LITERATURE',symbol,[(p['config'],[round(m['returnPct'],2) for m in p['cases']]) for p in picks],flush=True)
 (OUT/'literature-frozen.json').write_text(json.dumps(dict(protocol=protocol,selected=selected),indent=2));print('FROZEN',len(selected),flush=True)
