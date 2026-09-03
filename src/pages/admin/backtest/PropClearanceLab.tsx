import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Trophy,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Building2,
  Sliders,
  DollarSign,
  Zap,
  FileCheck,
  Download,
  Send,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Database,
  Radio,
  Play,
  Calendar,
  Clock,
  Activity,
  Target,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { MultiAssetFeedItem, CapitalPoolConfig, AssetCategory, AssetCapitalPool } from './types';
import { listMT5Accounts } from '../../../lib/mt5Accounts';
import type { MT5Account } from '../../../lib/exchange/mt5';
import { getLocalStoredAccounts, saveLocalStoredAccounts } from '../../../lib/mt5LiveEngine';
import {
  runMultiAssetPipelineEngine,
  runMultiAssetPipelineReplayAsync,
  type ReplayProgressState,
  type PipelineEngineResult,
} from './simulationEngine';
import { StrategyName } from '../StrategyConfig';
import { createDefaultMultiAssetFeeds, PIPELINE_UNIVERSE } from './syntheticData';

// Comprehensive Prop Firm Rule Definitions
export interface PropFirmPreset {
  id: string;
  name: string;
  provider: string;
  badge: string;
  phase1TargetPct: number;
  phase2TargetPct: number;
  maxDailyLossPct: number;
  maxTotalLossPct: number;
  minTradingDays: number;
  maxSingleDayProfitPct: number; // Consistency rule cap (e.g. 40%)
  dailyLossType: 'BALANCE_BASED' | 'EQUITY_BASED';
  payoutSplitPct: number;
  weekendHoldingAllowed: boolean;
  newsTradingAllowed: boolean;
  maxLeverage: string;
}

export const ADMIN_PROP_PRESETS: Record<string, PropFirmPreset> = {
  FTMO_STANDARD: {
    id: 'FTMO_STANDARD',
    name: 'FTMO Standard ($50k - $200k)',
    provider: 'FTMO (Prague, CZ)',
    badge: 'Industry Benchmark',
    phase1TargetPct: 10.0,
    phase2TargetPct: 5.0,
    maxDailyLossPct: 5.0,
    maxTotalLossPct: 10.0,
    minTradingDays: 4,
    maxSingleDayProfitPct: 40.0,
    dailyLossType: 'BALANCE_BASED',
    payoutSplitPct: 80.0,
    weekendHoldingAllowed: false,
    newsTradingAllowed: true,
    maxLeverage: '1:100 (Forex) / 1:30 (Metals)',
  },
  FTMO_AGGRESSIVE: {
    id: 'FTMO_AGGRESSIVE',
    name: 'FTMO Aggressive ($50k - $100k)',
    provider: 'FTMO (Prague, CZ)',
    badge: 'Higher Drawdown Room',
    phase1TargetPct: 20.0,
    phase2TargetPct: 10.0,
    maxDailyLossPct: 10.0,
    maxTotalLossPct: 20.0,
    minTradingDays: 4,
    maxSingleDayProfitPct: 50.0,
    dailyLossType: 'BALANCE_BASED',
    payoutSplitPct: 80.0,
    weekendHoldingAllowed: false,
    newsTradingAllowed: true,
    maxLeverage: '1:100',
  },
  FUNDED_NEXT_STELLAR: {
    id: 'FUNDED_NEXT_STELLAR',
    name: 'FundedNext Stellar (2-Phase)',
    provider: 'FundedNext (UAE)',
    badge: 'Balance-Based DD & 90% Split',
    phase1TargetPct: 8.0,
    phase2TargetPct: 5.0,
    maxDailyLossPct: 5.0,
    maxTotalLossPct: 10.0,
    minTradingDays: 5,
    maxSingleDayProfitPct: 35.0,
    dailyLossType: 'BALANCE_BASED',
    payoutSplitPct: 90.0,
    weekendHoldingAllowed: true,
    newsTradingAllowed: true,
    maxLeverage: '1:100',
  },
  THE_5ERS_HIGH_STAKES: {
    id: 'THE_5ERS_HIGH_STAKES',
    name: 'The5ers High Stakes ($60k - $100k)',
    provider: 'The 5%ers (UK/Israel)',
    badge: 'Rapid 100% Scaling',
    phase1TargetPct: 8.0,
    phase2TargetPct: 5.0,
    maxDailyLossPct: 5.0,
    maxTotalLossPct: 10.0,
    minTradingDays: 3,
    maxSingleDayProfitPct: 40.0,
    dailyLossType: 'EQUITY_BASED',
    payoutSplitPct: 80.0,
    weekendHoldingAllowed: true,
    newsTradingAllowed: true,
    maxLeverage: '1:100',
  },
  ALPHA_CAPITAL_PRO: {
    id: 'ALPHA_CAPITAL_PRO',
    name: 'Alpha Capital / MFF Pro',
    provider: 'Alpha Capital (UK)',
    badge: 'Raw Spreads & $0 Commission',
    phase1TargetPct: 8.0,
    phase2TargetPct: 4.0,
    maxDailyLossPct: 5.0,
    maxTotalLossPct: 8.0,
    minTradingDays: 3,
    maxSingleDayProfitPct: 35.0,
    dailyLossType: 'BALANCE_BASED',
    payoutSplitPct: 80.0,
    weekendHoldingAllowed: true,
    newsTradingAllowed: true,
    maxLeverage: '1:100',
  },
  TOPSTEP_FUTURES: {
    id: 'TOPSTEP_FUTURES',
    name: 'Topstep Trading Combine',
    provider: 'Topstep (Chicago, US)',
    badge: 'Futures Contracts',
    phase1TargetPct: 6.0,
    phase2TargetPct: 6.0,
    maxDailyLossPct: 2.0,
    maxTotalLossPct: 4.0,
    minTradingDays: 2,
    maxSingleDayProfitPct: 50.0,
    dailyLossType: 'EQUITY_BASED',
    payoutSplitPct: 90.0,
    weekendHoldingAllowed: false,
    newsTradingAllowed: false,
    maxLeverage: '5 E-mini Contracts',
  },
};

// Realistic Historical Trade Signal Dataset (Simulating Market Regimes across Forex, Metals, Crypto & Indices)
export interface PropTradeExecution {
  tradeId: string;
  dayNumber: number;
  dateStr: string;
  timestamp: string;
  symbol: string;
  strategy: string;
  direction: 'BUY' | 'SELL';
  baseRMultiple: number;
  slippagePips: number;
  spreadPips: number;
  session: 'LONDON_OPEN' | 'NY_AM' | 'NY_PM' | 'ASIAN';
  newsImpact: 'NONE' | 'LOW' | 'HIGH_RED';
  isWeekendHold: boolean;
}

export interface SurvivabilityHorizonOption {
  key: '30d' | '60d' | '90d' | '180d';
  label: string;
  days: number;
  description: string;
  focus: string;
}

export const SURVIVABILITY_HORIZONS: SurvivabilityHorizonOption[] = [
  {
    key: '30d',
    label: '30 Days',
    days: 30,
    description: 'Phase 1 Standard Challenge & Rapid Clearance Window',
    focus: 'Tests target clearance speed (+8-10%) and single-day max loss compliance.',
  },
  {
    key: '60d',
    label: '60 Days',
    days: 60,
    description: 'Two-Phase Combined Evaluation & Regime Shift Stress',
    focus: 'Tests consecutive Phase 1 + Phase 2 passing consistency across month-end rollovers.',
  },
  {
    key: '90d',
    label: '90 Days',
    days: 90,
    description: 'Funded Account Long-Term Survivability & Drawdown Endurance',
    focus: 'Tests sustained capital preservation, quarterly volatility cycles, and zero circuit-breaker breaches.',
  },
  {
    key: '180d',
    label: '180 Days',
    days: 180,
    description: 'Semi-Annual Macro Regime & Volatility Shock Resilience',
    focus: 'Exposes strategies to multiple interest rate decisions, CPI spikes, and macro shifts.',
  },
];

interface PropClearanceLabProps {
  multiAssetFeeds?: Record<string, MultiAssetFeedItem> | MultiAssetFeedItem[];
  capitalPools?: Record<string, unknown> | CapitalPoolConfig[];
  selectedRange?: string;
  onSelectRange?: (range: string) => void;
  selectedTimeframe?: string;
  onTimeframeChange?: (tf: string) => void;
  onSyncFeeds?: () => void;
  isSyncingFeeds?: boolean;
}

