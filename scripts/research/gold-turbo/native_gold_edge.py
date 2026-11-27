"""Frozen EXISTING Gold Standard entries through production evaluator + real ticks.

Distinct from Turbo: existing 15m/1h rules retain their original holding limits.
"""
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path=[p for p in sys.path if Path(p).resolve()!=HERE]
import importlib.util
spec=importlib.util.spec_from_file_location('simple_edge',HERE/'simple_edge.py');s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
import json,gzip,hashlib
import numpy as np
import pandas as pd
ROOT=s.ROOT


class NativeData(s.Data):
    def features(self,family,n):
        if family not in self.cache:
            source=next(x for x in self.native if x['strategy_id']==family)
            signal=np.zeros(len(self.t),dtype=np.int8);atr=np.full(len(self.t),np.nan);stop=atr.copy();ref=atr.copy()
            for c in source['candidates']:
                at=pd.Timestamp(c['at']).value//1000000;j=int(np.searchsorted(self.t,at))
                if j>=len(self.t) or self.t[j]!=at:continue
                if any(not np.isfinite(float(c[k])) for k in ('atr','stop','reference','target')):raise ValueError('INVALID_NATIVE_GEOMETRY')
                side=c['side'];expected=c['reference']+side*abs(c['reference']-c['stop'])*source['configuration']['rr']
                if abs(expected-c['target'])>1e-7:raise ValueError('TARGET_DIFFERS_FROM_PRODUCTION')
                signal[j]=side;atr[j]=c['atr'];stop[j]=c['stop'];ref[j]=c['reference']
            self.cache[family]=(np.ascontiguousarray(signal),np.ascontiguousarray(atr),np.ascontiguousarray(stop),np.ascontiguousarray(ref))
        return self.cache[family]


def main():
    data=NativeData(['2026-10']);data.native=json.loads((ROOT/'.tmp/gold-simple/native-signals.json').read_text())
    if not any(row['candidates'] for row in data.native):raise RuntimeError('NO_PRODUCTION_CANDIDATES: verify source aggregation/history before interpreting performance')
    s.tick_replay.library=lambda:s.library('native_gold_ticks.cpp');s.tick_replay.Replay=s.MarginReplay
    candidates=[]
    # Isolated fixed-risk scenarios. STANDARD limit values are read from the
    # existing policy snapshot below, not selected by return. House-Money risk
    # changes are NOT claimed to be simulated.
    profiles=[('QUALIFICATION_025',.25,1.5,8),('RESTRICTED_1',1.,1.5,8),('STANDARD_LIMITS_FIXED_1',1.,4,18)]
    policy=(ROOT/'supabase/functions/_shared/personal-growth-policy.ts').read_text()
    if 'STANDARD:{risk:1,open:6,correlated:3,daily:4,peak:18}' not in policy:raise ValueError('STANDARD_POLICY_CHANGED_REVIEW_REQUIRED')
    for row in data.native:
        c=row['configuration']
        for name,risk,daily,peak in profiles:
            candidates.append(dict(family=row['strategy_id'],profile=name,risk=risk,daily=daily,peak=peak,n=c['n'],stop=c['stop'],rr=c['rr'],hold=c.get('hold',c['n']*4)*c['minutes'],style=0,session=1 if daily==4 else 0,mode=0))
    arms=[]
    for i,c in enumerate(candidates):
        for capital in (100,500,1000,25000):
            for stress in (False,True):arms.append(dict(candidate=i,strategy_id=c['family'],profile=c['profile'],risk=c['risk'],daily_loss_pct=c['daily'],peak_loss_pct=c['peak'],leverage=100,commission=3.5,slip=.05 if stress else .02,delayMs=500 if stress else 200,manageMs=500 if stress else 200,sampleMs=200,capital=capital,stress=stress))
    result=s.tick_replay.run_month(data,'2026-10',candidates,arms)
    for row in result['results']:
        row['commissionMoney']=row.pop('costs')
        row['netProfitBeforeFinancingAfter100UsdMonthlyFee']=row['endingBalance']-row['arm']['capital']-100
        row['financingExposureLotDays']=sum(t[5]*(t[1]-t[0])/86400000 for t in row['trades'])
        row['breakEvenContinuousFinancingUsdPerLotDayAfterSubscription']=row['netProfitBeforeFinancingAfter100UsdMonthlyFee']/row['financingExposureLotDays'] if row['financingExposureLotDays'] else None
        if abs(row['endingBalance']-row['arm']['capital']-sum(t[6] for t in row['trades']))>1e-6:raise ValueError('CASH_RECEIPTS_DO_NOT_RECONCILE')
    payload=dict(schema='existing-gold-native-entry-tick-screen/v1',classification='NEW_PRODUCTION_ENTRY_SCREEN_ON_REAL_QUOTES_NOT_PRODUCTION_EXECUTION',selection='Exactly three existing frozen broker-family configurations, no parameter sweep or result-based change',source_manifest=data.manifests[0],aggregation_quality=json.loads((ROOT/'docs/research/edge-evidence-20261127/native-aggregation-quality.json').read_text()),evaluated_bundle_sha256=hashlib.sha256((ROOT/'.tmp/gold-simple/native-signals.mjs').read_bytes()).hexdigest(),production_entry_sha256=hashlib.sha256((ROOT/'supabase/functions/_shared/broker-strategy-families.ts').read_bytes()).hexdigest(),engine_sha256=hashlib.sha256((HERE/'native_gold_ticks.cpp').read_bytes()).hexdigest(),source_decisions=data.native,result=result,assumptions=dict(contract_size=100,volume_min=.01,volume_step=.01,max_margin_pct=20,loss_limits='Explicit per-arm: 1.5/8 qualification and 4/18 existing STANDARD-limit scenario',leverage=100,account_currency='USD',swap_per_lot_per_day=0),limitations=['Original Standard 15m/1h holding limits are retained; these are not newly successful Turbo scalp strategies','October had been viewed for other research; no pristine out-of-sample claim','STANDARD_LIMITS_FIXED_1 uses repository daily/peak values but fixed 1% risk, not the full dynamic House-Money policy; no live/default risk configuration is changed','One-position execution screen per configuration; account arbitration/partial exits/recovery are not production-loop validated here','Full frozen TP target, stop-first on tick crossings, actual-quote gaps, delayed market exits; native broker stop/limit distances are scenario assumptions','Financing is unavailable: zero-swap scenario, especially material for overnight Standard positions; this cannot qualify net profitability after actual financing','No retained historical news calendar; explicit clear-news scenario','One full month cannot establish median monthly return or survival probability','Fees are illustrative $100 for one calendar month; no paid/live activation'])
    out=ROOT/'docs/research/edge-evidence-20261127';raw=json.dumps(payload,separators=(',',':'),allow_nan=False).encode();(out/'native-gold-receipts.json.gz').write_bytes(gzip.compress(raw,mtime=0))
    compact={**payload,'source_decisions':[{k:v for k,v in r.items() if k!='candidates'}|{'candidate_count':len(r['candidates'])} for r in data.native],'result':{**result,'results':[{k:v for k,v in r.items() if k!='trades'} for r in result['results']]}}
    (out/'native-gold-summary.json').write_text(json.dumps(compact,indent=2,allow_nan=False)+'\n')
    for row in result['results']:
        if row['arm']['capital']==25000:print(row['arm']['strategy_id'],row['arm']['profile'],row['arm']['stress'],round(row['returnPct'],3),row['closedTrades'],row['profitFactor'],row['meanHoldMinutes'])

if __name__=='__main__':main()
