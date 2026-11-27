"""Fixed higher-risk Personal scenarios of unchanged existing Gold rules."""
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent;sys.path=[p for p in sys.path if Path(p).resolve()!=HERE]
import importlib.util,gzip,json,hashlib
spec=importlib.util.spec_from_file_location('native',HERE/'native_gold_edge.py');n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
ROOT=n.ROOT;OUT=ROOT/'docs/research/personal-edge-20261127'


def main():
    data=n.NativeData(['2026-10']);data.native=json.loads((ROOT/'.tmp/gold-simple/native-signals.json').read_text())
    n.s.tick_replay.library=lambda:n.s.library('personal_gold_ticks.cpp');n.s.tick_replay.Replay=n.s.MarginReplay
    candidates=[]
    for row in data.native:
        c=row['configuration'];candidates.append(dict(family=row['strategy_id'],n=c['n'],stop=c['stop'],rr=c['rr'],hold=c.get('hold',c['n']*4)*c['minutes'],style=0,session=2,mode=0))
    arms=[dict(candidate=i,strategy_id=c['family'],risk=risk,leverage=100,commission=3.5,slip=.05 if stress else .02,delayMs=500 if stress else 200,manageMs=500 if stress else 200,sampleMs=200,capital=cap,stress=stress) for i,c in enumerate(candidates) for risk in (1,2,3,5) for cap in (100,500,1000,25000) for stress in (False,True)]
    result=n.s.tick_replay.run_month(data,'2026-10',candidates,arms)
    for row in result['results']:
        row['commission_money']=row.pop('costs');row['net_after_full_100_subscription_before_financing']=row['endingBalance']-row['arm']['capital']-100
        wins=[t[6] for t in row['trades'] if t[6]>0];losses=[t[6] for t in row['trades'] if t[6]<0]
        row['average_win_money']=sum(wins)/len(wins) if wins else None;row['average_loss_money']=sum(losses)/len(losses) if losses else None
        if abs(sum(t[6] for t in row['trades'])-row['endingBalance']+row['arm']['capital'])>1e-6:raise ValueError('CASH_RECONCILIATION')
    payload=dict(schema='personal-fixed-risk-native-gold/v1',engine_sha256=hashlib.sha256((HERE/'personal_gold_ticks.cpp').read_bytes()).hexdigest(),risk_only_comparison=dict(risk_pct=[1,2,3,5],daily_pct=15,peak_pct=60,entry_margin_pct=50,leverage=100),source_manifest=data.manifests[0],result=result,limitations=['Personal experimental screen only; no Prop, account/default or production policy changes','Higher loss allowances can produce severe losses; modeled survival is not a future probability','These are existing Standard intraday/swing rules, not newly profitable Turbo scalps','One known October month, parameters not optimized; no independent future qualification','Current scenarios omit unverified overnight financing/news and full House-Money dynamic risk','All configurations are separate accounts; do not add returns','Same limits across 1/2/3/5% isolate sizing under this explicit experimental risk policy; they differ from previous conservative/Standard scenarios'])
    raw=json.dumps(payload,separators=(',',':'),allow_nan=False).encode();(OUT/'personal-gold-receipts.json.gz').write_bytes(gzip.compress(raw,mtime=0))
    compact={**payload,'result':{**result,'results':[{k:v for k,v in r.items() if k!='trades'} for r in result['results']]}}
    (OUT/'personal-gold-summary.json').write_text(json.dumps(compact,indent=2,allow_nan=False)+'\n')
    for r in result['results']:
        if r['arm']['capital'] in (500,25000) and not r['arm']['stress']:print(r['arm']['strategy_id'],r['arm']['capital'],r['arm']['risk'],round(r['returnPct'],2),round(r['drawdownPct'],2),r['closedTrades'])

if __name__=='__main__':main()
