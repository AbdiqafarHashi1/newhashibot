"""Publish complete ledgers and source identities; never a production qualification."""
import datetime as dt,gzip,hashlib,io,json,pathlib,shutil,subprocess,tarfile
ROOT=pathlib.Path(__file__).resolve().parents[3];OUT=ROOT/'.tmp/continuous-income';DEST=ROOT/'docs/research/continuous-income-20261114';DEST.mkdir(parents=True,exist_ok=True)
def read(p):return json.load(gzip.open(OUT/p))
def dump(p,obj):
 with gzip.GzipFile(filename=str(p),mode='wb',mtime=0) as f:f.write(json.dumps(obj,separators=(',',':')).encode())
def compact(s):
 rs=[]
 for i,a in enumerate(s['cases']):
  prev=a['capital'];months=[]
  for m in s['months']:
   e=m['cases'][i]['equity'];months.append(dict(month=m['month'],partial=m['partial'],returnPct=(e/prev-1)*100,closedTrades=m['cases'][i]['closedTrades'],blocked=m['cases'][i]['blocked']));prev=e
  full=[m for m in months if not m['partial']];final=s['final'][i];f6=s['months'][5]['cases'][i]['equity']/a['capital'];roll={}
  for days in [30,40]:
   pairs=[];daily=s.get('daily',[])
   for j,start in enumerate(daily):
    end=next((p for p in daily[j+1:] if p['at']>=start['at']+days*86400000),None)
    if end:pairs.append((end['cases'][i]['equity']/start['cases'][i]['equity']-1)*100)
   if pairs:roll[str(days)]=dict(windows=len(pairs),atLeast2=sum(r>=2 for r in pairs),atLeast3=sum(r>=3 for r in pairs),atLeast5=sum(r>=5 for r in pairs),negative=sum(r<0 for r in pairs),median=sorted(pairs)[len(pairs)//2],worst=min(pairs),limits='Overlapping marked-equity windows in one continuous account, not independent starts or approved payout requests.')
  rs.append(dict(model=s['model'],scenario=a,final={k:v for k,v in final.items() if k!='trades'},monthly=months,fullMonthCount=len(full),positiveFullMonths=sum(m['returnPct']>0 for m in full),fullMonthsAtLeast2=sum(m['returnPct']>=2 for m in full),fullMonthsAtLeast3=sum(m['returnPct']>=3 for m in full),worstFullMonth=min(m['returnPct'] for m in full),sixMonthNetPct=(f6-1)*100,sixMonthGeometricAverageMonthlyPct=(f6**(1/6)-1)*100,rolling=roll))
 return rs
main=read('results.json.gz');focused=read('focused/results.json.gz');selected=read('selected-income/results.json.gz');stress=read('income-stress/results.json.gz');challenge=read('challenge/results-expanded.json.gz');trail=read('challenge-trail1/results-expanded.json.gz');crypto=read('crypto-results.json.gz');mg=read('management-results.json.gz');fast=read('small-gold-results.json.gz');management=[]
for i,r in enumerate(mg['results']):
 prev=25000;ms=[]
 for m in mg['months']:
  e=m['cases'][i]['equity'];ms.append(dict(month=m['month'],partial=m['partial'],returnPct=(e/prev-1)*100));prev=e
 f6=mg['months'][5]['cases'][i]['equity']/25000
 management.append(dict(scenario=r['scenario'],final={k:v for k,v in r['final'].items() if k!='trades'},monthly=ms,fullMonthsPositive=sum(m['returnPct']>0 for m in ms[:6]),fullMonthsAtLeast2=sum(m['returnPct']>=2 for m in ms[:6]),worstFullMonth=min(m['returnPct'] for m in ms[:6]),sixMonthNetPct=(f6-1)*100,geometricAverageMonthlyPct=(f6**(1/6)-1)*100))
challenges=[]
for model,source in [('Original2ATR',challenge),('Selected1ATR',trail)]:
 for risk in [.5,.625,.75,1]:
  for target in [8,10]:
   rows=[r for r in source['results'] if r['scenario']['risk']==risk and r['scenario']['challengeTarget']==target];horizons={}
   for days in [30,40]:
    hit=lambda r:bool(r['fundedAt'] and r['fundedAt']-r['scenario']['start']<=days*86400000)
    resolved=lambda r:hit(r) or r['observedUntil']>=r['scenario']['start']+days*86400000 or any(e[1]==9 and e[0]<=r['scenario']['start']+days*86400000 for e in r['events'])
    horizons[str(days)]=dict(hits=sum(hit(r) for r in rows),starts=len(rows),censored=sum(not resolved(r) for r in rows))
   challenges.append(dict(model=model,risk=risk,challengeTarget=target,verificationTarget=5,aboveCurrentProductionRisk=risk>.5,horizons=horizons,failedThroughAvailableFollowup=sum(r['failed'] for r in rows)))
admission=[]
for name in ['all-production','focused-production','all-capacity','immediate-capacity','conditional-capacity']:
 p=OUT/f'admission-{name}.json';x=json.loads(p.read_text());admission.append(dict(name=name,status=x['status'],experiment=x['experiment'],engineSourceSha256=x['engineSourceSha256'],metrics=x['accounts'][0]['metrics'],funnel=x['funnel']));dump(DEST/f'admission-{name}.json.gz',x)

# Independently dispatched selected replay must match the parameterized management case.
for row in [r for family in selected['results'] for r in compact(family)]:
 match=next(r for r in management if r['scenario']==dict(risk=row['scenario']['risk'],trigger=2,trailATR=1,holdMinutes=1440)) if row['scenario']['risk'] in [.4,.5] else None
 if match:
  assert abs(row['final']['equity']-match['final']['equity'])<1e-6
  assert abs(row['final']['drawdownPct']-match['final']['drawdownPct'])<1e-6
summary=dict(schema='continuous-income-summary/v1',counts=dict(nativeMain=len(compact(main['results'][0]))+sum(len(s['cases']) for s in main['results'][1:]),nativeFocused=sum(len(s['cases']) for s in focused['results']),nativeEarlierPeak77=77,costStressCases=sum(len(s['cases']) for s in stress['results']),selectedIncomeCases=sum(len(s['cases']) for s in selected['results']),challengeOriginal=len(challenge['results']),challengeSelected=len(trail['results']),cryptoCases=len(crypto['results']),smallGoldCases=fast['protocol']['cases'],managementCases=len(management),canonicalAblations=len(admission)),native=[r for s in main['results'] for r in compact(s)],focused=[r for s in focused['results'] for r in compact(s)],selectedIncome=[r for s in selected['results'] for r in compact(s)],costStress=[r for s in stress['results'] for r in compact(s)],management=management,challenges=challenges,crypto=[{k:v for k,v in r.items() if k!='trades'} for r in crypto['results']],admission=admission,limits=['All comparisons reuse historical data; selection and overlapping-window frequencies are not independent validation or success probabilities.','November is partial through12Nov. Only May-Oct are full months.','Native income results remain separate from shared canonical scanner results and actual provider fills. RSI trailing is research-only and not counted in thirteen reviewed wired configurations.','Numerical native daily reset is UTC; new approved product static mode uses actual Europe/Prague observed tracking. Account/spec/news/payout compliance is not established by these replays.','No-cutoff returns are marked equity, with no simulated withdrawal or profit split; they are not payout claims.','False failed flag does not establish health: blocked entries, lot granularity, near-exhausted risk room and zero activity are disclosed.','2-5% personal-risk stress guards deliberately differ from customer defaults; no production risk cap was raised.'])
(DEST/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
for src,dest in [('income-stress/results.json.gz','cost-stress-results.json.gz'),('income-stress/protocol.json','cost-stress-protocol.json'),('selected-income/results.json.gz','selected-income-results.json.gz'),('selected-income/protocol.json','selected-income-protocol.json'),('results.json.gz','native-results.json.gz'),('protocol.json','native-protocol.json'),('focused/results.json.gz','focused-results.json.gz'),('focused/protocol.json','focused-protocol.json'),('peak-results-v1.json.gz','earlier-peak-results.json.gz'),('peak-protocol-v1.json','earlier-peak-protocol.json'),('challenge/results-expanded.json.gz','challenge-original.json.gz'),('challenge/protocol-expanded.json','challenge-original-protocol.json'),('challenge-trail1/results-expanded.json.gz','challenge-selected.json.gz'),('challenge-trail1/protocol-expanded.json','challenge-selected-protocol.json'),('crypto-results.json.gz','crypto-results.json.gz'),('small-gold-results.json.gz','small-gold-results.json.gz'),('management-results.json.gz','management-results.json.gz'),('management-protocol.json','management-protocol.json'),('admission-protocol.json','admission-protocol.json')]:shutil.copyfile(OUT/src,DEST/dest)
# Reconstruct and VERIFY the exact shared snapshot used by all five canonical runs.
# The parent tree plus the first funded-objective validation change yields the recorded digest.
baseTree='238afdff4fae2d0c49988ded5b45b249e75c7d42'
files=subprocess.check_output(['git','ls-tree','-r','--name-only',baseTree,'supabase/functions/_shared'],cwd=ROOT,text=True).splitlines();files=sorted(p for p in files if p.endswith('.ts'))+['scripts/research/run-frequency-audit.ts'];digest=hashlib.sha256();snapshot={}
for name in files:
 raw=subprocess.check_output(['git','show',baseTree+':'+name],cwd=ROOT)
 if name=='supabase/functions/_shared/prop-account-profile.ts':
  raw=raw.decode().replace('![2,5].includes','![2,3,5].includes').replace(" if(value.funded_profit_target_pct"," if(value.funded_profit_behavior!==undefined&&!['CONTINUE_TRADING','STOP_AT_TARGET'].includes(value.funded_profit_behavior))throw Error('PROP_FUNDED_BEHAVIOR_REQUIRED');\n if(value.funded_profit_target_pct").encode()
 digest.update(name.encode());digest.update(raw);snapshot[name]=raw
assert all(r['engineSourceSha256']==digest.hexdigest() for r in admission),digest.hexdigest()
with tarfile.open(DEST/'canonical-source.tar.gz','w:gz') as t:
 for name,raw in snapshot.items():
  info=tarfile.TarInfo(name);info.size=len(raw);info.mtime=0;t.addfile(info,io.BytesIO(raw))
with tarfile.open(DEST/'research-source.tar.gz','w:gz') as t:
 for p in sorted(pathlib.Path(__file__).parent.iterdir()):
  if p.suffix in ['.cpp','.py']:t.add(p,arcname='scripts/research/continuous-income/'+p.name)
 for n in ['engine-peak-v1.cpp','engine-static9-v2.cpp']:t.add(OUT/n,arcname='earlier-engines/'+n)
 for p in ['scripts/research/execution-frontier/features.py','scripts/research/execution-frontier/continuous.py','scripts/research/launch/search.py','scripts/research/prop-objective-frontier/engine.cpp','scripts/research/acquire-canonical-history.py']:t.add(ROOT/p,arcname=p)
from report import write_report
write_report()
checks={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(DEST.iterdir()) if p.is_file() and p.name!='SHA256SUMS.json'};(DEST/'SHA256SUMS.json').write_text(json.dumps(checks,indent=2)+'\n');print(json.dumps(summary['counts']))
