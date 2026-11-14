"""Censor-aware target counts, actual denominators and complete research evidence."""
import gzip,hashlib,json,pathlib,shutil,tarfile
from run import ROOT,OUT
DEST=ROOT/'docs/research/prop-objective-frontier-20261114';DEST.mkdir(parents=True,exist_ok=True)
def read(n):return json.load(gzip.open(OUT/n))
def ratio(n,d):return dict(hits=n,starts=d,pct=n/d*100 if d else None)
def summarize(rows,kind):
 n=len(rows)
 if kind=='CHALLENGE':
  hit=lambda r:r['passesWithin30Days']
  resolved=lambda r:hit(r) or r['full30DaysObserved'] or (r['failed'] and any(e[1]==9 and e[0]<=r['scenario']['start']+30*86400000 for e in r['events']))
  days=[(r['fundedAt']-r['scenario']['start'])/86400000 for r in rows if hit(r)]
  return dict(within30Days=ratio(sum(hit(r) for r in rows),n),censored=sum(not resolved(r) for r in rows),everFunded=sum(r['fundedAt'] is not None for r in rows),failed=sum(r['failed'] for r in rows),fastestDays=min(days) if days else None,slowestSuccessfulDays=max(days) if days else None)
 days=14 if rows[0]['scenario']['fundedTarget']==2 else 30
 eligible=lambda r:bool(r['financialTargetAt'] and r['plannedRequestAt'] and r['plannedRequestAt']<=r['observedUntil'])
 eligible_on_time=lambda r:eligible(r) and r['plannedRequestAt']-r['firstFundedTrade']<=days*86400000
 financial=lambda r:r['targetWithinGoalHorizon']
 resolved=lambda r:financial(r) or r['failed'] or bool(r['firstFundedTrade'] and r['observedUntil']>=r['firstFundedTrade']+days*86400000)
 return dict(financialTargetWithinHorizon=ratio(sum(financial(r) for r in rows),n),earliestRequestEligibleWithinHorizon=ratio(sum(eligible_on_time(r) for r in rows),n),everFinancialTarget=sum(r['financialTargetAt'] is not None for r in rows),everEarliestRequestEligible=sum(eligible(r) for r in rows),observedQuoteClockRequestEvents=sum(r['requestQualifiedAt'] is not None for r in rows),censored=sum(not resolved(r) for r in rows),failed=sum(r['failed'] for r in rows),worstDrawdownPct=max(r['worstPhasePeakDrawdownPct'] for r in rows))
source=read('results-expanded.json.gz');groups=[]
keys=sorted(set((r['scenario']['initial'],r['scenario']['guard'],r['scenario']['risk'],r['scenario']['challengeTarget'],r['scenario']['fundedTarget']) for r in source['results']))
for initial,guard,risk,target,goal in keys:
 rows=[r for r in source['results'] if (r['scenario']['initial'],r['scenario']['guard'],r['scenario']['risk'],r['scenario']['challengeTarget'],r['scenario']['fundedTarget'])==(initial,guard,risk,target,goal)]
 groups.append(dict(initial=initial,guard=guard,riskPct=risk,challengeTargetPct=target,fundedTargetPct=goal,aboveProductionRisk=risk>.5,**summarize(rows,initial)))
rec=read('recurring-results.json.gz');recurring=[]
for r in rec['results']:
 a=r['scenario'];start=pathlib.PurePath(a['date']).name;months=[]
 for month in range(int(a['date'][5:7]),12):
  name=f'2026-{month:02}';rewards=[p['customerReward'] for p in r['rewards'] if __import__('datetime').datetime.fromtimestamp(p['at']/1000,__import__('datetime').timezone.utc).strftime('%Y-%m')==name]
  months.append(dict(month=name,partial=month==11,rewardCycles=len(rewards),hypotheticalCustomerReward=sum(rewards),after100USDFeeSensitivity=sum(rewards)-100))
 recurring.append({k:v for k,v in r.items() if k not in ['trades','events'] }|dict(monthlyRewards=months,negativeOrZeroRewardFullMonths=sum(m['hypotheticalCustomerReward']<=0 for m in months if not m['partial'])))
summary=dict(schema='prop-objective-frontier-summary/v1',primaryScenarios=len(source['results']),baselineScenarios=len(read('results.json.gz')['results']),recurringCampaigns=len(rec['results']),strategy=source['protocol']['strategy'],capital=25000,groups=groups,recurring=recurring,inventory=json.loads((OUT/'inventory.json').read_text()),limits=['Retrospective overlapping starts are correlated scenarios, not independent probabilities.','1% evaluation risk is research-only and above current 0.5% production cap. No customer risk limits changed.','RSI trailing remains a research model; these returns are not attributed to the thirteen wired configurations.','Earliest modeled request eligibility requires flat net target plus the 14-day wait and available follow-up. It is not an approved firm reward.','UTC daily accounting, news handling, contracts, swaps and execution delay are numerical assumptions.','Recurring withdrawals and 80% reward split are simulated. $100 fee is sensitivity, not actual billing.','November data ends 2026-11-12 and retains partial-history censoring.'])
(DEST/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
for n in ['results.json.gz','results-expanded.json.gz','recurring-results.json.gz','protocol.json','protocol-expanded.json','protocol-recurring.json','inventory.json']:
 shutil.copyfile(OUT/n,DEST/n)
with tarfile.open(DEST/'source.tar.gz','w:gz') as t:
 for p in sorted((ROOT/'scripts/research/prop-objective-frontier').iterdir()):
  if p.suffix in ['.py','.cpp','.ts']:t.add(p,arcname='scripts/research/prop-objective-frontier/'+p.name)
 for name in ['engine-v1.cpp','engine-v2.cpp']:
  t.add(OUT/name,arcname='earlier-prototypes/'+name)
# Original V1 was discarded after tests found pending preservation entries were canceled;
# it is retained as source history, never counted as a successful study.
checks={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(DEST.iterdir()) if p.is_file() and p.name!='SHA256SUMS.json'};(DEST/'SHA256SUMS.json').write_text(json.dumps(checks,indent=2)+'\n')
print(json.dumps(dict(scenarios=summary['primaryScenarios'],baseline=summary['baselineScenarios'],recurring=summary['recurringCampaigns'],inventory=summary['inventory']['counts'])))
