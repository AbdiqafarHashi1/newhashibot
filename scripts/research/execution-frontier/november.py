"""First examination of the partial November archive, after all candidate freezes."""
import hashlib,json,pathlib
from features import Data
from literature import LiteratureData
from literature_native import setup
from study import OUT,dump
import tick_verify as t
arms=json.loads((OUT/'tick-protocol.json').read_text())['arms'];groups=[('original','ticks.cpp',Data,json.loads((OUT/'tick-protocol.json').read_text())['selected']),('literature','literature-ticks.cpp',LiteratureData,json.loads((OUT/'literature-frozen.json').read_text())['selected']),('swing','swing-ticks.cpp',Data,json.loads((OUT/'swing-frozen.json').read_text())['selected'])];frozen=dict(groups=[dict(stage=g[0],source=g[1],sourceSha256=hashlib.sha256(pathlib.Path(__file__).with_name(g[1]).read_bytes()).hexdigest(),selected=g[3]) for g in groups],arms=arms,period='2026-11 PARTIAL',disclosure='No full-month projection. All strategy parameters were fixed before acquiring November. Original survivor selection used July; literature and swing selection used May–October. Results are correlated tests of six finalists. Broker reference quotes and hypothetical costs, not actual customer fills.');(OUT/'november-protocol.json').write_text(json.dumps(frozen,indent=2));results=[]
for stage,source,cls,selected in groups:
 setup(source)
 for c in selected:
  data=cls(c['symbol'],['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11']);r=t.run(data,c['config'],'2026-11',arms);results.append(dict(stage=stage,candidate=c,results=[r],manifest=data.manifests[-1]));print('NOVEMBER',stage,c['symbol'],c['config'],[(x['arm']['profile'],round(x['returnPct'],3),x['closedTrades']) for x in r['results'] if x['arm']['capital']==25000 and x['arm']['stress']==1.5 and x['arm']['delayMs']==3000],flush=True);dump(OUT/'november.partial.json.gz',dict(protocol=frozen,results=results))
dump(OUT/'november.json.gz',dict(protocol=frozen,results=results));print('COMPLETE',len(results),flush=True)