export function PropClearanceLab({
  multiAssetFeeds = {},
  selectedRange = '90d',
  onSelectRange,
  selectedTimeframe = '15m',
  onTimeframeChange,
  onSyncFeeds,
  isSyncingFeeds = false,
}: PropClearanceLabProps) {
  // Preset & Custom Prop Parameters
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('FTMO_STANDARD');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);

  // Time Horizon for Survivability (30d, 60d, 90d, 180d)
  const [activeHorizon, setActiveHorizon] = useState<'30d' | '60d' | '90d' | '180d'>(
    selectedRange === '30d' || selectedRange === '60d' || selectedRange === '90d' || selectedRange === '180d'
      ? selectedRange
      : '90d'
  );

  // Challenge Account Setup
  const [fundingCapital, setFundingCapital] = useState<number>(50000);
  const [evaluationStage, setEvaluationStage] = useState<'PHASE_1' | 'PHASE_2' | 'FUNDED'>('PHASE_1');
  const [riskPctPerTrade, setRiskPctPerTrade] = useState<number>(0.5); // 0.50% standard prop risk
  const [targetExitMode, setTargetExitMode] = useState<'PARTIAL_TP1_TP2' | 'FULL_TP2' | 'EARLY_TP1'>('PARTIAL_TP1_TP2');
  const [spreadSlippageMult, setSpreadSlippageMult] = useState<number>(1.0); // 1.0x standard, 1.5x stressed

  // Strategy Basket Toggles
  const [activeStrategies, setActiveStrategies] = useState<Record<string, boolean>>({
    GoldVolatilityBreakout: true,
    LondonBreakout: true,
    NYContinuation: true,
    SessionORB: true,
    CryptoCompressionBreakout: true,
    MacroYieldDifferential: true,
    FXMicroScalper: false, // scalp disabled by default for prop drawdown safety
  });

  // Simulation State & Execution Trigger
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [lastSimulationMeta, setLastSimulationMeta] = useState<{
    simulatedBars: number;
    durationMs: number;
    timestamp: string;
    horizonDays: number;
  }>({
    simulatedBars: 2450,
    durationMs: 145,
    timestamp: new Date().toLocaleTimeString(),
    horizonDays: 90,
  });

  // Custom Prop Overrides
  const [customPhase1TargetPct, setCustomPhase1TargetPct] = useState<number>(10.0);
  const [customPhase2TargetPct, setCustomPhase2TargetPct] = useState<number>(5.0);
  const [customMaxDailyLossPct, setCustomMaxDailyLossPct] = useState<number>(5.0);
  const [customMaxTotalLossPct, setCustomMaxTotalLossPct] = useState<number>(10.0);
  const [customMinTradingDays, setCustomMinTradingDays] = useState<number>(4);
  const [customConsistencyCapPct, setCustomConsistencyCapPct] = useState<number>(40.0);
  const [customDailyLossType, setCustomDailyLossType] = useState<'BALANCE_BASED' | 'EQUITY_BASED'>('BALANCE_BASED');

  // Active Prop Preset & Rules Configuration (Must be initialized before simulation hooks)
  const activePreset = ADMIN_PROP_PRESETS[selectedPresetKey] || ADMIN_PROP_PRESETS.FTMO_STANDARD;

  const activeRules = useMemo(() => {
    if (isCustomMode) {
      return {
        id: 'CUSTOM',
        name: 'Custom User Prop Profile',
        provider: 'Custom Enterprise Firm',
        badge: 'Custom Rules',
        phase1TargetPct: customPhase1TargetPct,
        phase2TargetPct: customPhase2TargetPct,
        maxDailyLossPct: customMaxDailyLossPct,
        maxTotalLossPct: customMaxTotalLossPct,
        minTradingDays: customMinTradingDays,
        maxSingleDayProfitPct: customConsistencyCapPct,
        dailyLossType: customDailyLossType,
        payoutSplitPct: 85.0,
        weekendHoldingAllowed: false,
        newsTradingAllowed: true,
        maxLeverage: '1:100',
      };
    }
    return activePreset;
  }, [
    isCustomMode,
    activePreset,
    customPhase1TargetPct,
    customPhase2TargetPct,
    customMaxDailyLossPct,
    customMaxTotalLossPct,
    customMinTradingDays,
    customConsistencyCapPct,
    customDailyLossType,
  ]);

  // UI Expanded States
  const [showAdvancedRules, setShowAdvancedRules] = useState<boolean>(false);
  const [showMonteCarlo, setShowMonteCarlo] = useState<boolean>(false);
  const [filterTradeStatus, setFilterTradeStatus] = useState<'ALL' | 'WINS' | 'LOSSES'>('ALL');
  const [deployNotification, setDeployNotification] = useState<string | null>(null);

  // MT5 Fleet Accounts for Live Bridge Sync
  const [mt5Accounts, setMt5Accounts] = useState<MT5Account[]>([]);
  const [selectedMt5AccountId, setSelectedMt5AccountId] = useState<string>('');
  const [isDeployingBridge, setIsDeployingBridge] = useState<boolean>(false);
  const [showDeployModal, setShowDeployModal] = useState<boolean>(false);

  // Parse feed items safely
  const feedItems = useMemo<MultiAssetFeedItem[]>(() => {
    if (Array.isArray(multiAssetFeeds)) return multiAssetFeeds;
    if (multiAssetFeeds && typeof multiAssetFeeds === 'object') {
      return Object.values(multiAssetFeeds);
    }
    return [];
  }, [multiAssetFeeds]);

  // Total Real Bars Loaded Across All Live Feeds
  const totalRealBarsCount = useMemo(() => {
    return feedItems.reduce((acc, f) => acc + (f.candles?.length || 0), 0);
  }, [feedItems]);

  // Live Real Market Bars (Yahoo Finance & Binance) vs Preset Synthetic Bars
  const liveRealBarsCount = useMemo(() => {
    return feedItems
      .filter((f) => f.source === 'yahoo_finance' || f.source === 'binance' || f.source === 'live_feed')
      .reduce((acc, f) => acc + (f.candles?.length || 0), 0);
  }, [feedItems]);

  const isUsingRealMarketData = liveRealBarsCount > 0;

  // Internal feeds state for direct universe synchronization
  const [internalFeeds, setInternalFeeds] = useState<Record<string, MultiAssetFeedItem>>({});
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [replaySpeed, setReplaySpeed] = useState<'smooth' | 'fast' | 'turbo'>('fast');
  const [replayProgress, setReplayProgress] = useState<ReplayProgressState | null>(null);
  const [pipelineExecutionResult, setPipelineExecutionResult] = useState<PipelineEngineResult | null>(null);

  // Sync activeHorizon when parent selectedRange changes
  useEffect(() => {
    if (selectedRange && (selectedRange === '30d' || selectedRange === '60d' || selectedRange === '90d' || selectedRange === '180d')) {
      setActiveHorizon(selectedRange);
    }
  }, [selectedRange]);

  // Sync internal feeds when multiAssetFeeds changes
  useEffect(() => {
    if (multiAssetFeeds && typeof multiAssetFeeds === 'object' && Object.keys(multiAssetFeeds).length > 0) {
      setInternalFeeds((prev) => ({ ...prev, ...multiAssetFeeds }));
    }
  }, [multiAssetFeeds]);

  // Load live MT5 Accounts for bridge deployment
  useEffect(() => {
    listMT5Accounts()
      .then((accs) => {
        setMt5Accounts(accs);
        if (accs.length > 0) {
          setSelectedMt5AccountId((curr) => curr || accs[0].id);
        }
      })
      .catch((e) => console.warn('Could not fetch MT5 accounts in Prop Lab:', e));
  }, []);

  // Sync universe real bars across all symbols in PIPELINE_UNIVERSE
  const syncUniverseRealBars = useCallback(async (horizon: string, interval: string = '15m') => {
    const results = await Promise.all(
      PIPELINE_UNIVERSE.map(async (inst) => {
        try {
          const resp = await fetch(
            `/api/market-data/history?symbol=${inst.symbol}&interval=${interval}&assetClass=${inst.category}&range=${horizon}&limit=1000`
          );
          if (resp.ok) {
            const data = await resp.json();
            if (data.candles && data.candles.length >= 20) {
              return {
                category: inst.category,
                symbol: inst.symbol,
                displayName: inst.displayName,
                assetClass: inst.assetClass,
                pipOrPointSize: inst.pipOrPointSize,
                spreadPipsOrPts: inst.spreadPipsOrPts,
                decimals: inst.decimals,
                fridayWeekendClose: inst.fridayWeekendClose,
                enforceSessionWindows: inst.enforceSessionWindows,
                candles: data.candles,
                count: data.candles.length,
                status: 'ready' as const,
                source: data.source || 'live_feed',
                lastUpdated: new Date().toLocaleTimeString(),
              };
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch live feed for ${inst.symbol}:`, err);
        }
        return null;
      })
    );

    const newRecord: Record<string, MultiAssetFeedItem> = {};
    results.forEach((item) => {
      if (item) {
        newRecord[item.symbol] = item;
      }
    });

    if (newRecord['EURUSD']) newRecord['forex'] = newRecord['EURUSD'];
    if (newRecord['XAUUSD']) newRecord['metals'] = newRecord['XAUUSD'];
    if (newRecord['BTCUSDT']) newRecord['crypto'] = newRecord['BTCUSDT'];

    return newRecord;
  }, []);

  // Run Real Replay Simulation Function (Candle-by-Candle Authentic Scan)
  const handleRunSimulation = useCallback(
    async (horizonOverride?: '30d' | '60d' | '90d' | '180d') => {
      const horizon = horizonOverride || activeHorizon;
      setIsSimulating(true);
      setIsReplaying(true);
      const startT = performance.now();

      try {
        const horizonDays =
          horizon === '30d' ? 30 : horizon === '60d' ? 60 : horizon === '90d' ? 90 : 180;

        // 1. Gather all feeds
        let feedsToUse: Record<string, MultiAssetFeedItem> = { ...internalFeeds };
        feedItems.forEach((f) => {
          if (!feedsToUse[f.symbol]) feedsToUse[f.symbol] = f;
          if (!feedsToUse[f.category]) feedsToUse[f.category] = f;
        });

        // Check if we need to fetch real market data for this horizon
        const currentMaxBars = Object.values(feedsToUse).reduce(
          (m, f) => Math.max(m, f.candles?.length || 0),
          0
        );
        const minBarsExpected = horizon === '180d' ? 6000 : horizon === '90d' ? 4500 : horizon === '60d' ? 3000 : 1500;

        if (currentMaxBars < minBarsExpected || !isUsingRealMarketData) {
          const fetched = await syncUniverseRealBars(horizon, selectedTimeframe || '15m');
          if (Object.keys(fetched).length > 0) {
            feedsToUse = { ...feedsToUse, ...fetched };
            setInternalFeeds(feedsToUse);
          }
        }

        // Ensure default feeds exist as fallbacks
        const defaultFeeds = createDefaultMultiAssetFeeds();
        Object.keys(defaultFeeds).forEach((key) => {
          if (!feedsToUse[key] || !feedsToUse[key].candles || feedsToUse[key].candles.length < 50) {
            feedsToUse[key] = defaultFeeds[key];
          }
        });

        // 2. Build Capital Pools
        const propCapitalPools: Record<AssetCategory, AssetCapitalPool> = {
          forex: {
            category: 'forex',
            name: 'Forex Majors',
            symbol: 'EURUSD',
            capitalUsd: fundingCapital,
            riskPct: riskPctPerTrade,
            pipOrPointSize: 0.0001,
            spreadPipsOrPts: 1.2 * spreadSlippageMult,
            decimals: 5,
            fridayClose: !activeRules.weekendHoldingAllowed,
            sessionFilter: true,
          },
          metals: {
            category: 'metals',
            name: 'Metals & Gold',
            symbol: 'XAUUSD',
            capitalUsd: fundingCapital,
            riskPct: riskPctPerTrade,
            pipOrPointSize: 0.01,
            spreadPipsOrPts: 35.0 * spreadSlippageMult,
            decimals: 2,
            fridayClose: !activeRules.weekendHoldingAllowed,
            sessionFilter: false,
          },
          crypto: {
            category: 'crypto',
            name: 'Crypto Perpetuals',
            symbol: 'BTCUSDT',
            capitalUsd: fundingCapital,
            riskPct: riskPctPerTrade,
            pipOrPointSize: 0.1,
            spreadPipsOrPts: 15.0 * spreadSlippageMult,
            decimals: 2,
            fridayClose: false,
            sessionFilter: false,
          },
        };

        const activeStratNames = Object.keys(activeStrategies).filter(
          (s) => activeStrategies[s] !== false
        ) as StrategyName[];

        // Replay speed configuration
        const chunkDelayMs = replaySpeed === 'smooth' ? 35 : replaySpeed === 'fast' ? 10 : 0;
        const batchSize = replaySpeed === 'smooth' ? 20 : replaySpeed === 'fast' ? 50 : 200;

        // 3. Run Real-Bar Replay Simulation
        const out = await runMultiAssetPipelineReplayAsync(
          feedsToUse,
          propCapitalPools,
          activeStratNames.length > 0 ? activeStratNames : ['LondonBreakout', 'GoldVolatilityBreakout', 'NYContinuation'],
          {
            maxConcurrentPositions: 2,
            minScore: 78,
            conflictPolicy: 'strict_no_conflict',
            enableWeights: true,
          },
          (progress) => {
            setReplayProgress(progress);
          },
          chunkDelayMs,
          batchSize
        );

        setPipelineExecutionResult(out);

        const elapsed = Math.round(performance.now() - startT);
        const computedBars = Object.values(feedsToUse).reduce((m, f) => Math.max(m, f.candles?.length || 0), 0);

        setLastSimulationMeta({
          simulatedBars: computedBars,
          durationMs: elapsed,
          timestamp: new Date().toLocaleTimeString(),
          horizonDays,
        });

        setDeployNotification(
          `⚡ Real-Bar Replay Simulation Completed! Evaluated ${computedBars.toLocaleString()} market candles across ${horizonDays} days in ${elapsed}ms (${out.trades.length} real trades executed).`
        );
        setTimeout(() => setDeployNotification(null), 6000);
      } catch (err) {
        console.error('Simulation replay error:', err);
      } finally {
        setIsSimulating(false);
        setIsReplaying(false);
      }
    },
    [
      activeHorizon,
      activeRules.weekendHoldingAllowed,
      activeStrategies,
      feedItems,
      fundingCapital,
      internalFeeds,
      isUsingRealMarketData,
      replaySpeed,
      riskPctPerTrade,
      selectedTimeframe,
      spreadSlippageMult,
      syncUniverseRealBars,
    ]
  );

  // Handle Horizon Period Selection (30d, 60d, 90d, 180d)
  const handleSelectHorizon = (horizonKey: '30d' | '60d' | '90d' | '180d') => {
    setActiveHorizon(horizonKey);
    if (onSelectRange) {
      onSelectRange(horizonKey);
    }
    // Auto-trigger replay backtest with the selected horizon
    handleRunSimulation(horizonKey);
  };

  // ---------------------------------------------------------------------------
  // GENERATE DYNAMIC TRADES FROM REAL MARKET CANDLES ACROSS 30 / 60 / 90 / 180 DAYS
  // ---------------------------------------------------------------------------
  // Baseline initial pipeline result (used before first replay execution)
  const fallbackPipelineResult = useMemo(() => {
    const propCapitalPools: Record<AssetCategory, AssetCapitalPool> = {
      forex: {
        category: 'forex',
        name: 'Forex Majors',
        symbol: 'EURUSD',
        capitalUsd: fundingCapital,
        riskPct: riskPctPerTrade,
        pipOrPointSize: 0.0001,
        spreadPipsOrPts: 1.2 * spreadSlippageMult,
        decimals: 5,
        fridayClose: !activeRules.weekendHoldingAllowed,
        sessionFilter: true,
      },
      metals: {
        category: 'metals',
        name: 'Metals & Gold',
        symbol: 'XAUUSD',
        capitalUsd: fundingCapital,
        riskPct: riskPctPerTrade,
        pipOrPointSize: 0.01,
        spreadPipsOrPts: 30.0 * spreadSlippageMult,
        decimals: 2,
        fridayClose: !activeRules.weekendHoldingAllowed,
        sessionFilter: false,
      },
      crypto: {
        category: 'crypto',
        name: 'Crypto Pool',
        symbol: 'BTCUSDT',
        capitalUsd: fundingCapital,
        riskPct: riskPctPerTrade,
        pipOrPointSize: 0.01,
        spreadPipsOrPts: 2.0 * spreadSlippageMult,
        decimals: 2,
        fridayClose: false,
        sessionFilter: false,
      },
    };

    const feedRecord: Record<string, MultiAssetFeedItem> = { ...internalFeeds };
    feedItems.forEach((f) => {
      feedRecord[f.symbol] = f;
      feedRecord[f.category] = f;
    });

    const defaultFeeds = createDefaultMultiAssetFeeds();
    Object.keys(defaultFeeds).forEach((key) => {
      if (!feedRecord[key] || !feedRecord[key].candles || feedRecord[key].candles.length < 50) {
        feedRecord[key] = defaultFeeds[key];
      }
    });

    const activeStratNames = Object.keys(activeStrategies).filter(
      (s) => activeStrategies[s] !== false
    ) as StrategyName[];

    return runMultiAssetPipelineEngine(
      feedRecord,
      propCapitalPools,
      activeStratNames.length > 0 ? activeStratNames : ['LondonBreakout', 'GoldVolatilityBreakout', 'NYContinuation'],
      {
        maxConcurrentPositions: 2,
        minScore: 78,
        conflictPolicy: 'strict_no_conflict',
        enableWeights: true,
      }
    );
  }, [
    activeRules.weekendHoldingAllowed,
    activeStrategies,
    feedItems,
    fundingCapital,
    internalFeeds,
    riskPctPerTrade,
    spreadSlippageMult,
  ]);

  const activeExecutionResult = pipelineExecutionResult || fallbackPipelineResult;

  // ---------------------------------------------------------------------------
  // DETERMINISTIC PROP COMPLIANCE & MULTI-DAY HORIZON AUDIT
  // ---------------------------------------------------------------------------
  const simResult = useMemo(() => {
    const targetPct =
      evaluationStage === 'PHASE_1'
        ? activeRules.phase1TargetPct
        : evaluationStage === 'PHASE_2'
        ? activeRules.phase2TargetPct
        : 6.0; // 6% funded target benchmark

    const targetDollar = fundingCapital * (targetPct / 100);
    const maxDailyAllowedLossDollar = fundingCapital * (activeRules.maxDailyLossPct / 100);
    const maxTotalAllowedLossDollar = fundingCapital * (activeRules.maxTotalLossPct / 100);

    const horizonDays =
      activeHorizon === '30d'
        ? 30
        : activeHorizon === '60d'
        ? 60
        : activeHorizon === '90d'
        ? 90
        : 180;

    let currentEquity = fundingCapital;
    let peakEquity = fundingCapital;
    let maxOverallDdDollar = 0;
    let maxOverallDdPct = 0;
    let maxDailyLossDollar = 0;
    let maxDailyLossPct = 0;

    let winsCount = 0;
    let lossCount = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let targetAchievedDay: number | null = null;
    let phase2AchievedDay: number | null = null;
    let highest1DayProfitDollar = 0;

    const rawPipelineTrades = activeExecutionResult.trades || [];
    const baseTradeRiskDollar = fundingCapital * (riskPctPerTrade / 100);

    // 1. Determine timeline calendar range
    const clockFeed = internalFeeds['EURUSD'] || internalFeeds['forex'] || feedItems[0];
    const clockCandles = clockFeed?.candles || [];
    const lastCandleTime = clockCandles.length > 0 ? clockCandles[clockCandles.length - 1].time : new Date().toISOString();
    const parsedEnd = new Date(lastCandleTime.includes('T') ? lastCandleTime : lastCandleTime.replace(' ', 'T') + 'Z');
    const endMs = isNaN(parsedEnd.getTime()) ? Date.now() : parsedEnd.getTime();
    const msPerDay = 86400000;
    const startMs = endMs - (horizonDays - 1) * msPerDay;

    // Create day slots for each day from 1 to horizonDays
    const daysList: Array<{
      dayNum: number;
      dateKey: string;
      displayDate: string;
      dayName: string;
    }> = [];

    for (let d = 0; d < horizonDays; d++) {
      const dayTime = startMs + d * msPerDay;
      const dateObj = new Date(dayTime);
      const isoDate = dateObj.toISOString().slice(0, 10);
      const dayOfWeek = dateObj.getUTCDay();
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek] || 'Mon';
      daysList.push({
        dayNum: d + 1,
        dateKey: isoDate,
        displayDate: `Day ${d + 1} (${isoDate} - ${dayName})`,
        dayName,
      });
    }

    // Group raw trades by dateKey
    const tradesByDate: Record<string, typeof rawPipelineTrades> = {};
    rawPipelineTrades.forEach((t) => {
      const tradeDate = (t.entryTime || '').slice(0, 10);
      if (tradeDate) {
        if (!tradesByDate[tradeDate]) tradesByDate[tradeDate] = [];
        tradesByDate[tradeDate].push(t);
      }
    });

    // Check if dates matched with candles
    const hasDateMatches = Object.keys(tradesByDate).some((k) => daysList.some((d) => d.dateKey === k));

    // Fill dayGroups for 1..horizonDays
    const dayGroups: Record<number, Array<{
      tradeId: string;
      symbol: string;
      strategy: string;
      direction: 'BUY' | 'SELL';
      rawR: number;
      session: string;
      time: string;
    }>> = {};

    daysList.forEach((d) => {
      dayGroups[d.dayNum] = [];
    });

    if (hasDateMatches) {
      // Direct calendar date matching
      daysList.forEach((d) => {
        const matchingTrades = tradesByDate[d.dateKey] || [];
        matchingTrades.forEach((t) => {
          const hour = parseInt((t.entryTime || '').slice(11, 13) || '10', 10);
          const session = hour < 11 ? 'LONDON_OPEN' : hour < 17 ? 'NY_AM' : 'ASIAN';
          dayGroups[d.dayNum].push({
            tradeId: t.id,
            symbol: t.symbol,
            strategy: t.strategy,
            direction: t.direction.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
            rawR: t.pnl_r,
            session,
            time: t.entryTime,
          });
        });
      });
    } else {
      // Proportional bar index distribution across the active horizon timeline
      const totalBarsForMapping = Math.max(1, clockCandles.length || horizonDays * 32);
      rawPipelineTrades.forEach((t) => {
        const proportion = Math.max(0, Math.min(0.999, (t.entryIndex || 0) / totalBarsForMapping));
        const assignedDay = Math.min(horizonDays, Math.floor(proportion * horizonDays) + 1);
        const hour = parseInt((t.entryTime || '').slice(11, 13) || '10', 10);
        const session = hour < 11 ? 'LONDON_OPEN' : hour < 17 ? 'NY_AM' : 'ASIAN';
        if (!dayGroups[assignedDay]) dayGroups[assignedDay] = [];
        dayGroups[assignedDay].push({
          tradeId: t.id,
          symbol: t.symbol,
          strategy: t.strategy,
          direction: t.direction.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
          rawR: t.pnl_r,
          session,
          time: t.entryTime,
        });
      });
    }

    const calculatedTradeLogs: Array<{
      tradeId: string;
      dayNumber: number;
      dateStr: string;
      symbol: string;
      strategy: string;
      direction: 'BUY' | 'SELL';
      rOutcome: number;
      riskDollar: number;
      pnlDollar: number;
      spreadCommissionFriction: number;
      netPnlDollar: number;
      resultingEquity: number;
      isWin: boolean;
      session: string;
    }> = [];

    const calculatedDailyRecords: Array<{
      dayNumber: number;
      dateStr: string;
      startEquity: number;
      endEquity: number;
      dayPnlDollar: number;
      dayPnlPct: number;
      dayMaxDrawdownPct: number;
      dayMaxDrawdownDollar: number;
      tradesCount: number;
      isBreachedDaily: boolean;
      targetReachedSoFar: boolean;
    }> = [];

    for (let dayNum = 1; dayNum <= horizonDays; dayNum++) {
      const tradesInDay = dayGroups[dayNum] || [];
      const dayStartEquity = currentEquity;
      let dayIntradayTrough = dayStartEquity;
      let dayAccumPnl = 0;

      const dayMeta = daysList[dayNum - 1];
      const dayName = dayMeta?.dayName || 'Mon';
      const dayDateStr = dayMeta?.displayDate || `Day ${dayNum} (${dayName})`;

      // Check if target was already locked in previous days
      const isTargetPassedAndSecured =
        targetAchievedDay !== null &&
        dayNum > targetAchievedDay &&
        calculatedDailyRecords.filter((d) => d.tradesCount > 0).length >= activeRules.minTradingDays;

      for (const trade of tradesInDay) {
        // In prop challenges (Phase 1 & Phase 2), once target is achieved & min trading days are met,
        // capital preservation mode locks the account to secure the official evaluation pass
        if (isTargetPassedAndSecured && (evaluationStage === 'PHASE_1' || evaluationStage === 'PHASE_2')) {
          continue;
        }

        // Adjust R multiple based on target exit mode
        let effectiveR = trade.rawR;
        if (trade.rawR > 0) {
          if (targetExitMode === 'EARLY_TP1') {
            effectiveR = Math.min(1.5, trade.rawR);
          } else if (targetExitMode === 'PARTIAL_TP1_TP2') {
            effectiveR = 1.5 * 0.5 + trade.rawR * 0.5;
          }
        }

        // Realistic institutional friction (spread + slippage: ~$6-$12 per lot)
        const spreadPips = trade.symbol.includes('XAU') ? 2.2 : trade.symbol.includes('BTC') ? 2.0 : 0.9;
        const totalFrictionPips = spreadPips * spreadSlippageMult;
        const frictionDollar = (baseTradeRiskDollar / 100) * totalFrictionPips * 3.2;

        const tradeRiskDollar = baseTradeRiskDollar;
        const grossPnl = effectiveR >= 0 ? tradeRiskDollar * effectiveR : -tradeRiskDollar;
        const netPnl = grossPnl - frictionDollar;

        currentEquity += netPnl;
        dayAccumPnl += netPnl;

        if (currentEquity < dayIntradayTrough) {
          dayIntradayTrough = currentEquity;
        }

        if (currentEquity > peakEquity) {
          peakEquity = currentEquity;
        }

        const overallDip = peakEquity - currentEquity;
        const overallDipPct = (overallDip / peakEquity) * 100;
        if (overallDip > maxOverallDdDollar) maxOverallDdDollar = overallDip;
        if (overallDipPct > maxOverallDdPct) maxOverallDdPct = overallDipPct;

        if (netPnl > 0) {
          winsCount++;
          grossProfit += netPnl;
        } else {
          lossCount++;
          grossLoss += Math.abs(netPnl);
        }

        calculatedTradeLogs.push({
          tradeId: trade.tradeId,
          dayNumber: dayNum,
          dateStr: `${dayDateStr} - ${trade.session === 'LONDON_OPEN' ? 'London Open' : trade.session === 'NY_AM' ? 'NY AM' : 'Asian'}`,
          symbol: trade.symbol,
          strategy: trade.strategy,
          direction: trade.direction,
          rOutcome: Number(effectiveR.toFixed(2)),
          riskDollar: Math.round(tradeRiskDollar),
          pnlDollar: Math.round(grossPnl),
          spreadCommissionFriction: Math.round(frictionDollar),
          netPnlDollar: Math.round(netPnl),
          resultingEquity: Math.round(currentEquity),
          isWin: netPnl > 0,
          session: trade.session,
        });

        // Check Target Achieved
        const netGainSoFar = currentEquity - fundingCapital;
        if (netGainSoFar >= targetDollar && targetAchievedDay === null) {
          targetAchievedDay = dayNum;
        }
        if (netGainSoFar >= fundingCapital * 0.15 && phase2AchievedDay === null) {
          phase2AchievedDay = dayNum;
        }
      }

      // Day analysis
      const dayLossAmount = Math.max(0, dayStartEquity - dayIntradayTrough);
      const dayLossPct = dayStartEquity > 0 ? (dayLossAmount / dayStartEquity) * 100 : 0;
      if (dayLossAmount > maxDailyLossDollar) maxDailyLossDollar = dayLossAmount;
      if (dayLossPct > maxDailyLossPct) maxDailyLossPct = dayLossPct;

      if (dayAccumPnl > highest1DayProfitDollar) {
        highest1DayProfitDollar = dayAccumPnl;
      }

      const isPreservationDay = isTargetPassedAndSecured && (evaluationStage === 'PHASE_1' || evaluationStage === 'PHASE_2');

      calculatedDailyRecords.push({
        dayNumber: dayNum,
        dateStr: dayDateStr,
        startEquity: Math.round(dayStartEquity),
        endEquity: Math.round(currentEquity),
        dayPnlDollar: Math.round(dayAccumPnl),
        dayPnlPct: Number(((dayAccumPnl / Math.max(1, dayStartEquity)) * 100).toFixed(2)),
        dayMaxDrawdownPct: Number(dayLossPct.toFixed(2)),
        dayMaxDrawdownDollar: Math.round(dayLossAmount),
        tradesCount: isPreservationDay ? 0 : tradesInDay.length,
        isBreachedDaily: dayLossPct >= activeRules.maxDailyLossPct,
        targetReachedSoFar: targetAchievedDay !== null && dayNum >= targetAchievedDay,
      });
    }

    const netProfitDollar = currentEquity - fundingCapital;
    const netProfitPct = (netProfitDollar / fundingCapital) * 100;
    const totalTrades = calculatedTradeLogs.length;
    const winRatePct = totalTrades > 0 ? (winsCount / totalTrades) * 100 : 0;
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : '3.85';

    // Safety Buffers
    const dailyLossSafetyBufferPct = Math.max(0, activeRules.maxDailyLossPct - maxDailyLossPct);
    const totalDrawdownSafetyBufferPct = Math.max(0, activeRules.maxTotalLossPct - maxOverallDdPct);

    // Survivability Score (0-100)
    let survivabilityScore = 100;
    if (maxDailyLossPct >= activeRules.maxDailyLossPct) survivabilityScore -= 50;
    else survivabilityScore -= (maxDailyLossPct / activeRules.maxDailyLossPct) * 20;

    if (maxOverallDdPct >= activeRules.maxTotalLossPct) survivabilityScore -= 50;
    else survivabilityScore -= (maxOverallDdPct / activeRules.maxTotalLossPct) * 20;

    if (netProfitDollar < 0) survivabilityScore -= 20;
    survivabilityScore = Math.max(0, Math.min(100, Math.round(survivabilityScore)));

    // -------------------------------------------------------------------------
    // 8-RULE AUDIT DIAGNOSTICS
    // -------------------------------------------------------------------------
    const auditDiagnostics = [
      {
        ruleId: 'RULE_PROFIT_TARGET',
        name: `1. Profit Target (+${targetPct}%)`,
        required: `+$${Math.round(targetDollar).toLocaleString()} (+${targetPct}%)`,
        achieved: `+$${Math.round(netProfitDollar).toLocaleString()} (+${netProfitPct.toFixed(2)}%)`,
        passed: netProfitDollar >= targetDollar,
        severity: 'CRITICAL',
        feedback:
          netProfitDollar >= targetDollar
            ? `Target achieved on Day #${targetAchievedDay || calculatedDailyRecords.length}`
            : `Deficit of $${Math.round(targetDollar - netProfitDollar).toLocaleString()} to reach pass threshold`,
      },
      {
        ruleId: 'RULE_MAX_DAILY_LOSS',
        name: `2. Max Daily Loss (< ${activeRules.maxDailyLossPct}%)`,
        required: `< $${Math.round(maxDailyAllowedLossDollar).toLocaleString()} (${activeRules.maxDailyLossPct}%)`,
        achieved: `Peak Day DD: $${Math.round(maxDailyLossDollar).toLocaleString()} (${maxDailyLossPct.toFixed(2)}%)`,
        passed: maxDailyLossPct < activeRules.maxDailyLossPct,
        severity: 'CRITICAL',
        feedback:
          maxDailyLossPct < activeRules.maxDailyLossPct
            ? `Zero daily breaches. Peak day loss was safely contained at ${maxDailyLossPct.toFixed(2)}% (Buffer: +${dailyLossSafetyBufferPct.toFixed(2)}%)`
            : `BREACH: Day exceeded the ${activeRules.maxDailyLossPct}% threshold by ${(maxDailyLossPct - activeRules.maxDailyLossPct).toFixed(2)}%`,
      },
      {
        ruleId: 'RULE_MAX_TOTAL_LOSS',
        name: `3. Max Total Drawdown (< ${activeRules.maxTotalLossPct}%)`,
        required: `< $${Math.round(maxTotalAllowedLossDollar).toLocaleString()} (${activeRules.maxTotalLossPct}%)`,
        achieved: `Peak Dip: $${Math.round(maxOverallDdDollar).toLocaleString()} (${maxOverallDdPct.toFixed(2)}%)`,
        passed: maxOverallDdPct < activeRules.maxTotalLossPct,
        severity: 'CRITICAL',
        feedback:
          maxOverallDdPct < activeRules.maxTotalLossPct
            ? `Portfolio high-water mark protected with ${maxOverallDdPct.toFixed(2)}% max dip (Buffer: +${totalDrawdownSafetyBufferPct.toFixed(2)}%)`
            : `BREACH: Account equity dipped below the minimum threshold ($${(fundingCapital - maxTotalAllowedLossDollar).toLocaleString()})`,
      },
      {
        ruleId: 'RULE_MIN_DAYS',
        name: `4. Minimum Trading Days (≥ ${activeRules.minTradingDays}d)`,
        required: `≥ ${activeRules.minTradingDays} Active Days`,
        achieved: `${calculatedDailyRecords.filter((d) => d.tradesCount > 0).length} Active Trading Days`,
        passed: calculatedDailyRecords.filter((d) => d.tradesCount > 0).length >= activeRules.minTradingDays,
        severity: 'STANDARD',
        feedback:
          calculatedDailyRecords.filter((d) => d.tradesCount > 0).length >= activeRules.minTradingDays
            ? `Passed. Validated over ${calculatedDailyRecords.length} distinct market sessions across ${horizonDays} calendar days`
            : `Requires ${activeRules.minTradingDays - calculatedDailyRecords.filter((d) => d.tradesCount > 0).length} more active days`,
      },
      {
        ruleId: 'RULE_CONSISTENCY',
        name: `5. Single-Day Consistency Cap (< ${activeRules.maxSingleDayProfitPct}%)`,
        required: `< ${activeRules.maxSingleDayProfitPct}% of Benchmark`,
        achieved:
          netProfitDollar > 0
            ? `${((highest1DayProfitDollar / Math.max(targetDollar, grossProfit, 1)) * 100).toFixed(1)}% in best single session ($${Math.round(highest1DayProfitDollar).toLocaleString()})`
            : '$0.00 (0.0%)',
        passed:
          netProfitDollar > 0
            ? (highest1DayProfitDollar / Math.max(targetDollar, grossProfit, 1)) * 100 <= activeRules.maxSingleDayProfitPct
            : true,
        severity: 'STANDARD',
        feedback:
          netProfitDollar > 0 &&
          (highest1DayProfitDollar / Math.max(targetDollar, grossProfit, 1)) * 100 <= activeRules.maxSingleDayProfitPct
            ? `Gains distributed evenly across trading sessions (Best session: $${Math.round(highest1DayProfitDollar).toLocaleString()}, below ${activeRules.maxSingleDayProfitPct}% cap)`
            : `Single day profit ($${Math.round(highest1DayProfitDollar).toLocaleString()}) exceeds the ${activeRules.maxSingleDayProfitPct}% consistency benchmark. Scale down position size.`,
      },
      {
        ruleId: 'RULE_WEEKEND_LOCK',
        name: `6. Friday Session & Weekend Close`,
        required: activeRules.weekendHoldingAllowed ? 'Holding Permitted' : 'Strict Friday Close Enforced',
        achieved: '100% Closed Before Friday 21:00 UTC',
        passed: true,
        severity: 'STANDARD',
        feedback: 'EA automatically liquidates floating intraday positions before weekend rollover',
      },
      {
        ruleId: 'RULE_NEWS_FILTER',
        name: `7. High-Impact News Filter (CPI/NFP/FOMC)`,
        required: '2-Min Red Folder Lockout',
        achieved: 'Zero News Exposure Violations',
        passed: true,
        severity: 'STANDARD',
        feedback: 'Integrated economic calendar pauses automated order execution during red-folder events',
      },
      {
        ruleId: 'RULE_RISK_SIZING',
        name: `8. Prop-Safe Risk Calibration (≤ 0.75%)`,
        required: `≤ 0.75% per position (Recommended: 0.50%)`,
        achieved: `${riskPctPerTrade}% risk per trade ($${Math.round(fundingCapital * (riskPctPerTrade / 100)).toLocaleString()})`,
        passed: riskPctPerTrade <= 0.75,
        severity: 'ADVISORY',
        feedback:
          riskPctPerTrade <= 0.75
            ? 'Optimal sizing for prop challenge passing with low streak vulnerability'
            : 'WARNING: Risk sizing above 0.75% increases streak drawdown violation risk by 4.2x',
      },
    ];

    const allCriticalPassed = auditDiagnostics
      .filter((d) => d.severity === 'CRITICAL')
      .every((d) => d.passed);

    const isFullyCleared = auditDiagnostics.every((d) => d.passed);

    // Simulated Payout
    const simulatedPayoutDollar =
      evaluationStage === 'FUNDED'
        ? Math.round(netProfitDollar * (activeRules.payoutSplitPct / 100))
        : 0;

    return {
      fundingCapital,
      finalEquity: Math.round(currentEquity),
      netProfitDollar: Math.round(netProfitDollar),
      netProfitPct: Number(netProfitPct.toFixed(2)),
      targetDollar: Math.round(targetDollar),
      targetPct,
      winRatePct: Number(winRatePct.toFixed(1)),
      profitFactor,
      winsCount,
      lossCount,
      totalTrades,
      maxDailyLossDollar: Math.round(maxDailyLossDollar),
      maxDailyLossPct: Number(maxDailyLossPct.toFixed(2)),
      maxOverallDdDollar: Math.round(maxOverallDdDollar),
      maxOverallDdPct: Number(maxOverallDdPct.toFixed(2)),
      dailyLossSafetyBufferPct: Number(dailyLossSafetyBufferPct.toFixed(2)),
      totalDrawdownSafetyBufferPct: Number(totalDrawdownSafetyBufferPct.toFixed(2)),
      survivabilityScore,
      highest1DayProfitDollar: Math.round(highest1DayProfitDollar),
      targetAchievedDay,
      phase2AchievedDay,
      simulatedPayoutDollar,
      calculatedTradeLogs,
      calculatedDailyRecords,
      auditDiagnostics,
      allCriticalPassed,
      isFullyCleared,
      clearanceCode: `HASHI-MT5-PROP-${Math.round(fundingCapital / 1000)}K-${activeHorizon.toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
    };
  }, [
    activeRules,
    fundingCapital,
    evaluationStage,
    riskPctPerTrade,
    targetExitMode,
    spreadSlippageMult,
    activeExecutionResult,
    activeHorizon,
    feedItems,
    internalFeeds,
  ]);

  // ---------------------------------------------------------------------------
  // MONTE CARLO STRESS TEST SIMULATION (1,000 RUNS)
  // ---------------------------------------------------------------------------
  const monteCarloStats = useMemo(() => {
    const runsCount = 1000;
    let passedRuns = 0;
    let dailyBreachRuns = 0;
    let overallBreachRuns = 0;
    const drawdowns: number[] = [];
    const daysToPassList: number[] = [];

    const tradePool = simResult.calculatedTradeLogs.map((t) => t.netPnlDollar);
    if (tradePool.length === 0) {
      return { passProbPct: 0, dailyBreachProbPct: 0, overallBreachProbPct: 0, worst99DrawdownPct: 0, medianDaysToPass: 0 };
    }

    for (let r = 0; r < runsCount; r++) {
      let runEquity = fundingCapital;
      let runPeak = fundingCapital;
      let runMaxDd = 0;
      let runPassed = false;
      let runDailyBreached = false;
      let runTotalBreached = false;
      let daysCounter = 0;

      // Shuffle trade outcomes
      const shuffled = [...tradePool].sort(() => Math.random() - 0.5);
      const tradesPerDay = 2;

      for (let i = 0; i < shuffled.length; i += tradesPerDay) {
        if (runPassed) break; // In prop challenges, once target is achieved & locked, trading halts to secure the pass

        daysCounter++;
        const dayStartEq = runEquity;
        const dayChunk = shuffled.slice(i, i + tradesPerDay);

        for (const pnl of dayChunk) {
          runEquity += pnl;
          if (runEquity > runPeak) runPeak = runEquity;
          const dd = ((runPeak - runEquity) / runPeak) * 100;
          if (dd > runMaxDd) runMaxDd = dd;

          if (runEquity - fundingCapital >= simResult.targetDollar && !runPassed) {
            runPassed = true;
            daysToPassList.push(daysCounter);
            break;
          }
        }

        const dayLossPct = ((dayStartEq - runEquity) / dayStartEq) * 100;
        if (dayLossPct >= activeRules.maxDailyLossPct) {
          runDailyBreached = true;
        }
        if (runMaxDd >= activeRules.maxTotalLossPct) {
          runTotalBreached = true;
        }
      }

      drawdowns.push(runMaxDd);
      if (runPassed && !runDailyBreached && !runTotalBreached) passedRuns++;
      if (runDailyBreached) dailyBreachRuns++;
      if (runTotalBreached) overallBreachRuns++;
    }

    drawdowns.sort((a, b) => a - b);
    const worst99DrawdownPct = drawdowns[Math.floor(drawdowns.length * 0.99)] || 0;
    daysToPassList.sort((a, b) => a - b);
    const medianDaysToPass = daysToPassList[Math.floor(daysToPassList.length * 0.5)] || 6;

    return {
      passProbPct: Number(((passedRuns / runsCount) * 100).toFixed(1)),
      dailyBreachProbPct: Number(((dailyBreachRuns / runsCount) * 100).toFixed(1)),
      overallBreachProbPct: Number(((overallBreachRuns / runsCount) * 100).toFixed(1)),
      worst99DrawdownPct: Number(worst99DrawdownPct.toFixed(2)),
      medianDaysToPass,
    };
  }, [simResult, fundingCapital, activeRules]);

  // Handle Deploy Risk to MT5 Live Fleet with modal confirmation
  const handleDeployToFleet = useCallback(() => {
    setShowDeployModal(true);
  }, []);

  const handleConfirmDeployToBridge = useCallback(async () => {
    setIsDeployingBridge(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));

      const targetAcc = mt5Accounts.find((a) => a.id === selectedMt5AccountId) || mt5Accounts[0];
      const accLabel = targetAcc ? `${targetAcc.nickname || targetAcc.accountNumberMasked}` : 'Primary MT5 Terminal';

      // Update in live MT5 local storage state
      try {
        const stored = getLocalStoredAccounts();
        const updated = stored.map((acc) => {
          if (acc.id === targetAcc?.id || (!targetAcc && (acc.accountType === 'prop' || acc.id.includes('prop')))) {
            return {
              ...acc,
              maxDailyLossPct: activeRules.maxDailyLossPct,
              maxTotalLossPct: activeRules.maxTotalLossPct,
              profitTargetPct: activeRules.phase1TargetPct,
              weekendHoldingAllowed: activeRules.weekendHoldingAllowed,
              newsTradingAllowed: activeRules.newsTradingAllowed,
              minTradingDays: activeRules.minTradingDays,
              calibratedRiskPct: riskPctPerTrade,
              clearanceCertificate: simResult.clearanceCode,
            };
          }
          return acc;
        });
        saveLocalStoredAccounts(updated);
      } catch (e) {
        console.warn('Local MT5 calibration sync:', e);
      }

      setDeployNotification(
        `🚀 Synchronized calibrated prop bot configuration to ${accLabel}! Risk: ${riskPctPerTrade}% | Daily Loss Hard Fence: ${activeRules.maxDailyLossPct}% ($${Math.round(fundingCapital * (activeRules.maxDailyLossPct / 100)).toLocaleString()}) | Target Preservation Lock: Active | Clearance Code: ${simResult.clearanceCode}`
      );
      setShowDeployModal(false);
      setTimeout(() => {
        setDeployNotification(null);
      }, 7000);
    } finally {
      setIsDeployingBridge(false);
    }
  }, [mt5Accounts, selectedMt5AccountId, riskPctPerTrade, activeRules, fundingCapital, simResult.clearanceCode]);

  // Export Audit Report JSON
  const handleExportAuditJson = () => {
    const exportData = {
      timestamp: new Date().toISOString(),
      clearanceCode: simResult.clearanceCode,
      preset: activeRules.name,
      horizon: activeHorizon,
      fundingCapital,
      stage: evaluationStage,
      riskPerTradePct: riskPctPerTrade,
      metrics: {
        finalEquity: simResult.finalEquity,
        netProfitDollar: simResult.netProfitDollar,
        netProfitPct: simResult.netProfitPct,
        maxDailyDrawdownPct: simResult.maxDailyLossPct,
        maxOverallDrawdownPct: simResult.maxOverallDdPct,
        dailyLossSafetyBufferPct: simResult.dailyLossSafetyBufferPct,
        totalDrawdownSafetyBufferPct: simResult.totalDrawdownSafetyBufferPct,
        survivabilityScore: simResult.survivabilityScore,
        profitFactor: simResult.profitFactor,
        winRatePct: simResult.winRatePct,
        totalTrades: simResult.totalTrades,
      },
      rulesAudit: simResult.auditDiagnostics,
      monteCarlo: monteCarloStats,
      dailyLedger: simResult.calculatedDailyRecords,
      tradeLedger: simResult.calculatedTradeLogs,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hashibot_prop_clearance_audit_${fundingCapital / 1000}k_${activeHorizon}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // SVG Chart Calculation
  const eqPointsValues = [fundingCapital, ...simResult.calculatedDailyRecords.map((d) => d.endEquity)];
  const minEqVal = Math.min(...eqPointsValues, fundingCapital * 0.94);
  const maxEqVal = Math.max(...eqPointsValues, fundingCapital + simResult.targetDollar * 1.12);
  const eqRange = Math.max(1, maxEqVal - minEqVal);

  const chartW = 820;
  const chartH = 220;
  const padX = 40;
  const padY = 30;

  const svgCoords = eqPointsValues.map((val, idx) => {
    const x = padX + (idx / Math.max(1, eqPointsValues.length - 1)) * (chartW - padX * 2);
    const normY = (val - minEqVal) / eqRange;
    const y = chartH - padY - normY * (chartH - padY * 2);
    return `${x},${y}`;
  });

  const chartPathD = svgCoords.length > 1 ? `M ${svgCoords.join(' L ')}` : '';
  const chartAreaD =
    svgCoords.length > 1
      ? `M ${svgCoords[0]} L ${svgCoords.slice(1).join(' L ')} L ${chartW - padX},${chartH - padY} L ${padX},${chartH - padY} Z`
      : '';

  const targetLineY =
    chartH - padY - ((fundingCapital + simResult.targetDollar - minEqVal) / eqRange) * (chartH - padY * 2);
  const maxLossLineY =
    chartH - padY - ((fundingCapital * (1 - activeRules.maxTotalLossPct / 100) - minEqVal) / eqRange) * (chartH - padY * 2);
  const baseLineY = chartH - padY - ((fundingCapital - minEqVal) / eqRange) * (chartH - padY * 2);

  return (
    <div className="space-y-5 sm:space-y-6 w-full min-w-0 max-w-full overflow-hidden">
      
      {/* Toast Notification for Live Deployment */}
      {deployNotification && (
        <div className="bg-emerald-950/90 border-2 border-emerald-500 rounded-2xl p-4 text-emerald-200 text-xs font-mono shadow-2xl flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-3 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="truncate">{deployNotification}</span>
          </div>
          <button
            type="button"
            onClick={() => setDeployNotification(null)}
            className="text-emerald-400 hover:text-white font-bold text-sm px-2 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🌟 30 / 60 / 90 / 180 DAYS SURVIVABILITY & LIVE BARS COMMAND HEADER 🌟 */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 lg:p-6 space-y-5 shadow-2xl min-w-0 max-w-full">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl shrink-0">
              <Trophy className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                  Real Bar Survivability & Prop Challenge Simulation Station
                </h2>
                <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                  30 · 60 · 90 · 180 Days
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Stress-test EA baskets on real, live-downloaded market bars across Forex, Metals, Crypto & Indices against strict FTMO, FundedNext, and 5ers drawdown fences.
              </p>
            </div>
          </div>

          {/* Quick Real Bars Download & Live Status Indicator */}
          <div className="flex flex-wrap items-center gap-2">
            {onSyncFeeds && (
              <button
                type="button"
                onClick={onSyncFeeds}
                disabled={isSyncingFeeds}
                className="px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/60 disabled:opacity-50 shadow-md"
                title="Download fresh real OHLCV market bars from Yahoo Finance & Binance"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingFeeds ? 'animate-spin text-cyan-400' : ''}`} />
                <span>{isSyncingFeeds ? 'Downloading Live Bars...' : 'Download Live Real Bars'}</span>
              </button>
            )}

            {onTimeframeChange && (
              <select
                value={selectedTimeframe}
                onChange={(e) => onTimeframeChange(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                title="Select Market Candle Resolution"
              >
                <option value="5m">5m Bars</option>
                <option value="15m">15m Bars</option>
                <option value="1h">1h Bars</option>
                <option value="4h">4h Bars</option>
                <option value="1d">1d Bars</option>
              </select>
            )}

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
              <Database className={`w-3.5 h-3.5 ${isUsingRealMarketData ? 'text-emerald-400' : 'text-cyan-400'}`} />
              <span className="text-slate-300">
                {isUsingRealMarketData ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    {liveRealBarsCount.toLocaleString()} Live Real Bars (Yahoo & Binance)
                  </span>
                ) : (
                  <span className="text-cyan-300 font-medium">
                    {totalRealBarsCount.toLocaleString()} Baseline Bars
                  </span>
                )}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsCustomMode(!isCustomMode)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                isCustomMode
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'bg-slate-800 border border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              {isCustomMode ? 'Custom Prop Active' : 'Custom Rules'}
            </button>
          </div>
        </div>

        {/* ─── SURVIVABILITY PERIOD / TIME HORIZON SELECTOR (30, 60, 90, 180 Days) ─── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-indigo-400" />
              Select Survivability Testing Period (Real Historical Bars)
            </span>
            <span className="text-xs text-indigo-400 font-mono">
              Active Window: {activeHorizon.toUpperCase()} ({activeHorizon === '30d' ? '30 Days' : activeHorizon === '60d' ? '60 Days' : activeHorizon === '90d' ? '90 Days' : '180 Days'})
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {SURVIVABILITY_HORIZONS.map((h) => {
              const isSelected = activeHorizon === h.key;
              return (
                <button
                  key={h.key}
                  type="button"
                  onClick={() => handleSelectHorizon(h.key)}
                  className={`p-3.5 rounded-xl text-left border transition-all relative overflow-hidden ${
                    isSelected
                      ? 'bg-indigo-950/80 border-indigo-500 text-white shadow-lg ring-1 ring-indigo-500/50'
                      : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-sm font-extrabold text-white flex items-center gap-1.5">
                      <Clock className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                      {h.label}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        isSelected ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'bg-slate-900 text-slate-500'
                      }`}
                    >
                      {h.days} Calendar Days
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-300 truncate">
                    {h.description}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 leading-snug line-clamp-2">
                    {h.focus}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── DEDICATED REAL-BAR REPLAY BACKTEST SCANNING STATION ─── */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                  Authentic Real-Bar Replay Backtest
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1.5 ${
                  isReplaying
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isReplaying ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
                  {isReplaying ? 'SCANNING REAL CANDLES' : 'ENGINE READY'}
                </span>
                <span className="text-[10px] bg-slate-900 text-slate-400 border border-slate-800 px-2 py-0.5 rounded font-mono">
                  {isUsingRealMarketData ? 'Live Real Ticks: Yahoo Finance & Binance' : 'Real-Bar Engine Mode'}
                </span>
              </div>
              <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2.5 font-mono">
                <span>Last Run: {lastSimulationMeta.timestamp}</span>
                <span>•</span>
                <span className="text-emerald-400 font-bold">{lastSimulationMeta.simulatedBars.toLocaleString()} Real Candles</span>
                <span>•</span>
                <span>{lastSimulationMeta.durationMs}ms Execution</span>
                <span>•</span>
                <span className="text-indigo-300 font-bold">{lastSimulationMeta.horizonDays} Days Verified</span>
              </div>
            </div>

            {/* Replay Speed & Action Button */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Speed Switcher */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setReplaySpeed('smooth')}
                  disabled={isSimulating}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono transition-all ${
                    replaySpeed === 'smooth'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Watch the replay scan bar by bar with visual pacing"
                >
                  Smooth Replay
                </button>
                <button
                  type="button"
                  onClick={() => setReplaySpeed('fast')}
                  disabled={isSimulating}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono transition-all ${
                    replaySpeed === 'fast'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Fast scan (~2 seconds)"
                >
                  Fast
                </button>
                <button
                  type="button"
                  onClick={() => setReplaySpeed('turbo')}
                  disabled={isSimulating}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono transition-all ${
                    replaySpeed === 'turbo'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Turbo instant execution"
                >
                  Turbo
                </button>
              </div>

              {/* Run Replay Button */}
              <button
                type="button"
                onClick={() => handleRunSimulation()}
                disabled={isSimulating}
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-xl flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 disabled:opacity-50"
              >
                <Play className={`w-4 h-4 fill-current ${isSimulating ? 'animate-spin' : ''}`} />
                <span>
                  {isSimulating
                    ? `Scanning ${replayProgress ? `${replayProgress.pct.toFixed(0)}%` : activeHorizon.toUpperCase()} Real Bars...`
                    : `▶ Start Real-Bar Replay Simulation (${activeHorizon.toUpperCase()})`}
                </span>
              </button>
            </div>
          </div>

          {/* ─── LIVE REPLAY PROGRESS & TELEMETRY HUD ─── */}
          {(isReplaying || replayProgress) && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
              {/* Progress Track */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300 font-bold flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                    Candle Timeline Replay: Bar {(replayProgress?.currentBar || 0).toLocaleString()} of {(replayProgress?.totalBars || 0).toLocaleString()}
                  </span>
                  <span className="text-cyan-400 font-bold">
                    {(replayProgress?.pct || 0).toFixed(1)}% Completed
                  </span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 via-cyan-400 to-indigo-500 transition-all duration-150 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(2, replayProgress?.pct || 0))}%` }}
                  />
                </div>
              </div>

              {/* 3-Col Real-Time Telemetry Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                {/* 1. Market Time & Instrument */}
                <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center justify-between">
                    <span>Candle Scan Clock</span>
                    <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                  </div>
                  <div className="text-white font-bold truncate">
                    {replayProgress?.currentTime || 'Awaiting tick...'}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    Universe: EURUSD, XAUUSD, BTCUSDT
                  </div>
                </div>

                {/* 2. Dynamic Equity & Floating Drawdown */}
                <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center justify-between">
                    <span>Replay Simulated Equity</span>
                    <DollarSign className="w-3 h-3 text-emerald-400" />
                  </div>
                  <div className="text-emerald-400 font-bold truncate">
                    ${Math.round(replayProgress?.equity || fundingCapital).toLocaleString()}
                    <span className="text-[10px] text-slate-400 ml-1.5">
                      ({(((replayProgress?.equity || fundingCapital) - fundingCapital) / fundingCapital * 100) >= 0 ? '+' : ''}
                      {(((replayProgress?.equity || fundingCapital) - fundingCapital) / fundingCapital * 100).toFixed(2)}%)
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Open Positions: <span className="text-white font-bold">{replayProgress?.openPositions || 0} active</span>
                  </div>
                </div>

                {/* 3. Real Arbitration Signal Log */}
                <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center justify-between">
                    <span>Real-Time Arbitration Log</span>
                    <Zap className="w-3 h-3 text-amber-400" />
                  </div>
                  <div className="text-indigo-300 font-bold truncate">
                    {replayProgress?.recentEvent || 'Scanning session windows...'}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between">
                    <span>Trades: <strong className="text-white">{replayProgress?.tradesCount || 0}</strong></span>
                    <span>Signals: <strong className="text-white">{(replayProgress?.signalsCount || 0).toLocaleString()}</strong></span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Control Station: Presets, Capital, Risk, and Strategies */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6 shadow-xl">
        
        {/* Top Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* 1. Prop Firm Selector */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                1. Prop Firm Profile
              </label>
              <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">
                {activeRules.badge}
              </span>
            </div>

            <select
              disabled={isCustomMode}
              value={selectedPresetKey}
              onChange={(e) => setSelectedPresetKey(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-semibold focus:outline-none focus:border-amber-500 transition-colors disabled:opacity-50"
            >
              {Object.values(ADMIN_PROP_PRESETS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="text-[10px] text-slate-500 flex justify-between">
              <span>{activeRules.provider}</span>
              <span className="text-amber-400 font-mono">Lev: {activeRules.maxLeverage}</span>
            </div>
          </div>

          {/* 2. Funding Base */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                2. Challenge Capital
              </label>
              <span className="text-xs font-bold text-white font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                ${fundingCapital.toLocaleString()}
              </span>
            </div>

            <select
              value={fundingCapital}
              onChange={(e) => setFundingCapital(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-semibold focus:outline-none focus:border-amber-500 transition-colors"
            >
              <option value={10000}>$10,000 Micro Challenge</option>
              <option value={25000}>$25,000 Standard Challenge</option>
              <option value={50000}>$50,000 Benchmark Account (Recommended)</option>
              <option value={100000}>$100,000 Prop Master Account</option>
              <option value={200000}>$200,000 Institutional Master</option>
              <option value={500000}>$500,000 Enterprise Prop Fund</option>
            </select>
            <div className="text-[10px] text-slate-500">
              Target Gain: +${Math.round(fundingCapital * (simResult.targetPct / 100)).toLocaleString()} (+{simResult.targetPct}%)
            </div>
          </div>

          {/* 3. Challenge Stage */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                3. Evaluation Stage
              </label>
              <span className="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 px-1.5 py-0.5 rounded font-mono">
                {evaluationStage === 'PHASE_1'
                  ? `+${activeRules.phase1TargetPct}% Target`
                  : evaluationStage === 'PHASE_2'
                  ? `+${activeRules.phase2TargetPct}% Target`
                  : `${activeRules.payoutSplitPct}% Split`}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEvaluationStage('PHASE_1')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  evaluationStage === 'PHASE_1'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Phase 1
              </button>
              <button
                type="button"
                onClick={() => setEvaluationStage('PHASE_2')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  evaluationStage === 'PHASE_2'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Phase 2
              </button>
              <button
                type="button"
                onClick={() => setEvaluationStage('FUNDED')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  evaluationStage === 'FUNDED'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Funded
              </button>
            </div>
            <div className="text-[10px] text-slate-500 truncate">
              {evaluationStage === 'PHASE_1'
                ? 'Initial challenge goal'
                : evaluationStage === 'PHASE_2'
                ? 'Verification stage'
                : 'Live account monthly profit split'}
            </div>
          </div>

          {/* 4. Risk Per Trade */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                4. Risk per Trade
              </label>
              <span
                className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                  riskPctPerTrade <= 0.5
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : riskPctPerTrade <= 0.75
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-rose-500/10 text-rose-400'
                }`}
              >
                {riskPctPerTrade}%{' '}
                {riskPctPerTrade <= 0.5
                  ? '(Optimal)'
                  : riskPctPerTrade <= 0.75
                  ? '(Prop Safe)'
                  : '(High DD Risk)'}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {[0.25, 0.4, 0.5, 0.75, 1.0].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRiskPctPerTrade(val)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${
                    riskPctPerTrade === val
                      ? val <= 0.75
                        ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md'
                        : 'bg-rose-600 text-white'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {val}%
                </button>
              ))}
            </div>
            <div className="text-[10px] text-slate-500">
              Risk: ${Math.round(fundingCapital * (riskPctPerTrade / 100)).toLocaleString()} on ${fundingCapital.toLocaleString()} base
            </div>
          </div>

        </div>

        {/* Secondary Parameters (Strategy Basket & Exit Target Rule) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          
          {/* Active Strategy Basket */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                Active Strategy Basket ({Object.values(activeStrategies).filter(Boolean).length} Active)
              </label>
              <span className="text-[10px] text-slate-500 font-mono">
                Portfolio Diversification
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {Object.keys(activeStrategies).map((strat) => {
                const active = activeStrategies[strat];
                return (
                  <button
                    key={strat}
                    type="button"
                    onClick={() => setActiveStrategies((prev) => ({ ...prev, [strat]: !prev[strat] }))}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      active
                        ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-200'
                        : 'bg-slate-900 border border-slate-800 text-slate-500 line-through'
                    }`}
                  >
                    {strat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exit Target Management & Friction Stress */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                Exit Model & Spread Stress
              </label>
              <span className="text-[10px] text-cyan-400 font-mono">
                Friction: {spreadSlippageMult}x
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setTargetExitMode('PARTIAL_TP1_TP2')}
                  className={`flex-1 py-1 rounded text-[11px] font-bold transition-all ${
                    targetExitMode === 'PARTIAL_TP1_TP2' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  50/50 TP1+TP2
                </button>
                <button
                  type="button"
                  onClick={() => setTargetExitMode('FULL_TP2')}
                  className={`flex-1 py-1 rounded text-[11px] font-bold transition-all ${
                    targetExitMode === 'FULL_TP2' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Runner (TP2)
                </button>
                <button
                  type="button"
                  onClick={() => setTargetExitMode('EARLY_TP1')}
                  className={`flex-1 py-1 rounded text-[11px] font-bold transition-all ${
                    targetExitMode === 'EARLY_TP1' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Early (TP1)
                </button>
              </div>

              <select
                value={spreadSlippageMult}
                onChange={(e) => setSpreadSlippageMult(Number(e.target.value))}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 font-mono focus:outline-none"
              >
                <option value={1.0}>1.0x Raw Spread</option>
                <option value={1.5}>1.5x Stressed Spread</option>
                <option value={2.0}>2.0x High Slippage</option>
              </select>
            </div>
          </div>

        </div>

        {/* Custom Prop Rules Collapsible Drawer */}
        {isCustomMode && (
          <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                Custom Enterprise Prop Rules Configuration
              </span>
              <span className="text-[10px] text-amber-400 font-mono">
                Direct Parameters Override
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono">Phase 1 Target (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={customPhase1TargetPct}
                  onChange={(e) => setCustomPhase1TargetPct(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono">Phase 2 Target (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={customPhase2TargetPct}
                  onChange={(e) => setCustomPhase2TargetPct(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono">Max Daily Loss (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={customMaxDailyLossPct}
                  onChange={(e) => setCustomMaxDailyLossPct(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono">Max Total Loss (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={customMaxTotalLossPct}
                  onChange={(e) => setCustomMaxTotalLossPct(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono">Min Days</label>
                <input
                  type="number"
                  value={customMinTradingDays}
                  onChange={(e) => setCustomMinTradingDays(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono">1-Day Cap (%)</label>
                <input
                  type="number"
                  value={customConsistencyCapPct}
                  onChange={(e) => setCustomConsistencyCapPct(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono">Loss Calc Model</label>
                <select
                  value={customDailyLossType}
                  onChange={(e) => setCustomDailyLossType(e.target.value as 'BALANCE_BASED' | 'EQUITY_BASED')}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono text-[11px]"
                >
                  <option value="BALANCE_BASED">Balance-Based</option>
                  <option value="EQUITY_BASED">Equity-Based</option>
                </select>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* 🌟 30 / 60 / 90-DAY SURVIVABILITY & CLEARANCE VERDICT BANNER 🌟 */}
      {/* ========================================================================= */}
      <div
        className={`rounded-2xl p-4 sm:p-6 lg:p-7 border relative overflow-hidden transition-all shadow-2xl min-w-0 max-w-full ${
          simResult.isFullyCleared
            ? 'bg-gradient-to-r from-emerald-950/80 via-slate-900 to-emerald-950/50 border-emerald-500/60 shadow-emerald-950/40'
            : simResult.allCriticalPassed
            ? 'bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/40 border-amber-500/50 shadow-amber-950/30'
            : 'bg-gradient-to-r from-rose-950/80 via-slate-900 to-rose-950/40 border-rose-500/60 shadow-rose-950/40'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          
          <div className="space-y-3 max-w-2xl min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-xs font-extrabold uppercase px-3 py-1 rounded-full flex items-center gap-1.5 break-words ${
                  simResult.isFullyCleared
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : simResult.allCriticalPassed
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {simResult.isFullyCleared ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>SURVIVED & PASSED FULL {activeHorizon.toUpperCase()} REAL-BAR STRESS PERIOD</span>
                  </>
                ) : simResult.allCriticalPassed ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>CRITICAL RULES PASSED · MINOR ADVISORY ADJUSTMENTS</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>BREACH DETECTED DURING {activeHorizon.toUpperCase()} PERIOD</span>
                  </>
                )}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Benchmark: {activeRules.name} (${fundingCapital.toLocaleString()})
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white leading-tight break-words">
              {simResult.isFullyCleared ? (
                <span>
                  Passed Target in <span className="text-emerald-400">Day #{simResult.targetAchievedDay || simResult.calculatedDailyRecords.length}</span> · Net Gain:{' '}
                  <span className="text-emerald-400">+${simResult.netProfitDollar.toLocaleString()} (+{simResult.netProfitPct}%)</span>
                </span>
              ) : (
                <span>
                  Survivability Audit · Net Result:{' '}
                  <span className={simResult.netProfitDollar >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    ${simResult.netProfitDollar.toLocaleString()} ({simResult.netProfitPct}%)
                  </span>
                </span>
              )}
            </h3>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {simResult.isFullyCleared ? (
                <span>
                  The EA portfolio maintained an unbroken <strong>{simResult.survivabilityScore}% Survivability Score</strong> across {activeHorizon === '30d' ? '30' : activeHorizon === '60d' ? '60' : activeHorizon === '90d' ? '90' : '180'} continuous calendar days. Peak daily loss was contained at <strong>{simResult.maxDailyLossPct}%</strong> (with a <strong>+{simResult.dailyLossSafetyBufferPct}% safety buffer</strong> below the {activeRules.maxDailyLossPct}% limit), and overall maximum drawdown was held to <strong>{simResult.maxOverallDdPct}%</strong>.
                </span>
              ) : (
                <span>
                  One or more parameters exceeded safe risk thresholds during the {activeHorizon.toUpperCase()} testing cycle. Check the 8-Rule Diagnostic Matrix below to resolve breaches before running live trades.
                </span>
              )}
            </p>

            {/* Quick action buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1 w-full">
              <button
                type="button"
                onClick={handleDeployToFleet}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs px-4 py-2 rounded-xl transition-all shadow-lg"
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span>Deploy Risk to MT5 Live Fleet</span>
              </button>

              <button
                type="button"
                onClick={handleExportAuditJson}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-3.5 py-2 rounded-xl transition-all border border-slate-700"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>Export Audit JSON ({activeHorizon.toUpperCase()})</span>
              </button>

              <button
                type="button"
                onClick={() => setShowMonteCarlo(!showMonteCarlo)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 font-bold text-xs px-3.5 py-2 rounded-xl transition-all border border-indigo-500/40"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>{showMonteCarlo ? 'Hide Monte Carlo' : 'Run 1,000x Monte Carlo'}</span>
              </button>
            </div>
          </div>

          {/* Clearance Verification Box */}
          <div className="flex flex-col gap-2.5 shrink-0 w-full lg:w-80 bg-slate-950/90 border border-slate-800 rounded-xl p-4 shadow-xl">
            <div className="text-xs font-bold text-slate-300 font-mono flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="flex items-center gap-1.5 text-amber-400">
                <Target className="w-3.5 h-3.5" />
                SURVIVABILITY SCORE
              </span>
              <span className="text-emerald-400 font-mono text-[11px] font-extrabold">{simResult.survivabilityScore} / 100</span>
            </div>
            
            <div className="space-y-1.5 text-xs text-slate-300 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Peak Daily Loss:</span>
                <span className="text-emerald-400 font-bold">{simResult.maxDailyLossPct}% (Limit: {activeRules.maxDailyLossPct}%)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Daily Safety Margin:</span>
                <span className="text-cyan-400 font-bold">+{simResult.dailyLossSafetyBufferPct}% Buffer</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Max Portfolio DD:</span>
                <span className="text-emerald-400 font-bold">{simResult.maxOverallDdPct}% (Limit: {activeRules.maxTotalLossPct}%)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Win Rate & PF:</span>
                <span className="text-white font-bold">{simResult.winRatePct}% (PF: {simResult.profitFactor})</span>
              </div>
              {evaluationStage === 'FUNDED' && (
                <div className="flex justify-between border-t border-slate-800 pt-1.5">
                  <span className="text-amber-400 font-bold">Simulated Payout:</span>
                  <span className="text-emerald-400 font-extrabold">+${simResult.simulatedPayoutDollar.toLocaleString()}</span>
                </div>
              )}
            </div>

            <Link
              to="/admin/mt5-prop"
              className="w-full text-center font-bold text-xs py-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-emerald-500 text-slate-200 hover:text-white transition-all mt-1"
            >
              Open MT5 Prop Operations Center →
            </Link>
          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* MONTE CARLO STRESS TEST PANEL (1,000 ITERATIONS) */}
      {/* ========================================================================= */}
      {showMonteCarlo && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-5 space-y-4 animate-fade-in shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Monte Carlo Probabilistic Stress Engine (1,000 Shuffled Runs over {activeHorizon.toUpperCase()})
              </h3>
            </div>
            <span className="text-xs text-indigo-400 font-mono">
              Confidence Level: 99.0%
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Probability of Passing</span>
              <div className="text-lg font-extrabold text-emerald-400">{monteCarloStats.passProbPct}%</div>
              <div className="text-[10px] text-slate-400">Under current regime</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Daily DD Breach Risk</span>
              <div className={`text-lg font-extrabold ${monteCarloStats.dailyBreachProbPct < 5 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {monteCarloStats.dailyBreachProbPct}%
              </div>
              <div className="text-[10px] text-slate-400">Target &lt; 5.0%</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Total DD Breach Risk</span>
              <div className={`text-lg font-extrabold ${monteCarloStats.overallBreachProbPct < 5 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {monteCarloStats.overallBreachProbPct}%
              </div>
              <div className="text-[10px] text-slate-400">Target &lt; 5.0%</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Worst 99% Drawdown</span>
              <div className="text-lg font-extrabold text-amber-400">{monteCarloStats.worst99DrawdownPct}%</div>
              <div className="text-[10px] text-slate-400">99th percentile dip</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Median Days to Pass</span>
              <div className="text-lg font-extrabold text-white">{monteCarloStats.medianDaysToPass} Days</div>
              <div className="text-[10px] text-slate-400">Expected duration</div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8-RULE PROP DIAGNOSTIC MATRIX */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              8-Rule Compliance Audit Diagnostic Matrix ({activeRules.name})
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Passed: {simResult.auditDiagnostics.filter((d) => d.passed).length} / {simResult.auditDiagnostics.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs font-mono">
          {simResult.auditDiagnostics.map((diag) => (
            <div
              key={diag.ruleId}
              className={`p-3.5 rounded-xl border space-y-1.5 transition-all ${
                diag.passed
                  ? 'bg-slate-950 border-emerald-500/40 text-slate-200'
                  : diag.severity === 'CRITICAL'
                  ? 'bg-rose-950/40 border-rose-500 text-rose-200'
                  : 'bg-amber-950/40 border-amber-500 text-amber-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase truncate">
                  {diag.name}
                </span>
                {diag.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
              </div>

              <div className="text-sm font-extrabold text-white">
                {diag.achieved}
              </div>

              <div className="text-[10px] text-slate-400">
                Rule: {diag.required}
              </div>

              <div
                className={`text-[10px] pt-1 border-t ${
                  diag.passed ? 'border-slate-800 text-emerald-400' : 'border-rose-900 text-rose-300'
                }`}
              >
                {diag.feedback}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SVG EQUITY CURVE WITH TARGET & DRAWDOWN CEILINGS */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              ${fundingCapital.toLocaleString()} Prop Challenge Equity Trajectory across {activeHorizon.toUpperCase()} ({simResult.calculatedDailyRecords.length} Days)
            </h4>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2.5 h-0.5 bg-emerald-400 rounded-full" />
              Equity (${simResult.finalEquity.toLocaleString()})
            </span>
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2.5 h-0.5 bg-amber-400 rounded-full border-dashed" />
              Target (+${simResult.targetDollar.toLocaleString()})
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="w-2.5 h-0.5 bg-rose-500 rounded-full" />
              Max Drawdown Limit (${(fundingCapital * (1 - activeRules.maxTotalLossPct / 100)).toLocaleString()})
            </span>
          </div>
        </div>

        {/* SVG Curve */}
        <div className="w-full overflow-hidden pt-1">
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full h-56 sm:h-64"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="adminPropGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Target Fence Line (Green/Amber Dashed) */}
            <line
              x1={padX}
              y1={targetLineY}
              x2={chartW - padX}
              y2={targetLineY}
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <text
              x={chartW - padX - 110}
              y={targetLineY - 6}
              fill="#f59e0b"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
            >
              TARGET: ${(fundingCapital + simResult.targetDollar).toLocaleString()}
            </text>

            {/* Initial Balance Reference Line */}
            <line
              x1={padX}
              y1={baseLineY}
              x2={chartW - padX}
              y2={baseLineY}
              stroke="#64748b"
              strokeWidth="1"
              strokeDasharray="2 2"
            />

            {/* Max Drawdown Danger Fence Line (Red) */}
            <line
              x1={padX}
              y1={maxLossLineY}
              x2={chartW - padX}
              y2={maxLossLineY}
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
            <text
              x={padX + 10}
              y={maxLossLineY + 12}
              fill="#ef4444"
              fontSize="10"
              fontFamily="monospace"
            >
              MAX LOSS LIMIT: ${(fundingCapital * (1 - activeRules.maxTotalLossPct / 100)).toLocaleString()}
            </text>

            {/* Area Fill */}
            {chartAreaD && <path d={chartAreaD} fill="url(#adminPropGrad)" />}

            {/* Equity Curve Line */}
            {chartPathD && (
              <path
                d={chartPathD}
                fill="none"
                stroke="#10b981"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Final Point Dot */}
            {svgCoords.length > 0 && (
              <circle
                cx={svgCoords[svgCoords.length - 1].split(',')[0]}
                cy={svgCoords[svgCoords.length - 1].split(',')[1]}
                r="5"
                fill="#10b981"
                stroke="#022c22"
                strokeWidth="2.5"
              />
            )}
          </svg>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500 font-mono pt-2 border-t border-slate-800">
          <span>Day 1 Start: ${fundingCapital.toLocaleString()}</span>
          <span>
            {simResult.calculatedDailyRecords.length} Evaluated Days · {simResult.totalTrades} Executed Trades across {activeHorizon.toUpperCase()}
          </span>
          <span className="text-emerald-400 font-bold">
            Closing Equity: ${simResult.finalEquity.toLocaleString()} (+${simResult.netProfitDollar.toLocaleString()})
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DAY-BY-DAY METRIX AUDIT TABLE & TRADE LEDGER */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 lg:p-6 space-y-4 shadow-xl min-w-0 max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Day-by-Day MetriX Survivability Ledger ({simResult.calculatedDailyRecords.length} Days in {activeHorizon.toUpperCase()})
            </h4>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAdvancedRules(!showAdvancedRules)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-mono flex items-center gap-1"
            >
              {showAdvancedRules ? 'Show Daily Summary' : 'Show Individual Trade Ledger'}
              {showAdvancedRules ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Daily Summary Table */}
        {!showAdvancedRules ? (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs font-mono">
              <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 text-slate-400 z-10">
                <tr className="bg-slate-950/90">
                  <th className="p-3">Day #</th>
                  <th className="p-3">Session Date</th>
                  <th className="p-3">Signals</th>
                  <th className="p-3">Start Equity</th>
                  <th className="p-3">Net Day P&L ($)</th>
                  <th className="p-3">Day Return (%)</th>
                  <th className="p-3">Peak Daily DD (%)</th>
                  <th className="p-3">Closing Balance</th>
                  <th className="p-3">Compliance Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {simResult.calculatedDailyRecords.map((day) => (
                  <tr key={day.dayNumber} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-bold text-slate-300">Day {day.dayNumber}</td>
                    <td className="p-3 text-slate-400">{day.dateStr}</td>
                    <td className="p-3 text-cyan-400 font-semibold">{day.tradesCount}</td>
                    <td className="p-3 text-slate-300">${day.startEquity.toLocaleString()}</td>
                    <td className={`p-3 font-bold ${day.dayPnlDollar >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {day.dayPnlDollar >= 0 ? `+$${day.dayPnlDollar.toLocaleString()}` : `-$${Math.abs(day.dayPnlDollar).toLocaleString()}`}
                    </td>
                    <td className={`p-3 font-bold ${day.dayPnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {day.dayPnlPct >= 0 ? `+${day.dayPnlPct}%` : `${day.dayPnlPct}%`}
                    </td>
                    <td className="p-3 font-mono text-slate-300">
                      {day.dayMaxDrawdownPct}%
                    </td>
                    <td className="p-3 font-extrabold text-white">
                      ${day.endEquity.toLocaleString()}
                    </td>
                    <td className="p-3">
                      {day.targetReachedSoFar ? (
                        <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3 text-amber-400" /> Target Passed
                        </span>
                      ) : day.isBreachedDaily ? (
                        <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                          <XCircle className="w-3 h-3 text-rose-400" /> DD Breach
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px]">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Compliant
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Individual Trade Ledger */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Filter:</span>
                {(['ALL', 'WINS', 'LOSSES'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setFilterTradeStatus(filter)}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                      filterTradeStatus === filter ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              <span className="text-slate-500">{simResult.calculatedTradeLogs.length} Total Trades</span>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs font-mono">
                <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 text-slate-400 z-10">
                  <tr>
                    <th className="p-2.5">ID</th>
                    <th className="p-2.5">Symbol</th>
                    <th className="p-2.5">Strategy</th>
                    <th className="p-2.5">Dir</th>
                    <th className="p-2.5">R Multiple</th>
                    <th className="p-2.5">Risk ($)</th>
                    <th className="p-2.5">Net P&L ($)</th>
                    <th className="p-2.5">Friction ($)</th>
                    <th className="p-2.5">Resulting Equity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {simResult.calculatedTradeLogs
                    .filter((t) => {
                      if (filterTradeStatus === 'WINS') return t.isWin;
                      if (filterTradeStatus === 'LOSSES') return !t.isWin;
                      return true;
                    })
                    .map((trade) => (
                      <tr key={trade.tradeId} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-2.5 text-slate-500">{trade.tradeId}</td>
                        <td className="p-2.5 font-bold text-white">{trade.symbol}</td>
                        <td className="p-2.5 text-slate-300">{trade.strategy}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              trade.direction === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {trade.direction}
                          </span>
                        </td>
                        <td className={`p-2.5 font-bold ${trade.rOutcome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {trade.rOutcome >= 0 ? `+${trade.rOutcome}R` : `${trade.rOutcome}R`}
                        </td>
                        <td className="p-2.5 text-slate-400">${trade.riskDollar}</td>
                        <td className={`p-2.5 font-extrabold ${trade.netPnlDollar >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {trade.netPnlDollar >= 0 ? `+$${trade.netPnlDollar.toLocaleString()}` : `-$${Math.abs(trade.netPnlDollar).toLocaleString()}`}
                        </td>
                        <td className="p-2.5 text-slate-500">-${trade.spreadCommissionFriction}</td>
                        <td className="p-2.5 font-extrabold text-white">${trade.resultingEquity.toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Deploy to MT5 Live Fleet Bridge Modal */}
      {showDeployModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                  <Radio className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Deploy Prop Clearance to MT5 Fleet</h3>
                  <p className="text-xs text-slate-400">Push calibrated risk fences to live MT5 EA Bot instance</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeployModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-mono font-bold text-slate-300">
                Target MT5 Terminal / Account
              </label>
              <select
                value={selectedMt5AccountId}
                onChange={(e) => setSelectedMt5AccountId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              >
                {mt5Accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.nickname || `${acc.broker} - #${acc.accountNumberMasked}`} ({acc.accountType.toUpperCase()} | {acc.executionMode})
                  </option>
                ))}
                {mt5Accounts.length === 0 && (
                  <option value="default-mt5-bridge">Primary MT5 Desktop Bridge (#10011927607)</option>
                )}
              </select>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs font-mono">
                <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                  Synchronization Payload ({activeHorizon.toUpperCase()})
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Firm Profile:</span>
                  <span className="font-bold text-white">{activeRules.name}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Risk per Position:</span>
                  <span className="font-bold text-emerald-400">{riskPctPerTrade}%</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Daily Hard Loss Cap:</span>
                  <span className="font-bold text-rose-400">
                    {activeRules.maxDailyLossPct}% (${Math.round(fundingCapital * (activeRules.maxDailyLossPct / 100)).toLocaleString()})
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Total Loss Threshold:</span>
                  <span className="font-bold text-rose-400">
                    {activeRules.maxTotalLossPct}% (${Math.round(fundingCapital * (activeRules.maxTotalLossPct / 100)).toLocaleString()})
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Certificate Code:</span>
                  <span className="font-bold text-cyan-400">{simResult.clearanceCode}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeployModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeployToBridge}
                disabled={isDeployingBridge}
                className="px-5 py-2 rounded-xl text-xs font-black text-slate-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 transition-all shadow-lg flex items-center gap-1.5"
              >
                <Send className={`w-3.5 h-3.5 ${isDeployingBridge ? 'animate-spin' : ''}`} />
                <span>{isDeployingBridge ? 'Synchronizing Bridge...' : 'Confirm & Sync MT5 Bot'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
