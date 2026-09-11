import { StrategyName } from '../StrategyConfig';

export type AssetClass = 'crypto' | 'forex_majors' | 'forex_crosses' | 'metals_gold';
export type AssetCategory = 'forex' | 'metals' | 'crypto';
export type DataSourceType = 'preset' | 'csv' | 'live_exchange';
export type BacktestMode = 'single_strategy' | 'pipeline_arbitration' | 'prop_firm_clearance';

export interface StrategyTweakProposal {
  strategy: StrategyName;
  currentWeight: number;
  recommendedWeight: number;
  currentMinScore: number;
  recommendedMinScore: number;
  currentTp1R: number;
  recommendedTp1R: number;
  currentTp2R: number;
  recommendedTp2R: number;
  currentStopAtrMult: number;
  recommendedStopAtrMult: number;
  status: 'OPTIMAL' | 'OVER_TRADING' | 'CHOP_BLEED' | 'EXHAUSTED' | 'PRIME_ALPHA';
  rationale: string;
  expectedImprovement: string;
}

export interface AICalibrationReport {
  overallHealth: 'HEALTHY' | 'MODERATE_BLEED' | 'SEVERE_DRAWDOWN' | 'PROFITABLE';
  lossDiagnosis: string[];
  drawdownDiagnosis: string[];
  recommendations: StrategyTweakProposal[];
  globalTweaks: {
    recommendedMinScore: number;
    recommendedMaxPositions: number;
    recommendedConflictPolicy: 'highest_score' | 'strict_no_conflict' | 'trend_priority';
    recommendedForexRiskPct: number;
    recommendedMetalsRiskPct: number;
    recommendedCryptoRiskPct: number;
  };
  projectedPortfolioReturnR: number;
  projectedWinRatePct: number;
  projectedDrawdownPct: number;
}

export interface BtCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketEnvironment {
  assetClass: AssetClass;
  symbol: string;
  pipOrPointSize: number;
  spreadPipsOrPts: number;
  feePctPerSide: number;
  accountSizeUsd: number;
  riskPctPerTrade: number;
  fridayWeekendClose: boolean;
  enforceSessionWindows: boolean;
}

export interface AssetCapitalPool {
  category: AssetCategory;
  name: string;
  symbol: string;
  capitalUsd: number;
  riskPct: number;
  pipOrPointSize: number;
  spreadPipsOrPts: number;
  decimals: number;
  fridayClose: boolean;
  sessionFilter: boolean;
  feePctPerSide?: number;
}

export interface MultiAssetFeedItem {
  category: AssetCategory;
  symbol: string;
  displayName: string;
  assetClass: AssetClass;
  pipOrPointSize: number;
  spreadPipsOrPts: number;
  decimals: number;
  fridayWeekendClose: boolean;
  enforceSessionWindows: boolean;
  candles: BtCandle[];
  status: 'idle' | 'ready' | 'loading' | 'error';
  source: string;
  count: number;
  lastUpdated?: string;
  error?: string;
  datasetId?: string;
  qualityEvidence?: import('../../../lib/historicalData/types').HistoricalDataQualityReport;
}

export interface BtTrade {
  id: string;
  entryIndex: number;
  entryTime: string;
  strategy: StrategyName;
  category: AssetCategory;
  symbol: string;
  direction: 'buy' | 'sell';
  entry: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  result: 'tp2_hit' | 'tp1_hit' | 'sl_hit' | 'expired' | 'weekend_cut' | 'breakeven_exit';
  exitIndex: number | null;
  exitTime: string | null;
  exitPrice: number | null;
  pnl_r: number;
  pnl_net_usd: number;
  categoryCapitalUsd: number;
  capitalPoolReturnPct: number;
  durationBars: number;
  spreadDeductionPipsOrPts: number;
  grade: string;
  score: number;
  reason: string;
  rejectionCause?: string;
  feeDeductedUsd?: number;
  riskUsd?: number;
  initialRiskDistance?: number;
  isBreakevenMoved?: boolean;
  tp1HitAndPartialBanked?: boolean;
  partialBankedUsd?: number;
  partialBankedR?: number;
}

export interface BtMetrics {
  totalTrades: number;
  wins: number;
  tp1Hits: number;
  tp2Hits: number;
  losses: number;
  expired: number;
  winRate: number;
  profitFactor: number;
  totalR: number;
  netUsd: number;
  avgR: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  maxDrawdownPct: number;
  maxDrawdownR?: number;
  avgWinR?: number;
  avgLossR?: number;
  maxConsecutiveWins?: number;
  maxConsecutiveLosses?: number;
  evaluations?: number;
  candidates?: number;
  rejected?: number;
  rejectionReasons?: Record<string, number>;
  equityCurve: { bar: number; time: string; equityR: number; equityUsd: number }[];
}

export interface CategoryPerformanceSummary {
  category: AssetCategory;
  displayName: string;
  symbol: string;
  initialCapitalUsd: number;
  endingCapitalUsd: number;
  netUsd: number;
  returnPct: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  totalR: number;
  alphaSharePct: number;
}

export interface SymbolPerformanceSummary {
  symbol: string;
  displayName: string;
  category: AssetCategory;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  totalR: number;
  netUsd: number;
  alphaSharePct: number;
}

