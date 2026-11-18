"""Freeze from development results, then read the October holdout exactly once."""
import hashlib,json,pathlib,tarfile
from features import Data,ROOT
from tick_replay import run_month
root=ROOT/'.tmp/gold-micro';s=json.loads((root/'ticks-model2.json').read_text());candidates=[s['candidates'][2]];assert candidates[0]['family']=='watch_aligned_resume'
# Choice made solely from August/September. No changes based on October outcomes.
arms=[]
for profile,risk,lev in [('PERSONAL',.5,10),('PROP',.25,5)]:
 for case,comm,slip,delay,sample in [('NORMAL_TICKS',3.5,.02,1000,0),('LOCAL_1S',3.5,.02,1000,1000),('STANDARD_1S',5.25,.05,3000,1000),('CLOUD15_1S',5.25,.05,15000,1000),('ADVERSE_1S',5.25,.15,3000,1000),('FEED30S',5.25,.05,3000,30000)]:arms.append(dict(candidate=0,profile=profile,case=case,risk=risk,leverage=lev,commission=comm,slip=slip,delayMs=delay,manageMs=1000,capital=25000,sampleMs=sample))
for capital in [500,1000,5000]:arms.append(dict(candidate=0,profile='PERSONAL',case='SMALL_CAPITAL',risk=.5,leverage=10,commission=5.25,slip=.05,delayMs=3000,manageMs=1000,capital=capital,sampleMs=1000))
h=hashlib.sha256()
for name in ['features.py','ticks.cpp','tick_replay.py','holdout.py']:h.update(name.encode());h.update(pathlib.Path(__file__).with_name(name).read_bytes())
frozen=dict(schema='gold-micro-frozen-holdout/v1',sourceSha256=h.hexdigest(),selectionPeriod=['2026-08','2026-09'],holdoutPeriod='2026-10',candidates=candidates,arms=arms,decisionRule='Only the M15-aligned candidate remained positive in both development months across NORMAL, STANDARD and CLOUD15 execution cases. Its parameters are not retuned on October. Quote delay models time to a revalidated submission quote; an additional adverse fill reserve models unknown broker execution. Not actual broker fills.');(root/'frozen-holdout.json').write_text(json.dumps(frozen,indent=2))
with tarfile.open(root/'holdout-source.tar.gz','w:gz') as t:
 for name in ['features.py','ticks.cpp','tick_replay.py','holdout.py']:t.add(pathlib.Path(__file__).with_name(name),arcname='scripts/research/gold-micro/'+name)
data=Data(['2026-08','2026-09','2026-10']);results=[]
for month in ['2026-08','2026-09','2026-10']:
 results.append(run_month(data,month,candidates,arms));print('COMPLETE',month,flush=True);(root/'holdout.partial.json').write_text(json.dumps(dict(schema='gold-micro-holdout/v1',frozen=frozen,results=results,manifests=data.manifests)))
(root/'holdout.json').write_text(json.dumps(dict(schema='gold-micro-holdout/v1',frozen=frozen,results=results,manifests=data.manifests)));print('DONE',len(arms),flush=True)
