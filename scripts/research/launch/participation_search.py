"""New entry families; separate costed screens, never automatic release authority."""
import argparse,hashlib,itertools,json,pathlib
import broker_search as broker
import search
FAMILIES=['sweep_retest','band_reentry','london_range_break']
def main():
 p=argparse.ArgumentParser();p.add_argument('--symbols',default='EURUSD,GBPUSD,USDJPY,AUDUSD,USDCAD,XAUUSD');a=p.parse_args();run=broker.engine();out=search.ROOT/'.tmp/launch-research/participation';out.mkdir(exist_ok=True);grid=[dict(family=f,timeframe=tf,lookback=n,stopAtr=stop,rewardR=rr) for f,tf,n,stop,rr in itertools.product(FAMILIES,[15,60],[12,24,48],[1.5,2,3],[1.5,3,5])]
 for symbol in a.symbols.split(','):
  data=broker.BrokerData(search.ROOT/'.tmp/launch-research/exness-data',[f'2025-{m:02}' for m in range(1,9)],[symbol]);rows=[]
  for cfg in grid:rows.append({'configuration':cfg,'development':broker.simulate(data,cfg,'2025-01-20','2025-04-01',run)})
  selected=[]
  for family in FAMILIES:
   ranked=sorted([r for r in rows if r['configuration']['family']==family and r['development']['closedTrades']>=20 and (r['development']['profitFactor'] or 0)>1 and r['development']['equityReturnPct']>0 and not r['development']['failed']],key=lambda r:r['development']['equityReturnPct']/max(2,r['development']['maximumDrawdownPct']),reverse=True)
   for r in ranked[:8]:r['validation']=broker.simulate(data,r['configuration'],'2025-04-01','2025-06-01',run);selected.append(r)
  for r in selected:
   m=r['validation']
   if m['closedTrades']>=10 and (m['profitFactor'] or 0)>1 and m['equityReturnPct']>0 and not m['failed']:r['later']=broker.simulate(data,r['configuration'],'2025-06-01','2025-09-01',run)
  report={'schema':'participation-entry-screen/v1','symbol':symbol,'gridCount':len(grid),'protocol':{'development':['2025-01-20','2025-04-01'],'validation':['2025-04-01','2025-06-01'],'later':['2025-06-01','2025-09-01'],'selection':'Top eight positive costed development configurations per family; later periods already observed in previous research are not an untouched holdout'},'sourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()+pathlib.Path(broker.__file__).read_bytes()+pathlib.Path(search.__file__).read_bytes()+(search.ROOT/'scripts/research/launch/broker_account_screen.cpp').read_bytes()).hexdigest(),'results':selected,'manifests':data.manifests,'limitations':['Native bid/ask; explicit commission, carry and slippage scenarios','ATR stops/fixed reward exits are initial screens, not opposite-liquidity target claims','Canonical scanner/account replay is required before customer activation'],'automaticPromotion':False};(out/(symbol+'.json')).write_text(json.dumps(report,indent=2));print(symbol,'screened',len(grid),'later positive',sum('later'in r and r['later']['equityReturnPct']>0 and (r['later']['profitFactor'] or 0)>1 for r in selected),flush=True)
if __name__=='__main__':main()
