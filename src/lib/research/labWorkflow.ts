import type { HistoricalCache } from '../historicalData/cache';
import { hashHistoricalBars } from '../historicalData/HistoricalDataService';
import { normalizeAndValidate } from '../historicalData/validation';
import { createSessionCalendar } from '../historicalData/sessions';
import type { HistoricalDataRequest } from '../historicalData/types';
import type { DatasetCampaign } from './datasetCampaign';

/** Cache-only reopen: no provider request, no fabricated replacement bars. */
export async function restoreDatasetCampaign(cache: HistoricalCache, campaign: DatasetCampaign): Promise<DatasetCampaign> {
  const datasets = [];
  for (const item of campaign.inventory) {
    const parts = item.datasetId.split('|').map(decodeURIComponent);
    if (parts.length !== 8) throw new Error('UNSUPPORTED_CACHE_IDENTITY');
    const [provider, environment, accountId, broker, server, symbol, sourceSymbol, timeframe] = parts;
    const request = { provider, environment, accountId, broker, server, symbol, sourceSymbol, timeframe, from: campaign.requestedRange.from, to: campaign.requestedRange.to, includeOpenCandle: false } as HistoricalDataRequest;
    const metadata = await cache.getMetadata(request);
    const bars = await cache.getBars(request);
    if (!metadata || bars.length !== item.bars || hashHistoricalBars(bars) !== item.datasetHash) throw new Error(`CACHE_MISSING_OR_CHANGED:${item.symbol}:${item.timeframe}`);
    const calendar=createSessionCalendar(provider==='BINANCE'||provider==='BINANCE_USDM'||provider==='BYBIT'?'CRYPTO':symbol.includes('XAU')||symbol.includes('XAG')?'METALS':'FOREX');
    const checked=normalizeAndValidate(bars,request.timeframe,campaign.requestedRange,metadata.quality.classification,Date.now(),calendar.isExpected);
    datasets.push({ bars, metadata: { ...metadata, ...request, requestedRange: campaign.requestedRange, quality:checked.quality, dataHash: item.datasetHash, barCount: bars.length } });
  }
  if (!datasets.length) throw new Error('CAMPAIGN_HAS_NO_DATA');
  return { ...campaign, datasets };
}
export const LAB_STEPS = [
  ['DATA','Connections & data','Connect the owner feed or download public Crypto candles.'],
  ['SINGLE','Single strategy','Research one strategy and inspect its trades.'],
  ['SCANNER','Scanner pipeline','Replay approved strategies, qualification and arbitration together.'],
  ['ACCOUNT','Account simulation','Apply the account Brain to completed scanner evidence.'],
  ['PROP','100 Prop challenges','Evaluate a frozen firm profile over 100 chronological windows.'],
  ['FORWARD','Forward testing','Observe new market candles; manage separate demo certification.'],
  ['CALIBRATION','Calibration','Compare research parameters on chronological unseen periods.'],
  ['RESULTS','Results & exports','Inspect persisted history, outcomes and limitations.'],
] as const;
export type LabStep = typeof LAB_STEPS[number][0];
