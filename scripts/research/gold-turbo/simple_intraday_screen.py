"""Two fixed simple Gold scalp challengers; actual retained October bid/ask ticks.

Shared production entry-model functions; independent C++ execution screen, not
native runtime parity. No tuning loop; chronological halves are already-known
October development comparisons, not pristine unseen validation.
"""
import sys,importlib.util,gzip,json,hashlib
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
sys.path=[p for p in sys.path if Path(p).resolve()!=HERE]
sys.path.insert(0,str(ROOT/'mt5-agent'))
from gold_turbo.contracts import Candle
from gold_turbo.simple_intraday import MODELS,simple_intraday_signal,simple_atr
spec=importlib.util.spec_from_file_location('native',HERE/'native_gold_edge.py');n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
import numpy as np
import pandas as pd
OUT=ROOT/'docs/research/strategy-recovery-20261127'

class SimpleData(n.s.Data):
    def initialize_frame(self,f):
        super().initialize_frame(f)
        rows=[Candle('XAUUSD','EXNESS_OCTOBER',60000,int(at.value//1000000),float(r.open),float(r.high),float(r.low),float(r.close),int(r.volume),'BROKER_COMPLETED_BAR') for at,r in f.iterrows()]
        self.arrays={};self.counts={}
        for model in MODELS:
            sig=np.zeros(len(rows),dtype=np.int8);atr=np.full(len(rows),np.nan);level=atr.copy();ref=atr.copy()
            for i in range(15,len(rows)-1):
                b=rows[i]
                if b.end_ms!=rows[i+1].open_ms:continue
                prefix=rows[max(0,i-63):i+1];av=simple_atr(prefix)
                value=simple_intraday_signal(prefix,av,model,b.end_ms)
                if value is None:continue
                sig[i+1]=value.side;atr[i+1]=av;level[i+1]=value.stop;ref[i+1]=value.reference
            self.arrays[model]=tuple(np.ascontiguousarray(a) for a in (sig,atr,level,ref));self.counts[model]=int(np.count_nonzero(sig))
    def features(self,family,n):
        model,period=family.split(':');model=model.removesuffix('_PERSONAL_STANDARD');arrays=self.arrays[model];signal=arrays[0].copy()
        lo,hi={'whole':('2026-10-01','2026-11-01'),'earlier':('2026-10-01','2026-10-17'),'later':('2026-10-19','2026-11-01')}[period]
        signal[(self.t<pd.Timestamp(lo,tz='UTC').value//1000000)|(self.t>=pd.Timestamp(hi,tz='UTC').value//1000000)]=0
        return (signal,)+arrays[1:]

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    protocol=dict(models=list(MODELS),risk_pct=[.25,1],capital=[100,500,1000,25000],periods=['whole','earlier','later'],reward_r=1.5,hold_minutes={'SESSION_BREAKOUT':15,'SIMPLE_PULLBACK':10},entries='08:00–15:45 UTC; New York opening box 09:30–09:45 local, breaks before 10:30 local; simple impulse/pullback/reclaim independent model',guards='ATR-only model scaling; explicit cost/margin/volume/stop checks; no confirmation indicator stack',no_pristine_holdout=True,source='Retained October real bid/ask archive; no download',limits='Research qualification 1.5% daily / 8% peak, fixed per-arm sizing; no account/default changes',source_references=['https://www.sfi.ch/de/publications/n-24-98-a-profitable-day-trading-strategy-for-the-u.s.-equity-market','https://www.sfi.ch/en/publications/n-24-97-beat-the-market-an-effective-intraday-momentum-strategy-for-s-p500-etf-spy'],caveat='Published US equity concepts do not verify Gold profitability; these exact adaptations are new hypotheses.')
    (OUT/'simple-protocol.json').write_text(json.dumps(protocol,indent=2)+'\n')
    baseline=OUT/'simple-qualification-baseline.json.gz'
    if not baseline.exists() and (OUT/'simple-receipts.json.gz').exists():baseline.write_bytes((OUT/'simple-receipts.json.gz').read_bytes())
    policy=(ROOT/'supabase/functions/_shared/personal-growth-policy.ts').read_text()
    if 'STANDARD:{risk:1,open:6,correlated:3,daily:4,peak:18}' not in policy:raise ValueError('PERSONAL_STANDARD_POLICY_CHANGED')
    protocol['additional_personal_case']=dict(model='SESSION_BREAKOUT',risk_pct=1,daily_loss_pct=4,peak_loss_pct=18,reason='Separate the fixed entry rule from tight qualification guard effects, using existing Personal STANDARD limit values; fixed sizing, not dynamic House-Money. Not a new production risk profile.')
    (OUT/'simple-protocol.json').write_text(json.dumps(protocol,indent=2)+'\n')
    data=SimpleData(['2026-10']);n.s.tick_replay.library=lambda:n.s.library('native_gold_ticks.cpp');n.s.tick_replay.Replay=n.s.MarginReplay
    candidates=[dict(family=model+':'+period,n=20,stop=1.5,rr=1.5,hold=15 if model=='SESSION_BREAKOUT' else 10,style=0,session=0,mode=0) for model in MODELS for period in protocol['periods']]
    arms=[dict(candidate=i,family=c['family'],risk=risk,leverage=100,commission=3.5,slip=.05 if stress else .02,delayMs=500 if stress else 200,manageMs=500 if stress else 200,sampleMs=200,capital=cap,stress=stress) for i,c in enumerate(candidates) for risk in protocol['risk_pct'] for cap in protocol['capital'] for stress in (False,True)]
    for period in protocol['periods']:
        i=len(candidates);family='SESSION_BREAKOUT_PERSONAL_STANDARD:'+period
        candidates.append(dict(family=family,n=20,stop=1.5,rr=1.5,hold=15,style=0,session=1,mode=0))
        arms.extend(dict(candidate=i,family=family,risk=1,leverage=100,commission=3.5,slip=.05 if stress else .02,delayMs=500 if stress else 200,manageMs=500 if stress else 200,sampleMs=200,capital=cap,stress=stress) for cap in protocol['capital'] for stress in (False,True))
    result=n.s.tick_replay.run_month(data,'2026-10',candidates,arms)
    if baseline.exists():
        old=json.loads(gzip.decompress(baseline.read_bytes()))['result']['results']
        if result['results'][:len(old)]!=old:raise ValueError('QUALIFICATION_BASELINE_CHANGED')
    for r in result['results']:
        if abs(sum(t[6] for t in r['trades'])+r['arm']['capital']-r['endingBalance'])>1e-6:raise ValueError('CASH_AUDIT')
    payload=dict(protocol=protocol,entry_module_sha256=hashlib.sha256((ROOT/'mt5-agent/gold_turbo/simple_intraday.py').read_bytes()).hexdigest(),execution_module_sha256=hashlib.sha256((HERE/'native_gold_ticks.cpp').read_bytes()).hexdigest(),source_manifest=data.manifests[0],candidate_counts=data.counts,result=result)
    (OUT/'simple-receipts.json.gz').write_bytes(gzip.compress(json.dumps(payload,separators=(',',':'),allow_nan=False).encode(),mtime=0))
    payload['result']['results']=[{k:v for k,v in r.items() if k!='trades'} for r in result['results']]
    (OUT/'simple-summary.json').write_text(json.dumps(payload,indent=2,allow_nan=False)+'\n')
    for r in result['results']:
        if r['arm']['capital']==25000 and not r['arm']['stress']:print(r['arm']['family'],r['arm']['risk'],round(r['returnPct'],2),round(r['drawdownPct'],2),r['closedTrades'],r['profitFactor'])

if __name__=='__main__':main()
