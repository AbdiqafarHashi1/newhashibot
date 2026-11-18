"""Publish an optional demo review from exact completed canonical account outputs."""
import hashlib,json,pathlib
from features import ROOT
from study import OUT
strategy='gold.frontier-compression-15-24-1.5-5-h96';periods=[]
for name in ['compression-canonical-development-final','compression-canonical-validation-final']:
 p=OUT/(name+'.json');raw=p.read_bytes();s=json.loads(raw);assert s['status']=='COMPLETED' and s['experiment']['strategyScope']==strategy
 a=next(a for a in s['accounts'] if a['capital']==25000 and a['riskPct']==.5);m=a['metrics'];assert m['netReturnPct']>0 and m['closedTrades']>=10 and m['profitFactor']>1 and not m['accountFailed']
 periods.append(dict(reportSha256=hashlib.sha256(raw).hexdigest(),engineSourceSha256=s['engineSourceSha256'],status=s['status'],strategyIds=[strategy],start=s['funnel']['period']['start'],end=s['funnel']['period']['end'],metrics=m,capital=a['capital'],riskPct=a['riskPct']))
review=dict(schema='canonical-account-review/v1',strategyId=strategy,periods=periods,limitations=['Signal and forward demo scope only. No live authorization.','Retrospective May–June / July–October partitions. A May–July production-parity comparison lost 1.52%; it is retained in the research report.','The November 1–12 comparison has six closed trades and is a partial fresh observation, not a monthly return or independent success probability.','Native ordered-quote research and the shared OHLC account replay use different timing and lifecycle admission. Their returns are shown separately.','One full-position 5R target, up to 24-hour holding; commission, financing, slippage and contract rules remain scenarios.','New configuration is optional. The existing twelve-strategy bundle and seven-strategy Prop default are unchanged.'])
(ROOT/'supabase/functions/_shared/frontier-canonical-reviews.ts').write_text('// Optional add-on; never changes the baseline twelve or default Prop bundle.\nexport const FRONTIER_CANONICAL_REVIEWS='+json.dumps([review],indent=2)+' as const;\n')
