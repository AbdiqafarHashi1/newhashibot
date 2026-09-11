export type HistoricalProvider = 'MT5_BRIDGE' | 'BINANCE' | 'BYBIT' | 'CSV' | 'PUBLIC_RESEARCH';
export type HistoricalTimeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
export type DataQualityClassification = 'RESEARCH' | 'BROKER_VALIDATED' | 'CERTIFICATION';

export interface CanonicalCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  tickVolume?: number;
  realVolume?: number;
  spread?: number;
}

export interface CandleDerivation {
  derived: true;
  sourceDatasetId: string;
  sourceTimeframe: HistoricalTimeframe;
  targetTimeframe: HistoricalTimeframe;
  aggregationMethod: 'UTC_ALIGNED_COMPLETE_INTERVALS_V1';
}

export interface HistoricalDataRequest {
  provider: HistoricalProvider;
  symbol: string;
  sourceSymbol?: string;
  timeframe: HistoricalTimeframe;
  from: number;
  to: number;
  broker?: string;
  server?: string;
  environment?: string;
  accountId?: string;
  includeOpenCandle?: boolean;
  signal?: AbortSignal;
}

export interface HistoricalRange { from: number; to: number }
export interface HistoricalDataCoverage { ranges: HistoricalRange[]; from?: number; to?: number; barCount: number }

export interface HistoricalDataQualityReport {
  duplicates: number;
  invalidBars: number;
  outOfOrder: number;
  missingRanges: HistoricalRange[];
  staleFinalBar: boolean;
  score: number;
  classification: DataQualityClassification;
  expectedClosures: number;
  unknownSessionIntervals: number;
  unrealisticJumps?: number;
  timezoneConsistent?: boolean;
  sourceContinuous?: boolean;
}

export interface HistoricalDatasetMetadata extends HistoricalDataRequest {
  datasetKey: string;
  requestedRange: HistoricalRange;
  actualCoverage: HistoricalDataCoverage;
  barCount: number;
  timezone: 'UTC';
  lastSync: string;
  quality: HistoricalDataQualityReport;
  datasetVersion: 1;
  /** Deterministic hash of the normalized bars in the requested coverage. */
  dataHash: string;
  provenance: {
    provider: HistoricalProvider;
    accountId?: string;
    sourceSymbol: string;
    native: boolean;
    aggregation?: CandleDerivation;
  };
}

export interface HistoricalDataset { metadata: HistoricalDatasetMetadata; bars: CanonicalCandle[] }

export interface SharedResearchContext {
  mode: 'single' | 'multi_asset' | 'portfolio' | 'prop_replay' | 'stress' | 'walk_forward' | 'multi_challenge' | 'certification';
  data: Omit<HistoricalDataRequest, 'symbol'> & { symbols: string[] };
  datasetKeys: Record<string, string>;
  strategyId: string;
  strategyVersion: string;
  executionModel: string;
  primaryTimeframe: HistoricalTimeframe;
  requiredTimeframes: HistoricalTimeframe[];
  requestedEvaluationRange: HistoricalRange;
  requiredDataRange: HistoricalRange;
  accountId?: string;
}

export type ResearchDataProgress = 'RESOLVING_REQUIREMENTS'|'CHECKING_CACHE'|'FETCHING_HISTORY'|'VALIDATING'|'CACHING'|'READY'|'RUNNING'|'FAILED';
export interface ResearchDataBundle { context: SharedResearchContext; datasets: Record<string, HistoricalDataset> }