export interface MultiAssetInstrument {
  symbol: string;
  displayName: string;
  category: AssetCategory;
  assetClass: AssetClass;
  basePrice: number;
  pipOrPointSize: number;
  spreadPipsOrPts: number;
  decimals: number;
  fridayWeekendClose: boolean;
  enforceSessionWindows: boolean;
}

export interface ArbitrationCandidate {
  strategy: StrategyName;
  category: AssetCategory;
  symbol: string;
  direction: 'buy' | 'sell';
  entry: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  score: number;
  weight: number;
  weightedScore: number;
  grade: string;
  reason: string;
}

export interface ArbitrationEvent {
  id: string;
  barIndex: number;
  time: string;
  candidates: {
    strategy: StrategyName;
    category: AssetCategory;
    symbol: string;
    direction: 'buy' | 'sell';
    score: number;
    weightedScore: number;
    grade: string;
    reason: string;
  }[];
  winner: {
    strategy: StrategyName;
    category: AssetCategory;
    symbol: string;
    direction: 'buy' | 'sell';
    score: number;
    weightedScore: number;
  } | null;
  decision: 'executed' | 'rejected_conflict' | 'rejected_max_exposure' | 'rejected_score';
  notes: string;
}

export interface StrategyContributionStat {
  strategy: StrategyName;
  displayName: string;
  category: AssetCategory;
  marketType: string;
  weight: number;
  candidatesCount: number;
  wonArbitrationCount: number;
  executedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  totalR: number;
  netUsd: number;
  alphaSharePct: number;
}

export interface DateRangeOption {
  key: string;
  label: string;
  days: number;
  defaultTf: string;
  description: string;
}

export const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { key: '7d', label: 'Last 7 Days', days: 7, defaultTf: '5m', description: 'Intraday scalps & micro session sweeps' },
  { key: '14d', label: 'Last 14 Days', days: 14, defaultTf: '15m', description: 'Two-week session momentum & breakouts' },
  { key: '30d', label: 'Last 30 Days (1M)', days: 30, defaultTf: '15m', description: 'Full monthly institutional cross-asset cycle' },
  { key: '60d', label: 'Last 60 Days (2M)', days: 60, defaultTf: '1h', description: 'Multi-month trend continuation & macro cycle' },
  { key: '90d', label: 'Last 90 Days (3M)', days: 90, defaultTf: '1h', description: 'Quarterly macro & alpha decay stress test' },
  { key: '180d', label: 'Last 180 Days (6M)', days: 180, defaultTf: '1h', description: 'Semi-annual cross-regime multi-asset test' },
  { key: '365d', label: 'Last 365 Days (1Y)', days: 365, defaultTf: '4h', description: 'Full annual multi-cycle stress test' },
  { key: 'custom', label: 'Custom Date Range', days: 30, defaultTf: '15m', description: 'Custom specified date window' },
];

export const STRATEGY_ASSET_MAP: Record<
  StrategyName,
  { category: AssetCategory; defaultSymbol: string; supportedSymbols: string[]; decimals: number }
> = {
  LondonBreakout: { category: 'forex', defaultSymbol: 'EURUSD', supportedSymbols: ['EURUSD', 'GBPUSD'], decimals: 5 },
  NYContinuation: { category: 'forex', defaultSymbol: 'EURUSD', supportedSymbols: ['EURUSD', 'GBPUSD'], decimals: 5 },
  FXTrendPullback: { category: 'forex', defaultSymbol: 'GBPUSD', supportedSymbols: ['GBPUSD', 'EURUSD'], decimals: 5 },
  SessionORB: { category: 'forex', defaultSymbol: 'EURUSD', supportedSymbols: ['EURUSD', 'GBPUSD'], decimals: 5 },
  FXMicroScalper: { category: 'forex', defaultSymbol: 'GBPUSD', supportedSymbols: ['GBPUSD'], decimals: 5 },
  MacroYieldDifferential: { category: 'forex', defaultSymbol: 'EURUSD', supportedSymbols: ['EURUSD'], decimals: 5 },
  GoldVolatilityBreakout: { category: 'metals', defaultSymbol: 'XAUUSD', supportedSymbols: ['XAUUSD'], decimals: 2 },
  CryptoCompressionBreakout: { category: 'crypto', defaultSymbol: 'BTCUSDT', supportedSymbols: ['BTCUSDT', 'ETHUSDT'], decimals: 2 },
  CryptoMicroScalper: { category: 'crypto', defaultSymbol: 'BTCUSDT', supportedSymbols: ['BTCUSDT'], decimals: 2 },
  CryptoSwingContinuation: { category: 'crypto', defaultSymbol: 'BTCUSDT', supportedSymbols: ['BTCUSDT', 'ETHUSDT'], decimals: 2 },
  CryptoMomentumBreakout: { category: 'crypto', defaultSymbol: 'BTCUSDT', supportedSymbols: ['BTCUSDT', 'ETHUSDT'], decimals: 2 },
  CryptoReversalExhaustion: { category: 'crypto', defaultSymbol: 'BTCUSDT', supportedSymbols: ['BTCUSDT'], decimals: 2 },
};
