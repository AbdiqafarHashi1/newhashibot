"""Native perpetual entry expansion; separate causal screen, not customer execution approval."""
import gc,hashlib,itertools,json,pathlib
import search
ROOT=search.ROOT
families=['sweep_retest','band_reentry','london_range_break'];grid=[dict(family=f,timeframe=tf,lookback=n,stopAtr=s,rewardR=r) for f,tf,n,s,r in itertools.product(families,[15,60],[12,24,48],[1.5,2,3],[1.5,3,5])];run=search.engine();folder=ROOT/'.tmp/mission2/futures-data';data=search.Data(folder,[f'2025-{m:02}' for m in range(1,9)]);rows=[{'configuration':c,'development':search.simulate(data,c,'2025-01-20','2025-04-01',run)} for c in grid];selected=[]
for family in families:
 ranked=sorted([r for r in rows if r['configuration']['family']==family and r['development']['closedTrades']>=30 and (r['development']['profitFactor'] or 0)>1 and r['development']['equityReturnPct']>0 and not r['development']['accountFailed']],key=lambda r:r['development']['equityReturnPct']/max(2,r['development']['maximumDrawdownPct']),reverse=True)
 for r in ranked[:8]:r['validation']=search.simulate(data,r['configuration'],'2025-04-01','2025-06-01',run);selected.append(r)
passed=[r for r in selected if r['validation']['closedTrades']>=20 and r['validation']['equityReturnPct']>0 and (r['validation']['profitFactor'] or 0)>1 and not r['validation']['accountFailed']]
for r in passed:r['later2025']=search.simulate(data,r['configuration'],'2025-06-01','2025-09-01',run)
del data;gc.collect();data=search.Data(folder,[f'2026-{m:02}' for m in range(7,11)])
for r in passed:r['later2026']=search.simulate(data,r['configuration'],'2026-08-01','2026-11-01',run)
out=ROOT/'.tmp/launch-research/crypto-participation.json';out.parent.mkdir(exist_ok=True,parents=True);out.write_text(json.dumps({'schema':'crypto-participation-screen/v1','gridCount':len(grid),'families':families,'sourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()+pathlib.Path(search.__file__).read_bytes()+(ROOT/'scripts/research/launch/account_screen.cpp').read_bytes()).hexdigest(),'results':selected,'limitations':['Native USD-M account screen with explicit exchange-filter, fee and carry assumptions','Observed later periods are not a new untouched holdout','Canonical scanner, arbitration, account and participation replay required before activation'],'automaticPromotion':False},indent=2));print('Completed',len(grid),'new crypto entry configurations',flush=True)
