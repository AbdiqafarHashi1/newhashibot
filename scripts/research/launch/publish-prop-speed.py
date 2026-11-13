"""Publish completed local speed experiments without changing customer policies."""
import collections,datetime,gzip,hashlib,json,pathlib,statistics,tarfile
root=pathlib.Path('.tmp/prop-speed');out=pathlib.Path('docs/research/prop-speed-20261113');out.mkdir(exist_ok=True)
def read(name):return json.loads((root/name).read_text())
searches={f'search-{n}.json':read(f'search-{n}.json') for n in range(8)};searches.update({f'search-extra-{n}.json':read(f'search-extra-{n}.json') for n in range(2)})
rows=[r for d in searches.values() for r in d['results']];assert len(rows)==2016;assert sum(len(r['runs']) for r in rows)==24192
keys=[json.dumps([r['bundle'],r['variant'],r['objective']],sort_keys=True) for r in rows];assert len(set(keys))==len(keys)
validation={p:read(p) for p in ['validation.json','validation-banking.json','validation-banking-pos3.json']};assert sum(len(r['runs']) for d in validation.values() for r in d['results'])==502
cycles={p:read(p) for p in ['cycles.json','cycles-static.json']};assert sum(len(d['results']) for d in cycles.values())==60
lowrr={f'lowrr-{s}.json':read(f'lowrr-{s}.json') for s in ['XAUUSD','USDJPY','EURUSD']};assert sum(d['configurations'] for d in lowrr.values())==2592
capacity=read('capacity-comparison.json');assert len(capacity['results'])==40
scanner=read('capacity-probe.json');assert scanner['status']=='COMPLETED' and scanner['funnel']['period']['days']==30
archive=root/'capacity-source.tar.gz'
with tarfile.open(archive) as t:
 names=sorted(n for n in t.getnames() if n.startswith('supabase/functions/_shared/') and n.endswith('.ts'))+['scripts/research/run-frequency-audit.ts'];h=hashlib.sha256()
 for name in names:h.update(name.encode());h.update(t.extractfile(name).read())
 assert h.hexdigest()==scanner['engineSourceSha256']
(out/'capacity-source.tar.gz').write_bytes(archive.read_bytes());(out/'capacity-probe.json.gz').write_bytes(gzip.compress((root/'capacity-probe.json').read_bytes(),mtime=0));(out/'baseline-ledger.json.gz').write_bytes((root/'diagnostic-CURRENT_05_5.json.gz').read_bytes())
diag=read('diagnostics.json');trace=json.loads(gzip.decompress((root/'diagnostic-CURRENT_05_5.json.gz').read_bytes()));trades=trace['trace']['trades'];baseline=dict(diag['results'][0]['metrics']);baseline['meanWinR']=statistics.mean(t['netR'] for t in trades if t['net']>0);baseline['meanLossR']=statistics.mean(t['netR'] for t in trades if t['net']<0);monthly=collections.defaultdict(list)
for t in trades:monthly[datetime.datetime.fromtimestamp(t['closedAt']/1000,datetime.timezone.utc).strftime('%Y-%m')].append(t)
baseline['monthly']=[dict(month=m,closedTrades=len(t),realizedPctInitial=sum(x['net'] for x in t)/25000*100) for m,t in sorted(monthly.items())]
frozen=read('frozen-finalists.json');finalists=[{**r,'period':'EARLIER','twoWeekHits':sum(x['hit'] and x['daysToHit']<=14 for x in r['runs'])} for r in frozen['selected']]+[r for d in validation.values() for r in d['results']]
finalists=json.loads(json.dumps(finalists))
for r in finalists:r.pop('runs',None)
recurring=[{**r,'lossBasis':'STATIC' if name=='cycles-static.json' else 'HIGH_WATER'} for name,d in cycles.items() for r in d['results']]
for r in recurring:r.pop('cycles',None)
a=next(r for r in capacity['results'] if r['source']=='PRODUCTION_PARITY' and r['variant']['id']=='CURRENT_05_5' and r['objective']=='UNSTOPPED_FUNDED')['metrics'];b=next(r for r in capacity['results'] if r['source']=='RISK_CAPACITY_ONLY' and r['variant']['id']=='CURRENT_05_5' and r['objective']=='UNSTOPPED_FUNDED')['metrics']
replays=sum(len(r['runs']) for r in rows)+sum(len(r['runs']) for d in validation.values() for r in d['results'])+sum(len(r['cycles']) for d in cycles.values() for r in d['results'])+len(capacity['results'])+len(diag['results'])
confirmation=read('current-engine-confirmation.json');assert confirmation['caseCount']==16 and confirmation['headlineMetricsUnchanged'] is True
(out/'current-engine-confirmation.json').write_text(json.dumps(confirmation,indent=2)+'\n')
full={'current-engine-confirmation.json':confirmation,**searches,**validation,**cycles,**lowrr,'diagnostics.json':diag,'frozen-finalists.json':read('frozen-finalists.json'),'frozen-banking.json':read('frozen-banking.json'),'frozen-banking-pos3.json':read('frozen-banking-pos3.json'),'capacity-comparison.json':capacity}
(out/'all-scenarios.json.gz').write_bytes(gzip.compress(json.dumps(full,separators=(',',':')).encode(),mtime=0))
fastest=[]
for objective in ['PASS_8_5','PASS_10_5']:
 candidates=[(x['daysToHit'],r,x) for r in rows if r['objective']==objective for x in r['runs'] if x['hit']]
 days,r,x=min(candidates,key=lambda z:z[0]);fastest.append(dict(objective=objective,daysToFunded=days,bundle=r['bundle'],variant=r['variant'],start=x['start'],failedBeforeEnd=x['failed']))
