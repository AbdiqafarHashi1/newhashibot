"""Scalp and swing are selected independently so one style cannot crowd out the other.
Frozen entry, stop, target and holding contracts; genuine native source, no deployment effects.
"""
import argparse,gc,hashlib,itertools,json,pathlib
import search,broker_search as broker
FAMILIES=['trend_pullback','donchian','squeeze','sweep_retest','band_reentry','rsi2']
def main():
 p=argparse.ArgumentParser();p.add_argument('--market',choices=['crypto','forex'],required=True);p.add_argument('--symbols');p.add_argument('--scalp-only',action='store_true');p.add_argument('--expanded',action='store_true');a=p.parse_args();root=search.ROOT;months=[f'2025-{m:02}' for m in range(1,9)];symbols=a.symbols.split(',') if a.symbols else (search.SYMBOLS if a.market=='crypto' else ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD']);data=search.Data(root/'.tmp/mission2/futures-data',months,symbols) if a.market=='crypto' else broker.BrokerData(root/'.tmp/launch-research/exness-data',months,symbols);run=search.engine() if a.market=='crypto' else broker.engine();simulate=search.simulate if a.market=='crypto' else broker.simulate;selected=[];counts={}
 families=FAMILIES+(['momentum','bollinger','failed_breakout','london_range_break']+(['vwap_reclaim'] if a.market=='crypto' else []) if a.expanded else [])
 styles=[('SCALP',[5,15],[12,24,48] if a.expanded else [8,16,32],[12,24] if a.expanded else [6,12])]+([] if a.scalp_only else [('SWING',[60,240],[16,32,48],[24,72])])
 for style,frames,lookbacks,holds in styles:
  grid=[dict(family=f,timeframe=tf,lookback=n,stopAtr=s,rewardR=r,maxHoldBars=hold,style=style) for f,tf,n,s,r,hold in itertools.product(families,frames,lookbacks,[1.5,2,3],[1.5,3,5],holds)];counts[style]=len(grid);rows=[{'configuration':c,'development':simulate(data,c,'2025-01-20','2025-04-01',run)} for c in grid]
  for family in families:
   ranked=sorted([r for r in rows if r['configuration']['family']==family and r['development']['closedTrades']>=20 and (r['development']['profitFactor'] or 0)>1 and r['development']['equityReturnPct']>0 and not r['development'].get('failed',r['development'].get('accountFailed',False))],key=lambda r:r['development']['equityReturnPct']/max(2,r['development']['maximumDrawdownPct']),reverse=True)
   for r in ranked[:6]:r['validation']=simulate(data,r['configuration'],'2025-04-01','2025-06-01',run);selected.append(r)
  print(a.market,symbols,style,'screened',len(grid),flush=True)
 for r in selected:
  m=r['validation']
  if m['closedTrades']>=10 and (m['profitFactor'] or 0)>1 and m['equityReturnPct']>0 and not m.get('failed',m.get('accountFailed',False)):r['later2025']=simulate(data,r['configuration'],'2025-06-01','2025-09-01',run)
 if a.market=='crypto':
  del data;gc.collect();data=search.Data(root/'.tmp/mission2/futures-data',[f'2026-{m:02}' for m in range(7,11)],symbols)
  for r in selected:
   if 'later2025'in r:r['later2026']=simulate(data,r['configuration'],'2026-08-01','2026-11-01',run)
 report={'schema':'style-coverage-screen/v1','market':a.market,'symbols':symbols,'families':families,'scalpOnly':a.scalp_only,'expanded':a.expanded,'gridCountByStyle':counts,'selection':'Top six positive-costed development results per style/family; Jan–Mar development, Apr–May validation, Jun–Aug later observation; crypto also Aug–Oct2026. Previous observations preclude an untouched holdout claim.','sourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()+pathlib.Path(search.__file__).read_bytes()+pathlib.Path(broker.__file__).read_bytes()+(root/'scripts/research/launch/account_screen.cpp').read_bytes()+(root/'scripts/research/launch/broker_account_screen.cpp').read_bytes()).hexdigest(),'results':selected,'limitations':['Screen is not the canonical scanner, arbitration or account Brain','Costs and contract filters remain explicit scenarios','Scalp holding horizon is part of every configuration; increasing timeout is not a hidden strategy change'],'automaticPromotion':False};out=root/('.tmp/launch-research/scalps' if a.scalp_only else '.tmp/launch-research/styles');out.mkdir(exist_ok=True);(out/(a.market+'-'+ '-'.join(symbols)+'.json')).write_text(json.dumps(report,indent=2));print('Completed',a.market,symbols,flush=True)
if __name__=='__main__':main()
