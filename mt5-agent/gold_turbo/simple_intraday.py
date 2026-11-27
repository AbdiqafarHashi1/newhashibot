"""Two frozen price-action challengers. Published concepts, unverified Gold edge.

Shared by local Momentum evaluation and historical entry screening. No account
access, indicators beyond supplied ATR, parameter search or developing OHLC.
"""
from dataclasses import dataclass
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
import math

MODELS=('SESSION_BREAKOUT','SIMPLE_PULLBACK')
def simple_atr(rows):
    if len(rows)<15:return None
    tail=rows[-15:]
    return sum(max(b.high-b.low,abs(b.high-a.close),abs(b.low-a.close)) for a,b in zip(tail,tail[1:]))/14
@dataclass(frozen=True)
class IntradaySignal:
    side:int
    model:str
    anchor:int
    reference:float
    stop:float
    target:float
    maximum_hold_ms:int

def simple_intraday_signal(rows,atr,model,now_ms):
    if model not in MODELS:raise ValueError('UNKNOWN_SIMPLE_INTRADAY_MODEL')
    if not math.isfinite(atr) or atr<=0 or len(rows)<3:return None
    b=rows[-1]
    if b.end_ms>now_ms or now_ms-b.end_ms>5000:return None
    if any(r.end_ms>now_ms for r in rows):raise ValueError('FUTURE_COMPLETED_CANDLE')
    rows=rows[-64:]
    if any(a.end_ms!=c.open_ms for a,c in zip(rows,rows[1:])):return None
    if b.high-b.low>3*atr:return None
    utc=datetime.fromtimestamp(b.end_ms/1000,timezone.utc)
    if not 8*60<=utc.hour*60+utc.minute<=15*60+45:return None
    side=0;anchor=b.open_ms
    if model=='SESSION_BREAKOUT':
        local=datetime.fromtimestamp(b.end_ms/1000,timezone.utc).astimezone(ZoneInfo('America/New_York'))
        if not 9*60+45<local.hour*60+local.minute<10*60+30:return None
        start=int(local.replace(hour=9,minute=30,second=0,microsecond=0).timestamp()*1000)
        box=[r for r in rows if start<=r.open_ms<start+900000]
        if len(box)!=15 or box[0].open_ms!=start or box[-1].end_ms!=start+900000:return None
        hi=max(r.high for r in box);lo=min(r.low for r in box);previous=rows[-2]
        if not 1<= (hi-lo)/atr <=8:return None
        if previous.close<=hi and b.close>hi+.02*atr and b.close>b.open:
            side=1;stop=max((hi+lo)/2,min(previous.low,b.low))-.05*atr
        elif previous.close>=lo and b.close<lo-.02*atr and b.close<b.open:
            side=-1;stop=min((hi+lo)/2,max(previous.high,b.high))+.05*atr
        anchor=start
    else:
        impulse,pullback,reclaim=rows[-3:]
        direction=1 if impulse.close>impulse.open else -1
        body=direction*(impulse.close-impulse.open)
        if body<.8*atr:return None
        midpoint=(impulse.open+impulse.close)/2
        if direction==1 and pullback.low<impulse.close and pullback.close>=midpoint and reclaim.close>pullback.high+.02*atr:
            side=1;stop=pullback.low-.05*atr
        elif direction==-1 and pullback.high>impulse.close and pullback.close<=midpoint and reclaim.close<pullback.low-.02*atr:
            side=-1;stop=pullback.high+.05*atr
        anchor=impulse.open_ms
    if not side:return None
    distance=side*(b.close-stop)
    if not .35*atr<=distance<=3*atr:return None
    return IntradaySignal(side,model,anchor,b.close,stop,b.close+side*1.5*distance,900000 if model=='SESSION_BREAKOUT' else 600000)
