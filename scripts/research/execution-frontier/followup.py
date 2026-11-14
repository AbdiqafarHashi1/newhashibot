"""Freeze survivors before reading later months. Gold later prices were seen in prior research."""
import json
from features import Data
from study import OUT,dump
from tick_verify import run
p=json.loads((OUT/'tick-protocol.json').read_text());arms=p['arms'];selected=p['selected'];protocol=dict(selected=selected,arms=arms,periods=['2026-08','2026-09','2026-10'],disclosure='Gold August–October prices were already examined for a different micro strategy. Later Gold results are robustness checks, not untouched holdout. EURUSD/USDJPY later periods were acquired after candidate freeze; no retuning. July survivor selection retained.');(OUT/'followup-protocol.json').write_text(json.dumps(protocol,indent=2));results=[]
for c in selected:
 data=Data(c['symbol'],['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']);periods=[]
 for month in protocol['periods']:
  r=run(data,c['config'],month,arms);periods.append(r);print('LATER',c['symbol'],month,[(x['arm']['profile'],round(x['returnPct'],3)) for x in r['results'] if x['arm']['capital']==25000 and x['arm']['stress']==1.5 and x['arm']['delayMs']==3000],flush=True)
 results.append(dict(candidate=c,results=periods,manifests=data.manifests));dump(OUT/'followup.partial.json.gz',results)
dump(OUT/'followup.json.gz',dict(protocol=protocol,results=results));print('COMPLETE',len(results),flush=True)
