"""Sequential family selection. All periods and selection rules retained before evaluation."""
import argparse,json,pathlib,hashlib,gc
import search
p=argparse.ArgumentParser();p.add_argument('--data',default='.tmp/mission2/futures-data');p.add_argument('--out',default='.tmp/launch-research');a=p.parse_args();folder=pathlib.Path(a.out);folder.mkdir(parents=True,exist_ok=True);datafolder=pathlib.Path(a.data);run=search.engine()
def save(name,value):(folder/name).write_text(json.dumps(value,separators=(',',':')))
devpath=folder/'development.json';dev=json.loads(devpath.read_text());selected=[]
for family in search.FAMILIES:
 candidates=[r for r in dev['results'] if r['configuration']['family']==family and not r['metrics']['accountFailed'] and r['metrics']['closedTrades']>=10 and r['metrics']['equityReturnPct']>0];selected.extend(candidates[:6])
manifest={'sourceSha256':hashlib.sha256(devpath.read_bytes()).hexdigest(),'selection':'Top six positive development candidates per family, >=10 closes','period':['2025-03-01','2025-05-01'],'candidates':[r['configuration'] for r in selected]};save('validation.frozen.json',manifest)
data=search.Data(datafolder,[f'2025-{m:02}' for m in range(1,5)]);validation=[]
for r in selected:validation.append({'configuration':r['configuration'],'development':r['metrics'],'validation':search.simulate(data,r['configuration'],'2025-03-01','2025-05-01',run)})
validation.sort(key=lambda r:(not r['validation']['accountFailed'],min(r['validation']['monthly'].values()),r['validation']['equityReturnPct']/max(2,r['validation']['maximumDrawdownPct'])),reverse=True);save('validation.json',{'selection':manifest,'results':validation});del data;gc.collect();short=[];counts={}
for r in validation:
 c=r['configuration'];m=r['validation'];family=c['family']
 if m['equityReturnPct']>0 and not m['accountFailed'] and m['closedTrades']>=20 and counts.get(family,0)<2:short.append(c);counts[family]=counts.get(family,0)+1
freeze={'selection':'First two per family in frozen validation ranking with positive return, >=20 closes','candidates':short,'periods':[['2025-05-01','2025-09-01'],['2026-08-01','2026-11-01']]};save('holdout.frozen.json',freeze);holdout=[]
for months,start,end in [([f'2025-{m:02}' for m in range(1,9)],'2025-05-01','2025-09-01'),([f'2026-{m:02}' for m in range(7,11)],'2026-08-01','2026-11-01')]:
 data=search.Data(datafolder,months)
 for cfg in short:holdout.append({'configuration':cfg,'period':[start,end],'metrics':search.simulate(data,cfg,start,end,run)})
 del data;gc.collect()
save('holdout.json',{'selection':freeze,'results':holdout,'automaticPromotion':False});robust=[]
for c in short:
 rows=[r['metrics'] for r in holdout if r['configuration']==c]
 if len(rows)==2 and all(r['equityReturnPct']>0 and (r['profitFactor'] or 0)>1 and not r['accountFailed'] for r in rows):robust.append(c)
save('risk-matrix.frozen.json',{'candidates':robust,'risks':[.25,.5,1,2],'leverage':[1,3,5,10],'selection':'Exploratory reuse of later periods; not a new independent holdout'});matrix=[]
for months,start,end in [([f'2025-{m:02}' for m in range(1,9)],'2025-05-01','2025-09-01'),([f'2026-{m:02}' for m in range(7,11)],'2026-08-01','2026-11-01')]:
 data=search.Data(datafolder,months)
 for c in robust:
  for risk in [.25,.5,1,2]:
   for leverage in [1,3,5,10]:matrix.append({'configuration':c,'period':[start,end],'metrics':search.simulate(data,c,start,end,run,risk=risk,leverage=leverage)})
 del data;gc.collect()
save('risk-matrix.json',{'results':matrix,'automaticPromotion':False});summary={'developmentCount':len(dev['results']),'validationCount':len(validation),'validationPositive':sum(r['validation']['equityReturnPct']>0 for r in validation),'laterCount':len(short),'survivors':robust,'laterResults':holdout,'targets':{'monthlyMinimumPct':5,'monthlyMediumPct':10,'experimentalMonthlyPct':[10,50]},'classification':'RESEARCH_ACCOUNT_SCREEN_NOT_SCANNER_QUALIFICATION','automaticPromotion':False};save('summary.json',summary);print('LAUNCH_RESEARCH_SUMMARY '+json.dumps(summary),flush=True)
