"""Preserve completed studies and exact evidence; no orders, deployment or CI."""
import gzip,hashlib,json,pathlib,shutil,tarfile
from features import ROOT
from study import OUT
out=ROOT/'docs/research/execution-frontier-20261114';out.mkdir(parents=True,exist_ok=True)
files=[p for p in OUT.glob('*.json.gz') if '.partial.' not in p.name]
for p in files:shutil.copyfile(p,out/p.name)
protocols=['protocol','frozen','tick-protocol','followup-protocol','literature-protocol','literature-frozen','swing-protocol','swing-frozen','november-protocol','continuous-protocol']
for n in protocols:
 raw=(OUT/(n+'.json')).read_bytes()
 if n in ['protocol','frozen','literature-protocol','literature-frozen','swing-protocol','swing-frozen']:
  with gzip.GzipFile(filename=str(out/(n+'.json.gz')),mode='wb',mtime=0) as f:f.write(raw)
 else:(out/(n+'.json')).write_bytes(raw)
canonical=[]
for p in sorted(OUT.glob('compression-canonical-*.json')):
 if any(x in p.name for x in ['.resume.','.progress.']):continue
 raw=p.read_bytes();s=json.loads(raw)
 if s.get('status')!='COMPLETED':continue
 with gzip.GzipFile(filename=str(out/(p.name+'.gz')),mode='wb',mtime=0) as f:f.write(raw)
 canonical.append(dict(file=p.name+'.gz',sha256=hashlib.sha256(raw).hexdigest(),engineSourceSha256=s['engineSourceSha256'],period=s['funnel']['period'],experiment=s['experiment'],accounts=[{k:v for k,v in a.items() if k not in ['trades','decisions','equityPath']} for a in s['accounts']]))
continuous=json.load(gzip.open(OUT/'continuous.json.gz'));nov=json.load(gzip.open(OUT/'november.json.gz'))
checked=0
for r in continuous['results']:
 for a in r['final']:
  assert abs(25000+sum(t[6] for t in a['trades'])-a['endingBalance'])<1e-5;checked+=len(a['trades'])
summary=dict(schema='execution-frontier-summary/v1',baseScreenMonthCases=47808,orderedQuoteMonthCases=630,continuousAccounts=12,continuousTradeRecordsReconciled=checked,canonical=canonical,
 continuous=[{**r,'final':[{k:v for k,v in a.items() if k!='trades'} for a in r['final']]} for r in continuous['results']],
 november=[dict(stage=r['stage'],candidate=r['candidate']['config'],symbol=r['candidate']['symbol'],manifest=r['manifest'],results=[{k:v for k,v in a.items() if k!='trades'} for a in r['results'][0]['results']]) for r in nov['results']],
 decision='Optional fixed-target Gold compression add-on prepared for signals/demo via canonical evidence. Stronger RSI trailing candidate remains research; not execution-ready.',
 limitations=['All variant counts are correlated retrospective scenarios, not pass probabilities.','May–July canonical compression was negative; retained alongside other partitions.','November partial ends 2026-11-12; not a full month, actual payout or pass guarantee.','No live orders, activation, payments, Telegram send or Actions dispatch.'])
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
manifest=[json.loads(p.read_text()) for p in sorted((OUT/'data').glob('*.manifest.json'))];(out/'data-manifests.json').write_text(json.dumps(manifest,indent=2)+'\n')
with tarfile.open(out/'research-source.tar.gz','w:gz') as t:
 for folder,prefix in [(ROOT/'scripts/research/execution-frontier','scripts/research/execution-frontier'),(OUT/'v1-source','research-source-v1')]:
  for p in sorted(folder.iterdir()):
   if p.suffix in ['.py','.cpp']:t.add(p,arcname=prefix+'/'+p.name)
 t.add(OUT/'v1-literature.py',arcname='research-source-v1/literature.py')
checks={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.iterdir()) if p.is_file() and p.name!='SHA256SUMS.json'};(out/'SHA256SUMS.json').write_text(json.dumps(checks,indent=2)+'\n')
print(json.dumps(dict(files=len(checks),dataSets=len(manifest),ticks=sum(m['ticks'] for m in manifest),baseMonthCases=47808,canonicalReports=len(canonical),reconciledTrades=checked)))
