"""Publish compact genuine experiment results; never ship raw archives or invented performance."""
import argparse,json,pathlib,datetime,collections,gzip,base64,hashlib
p=argparse.ArgumentParser();p.add_argument('inputs',nargs='+');p.add_argument('--out',default='public/research/mission2-results.json');a=p.parse_args()
def pack(value):
 raw=json.dumps(value,separators=(',',':')).encode();return json.dumps({'encoding':'gzip-base64/v1','sha256':hashlib.sha256(raw).hexdigest(),'data':base64.b64encode(gzip.compress(raw,mtime=0)).decode()},separators=(',',':'))+'\n'
studies=[];inventory={}
for filename in a.inputs:
 x=json.loads(pathlib.Path(filename).read_text())
 if x.get('status')!='COMPLETED':raise ValueError('Incomplete run cannot be published as completed: '+filename)
 if not x.get('manifests') or not all(m.get('vendorChecksum') is True and m.get('sourceUrl','').startswith('https://data.binance.vision/') for m in x['manifests']):raise ValueError('Genuine source provenance required')
 if x.get('experiment',{}).get('microTp2')==1.5:x['experiment']['microTp2']=1.8;x['experiment']['metadataCorrection']='EXPERIMENT_20261105_CORRECTION.md; actual runtime baseline unchanged'
 for d in x['inventory']:inventory[d['id']]=d
 accounts=[]
 states={r['state']['id']:r['state'] for r in x['checkpoint']['store']['records']}
 daily_signals=collections.Counter(s['fillAt'][:10] for s in states.values() if s.get('watchOutcome')=='CONFIRMED' and s.get('fillAt'))
 for s in x.get('accounts',[]):
  by=collections.defaultdict(list)
  for t in s['trades']:by[t['strategy']].append(t)
  stats={}
  for strategy,trades in by.items():
   gain=sum(max(t['net'],0) for t in trades);loss=-sum(min(t['net'],0) for t in trades)
   stats[strategy]={'trades':len(trades),'net':sum(t['net'] for t in trades),'profitFactor':gain/loss if loss else None,'expectancyR':sum(t['netR'] for t in trades)/len(trades),'costs':sum(t['costs'] for t in trades),'winRate':sum(t['net']>0 for t in trades)/len(trades)}
  daily=collections.defaultdict(lambda:{'authorized':0,'closed':0,'net':0})
  execution_rows=collections.defaultdict(lambda:{'attempts':0,'authorized':0,'closed':0,'net':0,'wins':0,'gains':0,'losses':0,'costs':0})
  for d in s['decisions']:
   setup=states.get(d['signalId']);key='|'.join([setup['strategy'],setup['symbol'],setup['timeframe']]) if setup else 'UNMAPPED';r=execution_rows[key];r['attempts']+=1
   if d['quantity']>0:r['authorized']+=1;daily[datetime.datetime.fromtimestamp(d['at']/1000,datetime.timezone.utc).date().isoformat()]['authorized']+=1
  for t in s['trades']:
   day=datetime.datetime.fromtimestamp(t['closedAt']/1000,datetime.timezone.utc).date().isoformat();daily[day]['closed']+=1;daily[day]['net']+=t['net']
   setup=states[t['signalId']];r=execution_rows['|'.join([setup['strategy'],setup['symbol'],setup['timeframe']])];r['closed']+=1;r['net']+=t['net'];r['wins']+=t['net']>0;r['gains']+=max(t['net'],0);r['losses']+=max(-t['net'],0);r['costs']+=t['costs']
  for r in execution_rows.values():r['profitFactor']=r['gains']/r['losses'] if r['losses'] else None;r['expectancyDollars']=r['net']/r['closed'] if r['closed'] else None
  # Preserve every equity extremum: thin only repeated consecutive identical values.
  path=[]
  for mark in s.get('equityPath',[]):
   if not path or mark['equity']!=path[-1]['equity'] or mark['kind']!=path[-1]['kind']:path.append({k:mark[k] for k in ['at','equity','balance','kind']})
  accounts.append({k:s[k] for k in ['provider','capital','riskPct','metrics']}|{'byStrategy':stats,'executionRows':execution_rows,'daily':dict(daily),'equityPath':path})
 studies.append({'id':pathlib.Path(filename).stem,'experiment':x.get('experiment',{'entryPolicy':'COMBINED','microTp2':2.4 if 'candidate' in filename else 1.8,'partition':'DEVELOPMENT'}),'period':x['funnel']['period'],'venue':x['venue'],'funnel':x['funnel'],'accounts':accounts,'manifests':x['manifests'],'dailySignals':dict(daily_signals),'engineSourceSha256':x.get('engineSourceSha256'),'executionAssumptions':x['executionAssumptions'],'qualification':'NOT_GRANTED'})
