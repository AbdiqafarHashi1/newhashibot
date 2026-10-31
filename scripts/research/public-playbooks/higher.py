import collections,gzip,json,math,pathlib
import numpy as np
import core as c
protocol=json.loads(pathlib.Path('scripts/research/public-playbooks/higher-protocol.json').read_text());frozen={p:c.sha(pathlib.Path(p).read_bytes())for p in [__file__,'scripts/research/public-playbooks/core.py','scripts/research/public-playbooks/protocol.json','scripts/research/public-playbooks/higher-protocol.json']};cases=[];sources=[]
def wild(x,n,start=None):
 y=np.full(len(x),np.nan);start=n if start is None else start
 if len(x)>start:
  y[start]=np.mean(x[start-n+1:start+1])
  for i in range(start+1,len(x)):y[i]=(y[i-1]*(n-1)+x[i])/n
 return y
def adx(a,n=14):
 up=np.r_[0,np.diff(a['h'])];down=np.r_[0,-np.diff(a['l'])];plus=np.where((up>down)&(up>0),up,0);minus=np.where((down>up)&(down>0),down,0);tr=np.maximum(a['h']-a['l'],np.maximum(abs(a['h']-np.r_[a['c'][0],a['c'][:-1]]),abs(a['l']-np.r_[a['c'][0],a['c'][:-1]])));tr=wild(tr,n);dp=100*wild(plus,n)/tr;dm=100*wild(minus,n)/tr
 with np.errstate(divide='ignore',invalid='ignore'):dx=np.where(dp+dm==0,0,100*abs(dp-dm)/(dp+dm))
 return wild(dx,n,start=2*n),dp,dm

def stop_trade(a,ft,fr,start,fill,side,stop,target,end_ms,source_bars,source_factor):
 sign=1 if side=='buy'else-1;risk=(fill-stop)*sign
 if risk<=0 or(target-fill)*sign<=0:return {'status':'EXCLUDED','reason':'GAP_OUTSIDE_GEOMETRY'}
 stop_current=stop;limit=int(np.searchsorted(a['t'],end_ms));status='OPEN';exit_index=None;price=None
 for k in range(start,limit):
  low=float(a['l'][k]);high=float(a['h'][k]);hit=low<=stop_current if sign==1 else high>=stop_current;take=high>=target if sign==1 else low<=target
  if hit:
   status='STOP';price=stop_current if k==start else float(min(stop_current,a['o'][k])if sign==1 else max(stop_current,a['o'][k]));exit_index=k;break
  if take:status='TARGET';price=target;exit_index=k;break
  close=int(a['t'][k]+c.WIDTH);j=int(np.searchsorted(source_bars['t'],close,side='right')-1)
  if j>=4 and source_bars['t'][j]==close:
   pivot=j-2
   if sign==1 and source_bars['l'][pivot]<min(source_bars['l'][pivot-2:pivot])and source_bars['l'][pivot]<min(source_bars['l'][pivot+1:pivot+3]):stop_current=max(stop_current,float(source_bars['l'][pivot]))
   if sign==-1 and source_bars['h'][pivot]>max(source_bars['h'][pivot-2:pivot])and source_bars['h'][pivot]>max(source_bars['h'][pivot+1:pivot+3]):stop_current=min(stop_current,float(source_bars['h'][pivot]))
 if status=='OPEN':return {'status':'OPEN','entryTime':c.iso(a['t'][start]),'entryPrice':fill,'netR':None,'unrealizedGrossR':(float(a['c'][limit-1])-fill)*sign/risk,'knownAt':None}
 fc=c.funding_cost(a,ft,fr,int(a['t'][start]),int(a['t'][exit_index]),sign,fill);gross=(price-fill)*sign;return {'status':status,'entryTime':c.iso(a['t'][start]),'exitTime':c.iso(a['t'][exit_index]),'knownAt':c.iso(a['t'][exit_index]+c.WIDTH),'entryPrice':fill,'exitPrice':price,'grossR':gross/risk,'netR':(gross-fill*.0016-fc)/risk,'stressR':(gross-fill*.0024-max(fc,0)*1.5-min(fc,0))/risk,'costR':(fill*.0016+fc)/risk,'fundingQuote':fc}

