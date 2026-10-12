import type { HistoricalDataset, HistoricalTimeframe } from '../historicalData/types';
import type { DatasetCampaign, ResearchMarket } from '../research/datasetCampaign';

/** Bounded illustrative candles, deliberately CSV/RESEARCH, never venue-certified. */
export function previewDatasetCampaign(market: ResearchMarket, symbols: string[], timeframes: HistoricalTimeframe[]): DatasetCampaign {
  const steps: Record<HistoricalTimeframe, number> = { '1m':60000, '5m':300000, '15m':900000, '30m':1800000, '1h':3600000, '4h':14400000, '1d':86400000 };
  const datasets: HistoricalDataset[] = symbols.flatMap(symbol => timeframes.map(timeframe => {
    const step = steps[timeframe], from = Math.floor((Date.now() - step * 601) / step) * step;
    const base = symbol.endsWith('USDT') ? 60000 : symbol.startsWith('XAU') ? 2000 : 1.1;
    const bars = Array.from({length:600}, (_,i) => { const open=base*(1+.02*Math.sin(i/8)+i*.00002), close=open*(1+.0015*Math.sin(i/3)); return {timestamp:from+i*step,open,close,high:Math.max(open,close)*1.002,low:Math.min(open,close)*.998,volume:100+i%20}; });
    const to = bars[599].timestamp;
    return {bars,metadata:{provider:'CSV' as const,symbol,sourceSymbol:symbol,timeframe,from,to,environment:'OWNER_PREVIEW_SIMULATED',datasetKey:`preview-${symbol}-${timeframe}`,requestedRange:{from,to},actualCoverage:{ranges:[{from,to}],from,to,barCount:600},barCount:600,timezone:'UTC' as const,lastSync:new Date().toISOString(),quality:{duplicates:0,invalidBars:0,outOfOrder:0,missingRanges:[],staleFinalBar:false,score:100,classification:'RESEARCH' as const,expectedClosures:0,unknownSessionIntervals:0},datasetVersion:1 as const,dataHash:`SIMULATED-${symbol}-${timeframe}`,provenance:{provider:'CSV' as const,sourceSymbol:symbol,native:false,sourceName:'CSV' as const,sourceVersion:'OWNER_PREVIEW_SIMULATED'}}};
  }));
  return {version:'dataset-campaign/v1',id:'preview-campaign',hash:'SIMULATED-CAMPAIGN',name:'Illustrative demonstration candles — not acquired market history',market,createdAt:new Date().toISOString(),requestedRange:datasets[0].metadata.requestedRange,providers:['CSV'],datasets,inventory:datasets.map(d=>({datasetId:d.metadata.datasetKey,datasetHash:d.metadata.dataHash,provider:'CSV',symbol:d.metadata.symbol,sourceSymbol:d.metadata.symbol,timeframe:d.metadata.timeframe,bars:d.bars.length,certifiable:false})),quality:'INCOMPLETE'};
}
