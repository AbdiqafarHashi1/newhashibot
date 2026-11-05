"""Bounded predeclared chronological experiments. Separate subprocesses share no account state.
The canonical runner still arbitrates the entire ten-symbol universe within each experiment.
"""
import argparse,concurrent.futures,json,pathlib,subprocess,datetime
p=argparse.ArgumentParser();p.add_argument('--out',default='.tmp/mission2/campaign');p.add_argument('--workers',type=int,default=4);p.add_argument('--entry',choices=['COMBINED','IMMEDIATE_ONLY','CONDITIONAL_ONLY'],default='COMBINED');p.add_argument('--variant',choices=['both','baseline','net-rr-candidate'],default='both');a=p.parse_args()
if not 1<=a.workers<=6:raise ValueError('Bounded experiment concurrency 1..6')
root=pathlib.Path(a.out);root.mkdir(parents=True,exist_ok=True)
symbols='BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,ADAUSDT,DOGEUSDT,LINKUSDT,AVAXUSDT,LTCUSDT'
specs=[]
for name,month,start,end,folder in [('validation','2025-02','2025-02-17','2025-02-24','.tmp/mission2/data'),('confirmation','2025-03','2025-03-17','2025-03-24','.tmp/mission2/data'),('reserved-holdout','2026-10','2026-10-20','2026-10-27','.tmp/mission2/holdout-data')]:
 for variant in (['baseline','net-rr-candidate'] if a.variant=='both' else [a.variant]):
  specs.append(dict(id=name+'-'+variant,month=month,start=start,end=end,data=folder,variant=variant,partition=name.upper()))
(root/'manifest.json').write_text(json.dumps({'schema':'mission2-campaign/v1','hypothesis':'docs/research/mission2/EXPERIMENT_20261105.json','experiments':specs,'holdoutPolicy':'No further tuning after reserved-holdout inspection','resultsMayBeNegative':True,'entryPolicy':a.entry,'chronologicalWindowsPreviouslyExposed':True},indent=2))
def run(s):
 out=root/(s['id']+'.json');log=root/(s['id']+'.log')
 cmd=['node','--import','tsx','scripts/research/run-frequency-audit.ts','symbols='+symbols,'months='+s['month'],'start='+s['start']+'T00:00:00Z','end='+s['end']+'T00:00:00Z','data='+s['data'],'partition='+s['partition'],'out='+str(out),'entry='+a.entry]
 if s['variant']!='baseline':cmd.append('microTp2=2.4')
 with log.open('w') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
 result={'id':s['id'],'exitCode':r.returncode,'output':str(out),'log':str(log),'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()};(root/(s['id']+'.status.json')).write_text(json.dumps(result));print(json.dumps(result),flush=True);return result
with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:results=list(pool.map(run,specs))
(root/'status.json').write_text(json.dumps(results,indent=2));raise SystemExit(1 if any(r['exitCode'] for r in results) else 0)
