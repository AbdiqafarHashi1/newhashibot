"""Causal closed-M1 price-action features for an offline-fitted local model.

No future bars, account access, broker orders or indicator-confirmation voting.
Quote counts describe observed quote activity, not exchange trading volume.
"""
from datetime import datetime,timezone
import math
FEATURE_NAMES=('body_atr','range_atr','wick_imbalance','return_3','return_5','return_15','distance_high_20','distance_low_20','fast_slow_gap','distance_fast','volatility_ratio','quote_activity','spread_atr','hour_sin','hour_cos')

def context_features(rows,spread,now_ms):
    if len(rows)<32 or not math.isfinite(spread) or spread<0:return None
    tail=rows[-32:]
    if tail[-1].end_ms>now_ms or now_ms-tail[-1].end_ms>5000:return None
    if any(a.end_ms!=b.open_ms or a.timeframe_ms!=60000 or b.timeframe_ms!=60000 for a,b in zip(tail,tail[1:])):return None
    tr=[max(b.high-b.low,abs(b.high-a.close),abs(b.low-a.close)) for a,b in zip(tail,tail[1:])]
    atr=sum(tr[-14:])/14;long_atr=sum(tr)/len(tr)
    if atr<=0 or long_atr<=0:return None
    b=tail[-1];closes=[r.close for r in tail];fast=sum(closes[-5:])/5;slow=sum(closes[-20:])/20
    lower=min(b.open,b.close)-b.low;upper=b.high-max(b.open,b.close)
    activity=sum(r.quote_count for r in tail[-20:])/20
    at=datetime.fromtimestamp(b.end_ms/1000,timezone.utc);hour=at.hour+at.minute/60
    values=[(b.close-b.open)/atr,(b.high-b.low)/atr,(lower-upper)/atr,*[(b.close-closes[-1-k])/atr for k in (3,5,15)],(b.close-max(r.high for r in tail[-20:]))/atr,(b.close-min(r.low for r in tail[-20:]))/atr,(fast-slow)/atr,(b.close-fast)/atr,atr/long_atr,b.quote_count/activity-1 if activity else 0,spread/atr,math.sin(hour*math.pi/12),math.cos(hour*math.pi/12)]
    if not all(math.isfinite(v) for v in values):return None
    return tuple(values),atr
