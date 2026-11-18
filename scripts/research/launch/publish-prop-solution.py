"""Publish completed local scenarios; never runs CI, orders, or provider operations."""
import glob,gzip,hashlib,json,pathlib,statistics,tarfile
root=pathlib.Path('.tmp/prop-solution');out=pathlib.Path('docs/research/prop-solution-20261113');out.mkdir(exist_ok=True)
def read(p):return json.loads(pathlib.Path(p).read_text())
def stats(values):
 v=[x for x in values if x is not None]
 return None if not v else dict(min=min(v),median=statistics.median(v),max=max(v))
def horizon(rows,key,days):
 # A missing result with insufficient follow-up is censored, not a failed deadline.
 eligible=[r for r in rows if r.get(key) is not None and r[key]<=days or r.get('observedDays',(1756684800000-r['start'])/86400000)>=days]
 hits=sum(r.get(key) is not None and r[key]<=days for r in eligible)
 return dict(days=days,hits=hits,eligible=len(eligible),censored=len(rows)-len(eligible),pct=hits/len(eligible)*100 if eligible else None)
def summarize(r,fund=False):
 rows=r['rows'];k='daysToRequest' if fund else 'daysToFirstRequest';net='netAfterMonthlyFee' if fund else 'netFeeFromFunded'
 return {**{k:v for k,v in r.items() if k!='rows'},'starts':len(rows),'requests':sum(x[k] is not None for x in rows),'passes':None if fund else sum(x['fundedAt'] is not None for x in rows),'fundingDays':None if fund else stats(x['daysToFunded'] for x in rows),'requestDays':stats(x[k] for x in rows),'fundedToRequestDays':None if fund else stats(x['daysFundedToRequest'] for x in rows),'rewardUSD':stats(x['reward80Pct'] for x in rows),'netAfterFundedFeesUSD':stats(x[net] for x in rows),'meaningfulAfterFundedFees':sum(x[net] is not None and x[net]>=100 for x in rows),'meaningfulAfterChallengeFees':None if fund else sum(x['netFeeFromChallenge'] is not None and x['netFeeFromChallenge']>=100 for x in rows),'horizons':[horizon(rows,k,d) for d in ([14,30,45,60] if fund else [30,60,90,120,180])],'rows':rows}
files=[p for p in sorted(root.glob('*.json')) if not any(x in p.name for x in ['scanner','progress','resume'])]
full={p.name:read(p) for p in files}
balanced=[summarize(r) for p,d in full.items() if p.startswith('balanced-') for r in d['results']]
funded=[summarize(r,True) for p,d in full.items() if p.startswith('funded-frontier-') for r in d['results']]
cycles=[r for p,d in full.items() if p.startswith('cycles-') for r in d['results']]
new=[]
for p,d in full.items():
 if not p.startswith('new-evaluation-'):continue
 for r in d['results']:
  if r['cost']!=1.5 or r['fundedRisk']!=.25:continue
  new.append(dict(profile=r['profile'],phase=r['phase'],challenge=r.get('challenge'),starts=len(r['rows']),passes=None if r['phase']=='FUNDED' else sum(x['fundedAt'] is not None for x in r['rows']),requests=sum(x['firstRequestAt'] is not None for x in r['rows']),requestDays=stats(x['daysToFirstRequest'] for x in r['rows'])))
archive=out/'canonical-source.tar.gz'
with tarfile.open(archive) as t:
 paths=sorted(n for n in t.getnames() if n.startswith('supabase/functions/_shared/') and n.endswith('.ts'))+['scripts/research/run-frequency-audit.ts'];h=hashlib.sha256()
 for name in paths:h.update(name.encode());h.update(t.extractfile(name).read())
 digest=h.hexdigest()
for name in ['gold-trend-scanner','yen-london-scanner']:
 p=root/(name+'.json');d=read(p);assert d['engineSourceSha256']==digest;assert d['status']=='COMPLETED',d['status']
 (out/(name+'.json.gz')).write_bytes(gzip.compress(p.read_bytes(),mtime=0))
summary=dict(schema='prop-practical-plan/v1',date='2026-11-13',recommendation=dict(capital=25000,evaluationRiskPct=.5,fundedRiskPct=.25,targetPct=2,maximumPositions=2,leverageCeiling=5,bundle='ALL_TESTED',livePromotion=False,note='Prepare the reviewed seven-configuration bundle for demo forward testing. Plan for multiple months to funding, then a variable payout window. New single-asset strategies did not improve the canonical results.'),assumptions=dict(costScale=1.5,rewardSharePct=80,modeledFeeUSDPer30Days=100,meaningfulNetUSD=100,challengePurchaseFeeIncluded=False,taxAndVPSIncluded=False,firmApproval=False,overlappingStarts=True,periodEnd='2025-09-01',liveCutoffOptions=[2,5],researchOnlyTarget=[1],cashflowModel='Monthly fees are sensitivity assumptions, not billing changes. Actual firm approval and payment processing are excluded.'),balanced=balanced,funded=funded,cycles=cycles,newStrategies=new,canonicalSourceSha256=digest,counts=dict(balanced=sum(len(r['rows']) for r in balanced),funded=sum(len(r['rows']) for r in funded),frontier=sum(len(r['rows']) for p,d in full.items() if p.startswith('frontier-') for r in d['results']),newCanonical=sum(len(r['rows']) for p,d in full.items() if p.startswith('new-evaluation-') for r in d['results']),recurringCampaigns=len(cycles)))
assert summary['counts']['balanced']==144 and summary['counts']['funded']==612 and summary['counts']['frontier']==576 and len(cycles)==90
(out/'all-scenarios.json.gz').write_bytes(gzip.compress(json.dumps(full,separators=(',',':')).encode(),mtime=0))
compact=json.loads(json.dumps(summary))
for kind in ['balanced','funded']:
 for r in compact[kind]:r.pop('rows',None)
for r in compact['cycles']:r.pop('cycles',None);r.pop('unfinished',None)
(out/'summary.json').write_text(json.dumps(compact,indent=2)+'\n')
public=pathlib.Path('public/research/prop-solution-20261113.summary.json');public.write_text(json.dumps(compact,separators=(',',':'))+'\n')
print(json.dumps({'counts':summary['counts'],'publicBytes':public.stat().st_size,'archiveSourceSha256':digest,'newStrategies':new},indent=2))
