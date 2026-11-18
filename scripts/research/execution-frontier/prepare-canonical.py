"""Aggregate only complete five-minute native quotes; preserve first-party provenance."""
import hashlib,json,pathlib
import pandas as pd
from features import Data,ROOT
out=ROOT/'.tmp/execution-frontier/canonical-data';out.mkdir(exist_ok=True)
for month in ['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11']:
 data=Data('XAUUSD',[month]);f=data.f.resample('5min',closed='left',label='left').agg({'open':'first','high':'max','low':'min','close':'last','volume':'sum','ask_open':'first','ask_high':'max','ask_low':'min','ask_close':'last'});counts=data.f.close.resample('5min').count();f=f[counts>0];rows=[]
 for at,b in f.iterrows():rows.append(dict(symbol='XAUUSD',timeframe='5m',open_time=at.isoformat().replace('+00:00','Z'),source='EXNESS_BROKER_BID_ASK',market_type='forex',**{k:float(v) for k,v in b.items()}))
 raw=json.dumps(rows,separators=(',',':')).encode();p=out/f'XAUUSD-5m-{month}.json';p.write_bytes(raw);manifest=dict(data.manifests[0],timeframe='5m',partialSessionBucketsRetainObservedQuotes=True,rows=len(rows),parentM1Sha256=data.manifests[0]['rowsSha256'],rowsSha256=hashlib.sha256(raw).hexdigest());p.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2))
print('COMPLETE')