if __name__=='__main__':
 for symbol in c.p['assets']:
  a,ft,fr,manifests=c.read(symbol);sources.extend(manifests);h4=c.aggregate(a,48);h4ema=c.ema(h4['c'],50)
  for minutes in protocol['rsiTimeframesMinutes']:
   factor=minutes//5;b=c.aggregate(a,factor);r2=c.rsi(b['c'],2);av=c.atr(b);native_exit=np.zeros(len(a['t']))
   for j,t in enumerate(b['t']):
    idx=int(np.searchsorted(a['t']+c.WIDTH,t));native_exit[idx]=r2[j]
   for stage in ['development','validation','later']:
    period=c.p[stage];begin=c.ms(period['from']);end=c.ms(period['until']);trades=[];active=0
    for j,t in enumerate(b['t']):
     if not begin<=t<end or t<active or j<25:continue
     h4i=int(np.searchsorted(h4['t'],t,side='right')-1)
     if h4i<50 or not r2[j]<5 or not b['c'][j]>h4ema[h4i]:continue
     idx=int(np.searchsorted(a['t']+c.WIDTH,t));entry=float(b['c'][j]);stop=entry-2*av[j];target=float(b['h'][j-20:j].max());outcome=c.simulate(a,ft,fr,idx,'buy',stop,target,max_bars=72,exit_rsi=native_exit,period_end=end)
     if not outcome or outcome['status']=='EXCLUDED':continue
     row={'role':f'RSI2_PROTECTED_{minutes}M','symbol':symbol,'at':c.iso(t),'side':'buy','entry':entry,'stop':stop,'target':target,'outcome':outcome};trades.append(row);active=c.ms(outcome['knownAt'])if outcome['knownAt']else end
    cases.append({'role':f'RSI2_PROTECTED_{minutes}M','symbol':symbol,'stage':stage,'summary':c.metrics(trades),'trades':trades})
  for minutes in protocol['grailTimeframesMinutes']:
   factor=minutes//5;b=c.aggregate(a,factor);e=c.ema(b['c'],20);strength,plus,minus=adx(b)
   for stage in ['development','validation','later']:
    period=c.p[stage];begin=c.ms(period['from']);end=c.ms(period['until']);trades=[];active=0;armed=0;peak=None;pull=None;dipped=True
    for j,t in enumerate(b['t']):
     if t<begin:continue
     if t>=end:break
     if j<60:continue
     if strength[j]<strength[j-1]:dipped=True
     if t<active:continue
     if not armed and dipped and strength[j]>30 and strength[j]>strength[j-1]:armed=1 if plus[j]>minus[j]else-1;peak=float(b['h'][j]if armed==1 else b['l'][j]);pull=None;dipped=False
     if not armed:continue
     if armed==1 and b['h'][j]>peak:peak=float(b['h'][j]);pull=None
     if armed==-1 and b['l'][j]<peak:peak=float(b['l'][j]);pull=None
     pull=float(b['l'][j]if armed==1 else b['h'][j])if pull is None else min(pull,float(b['l'][j]))if armed==1 else max(pull,float(b['h'][j]))
     touched=b['l'][j]<=e[j]and b['c'][j-1]>e[j-1]if armed==1 else b['h'][j]>=e[j]and b['c'][j-1]<e[j-1]
     if not touched:continue
     side='buy'if armed==1 else'sell';trigger=float(b['h'][j-1]if armed==1 else b['l'][j-1]);first=int(np.searchsorted(a['t'],t));last=min(first+factor,int(np.searchsorted(a['t'],end)));filled=None
     for k in range(first,last):
      if(armed==1 and a['h'][k]>trigger)or(armed==-1 and a['l'][k]<trigger):filled=k;break
     if filled is None:continue
     fill=float(max(a['o'][filled],trigger)if armed==1 else min(a['o'][filled],trigger));outcome=stop_trade(a,ft,fr,filled,fill,side,pull,peak,end,b,factor)
     armed=0
     if outcome['status']=='EXCLUDED':continue
     trades.append({'role':f'GRAIL_STOP_ENTRY_{minutes}M','symbol':symbol,'at':c.iso(t),'side':side,'entry':fill,'stop':pull,'target':peak,'outcome':outcome});active=c.ms(outcome['knownAt'])if outcome['knownAt']else end
    cases.append({'role':f'GRAIL_STOP_ENTRY_{minutes}M','symbol':symbol,'stage':stage,'summary':c.metrics(trades),'trades':trades})
  print(json.dumps({'symbol':symbol,'cases':len(cases)}),flush=True)
 pooled=[]
 for role in sorted(set(r['role']for r in cases)):
  for stage in ['development','validation','later']:
   trades=[t for r in cases if r['role']==role and r['stage']==stage for t in r['trades']];s=c.metrics(trades);pooled.append({'role':role,'stage':stage,'summary':s});print(json.dumps(pooled[-1]),flush=True)
 if any(c.sha(pathlib.Path(k).read_bytes())!=h for k,h in frozen.items()):raise ValueError('SOURCE_CHANGED')
 result={'protocol':protocol,'sourceHashes':frozen,'sources':sources,'pooled':pooled,'cases':cases,'classification':'STOP_ENTRY_AND_TIMEFRAME_REFERENCE_NOT_SCANNER_APPROVAL','publication':False,'execution':False,'promotion':False};pathlib.Path('docs/research/public-playbooks/higher.json.gz').write_bytes(gzip.compress(json.dumps(result).encode(),mtime=0));pathlib.Path('docs/research/public-playbooks/higher-summary.json').write_text(json.dumps({**result,'cases':[{k:v for k,v in r.items()if k!='trades'}for r in cases]},indent=2)+'\n')
