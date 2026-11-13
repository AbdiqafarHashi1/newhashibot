"""Causal native bid/ask family screening; no scanner qualification or provider authority."""
import ctypes,hashlib,itertools,json,pathlib,subprocess,argparse
import numpy as np
import pandas as pd
import search
ROOT=search.ROOT
class BrokerData(search.Data):
 def __init__(self,folder,months,symbols):
  self.symbols=symbols;frames=[];self.manifests=[]
  for symbol in symbols:
   rows=[]
   for month in months:
    path=folder/f'{symbol}-5m-{month}.json';raw=path.read_bytes();manifest=json.loads(path.with_suffix('.manifest.json').read_text())
    if manifest['source']!='EXNESS_BROKER_BID_ASK' or hashlib.sha256(raw).hexdigest()!=manifest['rowsSha256']:raise ValueError('BROKER_SOURCE_HASH_INVALID')
    rows+=json.loads(raw);self.manifests.append(manifest)
   f=pd.DataFrame(rows);f.index=pd.to_datetime(f.open_time,utc=True);f=f.rename(columns={'open':'o','high':'h','low':'l','close':'c','volume':'v'});f['qv']=0
   if f.index.has_duplicates or not f.index.is_monotonic_increasing or (f.ask_open<f.o).any():raise ValueError('BROKER_CLOCK_OR_QUOTES_INVALID')
   frames.append(f)
  self.frames=frames;clock=frames[0].index
  for f in frames[1:]:clock=clock.union(f.index)
  self.clock=clock.sort_values();self.t=np.ascontiguousarray(self.clock.asi8/1e6,dtype=np.float64);self.cache={};self.atr={}
  self.native=[np.ascontiguousarray(np.column_stack([f[k].reindex(self.clock) for f in frames]),dtype=np.float64) for k in ['o','ask_open','h','l','ask_high','ask_low','c','ask_close']]
  self.contracts=np.ascontiguousarray([100 if s=='XAUUSD' else 100000 for s in symbols],dtype=np.float64);self.ticks=np.ascontiguousarray([.01 if s=='XAUUSD' else .001 if s.endswith('JPY') else .00001 for s in symbols],dtype=np.float64);self.inverse=np.ascontiguousarray([int(s in ['USDJPY','USDCAD']) for s in symbols],dtype=np.int32)
def engine():
 target=ROOT/'.tmp/launch-research/broker_screen.so';subprocess.run(['g++','-O3','-std=c++17','-shared','-fPIC',str(ROOT/'scripts/research/launch/broker_account_screen.cpp'),'-o',str(target)],check=True);lib=ctypes.CDLL(str(target));run=lib.broker_screen;D=ctypes.POINTER(ctypes.c_double);I=ctypes.POINTER(ctypes.c_int);B=ctypes.POINTER(ctypes.c_byte);run.argtypes=[ctypes.c_int,ctypes.c_int]+[D]*9+[B]+[D]*3+[I,ctypes.c_int,ctypes.c_int]+[ctypes.c_double]*8+[D,D,ctypes.c_int];run.restype=ctypes.c_int;return run
def simulate(data,cfg,start,end,run):
 signal,atr=data.feature(cfg['family'],cfg['timeframe'],cfg['lookback'],cfg.get('minimumAtrFraction',0));begin=int(np.searchsorted(data.t,search.stamp(start)));end=int(np.searchsorted(data.t,search.stamp(end)));out=np.zeros(10);trades=np.zeros((50000,9));D=ctypes.POINTER(ctypes.c_double);ptr=lambda a:a.ctypes.data_as(D)
 rc=run(len(data.t),len(data.symbols),*[ptr(a) for a in data.native],ptr(atr),signal.ctypes.data_as(ctypes.POINTER(ctypes.c_byte)),ptr(data.t),ptr(data.contracts),ptr(data.ticks),data.inverse.ctypes.data_as(ctypes.POINTER(ctypes.c_int)),begin,end,.5,5,cfg['stopAtr'],cfg['rewardR'],cfg.get('maxHoldBars',cfg['lookback']*4)*cfg['timeframe']*60000,3.5,.5,10000,ptr(out),ptr(trades),len(trades))
 if rc:raise ValueError('BROKER_SCREEN_FAILED')
 return {'equityReturnPct':(out[0]/10000-1)*100,'maximumDrawdownPct':out[1],'profitFactor':out[2]/out[3] if out[3]>0 else None,'closedTrades':int(out[4]),'entries':int(out[5]),'blocked':int(out[6]),'failed':bool(out[7]),'costs':out[8],'openPositions':int(out[9])}
def main():
 p=argparse.ArgumentParser();p.add_argument('--market',choices=['forex','gold'],required=True);p.add_argument('--symbols');a=p.parse_args();folder=ROOT/'.tmp/launch-research/exness-data';symbols=['XAUUSD'] if a.market=='gold' else ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD'];symbols=a.symbols.split(',') if a.symbols else symbols;data=BrokerData(folder,[f'2025-{m:02}' for m in range(1,9)],symbols);run=engine();grid=[c for c in search.GRID if c['family']!='vwap_reclaim'];rows=[]
 for i,c in enumerate(grid):
  rows.append({'configuration':c,'development':simulate(data,c,'2025-01-20','2025-04-01',run)})
  if i%81==80:print(a.market,'development',i+1,flush=True)
 shortlisted=[]
 for family in search.FAMILIES:
  ranked=sorted([r for r in rows if r['configuration']['family']==family and r['development']['closedTrades']>=20 and r['development']['equityReturnPct']>0 and (r['development']['profitFactor'] or 0)>1 and not r['development']['failed']],key=lambda r:r['development']['equityReturnPct']/max(r['development']['maximumDrawdownPct'],2),reverse=True)
  for r in ranked[:12]:r['validation']=simulate(data,r['configuration'],'2025-04-01','2025-06-01',run);shortlisted.append(r)
 survivors=[r for r in shortlisted if r['validation']['closedTrades']>=10 and r['validation']['equityReturnPct']>0 and (r['validation']['profitFactor'] or 0)>1 and not r['validation']['failed']]
 for r in survivors:r['later']=simulate(data,r['configuration'],'2025-06-01','2025-09-01',run)
 report={'schema':'native-broker-family-screen/v1','market':a.market,'symbols':symbols,'selection':'648 fixed configurations; Jan–Mar development, Apr–May validation, Jun–Aug later period. No claimed untouched holdout after this report is inspected.','limitations':['Separate account screen, not scanner/arbitration qualification','Bid/ask observed; commission/contract/leverage/carry/slippage are scenarios','Features across incomplete session buckets require canonical replay verification','Tick counts are quote activity, not traded volume; no VWAP family used'],'gridCount':len(grid),'shortlisted':shortlisted,'survivors':survivors,'sourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()+(ROOT/'scripts/research/launch/broker_account_screen.cpp').read_bytes()+(ROOT/'scripts/research/launch/search.py').read_bytes()).hexdigest(),'manifests':data.manifests,'initialCapital':10000,'riskPct':.5,'effectiveLeverageCap':5,'automaticPromotion':False};out=ROOT/f'.tmp/launch-research/broker-family-{a.market}{'-'+a.symbols if a.symbols else ''}.json';out.write_text(json.dumps(report,indent=2));print(a.market,'SURVIVORS',json.dumps(survivors),flush=True)
if __name__=='__main__':main()
