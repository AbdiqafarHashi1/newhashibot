import collections,gzip,json,math,pathlib
import numpy as np
import core as c
protocol=json.loads(pathlib.Path('scripts/research/public-playbooks/limit-protocol.json').read_text());frozen={p:c.sha(pathlib.Path(p).read_bytes())for p in [__file__,'scripts/research/public-playbooks/core.py','scripts/research/public-playbooks/protocol.json','scripts/research/public-playbooks/limit-protocol.json']};cases=[];sources=[]
def limit_outcome(a,ft,fr,event,limit,stop,target,end,r2):
 side=event['side'];sign=1 if side=='buy'else-1;risk=(limit-stop)*sign
 if risk<=0 or(target-limit)*sign<=0 or min(limit,stop,target)<=0:return {'status':'INVALID_PLANNED_GEOMETRY'}
 first=event['index']+1;last=min(first+6,int(np.searchsorted(a['t'],end)));fill=None
 for j in range(first,last):
  through=(a['o'][j]<=limit or a['l'][j]<limit*(1-.00005))if sign==1 else(a['o'][j]>=limit or a['h'][j]>limit*(1+.00005))
  if through:fill=j;break
 if fill is None:return {'status':'UNFILLED','releaseAt':c.iso(min(end,int(a['t'][last-1]+c.WIDTH)))if last>first else c.iso(end)}
 stop_pending=False;status='OPEN';price=None;exit_index=None;maximum=min(fill+72,int(np.searchsorted(a['t'],end)))
 for j in range(fill,maximum):
  if stop_pending:status='RULE_EXIT';price=float(a['o'][j]);exit_index=j;break
  hit=a['l'][j]<=stop if sign==1 else a['h'][j]>=stop;take=a['h'][j]>=target if sign==1 else a['l'][j]<=target
  if hit:status='STOP';price=float(min(stop,a['o'][j])if sign==1 else max(stop,a['o'][j]));exit_index=j;break
  if take:status='TARGET';price=target;exit_index=j;break
  if event['role']=='crypto.pub-rsi-dip'and r2[j]>60:stop_pending=True
 if status=='OPEN'and maximum-fill==72:status='TIMEOUT';price=float(a['c'][maximum-1]);exit_index=maximum-1
 if status=='OPEN':return {'status':'OPEN','entryTime':c.iso(a['t'][fill]),'entryPrice':limit,'netR':None,'unrealizedGrossR':(float(a['c'][maximum-1])-limit)*sign/risk,'knownAt':None}
 held=int(a['t'][exit_index]+(c.WIDTH if status=='TIMEOUT'else 0));fc=c.funding_cost(a,ft,fr,int(a['t'][fill]),held,sign,limit);base_fee=limit*.0002+price*(.0002 if status=='TARGET'else .0008);stress_fee=(limit+price)*.0008;gross=(price-limit)*sign
 return {'status':status,'entryTime':c.iso(a['t'][fill]),'entryPrice':limit,'exitTime':c.iso(a['t'][exit_index]),'exitPrice':price,'knownAt':c.iso(a['t'][exit_index]+c.WIDTH),'grossR':gross/risk,'netR':(gross-base_fee-fc)/risk,'stressR':(gross-stress_fee-max(fc,0)*1.5-min(fc,0))/risk,'costR':(base_fee+fc)/risk,'fundingQuote':fc,'feeQuote':base_fee,'fillModel':'RESTING_LIMIT_STRICT_TRADE_THROUGH_NOT_VERIFIED_EXCHANGE_FILL'}
