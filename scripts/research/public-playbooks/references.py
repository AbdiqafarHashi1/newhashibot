import gzip,json,math,pathlib,sys
import numpy as np
import core as c
protocol=json.loads(pathlib.Path('scripts/research/public-playbooks/reference-protocol.json').read_text());source_hashes={p:c.sha(pathlib.Path(p).read_bytes())for p in [__file__,'scripts/research/public-playbooks/core.py','scripts/research/public-playbooks/protocol.json','scripts/research/public-playbooks/reference-protocol.json']};cases=[];sources=[]
if __name__=='__main__':
 for symbol in c.p['assets']:
  a,ft,fr,manifest=c.read(symbol);sources.extend(manifest);h=c.aggregate(a,12);h4=c.aggregate(a,48);mid=c.mean(h['c'],20);sd=np.sqrt(np.maximum(0,c.mean(h['c']**2,20)-mid**2));lower=mid-2*sd;upper=mid+2*sd;r14w=c.rsi(h['c'],14);r14s=c.rsi(h['c'],14,False);r2=c.rsi(a['c'],2);h4ema=c.ema(h4['c'],50)
  for role in protocol['references']:
   for stage in ['development','validation','later']:
    period=c.p[stage];begin=c.ms(period['from']);end=c.ms(period['until']);trades=[];position=None;pending=None;max_adverse=0
    for i,t in enumerate(a['t']):
     if t<begin:continue
     if t>=end:break
     if pending:
      if pending=='BUY':position={'entryPrice':float(a['o'][i]),'entryTime':c.iso(int(t)),'entryIndex':i,'adverseGrossPercent':0.}
      else:
       entry=position['entryPrice'];exit=float(a['o'][i]);fc=c.funding_cost(a,ft,fr,c.ms(position['entryTime']),int(t),1,entry);gross=(exit-entry)/entry;net=gross-.0016-fc/entry;stress=gross-.0024-(max(fc,0)*1.5+min(fc,0))/entry;trades.append({**position,'exitTime':c.iso(int(t)),'exitPrice':exit,'grossReturn':gross,'netReturn':net,'stressReturn':stress,'fundingQuote':fc,'status':'CLOSED'});position=None
      pending=None
     if position:position['adverseGrossPercent']=min(position['adverseGrossPercent'],(float(a['l'][i])-position['entryPrice'])/position['entryPrice'])
     close=int(t+c.WIDTH);j=int(np.searchsorted(h['t'],close,side='right')-1);k=int(np.searchsorted(h4['t'],close,side='right')-1)
     if role=='OBSIDE_RSI2_UNPROTECTED':
      buy=k>=50 and r2[i]<5 and a['c'][i]>h4ema[k];sell=position is not None and(r2[i]>60 or i-position['entryIndex']+1>=72)
     else:
      if j<20 or close!=h['t'][j]:continue
      rsi=r14w[j]if role=='ALPACA_INTENT_WILDER'else r14s[j];buy=h['c'][j]<lower[j]and rsi<30;sell=buy if role=='ALPACA_BACKTEST_AS_WRITTEN_SMA'else h['c'][j]>upper[j]and rsi>70
     if position is None and buy:pending='BUY'
     elif position is not None and sell:pending='SELL'
    open_evidence=None
    if position:
     last=int(np.searchsorted(a['t'],end)-1);entry=position['entryPrice'];fc=c.funding_cost(a,ft,fr,c.ms(position['entryTime']),int(a['t'][last]+c.WIDTH),1,entry);open_evidence={**position,'status':'OPEN','lastObservedTime':c.iso(int(a['t'][last]+c.WIDTH)),'unrealizedNetReturn':(float(a['c'][last])-entry)/entry-.0016-fc/entry}
    pf=lambda key:sum(max(t[key],0)for t in trades)/sum(max(-t[key],0)for t in trades)if sum(max(-t[key],0)for t in trades)>0 else None
    result={'symbol':symbol,'role':role,'stage':stage,'resolved':len(trades),'netPF':pf('netReturn'),'stressPF':pf('stressReturn'),'meanNetReturn':float(np.mean([t['netReturn']for t in trades]))if trades else None,'worstTradeAdverseGrossPercent':min((t['adverseGrossPercent']for t in trades),default=None),'open':open_evidence,'trades':trades,'productionApproved':False};cases.append(result);print(json.dumps({k:v for k,v in result.items()if k not in ['trades','open']}),flush=True)
 if any(c.sha(pathlib.Path(p).read_bytes())!=h for p,h in source_hashes.items()):raise ValueError('SOURCE_CHANGED')
 result={'protocol':protocol,'sourceHashes':source_hashes,'sources':sources,'cases':cases,'classification':'UNPROTECTED_REFERENCE_NOT_SCANNER_APPROVAL','publication':False,'execution':False,'promotion':False};pathlib.Path('docs/research/public-playbooks/references.json.gz').write_bytes(gzip.compress(json.dumps(result).encode(),mtime=0));pathlib.Path('docs/research/public-playbooks/references-summary.json').write_text(json.dumps({**result,'cases':[{k:v for k,v in r.items()if k!='trades'}for r in cases]},indent=2)+'\n')
