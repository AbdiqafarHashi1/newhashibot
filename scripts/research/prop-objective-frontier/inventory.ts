/** Read-only code/review inventory. Never claims deployed installation or live approval. */
import {writeFileSync} from 'node:fs';
import {EXECUTION_CANONICAL_REVIEWS} from '../../../supabase/functions/_shared/execution-canonical-reviews.ts';
import {buildCanonicalDemoBundle} from '../../../supabase/functions/_shared/canonical-demo-release.ts';
import {executionStrategyChoices} from '../../../supabase/functions/_shared/execution-strategy-selection.ts';
import {executionStrategyDisplayName} from '../../../supabase/functions/_shared/execution-strategy-presets.ts';
import {PROP_STRATEGY_BUNDLES} from '../../../supabase/functions/_shared/prop-strategy-bundles.ts';
const bundle=buildCanonicalDemoBundle(EXECUTION_CANONICAL_REVIEWS.map(r=>r.strategyId),EXECUTION_CANONICAL_REVIEWS);
const rows=bundle.strategies.map(item=>{
 const s=item.configuration.strategies[0],market=s.id.startsWith('crypto.')?'CRYPTO':s.id.startsWith('gold.')?'METALS':'FOREX';
 const providers=['MT5_PERSONAL','MT5_PROP','BINANCE','BYBIT'].filter(p=>executionStrategyChoices(p,'demo').some(c=>c.id===s.id));
 if(!providers.length)throw Error('REVIEWED_STRATEGY_NOT_SELECTABLE:'+s.id);
 return {id:s.id,name:executionStrategyDisplayName(s.id,item.strategyName),market,symbols:s.symbols,timeframes:s.timeframes,providers,releaseScope:'SIGNALS_AND_FORWARD_DEMO',liveApproved:false,inDefaultPropBundle:PROP_STRATEGY_BUNDLES.ALL_TESTED.ids.includes(s.id),parameters:s.parameters,maximumHoldingBars:s.maxBarsInTrade,periods:item.review.periods.map(p=>({start:p.start,end:p.end,capital:'capital' in p?p.capital:null,riskPct:'riskPct' in p?p.riskPct:null,closedTrades:p.metrics.closedTrades,netReturnPct:p.metrics.netReturnPct,profitFactor:p.metrics.profitFactor})),limitations:item.review.limitations};
});
const report={schema:'reviewed-execution-inventory/v1',counts:{total:rows.length,crypto:rows.filter(r=>r.market==='CRYPTO').length,forex:rows.filter(r=>r.market==='FOREX').length,metals:rows.filter(r=>r.market==='METALS').length},meaning:'Exact configurations with positive recorded canonical review periods and compatible scanner/demo account choices; variants can share a family. Historical positives do not establish profitable months, each asset or live execution.',installation:'NOT_OBSERVED_IN_THIS_AUDIT',researchRsiTrailingIncluded:false,rows};
writeFileSync('.tmp/prop-objective-frontier/inventory.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.counts));
