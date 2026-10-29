"""Reprice frozen selections only; no new trading/admission logic or execution."""
import bisect,datetime,gzip,hashlib,json,pathlib,sys
iso=lambda ms:datetime.datetime.fromtimestamp(ms/1000,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
ms=lambda s:int(datetime.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()*1000)
sha=lambda b:hashlib.sha256(b).hexdigest()
def settlements(ft,fr,pt,prices,entry,early_exit,late_exit,side):
 result=[]
 for i in range(bisect.bisect_left(ft,entry-15000),bisect.bisect_right(ft,late_exit+15000)):
  j=bisect.bisect_right(pt,ft[i])-1
  if j<0 or ft[i]-pt[j]>900000:raise ValueError('SETTLEMENT_PRICE_PROXY_MISSING')
  cost=prices[j]*fr[i]*side
  if cost<0 and not(entry+15000<ft[i]<early_exit-15000):continue
  result.append({'settledAt':iso(ft[i]),'rate':fr[i],'priceProxy':prices[j],'quoteCost':cost,'stressQuoteCost':max(cost,0)*1.5+min(cost,0),'boundaryUncertain':not(entry+15000<ft[i]<early_exit-15000)})
 return result

def metrics(rows,key):
 values=[r[key]for r in rows if r[key]is not None];profit=sum(max(v,0)for v in values);loss=-sum(min(v,0)for v in values)
 return {'resolved':len(values),'profitFactor':profit/loss if loss else None,'meanNetR':sum(values)/len(values)if values else None}

def run():
 roots=pathlib.Path(sys.argv[1]);prices_root=pathlib.Path('../research-data/ten-asset');protocol=json.loads(pathlib.Path('scripts/research/funding-audit/protocol.json').read_text());inputs={};sources=[]
 for symbol in json.loads(pathlib.Path('scripts/research/ten-asset/protocol.json').read_text())['altAssets']:
  fund=[];candles=[]
  for year in [2025,2026]:
   for month in range(1,10 if year==2026 else 13):
    for kind,root in [('fundingRate',roots),('15m',prices_root)]:
     name=f'{symbol}-{kind}-{year}-{month:02d}';raw=(root/(name+'.json')).read_bytes();meta=json.loads((root/(name+'.manifest.json')).read_text());z=(root/(name+'.zip')).read_bytes();checksum=(root/(name+'.zip.CHECKSUM')).read_text().split()[0]
     if sha(raw)!=meta['datasetSha256']or sha(z)!=checksum or sha(z)!=meta['rawSha256']:raise ValueError('SOURCE_HASH_MISMATCH')
     (fund if kind=='fundingRate'else candles).extend(json.loads(raw));sources.append(meta)
  ft=[r['calcTimeMs']for r in fund];fr=[r['rate']for r in fund];pt=[ms(r['open_time'])for r in candles];opens=[r['open']for r in candles]
  if any(abs(ft[i]-ft[i-1]-fund[i]['intervalHours']*3600000)>30000 for i in range(1,len(ft))):raise ValueError('FUNDING_INTERVAL_GAP:'+symbol)
  if any(pt[i]-pt[i-1]!=900000 for i in range(1,len(pt))):raise ValueError('PRICE_GAP')
  inputs[symbol]=(ft,fr,pt,opens,ft[-1]+fund[-1]['intervalHours']*3600000)
 reports=[]
 for folder in ['ten-asset','ten-asset-regimes']:
  path=pathlib.Path('docs/research')/folder/'evidence.json.gz';raw=path.read_bytes();original=json.loads(gzip.decompress(raw));rows=[]
  for s in original['selected']:
   c=s['candidate'];o=s['base'];events=[];net=stress=None
   if o['netR']is not None:
    if c['strategyId']=='crypto.daily-ema-trend':net=o['netR'];stress=s['stress']['netR']
    else:
     entry=ms(o['entryTime']);early=ms(o['exitTime']);late=early+900000
     if o['status']=='TIMEOUT':early=late
     ft,fr,pt,prices,next_settlement=inputs[c['symbol']]
     if ft[0]>entry-15000 or late+15000>=next_settlement:raise ValueError('FUNDING_COVERAGE_MISSING')
     events=settlements(ft,fr,pt,prices,entry,early,late,1 if c['side']=='buy'else-1);risk=abs(o['entryPrice']-c['stop']);gross=(o['exitPrice']-o['entryPrice'])*(1 if c['side']=='buy'else-1)
     net=(gross-o['entryPrice']*.0016-sum(e['quoteCost']for e in events))/risk;stress=(gross-o['entryPrice']*.0024-sum(e['stressQuoteCost']for e in events))/risk
   rows.append({'candidate':c,'outcome':o,'reserveNetR':o['netR'],'netR':net,'stressR':stress,'settlements':events})
  periods=[]
  for start,end in [('2025-02-01','2026-01-01'),('2026-01-01','2026-07-01'),('2026-07-01','2026-10-01')]:
   part=[r for r in rows if start<=r['outcome']['entryTime'][:10]<end];periods.append({'start':start,'end':end,'base':metrics(part,'netR'),'stress':metrics(part,'stressR')})
  reports.append({'sourceStudy':folder,'sourceEvidenceSha256':sha(raw),'base':metrics(rows,'netR'),'stress':metrics(rows,'stressR'),'periods':periods,'byDirection':[{'side':side,'base':metrics([r for r in rows if r['candidate']['side']==side],'netR')}for side in ['buy','sell']],'rows':rows})
 out=pathlib.Path('docs/research/funding-audit');out.mkdir(exist_ok=True);report={'protocol':protocol,'sourceHashes':{p:sha(pathlib.Path(p).read_bytes())for p in ['scripts/research/funding-audit/acquire.py','scripts/research/funding-audit/audit.py','scripts/research/funding-audit/protocol.json']},'sources':sources,'reports':reports,'publication':False,'execution':False,'promotion':False};(out/'evidence.json.gz').write_bytes(gzip.compress(json.dumps(report).encode(),mtime=0));(out/'summary.json').write_text(json.dumps({**report,'reports':[{k:v for k,v in r.items()if k!='rows'}for r in reports]},indent=2)+'\n');print(json.dumps([{k:v for k,v in r.items()if k not in ['rows']}for r in reports]),flush=True)
if __name__=='__main__':run()
