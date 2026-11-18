"""Extract only existing, hash-matched canonical reports. No candle acquisition."""
import base64,gzip,hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
reviews=json.loads((root/'.tmp/part1-reviews.json').read_text())
wanted={p['reportSha256']:(r['strategyId'],p) for r in reviews for p in r['periods']}
trades=[];coverage=[];sources=[];seen=set()
for path in sorted((root/'docs/research').rglob('*')):
 if not(path.name.endswith('.json.gz') or path.name.endswith('.json.gz.b64') or path.suffix=='.json'):continue
 raw=path.read_bytes()
 if path.suffix=='.b64':raw=base64.b64decode(raw)
 if path.name.endswith(('.gz','.gz.b64')):
  try:raw=gzip.decompress(raw)
  except (OSError,EOFError):continue
 sha=hashlib.sha256(raw).hexdigest()
 if sha not in wanted or sha in seen:continue
 seen.add(sha);strategy,p=wanted[sha];d=json.loads(raw)
 accounts=[a for a in d['accounts'] if a['capital']==p['capital'] and a['riskPct']==p['riskPct']]
 if len(accounts)!=1:raise RuntimeError('Ambiguous canonical account '+str(path))
 a=accounts[0];sources.append({'path':str(path.relative_to(root)),'sha256':sha,'strategy':strategy});coverage.append({'strategy':strategy,'start':p['start'],'end':p['end']})
 for t in a['trades']:
  if t['strategy']!=strategy:raise RuntimeError('Unexpected strategy')
  trades.append({'id':t['signalId'],'strategy':strategy,'symbol':t['symbol'],'timeframe':('1h' if '-60-' in strategy else '4h' if '.launch-' in strategy else '5m' if '-5-24-' in strategy else '15m'),'entry':t['openedAt'],'exit':t['closedAt'],'netR':t['netR'],'source':sha})
missing=sorted(set(wanted)-seen)
if missing:print('Canonical full ledgers unavailable:',len(missing))
for name,id,symbol in [('evidence-final-spot-entry-ETHUSDT.json.gz','crypto.complementary-ema-pullback','ETHUSDT'),('evidence-gold-profile.json.gz','forex.complementary-ema-pullback','XAUUSD')]:
 path=root/'docs/research/complementary'/name;raw=gzip.decompress(path.read_bytes());d=json.loads(raw);ledger=d.get('ledger',d.get('decisions',[]));print(name,list(d)[:8])
 # Spot reference uses the recorded per-symbol evidence ledger; preserve exact signal IDs.
 if not ledger:
  for key,value in d.items():
   if isinstance(value,list) and value and isinstance(value[0],dict) and 'outcome' in value[0]:ledger=value;break
 if not ledger:raise RuntimeError('Outcome ledger missing '+name)
 sources.append({'path':str(path.relative_to(root)),'sha256':hashlib.sha256(raw).hexdigest(),'strategy':id})
 coverage.extend({'strategy':id,'start':a,'end':b} for a,b in [('2025-03-01T00:00:00Z','2026-01-01T00:00:00Z'),('2026-01-01T00:00:00Z','2026-11-01T00:00:00Z')])
 for row in ledger:
  o=row.get('outcome');c=row.get('candidate',{})
  if not o or o.get('strategyId')!=id or o.get('netR') is None or not o.get('exitTime'):continue
  trades.append({'id':o['candidateId'],'strategy':id,'symbol':symbol,'timeframe':'1h','entry':o['entryTime'],'exit':o['exitTime'],'netR':o['netR'],'source':hashlib.sha256(raw).hexdigest()})
# Reference summaries may repeat independent/combined diagnostics; never count repeated signal IDs twice.
unique={}
for t in trades:
 k=(t['strategy'],t['id'])
 if k in unique and unique[k]['netR']!=t['netR']:raise RuntimeError('Conflicting duplicate '+str(k))
 unique[k]=t
out={'sources':sources,'coverage':coverage,'trades':list(unique.values()),'missingReports':missing,'missingStrategies':sorted({wanted[h][0] for h in missing}),'limitations':['Saved realized outcomes only: intratrade equity drawdown and forced Friday exit fills are not reconstructed.','Configurations have unequal historical coverage; no synthetic alignment or candle downloads.']}
(root/'.tmp/part1-ledgers.json').write_text(json.dumps(out))
print('matched reports',len(seen),'configs',len({t['strategy'] for t in unique.values()}),'trades',len(unique))
