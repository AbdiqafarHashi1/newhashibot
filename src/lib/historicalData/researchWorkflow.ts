import { HistoricalDataService } from './HistoricalDataService';
import { TIMEFRAME_MS } from './validation';
import type { HistoricalDataRequest, HistoricalDataset, HistoricalTimeframe, ResearchDataBundle, ResearchDataProgress, SharedResearchContext } from './types';
import { normalizeResearchContext, resolveStrategyDataRequirements } from './researchContext';

export type ResearchProgressListener=(state:ResearchDataProgress,request?:HistoricalDataRequest)=>void;
export async function ensureResearchData(service:HistoricalDataService,input:SharedResearchContext,strategyIds:string[],onProgress:ResearchProgressListener=()=>{}):Promise<ResearchDataBundle>{
  onProgress('RESOLVING_REQUIREMENTS');const requirements=resolveStrategyDataRequirements(strategyIds,input.primaryTimeframe),context=normalizeResearchContext({...input,requiredTimeframes:[...new Set([...input.requiredTimeframes,...requirements.requiredTimeframes])],requiredDataRange:{from:Math.min(input.requiredDataRange.from,input.requestedEvaluationRange.from-requirements.warmupBars*timeframeMs(requirements.primaryTimeframe)),to:input.requestedEvaluationRange.to}});const datasets:Record<string,HistoricalDataset>={};
  onProgress('CHECKING_CACHE');
  for(const symbol of context.data.symbols)for(const timeframe of context.requiredTimeframes){const width=TIMEFRAME_MS[timeframe],request:HistoricalDataRequest={provider:context.data.provider,symbol,sourceSymbol:context.data.sourceSymbol,timeframe,from:Math.floor(context.requiredDataRange.from/width)*width,to:Math.floor(context.requiredDataRange.to/width)*width,broker:context.data.broker,server:context.data.server,environment:context.data.environment,accountId:context.accountId};onProgress('FETCHING_HISTORY',request);datasets[`${symbol}:${timeframe}`]=await service.get(request);onProgress('VALIDATING',request);}
  onProgress('READY');return {context,datasets};
}
function timeframeMs(tf:HistoricalTimeframe){return {'1m':60_000,'5m':300_000,'15m':900_000,'30m':1_800_000,'1h':3_600_000,'4h':14_400_000,'1d':86_400_000}[tf];}
export function canonicalToBacktestBars(dataset:HistoricalDataset,evaluationRange=dataset.metadata.requestedRange){return dataset.bars.filter(b=>b.timestamp>=evaluationRange.from&&b.timestamp<=evaluationRange.to).map(b=>({time:new Date(b.timestamp).toISOString(),open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume??b.tickVolume??0}));}