summary=dict(schema='prop-speed-audit/v1',date='2026-11-13',accountCases=replays+confirmation['caseCount'],currentEngineConfirmation=confirmation,fastest=fastest,accountStudyArchiveSha256=hashlib.sha256((out/'account-study-source.tar.gz').read_bytes()).hexdigest(),counts=dict(currentEngineRechecks=confirmation['caseCount'],searchAccountReplays=24192,validationAccountReplays=502,recurringCampaigns=60,recurringAccountReplays=sum(len(r['cycles']) for d in cycles.values() for r in d['results']),capacityAccountReplays=40,diagnosticAccountReplays=4,newShortHoldConfigurations=2592,newShortHoldApproximateCases=sum(d['earlierCases']+d['laterCases'] for d in lowrr.values()),canonicalCapacityTicks=43200),recommendation='5% months are possible; the current continuous replay achieved them in May and June. Later-period results do not support reliable two-week or one-month challenge completion. Keep the reviewed normal-risk demo settings; phase banking and faster variants remain account research until implemented and observed in the matching provider path.',baseline=baseline,finalists=finalists,recurring=recurring,capacity=dict(status='COMPLETED_30_DAY_PROBE',originalSignals=capacity['originalSignals'],relaxedSignals=capacity['relaxedSignals'],note=f"Matched March 1–31 only, not six months: at normal sizing, entries {a['authorizedEntries']} → {b['authorizedEntries']}, ending marked return {a['netReturnPct']:.2f}% → {b['netReturnPct']:.2f}%. More alerts did not produce the requested profit target.",results=capacity['results']),lowRewardScreen=dict(configurations=2592,shortlisted=sum(len(d['finalists']) for d in lowrr.values()),positiveLater=sum(r['later']['returnPct']>0 and not r['later']['failed'] for d in lowrr.values() for r in d['finalists'])),limits=['Overlapping historical starts and sensitivity variants are correlated','Research-only policy/exit variants do not change customer limits or provide execution authority','Banking only sizes genuine subsequent qualified setups; minimum days and firm limits remain enforced','Exness reference bid/ask and scenario costs are not firm fills or actual payouts','No real orders, provider activation, entitlement or billing change'],canonicalCapacitySourceSha256=scanner['engineSourceSha256'],hostedStatusObserved='Supabase uqiwbzfcntlcyyewawfc INACTIVE on 2026-11-13')
assert replays==24978,replays
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');pathlib.Path('public/research/prop-speed-20261113.summary.json').write_text(json.dumps(summary,separators=(',',':'))+'\n');print(json.dumps({'counts':summary['counts'],'accountCases':summary['accountCases'],'screen':summary['lowRewardScreen'],'capacity':summary['capacity']['note']},indent=2))
