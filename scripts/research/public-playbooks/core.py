"""Source-faithful reference diagnostics and separately declared protected adaptations.
Not a production scanner, publication authority, or replacement execution engine.
"""
import collections,datetime,gzip,hashlib,json,math,pathlib,sys
import numpy as np
root=pathlib.Path(sys.argv[1]);out=pathlib.Path('docs/research/public-playbooks');p=json.loads(pathlib.Path('scripts/research/public-playbooks/protocol.json').read_text());WIDTH=300000
sha=lambda b:hashlib.sha256(b).hexdigest()
ms=lambda s:int(datetime.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()*1000)
iso=lambda t:datetime.datetime.fromtimestamp(t/1000,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
source_hashes={}
roles=['crypto.pub-orb','crypto.pub-vwap','crypto.pub-rsi-dip','crypto.pub-band-range','crypto.pub-day-sweep','crypto.pub-ema100']

def ema(x,n):
 y=np.full(len(x),np.nan)
 if len(x)<n:return y
 y[n-1]=np.mean(x[:n]);a=2/(n+1)
 for i in range(n,len(x)):y[i]=a*x[i]+(1-a)*y[i-1]
 return y

def mean(x,n):
 y=np.full(len(x),np.nan);cs=np.r_[0.,np.cumsum(x)];y[n-1:]=(cs[n:]-cs[:-n])/n;return y

def rsi(x,n,wilder=True):
 d=np.r_[0.,np.diff(x)];up=np.maximum(d,0);down=np.maximum(-d,0)
 if wilder:
  a=np.full(len(x),np.nan);b=a.copy()
  if len(x)>n:
   a[n]=np.mean(up[1:n+1]);b[n]=np.mean(down[1:n+1])
   for i in range(n+1,len(x)):a[i]=(a[i-1]*(n-1)+up[i])/n;b[i]=(b[i-1]*(n-1)+down[i])/n
 else:a=mean(up,n);b=mean(down,n)
 with np.errstate(divide='ignore',invalid='ignore'):y=100-100/(1+a/b)
 y=np.where((a==0)&(b==0),50,np.where((b==0)&(a>0),100,y));return y

def atr(a,n=14):
 tr=np.maximum(a['h']-a['l'],np.maximum(np.abs(a['h']-np.r_[a['c'][0],a['c'][:-1]]),np.abs(a['l']-np.r_[a['c'][0],a['c'][:-1]])));y=np.full(len(tr),np.nan)
 if len(tr)>n:
  y[n]=np.mean(tr[1:n+1])
  for i in range(n+1,len(tr)):y[i]=(y[i-1]*(n-1)+tr[i])/n
 return y

def aggregate(a,factor):
 n=len(a['t'])//factor;g=lambda k:a[k][:n*factor].reshape(n,factor)
 if np.any(g('t')[:,0]%(WIDTH*factor))or np.any(np.diff(g('t'),axis=1)!=WIDTH):raise ValueError('PARTIAL_HIGHER_TIMEFRAME')
 return {'t':g('t')[:,0]+WIDTH*factor,'o':g('o')[:,0],'h':g('h').max(1),'l':g('l').min(1),'c':g('c')[:,-1],'v':g('v').sum(1)}

def read(symbol):
 rows=[];fund=[];sources=[]
 for y in [2025,2026]:
  for m in range(1,10 if y==2026 else 13):
   for kind in ['klines','fundingRate']:
    name=f'{symbol}-5m-{y}-{m:02d}'if kind=='klines'else f'{symbol}-fundingRate-{y}-{m:02d}';raw=(root/(name+'.json')).read_bytes();z=(root/(name+'.zip')).read_bytes();check=(root/(name+'.zip.CHECKSUM')).read_text().split()[0];meta=json.loads((root/(name+'.manifest.json')).read_text());expected=f'https://data.binance.vision/data/futures/um/monthly/{kind}/{symbol}/'+('5m/'if kind=='klines'else'')+name+'.zip'
    if sha(raw)!=meta['datasetSha256']or sha(z)!=check or check!=meta['rawSha256']or meta['sourceUrl']!=expected:raise ValueError('SOURCE_HASH_OR_IDENTITY')
    part=json.loads(raw)
    if len(part)!=meta['rows']:raise ValueError('SOURCE_COUNT')
    (rows if kind=='klines'else fund).extend(part);sources.append(meta)
 a={k:np.array([ms(r['open_time'])if k=='t'else r[key]for r in rows])for k,key in [('t','open_time'),('o','open'),('h','high'),('l','low'),('c','close'),('v','volume')]}
 if len(rows)!=183744 or np.any(np.diff(a['t'])!=WIDTH)or a['t'][0]!=ms('2025-01-01T00:00:00Z')or a['t'][-1]+WIDTH!=ms('2026-10-01T00:00:00Z'):raise ValueError('NATIVE_CONTINUITY')
 if any(r['symbol']!=symbol or r['timeframe']!='5m'or r['source']!='BINANCE_USDM_KLINES'or r['instrument_type']!='USDT_PERPETUAL'for r in rows):raise ValueError('NATIVE_IDENTITY')
 ft=np.array([r['calcTimeMs']for r in fund]);fr=np.array([r['rate']for r in fund]);fi=np.array([r['intervalHours']for r in fund])
 if np.any(np.diff(ft)<=0)or ft[0]>a['t'][0]+86400000 or ft[-1]<a['t'][-1]-86400000 or np.any(np.diff(ft)>86400000)or np.any(fi<1)or np.any(fi>24):raise ValueError('FUNDING_COVERAGE')
 return a,ft,fr,sources

def funding_cost(a,ft,fr,entry,exit,sign,entry_price):
 left=np.searchsorted(ft,entry-15000);right=np.searchsorted(ft,exit+15000,side='right');value=0.
 for t,rate in zip(ft[left:right],fr[left:right]):
  amount=sign*float(rate)*float(a['o'][min(len(a['o'])-1,max(0,int(np.searchsorted(a['t'],t,side='right')-1)))])
  certain=t>entry+15000 and t<exit-15000
  if certain or amount>0:value+=amount
 return value

def simulate(a,ft,fr,i,side,stop,target,max_bars=72,exit_rsi=None,period_end=None):
 start=i+1
 if start>=len(a['t'])or a['t'][start]>=period_end:return None
 entry=float(a['o'][start]);sign=1 if side=='buy'else-1;risk=(entry-stop)*sign
 if risk<=0 or(target-entry)*sign<=0:return {'status':'EXCLUDED','reason':'INVALID_NEXT_OPEN_GEOMETRY'}
 end=min(start+max_bars,int(np.searchsorted(a['t'],period_end)),len(a['t']));pending=False;status='OPEN';exit_price=None;exit_index=None
 for j in range(start,end):
  if pending:status='RULE_EXIT';exit_price=float(a['o'][j]);exit_index=j;break
  stop_hit=a['l'][j]<=stop if sign==1 else a['h'][j]>=stop;target_hit=a['h'][j]>=target if sign==1 else a['l'][j]<=target
  if stop_hit:status='STOP';exit_price=float(min(stop,a['o'][j])if sign==1 else max(stop,a['o'][j]));exit_index=j;break
  if target_hit:status='TARGET';exit_price=target;exit_index=j;break
  if exit_rsi is not None and exit_rsi[j]>60:pending=True
 if status=='OPEN'and end-start==max_bars:status='TIMEOUT';exit_index=end-1;exit_price=float(a['c'][exit_index])
 if status=='OPEN':return {'status':'OPEN','entryPrice':entry,'entryTime':iso(a['t'][start]),'netR':None,'unrealizedGrossR':(float(a['c'][end-1])-entry)*sign/risk if end>start else None,'knownAt':None}
 exit_ms=int(a['t'][exit_index]);held_until=exit_ms+WIDTH if status=='TIMEOUT'else exit_ms;fc=funding_cost(a,ft,fr,int(a['t'][start]),held_until,sign,entry);cost=entry*.0016+fc;stress=entry*.0024+max(fc,0)*1.5+min(fc,0);gross=(exit_price-entry)*sign
 return {'status':status,'entryPrice':entry,'exitPrice':exit_price,'entryTime':iso(a['t'][start]),'exitTime':iso(exit_ms),'knownAt':iso(exit_ms+WIDTH),'grossR':gross/risk,'netR':(gross-cost)/risk,'stressR':(gross-stress)/risk,'costR':cost/risk,'fundingQuote':fc,'fundingNotionalModel':'TRADE_CANDLE_OPEN_PROXY_NOT_MARK_PRICE','bars':exit_index-start+1}

def metrics(trades):
 resolved=[t for t in trades if t['outcome'].get('netR')is not None];r=[t['outcome']['netR']for t in resolved];s=[t['outcome']['stressR']for t in resolved]
 pf=lambda x:sum(max(v,0)for v in x)/sum(max(-v,0)for v in x)if sum(max(-v,0)for v in x)>0 else None
 return {'selected':len(trades),'resolved':len(r),'open':sum(t['outcome']['status']=='OPEN'for t in trades),'netPF':pf(r),'stressPF':pf(s),'expectancyR':sum(r)/len(r)if r else None}

def indicators(a):
 h=aggregate(a,12);h4=aggregate(a,48);h['atr']=atr(h);h['ema100']=ema(h['c'],100);h['mid']=mean(h['c'],20);h['sd']=np.sqrt(np.maximum(0,mean(h['c']**2,20)-h['mid']**2));h['lo']=h['mid']-2*h['sd'];h['hi']=h['mid']+2*h['sd'];h['width']=(h['hi']-h['lo'])/h['mid'];h['q75']=np.full(len(h['t']),np.nan)
 for k in range(120,len(h['t'])):h['q75'][k]=np.quantile(h['width'][k-120:k],.75)
 h4['ema50']=ema(h4['c'],50);native_atr=atr(a);native_rsi=rsi(a['c'],2);e20=ema(a['c'],20);vol=mean(a['v'],20);return h,h4,native_atr,native_rsi,e20,vol

def candidates(a,h,h4,at,r2,e20,vol):
 result=[];t=a['t'];day=t//86400000;oh=ol=None;or_day=-1;or_seen=set();sweep_seen=set();anchor_day=-1;sumv=sumvp=sumvp2=0.;armed=0;last_lo=last_hi=None
 for i in range(6000,len(t)-1):
  close=int(t[i]+WIDTH);hh=int(np.searchsorted(h['t'],close,side='right')-1);h4i=int(np.searchsorted(h4['t'],close,side='right')-1)
  if hh<120 or h4i<50 or not math.isfinite(at[i]):continue
  c,o,lo,hi=[float(a[k][i])for k in ['c','o','l','h']];atr5=float(at[i]);minute=int((t[i]%86400000)//60000);d=int(day[i]);prior20vol=float(vol[i-1]);h1atr=float(h['atr'][hh])
  def add(role,side,stop,target,reason):
   risk=(c-stop)*(1 if side=='buy'else-1);reward=(target-c)*(1 if side=='buy'else-1)
   if risk>0 and reward>0 and stop>0 and target>0:result.append({'role':role,'symbol':'','at':iso(close),'index':i,'side':side,'entry':c,'stop':float(stop),'target':float(target),'riskReward':reward/risk,'reason':reason})
  # Source UTC crypto ORB, no synthetic 1m entry or stock-open transfer claim.
  if d!=or_day:or_day=d;oh=ol=None;or_seen=set()
  if 540<=minute<555:oh=hi if oh is None else max(oh,hi);ol=lo if ol is None else min(ol,lo)
  if 555<=minute<660 and oh is not None and ol is not None and a['v'][i]>1.5*prior20vol:
   side='buy'if c>oh else'sell'if c<ol else''
   if side and side not in or_seen:or_seen.add(side);add('crypto.pub-orb',side,(oh+ol)/2,oh+(oh-ol)if side=='buy'else ol-(oh-ol),'UTC15M_RANGE_VOLUME_BREAK')
  # Session VWAP complete to current bar only, prior extension then reversal touch.
  ad=int((t[i]-810*60000)//86400000)
  if ad!=anchor_day:anchor_day=ad;sumv=sumvp=sumvp2=0.;armed=0
  price=(hi+lo+c)/3;v=float(a['v'][i]);sumv+=v;sumvp+=v*price;sumvp2+=v*price*price;vw=sumvp/sumv if sumv else c;sd=math.sqrt(max(0,sumvp2/sumv-vw*vw))if sumv else 0
  if 810<=minute<1020:
   if armed==1 and lo<=vw<c and c>o:stop=min(c-atr5,lo);add('crypto.pub-vwap','buy',stop,c+2*(c-stop),'SESSION_VWAP_EXTENSION_PULLBACK');armed=0
   elif armed==-1 and hi>=vw>c and c<o:stop=max(c+atr5,hi);add('crypto.pub-vwap','sell',stop,c-2*(stop-c),'SESSION_VWAP_EXTENSION_PULLBACK');armed=0
   elif sd>0 and c>vw+2*sd:armed=1
   elif sd>0 and c<vw-2*sd:armed=-1
  if r2[i]<5 and c>h4['ema50'][h4i]:add('crypto.pub-rsi-dip','buy',c-2*h1atr,float(h['h'][hh]),'RSI2_HTF50_PROTECTED_ADAPTATION')
  # Closed-H1 range bar; evaluate exactly once, never on a mutable H1 bar.
  if close==h['t'][hh]and h['width'][hh]<=h['q75'][hh]:
   if h['l'][hh]<h['lo'][hh]and h['c'][hh]>h['lo'][hh]and h['c'][hh]>h['o'][hh]:add('crypto.pub-band-range','buy',float(h['l'][hh]-.1*h1atr),float(h['mid'][hh]),'QUIET_H1_BAND_REJECTION')
   if h['h'][hh]>h['hi'][hh]and h['c'][hh]<h['hi'][hh]and h['c'][hh]<h['o'][hh]:add('crypto.pub-band-range','sell',float(h['h'][hh]+.1*h1atr),float(h['mid'][hh]),'QUIET_H1_BAND_REJECTION')
  # Last completed UTC day, not an inference about actual hidden stop orders.
  if i>=288:
   begin=int(np.searchsorted(t,d*86400000-86400000));end=int(np.searchsorted(t,d*86400000));pdh=float(a['h'][begin:end].max());pdl=float(a['l'][begin:end].min());mid=(pdh+pdl)/2
   if lo<pdl<c and c-o>=.25*atr5 and (d,'buy')not in sweep_seen:sweep_seen.add((d,'buy'));add('crypto.pub-day-sweep','buy',lo-.1*atr5,mid,'PRIOR_DAY_LOW_RECLAIM')
   if hi>pdh>c and o-c>=.25*atr5 and (d,'sell')not in sweep_seen:sweep_seen.add((d,'sell'));add('crypto.pub-day-sweep','sell',hi+.1*atr5,mid,'PRIOR_DAY_HIGH_RECLAIM')
  if c>h['ema100'][hh]and a['c'][i-1]<=e20[i-1]and c>e20[i]and c>a['h'][i-1]and c>o:stop=float(a['l'][i-2:i+1].min()-.1*atr5);add('crypto.pub-ema100','buy',stop,c+2*(c-stop),'H1_BIAS_5M_RECLAIM_ADAPTATION')
  if c<h['ema100'][hh]and a['c'][i-1]>=e20[i-1]and c<e20[i]and c<a['l'][i-1]and c<o:stop=float(a['h'][i-2:i+1].max()+.1*atr5);add('crypto.pub-ema100','sell',stop,c-2*(stop-c),'H1_BIAS_5M_RECLAIM_ADAPTATION')
 return result

