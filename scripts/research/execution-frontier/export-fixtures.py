"""Real closed-bar fixtures compare the shared evaluator with frozen screen decisions."""
import json
import numpy as np
import pandas as pd
from features import Data,ROOT
from study import OUT
x=Data('XAUUSD',['2026-05','2026-06']);sig,atr,structure=x.features('compression_expand',15,24);f=x.f.resample('15min',closed='left',label='right').agg({'open':'first','high':'max','low':'min','close':'last','volume':'sum','ask_open':'first','ask_high':'max','ask_low':'min','ask_close':'last'});counts=x.f.close.resample('15min',closed='left',label='right').count();f=f[counts==15];fixtures=[]
for i in range(110,len(f)-1):
 at=f.index[i];j=int(np.searchsorted(x.x[:,0],at.value//1000000))
 if j>=len(x.x) or x.x[j,0]!=at.value//1000000:continue
 side=int(sig[j]);active=6<=at.hour<20
 if not active:side=0
 if not side and len(fixtures)%7!=0:continue
 rows=[]
 for t,b in f.iloc[i-109:i+1].iterrows():rows.append(dict(symbol='XAUUSD',timeframe='15m',open_time=(t-pd.Timedelta(minutes=15)).isoformat().replace('+00:00','Z'),source='EXNESS_BROKER_BID_ASK',**{k:float(v) for k,v in b.items()}))
 fixtures.append(dict(at=at.isoformat(),side=side,atr=float(atr[j]),structure=float(structure[j]),rows=rows))
 if len(fixtures)>=80:break
assert any(f['side']!=0 for f in fixtures)
(OUT/'shared-fixtures.json').write_text(json.dumps(fixtures,separators=(',',':')));print(len(fixtures))
