"""Rebuild native quote candles, retaining observed partial session-edge buckets."""
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path=[p for p in sys.path if Path(p).resolve()!=HERE]
import hashlib,json
import pandas as pd
ROOT=HERE.parents[2]


def aggregate(f,minutes):
    g=f.resample(f'{minutes}min').agg(dict(open='first',high='max',low='min',close='last',volume='sum',ask_open='first',ask_high='max',ask_low='min',ask_close='last'))
    n=f.close.resample(f'{minutes}min').count()
    # Closed bars are defined by time buckets, not by a requirement that the
    # venue emit at least one quote in every minute. Never create empty buckets.
    g=g[n>0]
    rows=[dict(symbol='XAUUSD',market_type='forex',timeframe='1h' if minutes==60 else '15m',open_time=at.isoformat(),source='EXNESS_BROKER_BID_ASK',**{k:float(v) for k,v in r.items()}) for at,r in g.iterrows()]
    return rows,dict(observed_buckets=len(g),buckets_with_fewer_than_m_M1_rows=int(((n>0)&(n<minutes)).sum()),policy='Actual quote aggregation, no empty buckets or invented quotes; production calendar continuity validation remains active')


def main():
    p=ROOT/'.tmp/gold-micro/data/XAUUSD-1m-2026-10.json';raw=p.read_bytes();manifest=json.loads(p.with_suffix('.manifest.json').read_text())
    if hashlib.sha256(raw).hexdigest()!=manifest['rowsSha256']:raise ValueError('M1_SOURCE_CHANGED')
    f=pd.DataFrame(json.loads(raw));f.index=pd.to_datetime(f.open_time,utc=True)
    out={};quality={}
    for m in (15,60):out[str(m)],quality[str(m)]=aggregate(f,m)
    target=ROOT/'.tmp/gold-simple/native-bars.json';target.parent.mkdir(parents=True,exist_ok=True);payload=json.dumps(out,separators=(',',':')).encode();target.write_bytes(payload)
    quality['normalized_bars_sha256']=hashlib.sha256(payload).hexdigest()
    (ROOT/'docs/research/edge-evidence-20261127/native-aggregation-quality.json').write_text(json.dumps(quality,indent=2)+'\n')

if __name__=='__main__':main()
