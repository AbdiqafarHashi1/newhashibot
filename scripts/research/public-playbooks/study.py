from core import *
source_hashes={s:sha(pathlib.Path(s).read_bytes())for s in ['scripts/research/public-playbooks/protocol.json','scripts/research/public-playbooks/core.py','scripts/research/public-playbooks/acquire.py',__file__]}

if __name__=='__main__':
 all_sources=[];case_trades=collections.defaultdict(list);excluded=collections.Counter();source_events=[]
 for symbol in p['assets']:
  a,ft,fr,sources=read(symbol);all_sources.extend(sources);h,h4,at,r2,e20,vol=indicators(a);events=candidates(a,h,h4,at,r2,e20,vol)
  for stage in ['development','validation','later']:
   period=p[stage];start_ms=ms(period['from']);end_ms=ms(period['until']);active={}
   for event in events:
    stamp=ms(event['at'])
    if not start_ms<=stamp<end_ms:continue
    role=event['role']
    if stamp<active.get(role,0):continue
    outcome=simulate(a,ft,fr,event['index'],event['side'],event['stop'],event['target'],exit_rsi=r2 if role=='crypto.pub-rsi-dip'else None,period_end=end_ms)
    if not outcome:continue
    if outcome['status']=='EXCLUDED':excluded[(stage,role)]+=1;continue
    row={**event,'symbol':symbol,'stage':stage,'outcome':outcome};case_trades[(stage,role)].append(row);source_events.append(row);active[role]=ms(outcome['knownAt'])if outcome['knownAt']else end_ms
  print(json.dumps({'symbol':symbol,'sourceEvents':len(events),'selected':len(source_events)}),flush=True)
 results=[]
 for role in roles:
  for stage in ['development','validation','later']:
   trades=case_trades[(stage,role)];s=metrics(trades);minimum=p['gates']['developmentResolved']if stage=='development'else p['gates']['validationResolved'];failures=[]
   if s['resolved']<minimum:failures.append('SAMPLE')
   if(s['netPF']or 0)<1.2:failures.append('NET_PF')
   if(s['stressPF']or 0)<=1:failures.append('STRESS_PF')
   if(s['expectancyR']or 0)<=0:failures.append('EXPECTANCY')
   results.append({'role':role,'stage':stage,'summary':s,'failures':failures,'excluded':excluded[(stage,role)],'byAsset':[{'symbol':s,'summary':metrics([t for t in trades if t['symbol']==s])}for s in p['assets']],'trades':trades})
   print(json.dumps({k:v for k,v in results[-1].items()if k not in ['trades','byAsset']}),flush=True)
 if any(sha(pathlib.Path(k).read_bytes())!=v for k,v in source_hashes.items()):raise ValueError('FROZEN_SOURCE_CHANGED')
 result={'protocol':p,'sourceHashes':source_hashes,'sources':all_sources,'results':results,'classification':'REFERENCE_DIAGNOSTIC_NOT_PRODUCTION_PARITY','publication':False,'execution':False,'promotion':False};out.mkdir(exist_ok=True,parents=True);(out/'evidence.json.gz').write_bytes(gzip.compress(json.dumps(result).encode(),mtime=0));(out/'summary.json').write_text(json.dumps({**result,'results':[{k:v for k,v in r.items()if k!='trades'}for r in results]},indent=2)+'\n')