if __name__=='__main__':
 for symbol in c.p['assets']:
  a,ft,fr,manifests=c.read(symbol);sources.extend(manifests);h,h4,at,r2,e20,vol=c.indicators(a);events=c.candidates(a,h,h4,at,r2,e20,vol);vwaps=np.empty(len(a['t']));anchor=-1;sv=sp=0.
  for i,t in enumerate(a['t']):
   day=int((t-810*60000)//86400000)
   if day!=anchor:anchor=day;sv=sp=0.
   sv+=a['v'][i];sp+=a['v'][i]*(a['h'][i]+a['l'][i]+a['c'][i])/3;vwaps[i]=sp/sv if sv else a['c'][i]
  for stage in ['development','validation','later']:
   begin=c.ms(c.p[stage]['from']);end=c.ms(c.p[stage]['until']);active={};buckets=collections.defaultdict(list);unfilled=collections.Counter();invalid=collections.Counter()
   for e in events:
    stamp=c.ms(e['at']);role=e['role'];i=e['index'];sign=1 if e['side']=='buy'else-1
    if not begin<=stamp<end or stamp<active.get(role,0):continue
    j=int(np.searchsorted(h['t'],stamp,side='right')-1);limit=None;stop=e['stop'];target=e['target']
    if role=='crypto.pub-orb':limit=(target+2*stop)/3
    elif role=='crypto.pub-vwap':limit=float(vwaps[i]);target=limit+sign*2*abs(limit-stop)
    elif role=='crypto.pub-rsi-dip':limit=e['entry']-.25*float(h['atr'][j])
    elif role=='crypto.pub-band-range':limit=float(h['lo'][j]if sign==1 else h['hi'][j])
    elif role=='crypto.pub-ema100':limit=float(e20[i]);target=limit+sign*2*abs(limit-stop)
    elif role=='crypto.pub-day-sweep':day=int(a['t'][i]//86400000);left=int(np.searchsorted(a['t'],day*86400000-86400000));right=int(np.searchsorted(a['t'],day*86400000));limit=float(a['l'][left:right].min()if sign==1 else a['h'][left:right].max())
    outcome=limit_outcome(a,ft,fr,e,float(limit),float(stop),float(target),end,r2)
    if outcome['status']=='INVALID_PLANNED_GEOMETRY':invalid[role]+=1;continue
    if outcome['status']=='UNFILLED':unfilled[role]+=1;active[role]=c.ms(outcome['releaseAt']);continue
    row={**e,'entry':float(limit),'stop':float(stop),'target':float(target),'symbol':symbol,'outcome':outcome};buckets[role].append(row);active[role]=c.ms(outcome['knownAt'])if outcome['knownAt']else end
   for role in protocol['roles']:cases.append({'role':role,'symbol':symbol,'stage':stage,'summary':c.metrics(buckets[role]),'unfilled':unfilled[role],'invalid':invalid[role],'trades':buckets[role]})
  print(json.dumps({'symbol':symbol,'cases':len(cases)}),flush=True)
 pooled=[]
 for role in protocol['roles']:
  for stage in ['development','validation','later']:
   group=[r for r in cases if r['role']==role and r['stage']==stage];trades=[t for r in group for t in r['trades']];s=c.metrics(trades);result={'role':role,'stage':stage,'summary':s,'unfilled':sum(r['unfilled']for r in group),'invalid':sum(r['invalid']for r in group)};pooled.append(result);print(json.dumps(result),flush=True)
 if any(c.sha(pathlib.Path(k).read_bytes())!=v for k,v in frozen.items()):raise ValueError('SOURCE_CHANGED')
 result={'protocol':protocol,'sourceHashes':frozen,'sources':sources,'pooled':pooled,'cases':cases,'classification':'RESTING_LIMIT_EXECUTION_DIAGNOSTIC_NOT_SCANNER_OR_PROVIDER_CERTIFICATION','publication':False,'execution':False,'promotion':False};pathlib.Path('docs/research/public-playbooks/limits.json.gz').write_bytes(gzip.compress(json.dumps(result).encode(),mtime=0));pathlib.Path('docs/research/public-playbooks/limits-summary.json').write_text(json.dumps({**result,'cases':[{k:v for k,v in r.items()if k!='trades'}for r in cases]},indent=2)+'\n')
