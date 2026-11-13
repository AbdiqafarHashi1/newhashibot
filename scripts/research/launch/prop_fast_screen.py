"""Exploratory bid/ask parameter screen only; never canonical qualification."""
import ctypes,itertools,json,pathlib,sys,numpy as np
sys.path.insert(0,str(pathlib.Path(__file__).parent));import broker_search as broker,search
symbol=sys.argv[1];data=broker.BrokerData(search.ROOT/'.tmp/launch-research/exness-data',[f'2025-{m:02}' for m in range(1,9)],[symbol]);run=broker.engine();D=ctypes.POINTER(ctypes.c_double);ptr=lambda x:x.ctypes.data_as(D)
starts=['2025-03-01','2025-03-15','2025-04-01','2025-04-15','2025-05-01','2025-05-15'];rows=[]
for family,tf,n,stop,rr,hold in itertools.product(['momentum','squeeze','rsi2','band_reentry'],[5,15],[12,24,48],[1,1.5,2],[2,3,5],[12,24,48]):
 sig,atr=data.feature(family,tf,n);values=[]
 for start in starts:
  begin=int(np.searchsorted(data.t,search.stamp(start)));end=int(np.searchsorted(data.t,search.stamp(start)+30*86400000));out=np.zeros(10);trades=np.zeros((1000,9));rc=run(len(data.t),1,*[ptr(x) for x in data.native],ptr(atr),sig.ctypes.data_as(ctypes.POINTER(ctypes.c_byte)),ptr(data.t),ptr(data.contracts),ptr(data.ticks),data.inverse.ctypes.data_as(ctypes.POINTER(ctypes.c_int)),begin,end,1,10,stop,rr,hold*tf*60000,3.5,.5,10000,ptr(out),ptr(trades),len(trades));assert rc==0;values.append({'returnPct':(out[0]/10000-1)*100,'drawdownPct':out[1],'trades':int(out[4]),'failed':bool(out[7])})
 rows.append({'symbol':symbol,'family':family,'minutes':tf,'n':n,'stop':stop,'rr':rr,'hold':hold,'hits15':sum(x['returnPct']>=15 and x['drawdownPct']<8 for x in values),'hits5':sum(x['returnPct']>=5 and x['drawdownPct']<8 for x in values),'worstDD':max(x['drawdownPct'] for x in values),'meanReturn':sum(x['returnPct'] for x in values)/6,'windows':values})
path=search.ROOT/'.tmp/prop-objectives'/f'parameter-{symbol}.json';path.write_text(json.dumps({'classification':'APPROXIMATE_SCREEN_NOT_CANONICAL_BRAIN_OR_PHASE_REPLAY','gridCount':len(rows),'scenarioCount':len(rows)*6,'riskPct':1,'leverage':10,'rows':rows},default=lambda x:x.item()));print(json.dumps(sorted(rows,key=lambda x:(x['hits15'],x['hits5'],-x['worstDD'],x['meanReturn']),reverse=True)[:3],default=lambda x:x.item()))