qualified=[]
for key,d in sorted(inventory.items()):
 rows=[r for study in studies for r in study['funnel']['rows'] if r['strategy']==key]
 anchors=[(s,ac['byStrategy'].get(key)) for s in studies for ac in s['accounts'] if ac['provider']=='BINANCE' and ac['capital']==1000 and ac['riskPct']==.5 and ac['byStrategy'].get(key)]
 # Experiments/scenarios overlap. Never add their trades as independent statistical samples.
 largest=max((r['trades'] for _,r in anchors),default=0)
 diagnosis='No adequate independent execution/holdout evidence yet.'
 if d['market']=='forex':diagnosis='Broker archive probes returned HTTP 429; historical account-grade Forex/Gold evidence unavailable.'
 elif any(any(k.startswith(('SLEEVE_NATIVE','TEAM_NATIVE','ALIGNED_NATIVE','WEAKNESS_NATIVE')) for k in r['rejections']) for r in rows):diagnosis='This definition requires native derivatives/history context; inspect the matching venue cohort, not spot-only rejection counts.'
 elif any(r['rejections'].get('INSUFFICIENT_NET_REWARD_RISK',0)>0 for r in rows):diagnosis='Net reward/risk rejects some gross candidates; cost-aware target experiment is isolated and has not qualified the strategy.'
 qualified.append({'strategy':key,'market':d['market'],'version':d['version'],'classification':'INSUFFICIENT DATA' if largest<30 else 'REWORK','largestSingleStudyClosedSample':largest,'diagnosis':diagnosis,'demoRecommendation':'NOT_APPROVED_YET','evidenceStudyIds':[s['id'] for s in studies if any(r['strategy']==key for r in s['funnel']['rows'])]})
index_studies=[]
out_path=pathlib.Path(a.out);out_path.parent.mkdir(parents=True,exist_ok=True)
for study in studies:
 for i,account in enumerate(study['accounts']):
  detail_name='mission2-'+study['id']+'-account-'+str(i)+'.json';detail_payload=pack({'equityPath':account.pop('equityPath')})
  (out_path.parent/detail_name).write_text(detail_payload);account['detailUrl']='/research/'+detail_name
 filename='mission2-'+study['id']+'.json';payload=pack(study)
 if len(payload.encode())>4500000:raise ValueError('Research study exceeds bounded publication size; split experiments before publishing')
 (out_path.parent/filename).write_text(payload)
 anchor=next((ac for ac in study['accounts'] if ac['provider']=='BINANCE' and ac['capital']==1000 and ac['riskPct']==.5),None)
 index_studies.append({'summary':{'signals':sum(r['confirmed'] for r in study['funnel']['rows']),'metrics':anchor['metrics'] if anchor else None},**{k:study[k] for k in ['id','experiment','period','venue']},'dataUrl':'/research/'+filename})
result={'schema':'mission2-research-results/v1','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'missionStatus':'IN_PROGRESS','studies':index_studies,'strategyInventory':qualified,'limitations':['No production promotion or live broker connectivity is established by these experiments.','Reported account returns use explicitly documented OHLC cost/contract assumptions.','Experiments overlap; scenario counts are not independent sample sizes.','Trade frequency is measured over each stated period, not a promised daily return.','Forex, Gold and rapid Gold scalping remain unverified without appropriate genuine bid/ask/tick data.']}
path=pathlib.Path(a.out);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(result,separators=(',',':'))+'\n');print('Published',len(studies),'actual studies,',len(qualified),'definitions,',path.stat().st_size,'bytes')
