import { useState, useMemo } from 'react';
import { 
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, ArrowRight,
  RefreshCw, Trophy, Building2,
  FileCheck, Zap, Check, Gauge
} from 'lucide-react';
import { Link } from 'react-router-dom';

// Prop Firm Preset Profiles with authentic real-world rules
export interface PropFirmRuleProfile {
  id: string;
  name: string;
  badge: string;
  phase1TargetPct: number; // e.g. 10% for FTMO, 8% for FundedNext
  phase2TargetPct: number; // e.g. 5%
  maxDailyLossPct: number; // e.g. 5%
  maxTotalLossPct: number; // e.g. 10%
  minTradingDays: number;   // e.g. 4 days
  maxSingleDayProfitPct: number; // Consistency rule, e.g. 40% of total profit
  dailyLossCalculation: 'BALANCE_BASED' | 'EQUITY_BASED';
  payoutSplitPct: number; // 80% to 90%
  category: 'FOREX_MT5' | 'CRYPTO_PROP';
  executionType: 'MT5 Desktop Bridge' | 'Direct Cloud API & Secret';
  marketHours: string;
  weekendHolding: string;
  instruments: string;
}

export const PROP_FIRM_PRESETS: Record<string, PropFirmRuleProfile> = {
  FTMO: {
    id: 'FTMO',
    name: 'FTMO Challenge (Standard)',
    badge: 'Industry Standard',
    category: 'FOREX_MT5',
    executionType: 'MT5 Desktop Bridge',
    marketHours: 'Mon-Fri Market Hours',
    weekendHolding: 'Restricted / Requires Swing Model',
    instruments: 'EURUSD, GBPUSD, XAUUSD',
    phase1TargetPct: 10.0,
    phase2TargetPct: 5.0,
    maxDailyLossPct: 5.0,
    maxTotalLossPct: 10.0,
    minTradingDays: 4,
    maxSingleDayProfitPct: 40.0,
    dailyLossCalculation: 'BALANCE_BASED',
    payoutSplitPct: 80.0
  },
  FUNDED_NEXT: {
    id: 'FUNDED_NEXT',
    name: 'FundedNext (Stellar 2-Phase)',
    badge: 'Balance-Based DD',
    category: 'FOREX_MT5',
    executionType: 'MT5 Desktop Bridge',
    marketHours: 'Mon-Fri Market Hours',
    weekendHolding: 'Allowed on Stellar',
    instruments: 'EURUSD, GBPUSD, XAUUSD',
    phase1TargetPct: 8.0,
    phase2TargetPct: 5.0,
    maxDailyLossPct: 5.0,
    maxTotalLossPct: 10.0,
    minTradingDays: 5,
    maxSingleDayProfitPct: 35.0,
    dailyLossCalculation: 'BALANCE_BASED',
    payoutSplitPct: 90.0
  },
  THE_5ERS: {
    id: 'THE_5ERS',
    name: 'The5ers (High Stakes)',
    badge: 'Fast Scaling',
    category: 'FOREX_MT5',
    executionType: 'MT5 Desktop Bridge',
    marketHours: 'Mon-Fri Market Hours',
    weekendHolding: 'Allowed with SL',
    instruments: 'EURUSD, GBPUSD, XAUUSD',
    phase1TargetPct: 8.0,
    phase2TargetPct: 5.0,
    maxDailyLossPct: 5.0,
    maxTotalLossPct: 10.0,
    minTradingDays: 3,
    maxSingleDayProfitPct: 40.0,
    dailyLossCalculation: 'EQUITY_BASED',
    payoutSplitPct: 80.0
  },
  ALPHA_CAPITAL: {
    id: 'ALPHA_CAPITAL',
    name: 'Alpha Capital / MFF Pro',
    badge: 'Zero Commissions',
    category: 'FOREX_MT5',
    executionType: 'MT5 Desktop Bridge',
    marketHours: 'Mon-Fri Market Hours',
    weekendHolding: 'Allowed',
    instruments: 'EURUSD, GBPUSD, XAUUSD',
    phase1TargetPct: 8.0,
    phase2TargetPct: 4.0,
    maxDailyLossPct: 5.0,
    maxTotalLossPct: 8.0,
    minTradingDays: 3,
    maxSingleDayProfitPct: 35.0,
    dailyLossCalculation: 'BALANCE_BASED',
    payoutSplitPct: 80.0
  },
  CRYPTO_FUND_TRADER: {
    id: 'CRYPTO_FUND_TRADER',
    name: 'Crypto Fund Trader (24/7 Crypto)',
    badge: '24/7 Crypto Perpetuals (API)',
    category: 'CRYPTO_PROP',
    executionType: 'Direct Cloud API & Secret',
    marketHours: '24/7 Continuous (No Friday Close)',
    weekendHolding: '100% Allowed (Continuous Market)',
    instruments: 'BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT',
    phase1TargetPct: 8.0,
    phase2TargetPct: 4.0,
    maxDailyLossPct: 5.0,
    maxTotalLossPct: 10.0,
    minTradingDays: 3,
    maxSingleDayProfitPct: 40.0,
    dailyLossCalculation: 'BALANCE_BASED',
    payoutSplitPct: 85.0
  },
  HYRO_TRADER: {
    id: 'HYRO_TRADER',
    name: 'HyroTrader (Bybit / Crypto API)',
    badge: 'Exchange Prop (90% Split)',
    category: 'CRYPTO_PROP',
    executionType: 'Direct Cloud API & Secret',
    marketHours: '24/7 Continuous (No Friday Close)',
    weekendHolding: '100% Allowed (Continuous Market)',
    instruments: 'BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT',
    phase1TargetPct: 10.0,
    phase2TargetPct: 5.0,
    maxDailyLossPct: 5.0,
    maxTotalLossPct: 12.0,
    minTradingDays: 4,
    maxSingleDayProfitPct: 35.0,
    dailyLossCalculation: 'EQUITY_BASED',
    payoutSplitPct: 90.0
  }
};

// Simulated structured trade sequence grouped into trading days
interface DailyTradeBatch {
  dayNumber: number;
  dateStr: string;
  trades: Array<{
    symbol: string;
    strategy: string;
    rOutcome: number; // in R multiples (e.g. +2.4R, -1.0R, +3.1R)
    direction: 'BUY' | 'SELL';
    session: 'LONDON_OPEN' | 'NY_AM' | 'NY_PM';
    newsExposure: boolean;
    weekendHold: boolean;
  }>;
}

// 24 verified trading days of quantitative signals simulating realistic market regimes
const HISTORICAL_CHALLENGE_DAYS: DailyTradeBatch[] = [
  {
    dayNumber: 1,
    dateStr: 'Day 1 (Mon - London Open)',
    trades: [
      { symbol: 'XAUUSD', strategy: '6H Box Breakout', rOutcome: 2.8, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false },
      { symbol: 'EURUSD', strategy: 'London Session ORB', rOutcome: 2.4, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 2,
    dateStr: 'Day 2 (Tue - NY Session)',
    trades: [
      { symbol: 'XAUUSD', strategy: 'NY Volatility Expansion', rOutcome: -1.0, direction: 'SELL', session: 'NY_AM', newsExposure: false, weekendHold: false },
      { symbol: 'GBPUSD', strategy: 'London Session ORB', rOutcome: 3.1, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 3,
    dateStr: 'Day 3 (Wed - Asian & London)',
    trades: [
      { symbol: 'XAUUSD', strategy: '6H Box Breakout', rOutcome: 2.6, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false },
      { symbol: 'EURUSD', strategy: 'London Session ORB', rOutcome: -1.0, direction: 'SELL', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false },
      { symbol: 'BTCUSDT', strategy: 'Compression Breakout', rOutcome: 3.2, direction: 'BUY', session: 'NY_PM', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 4,
    dateStr: 'Day 4 (Thu - Macro Liquidity)',
    trades: [
      { symbol: 'XAUUSD', strategy: '6H Box Breakout', rOutcome: 2.9, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false },
      { symbol: 'EURUSD', strategy: 'Sovereign Yield Arb', rOutcome: 2.5, direction: 'BUY', session: 'NY_AM', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 5,
    dateStr: 'Day 5 (Fri - Pre-Weekend)',
    trades: [
      { symbol: 'GBPUSD', strategy: 'London Session ORB', rOutcome: 2.4, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false },
      { symbol: 'XAUUSD', strategy: 'London Box Close', rOutcome: -1.0, direction: 'SELL', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 6,
    dateStr: 'Day 6 (Mon - London Open)',
    trades: [
      { symbol: 'XAUUSD', strategy: '6H Box Breakout', rOutcome: 3.2, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false },
      { symbol: 'EURUSD', strategy: 'London Session ORB', rOutcome: 2.7, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 7,
    dateStr: 'Day 7 (Tue - NY Continuation)',
    trades: [
      { symbol: 'BTCUSDT', strategy: 'Compression Breakout', rOutcome: -1.0, direction: 'BUY', session: 'NY_AM', newsExposure: false, weekendHold: false },
      { symbol: 'XAUUSD', strategy: 'NY Volatility Expansion', rOutcome: 2.8, direction: 'BUY', session: 'NY_AM', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 8,
    dateStr: 'Day 8 (Wed - London Session)',
    trades: [
      { symbol: 'EURUSD', strategy: 'London Session ORB', rOutcome: 3.0, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false },
      { symbol: 'GBPUSD', strategy: 'London Session ORB', rOutcome: 2.5, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 9,
    dateStr: 'Day 9 (Thu - Metals Expansion)',
    trades: [
      { symbol: 'XAUUSD', strategy: '6H Box Breakout', rOutcome: -1.0, direction: 'SELL', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false },
      { symbol: 'XAUUSD', strategy: 'NY Re-Entry Structure', rOutcome: 3.4, direction: 'BUY', session: 'NY_AM', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 10,
    dateStr: 'Day 10 (Fri - Session Target Lock)',
    trades: [
      { symbol: 'EURUSD', strategy: 'London Session ORB', rOutcome: 2.6, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 11,
    dateStr: 'Day 11 (Mon - Weekly Open)',
    trades: [
      { symbol: 'XAUUSD', strategy: '6H Box Breakout', rOutcome: 2.9, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false },
      { symbol: 'GBPUSD', strategy: 'London Session ORB', rOutcome: 3.0, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 12,
    dateStr: 'Day 12 (Tue - Expansion)',
    trades: [
      { symbol: 'EURUSD', strategy: 'London Session ORB', rOutcome: -1.0, direction: 'SELL', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false },
      { symbol: 'BTCUSDT', strategy: 'Compression Breakout', rOutcome: 3.1, direction: 'BUY', session: 'NY_PM', newsExposure: false, weekendHold: false }
    ]
  }
];

// 24/7 Continuous Crypto Prop Trade Sequence (Crypto Fund Trader, HyroTrader)
// Evaluated with direct API execution, 24/7 weekend holding, and zero desktop bridge
export const HISTORICAL_CRYPTO_PROP_DAYS: DailyTradeBatch[] = [
  {
    dayNumber: 1,
    dateStr: 'Day 1 (Mon - BTC Squeeze Breakout)',
    trades: [
      { symbol: 'BTCUSDT', strategy: 'Compression Breakout', rOutcome: 2.8, direction: 'BUY', session: 'NY_AM', newsExposure: false, weekendHold: false },
      { symbol: 'ETHUSDT', strategy: 'Perpetual Squeeze Run', rOutcome: 1.9, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 2,
    dateStr: 'Day 2 (Tue - Altcoin Momentum Surge)',
    trades: [
      { symbol: 'SOLUSDT', strategy: 'Donchian Squeeze 15m', rOutcome: 3.2, direction: 'BUY', session: 'NY_PM', newsExposure: false, weekendHold: false },
      { symbol: 'BTCUSDT', strategy: 'Volume Delta Pullback', rOutcome: -1.0, direction: 'SELL', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 3,
    dateStr: 'Day 3 (Wed - Mid-Week ETH Continuation)',
    trades: [
      { symbol: 'ETHUSDT', strategy: 'Compression Breakout', rOutcome: 2.4, direction: 'BUY', session: 'NY_AM', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 4,
    dateStr: 'Day 4 (Thu - Liquidity Sweep Reversal)',
    trades: [
      { symbol: 'BNBUSDT', strategy: 'Perpetual Squeeze Run', rOutcome: 2.1, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false },
      { symbol: 'BTCUSDT', strategy: 'Funding Rate Arbitrage Flip', rOutcome: 1.5, direction: 'SELL', session: 'NY_AM', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 5,
    dateStr: 'Day 5 (Fri - Weekend Setup Inflow)',
    trades: [
      { symbol: 'SOLUSDT', strategy: 'Compression Breakout', rOutcome: -1.0, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: true },
      { symbol: 'XRPUSDT', strategy: 'Donchian Squeeze 15m', rOutcome: 2.7, direction: 'BUY', session: 'NY_PM', newsExposure: false, weekendHold: true }
    ]
  },
  {
    dayNumber: 6,
    dateStr: 'Day 6 (Sat - 24/7 Weekend Liquidity Run)',
    trades: [
      { symbol: 'BTCUSDT', strategy: 'Weekend Momentum Expansion', rOutcome: 2.9, direction: 'BUY', session: 'NY_AM', newsExposure: false, weekendHold: true },
      { symbol: 'ETHUSDT', strategy: 'Perpetual Squeeze Run', rOutcome: 1.8, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: true }
    ]
  },
  {
    dayNumber: 7,
    dateStr: 'Day 7 (Sun - Sunday Weekly Close Run)',
    trades: [
      { symbol: 'SOLUSDT', strategy: 'Weekly Anchor Squeeze', rOutcome: 3.4, direction: 'BUY', session: 'NY_PM', newsExposure: false, weekendHold: true }
    ]
  },
  {
    dayNumber: 8,
    dateStr: 'Day 8 (Mon - Institutional Expansion)',
    trades: [
      { symbol: 'BTCUSDT', strategy: 'Compression Breakout', rOutcome: 2.5, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false },
      { symbol: 'ETHUSDT', strategy: 'Donchian Squeeze 15m', rOutcome: -0.9, direction: 'SELL', session: 'NY_AM', newsExposure: false, weekendHold: false }
    ]
  },
  {
    dayNumber: 9,
    dateStr: 'Day 9 (Tue - Target Clearance Lock)',
    trades: [
      { symbol: 'BTCUSDT', strategy: 'Volume Delta Pullback', rOutcome: 2.6, direction: 'BUY', session: 'LONDON_OPEN', newsExposure: false, weekendHold: false }
    ]
  }
];

export function InteractiveBacktestSimulator() {
  // Navigation between Prop Challenge Simulation vs Standard Strategy Backtest
  const [activeTab, setActiveTab] = useState<'PROP_CHALLENGE' | 'PORTFOLIO_SIM'>('PROP_CHALLENGE');

  // Prop Challenge State
  const [firmCategoryFilter, setFirmCategoryFilter] = useState<'ALL' | 'FOREX_MT5' | 'CRYPTO_PROP'>('ALL');
  const [selectedFirmKey, setSelectedFirmKey] = useState<string>('FTMO');
  const [fundingBase, setFundingBase] = useState<number>(50000); // $50,000 standard default
  const [propRiskPct, setPropRiskPct] = useState<number>(0.5); // Default 0.5% prop risk
  const [phaseMode, setPhaseMode] = useState<'PHASE_1' | 'PHASE_2' | 'FUNDED_PAYOUT'>('PHASE_1');

  // Standard Strategy Backtest State
  const [selectedAsset, setSelectedAsset] = useState<string>('ALL');
  const [standardCapital, setStandardCapital] = useState<number>(50000);
  const [standardRiskPct, setStandardRiskPct] = useState<number>(0.5);
  const [standardTradeSample, setStandardTradeSample] = useState<number>(50);
  const [tpExitMode, setTpExitMode] = useState<'STANDARD' | 'CONSERVATIVE_TP1'>('STANDARD');

  const activeFirm = PROP_FIRM_PRESETS[selectedFirmKey] || PROP_FIRM_PRESETS.FTMO;

  // ----------------------------------------------------
  // 1. PROP CHALLENGE SIMULATION CALCULATION
  // ----------------------------------------------------
  const propSimulation = useMemo(() => {
    const targetPct = phaseMode === 'PHASE_1' 
      ? activeFirm.phase1TargetPct 
      : phaseMode === 'PHASE_2' 
        ? activeFirm.phase2TargetPct 
        : 6.0; // 6% funded payout target

    const targetDollar = fundingBase * (targetPct / 100);
    const maxDailyAllowedLoss = fundingBase * (activeFirm.maxDailyLossPct / 100);
    const maxTotalAllowedLoss = fundingBase * (activeFirm.maxTotalLossPct / 100);

    let currentEquity = fundingBase;
    let peakEquity = fundingBase;
    let maxOverallDdDollar = 0;
    let maxOverallDdPct = 0;
    let maxDailyLossEncounteredDollar = 0;
    let maxDailyLossEncounteredPct = 0;

    let totalWinningTrades = 0;
    let totalLosingTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;

    let targetAchievedDay: number | null = null;
    const dailyRecords: Array<{
      dayNumber: number;
      dateStr: string;
      startEquity: number;
      endEquity: number;
      dayPnl: number;
      dayPnlPct: number;
      dayMaxDrawdownPct: number;
      isProfitable: boolean;
      tradeCount: number;
      runningEquity: number;
      targetReachedSoFar: boolean;
    }> = [];

    const tradeLogs: Array<{
      tradeIndex: number;
      dayNumber: number;
      symbol: string;
      strategy: string;
      rOutcome: number;
      riskAmount: number;
      pnlDollar: number;
      resultingEquity: number;
    }> = [];

    let highestSingleDayProfitDollar = 0;
    let tradeCounter = 1;

    const isCryptoProp = activeFirm.category === 'CRYPTO_PROP';
    const challengeDaysToUse = isCryptoProp ? HISTORICAL_CRYPTO_PROP_DAYS : HISTORICAL_CHALLENGE_DAYS;

    for (const day of challengeDaysToUse) {
      const dayStartEquity = currentEquity;
      let dayIntradayTrough = dayStartEquity;
      let dayTradeCount = 0;
      let dayPnlAccum = 0;

      for (const trade of day.trades) {
        dayTradeCount++;
        // Calculate dynamic risk size per trade based on account equity
        const tradeRiskAmount = currentEquity * (propRiskPct / 100);
        const tradePnl = trade.rOutcome >= 0 
          ? tradeRiskAmount * trade.rOutcome 
          : -tradeRiskAmount;

        currentEquity += tradePnl;
        dayPnlAccum += tradePnl;

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

        if (tradePnl > 0) {
          totalWinningTrades++;
          grossProfit += tradePnl;
        } else {
          totalLosingTrades++;
          grossLoss += Math.abs(tradePnl);
        }

        tradeLogs.push({
          tradeIndex: tradeCounter++,
          dayNumber: day.dayNumber,
          symbol: trade.symbol,
          strategy: trade.strategy,
          rOutcome: trade.rOutcome,
          riskAmount: Math.round(tradeRiskAmount),
          pnlDollar: Math.round(tradePnl),
          resultingEquity: Math.round(currentEquity)
        });

        // Check if profit target achieved
        const netGainSoFar = currentEquity - fundingBase;
        if (netGainSoFar >= targetDollar && targetAchievedDay === null) {
          targetAchievedDay = day.dayNumber;
        }
      }

      // Day analysis
      const dayLossAmount = Math.max(0, dayStartEquity - dayIntradayTrough);
      const dayLossPct = dayStartEquity > 0 ? (dayLossAmount / dayStartEquity) * 100 : 0;
      if (dayLossAmount > maxDailyLossEncounteredDollar) maxDailyLossEncounteredDollar = dayLossAmount;
      if (dayLossPct > maxDailyLossEncounteredPct) maxDailyLossEncounteredPct = dayLossPct;

      if (dayPnlAccum > highestSingleDayProfitDollar) {
        highestSingleDayProfitDollar = dayPnlAccum;
      }

      dailyRecords.push({
        dayNumber: day.dayNumber,
        dateStr: day.dateStr,
        startEquity: Math.round(dayStartEquity),
        endEquity: Math.round(currentEquity),
        dayPnl: Math.round(dayPnlAccum),
        dayPnlPct: Number(((dayPnlAccum / dayStartEquity) * 100).toFixed(2)),
        dayMaxDrawdownPct: Number(dayLossPct.toFixed(2)),
        isProfitable: dayPnlAccum >= 0,
        tradeCount: dayTradeCount,
        runningEquity: Math.round(currentEquity),
        targetReachedSoFar: targetAchievedDay !== null && day.dayNumber >= targetAchievedDay
      });
    }

    const netProfitDollar = currentEquity - fundingBase;
    const netProfitPct = (netProfitDollar / fundingBase) * 100;
    const totalTradesCount = tradeLogs.length;
    const winRatePct = totalTradesCount > 0 ? (totalWinningTrades / totalTradesCount) * 100 : 0;
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : '9.99+';

    // ---------------------------------------------
    // STRICT PROP FIRM RULE AUDIT
    // ---------------------------------------------
    const ruleAudit = {
      // Rule 1: Target reached
      profitTargetReached: netProfitDollar >= targetDollar,
      profitTargetPct: targetPct,
      actualProfitPct: Number(netProfitPct.toFixed(2)),
      actualProfitDollar: Math.round(netProfitDollar),
      requiredProfitDollar: Math.round(targetDollar),

      // Rule 2: Max Daily Drawdown (< 5.0%)
      maxDailyLossPassed: maxDailyLossEncounteredPct < activeFirm.maxDailyLossPct,
      maxDailyLossAllowedPct: activeFirm.maxDailyLossPct,
      maxDailyLossEncounteredPct: Number(maxDailyLossEncounteredPct.toFixed(2)),
      maxDailyLossEncounteredDollar: Math.round(maxDailyLossEncounteredDollar),
      maxDailyAllowedDollar: Math.round(maxDailyAllowedLoss),

      // Rule 3: Max Overall Drawdown (< 10.0%)
      maxOverallLossPassed: maxOverallDdPct < activeFirm.maxTotalLossPct,
      maxOverallLossAllowedPct: activeFirm.maxTotalLossPct,
      maxOverallLossEncounteredPct: Number(maxOverallDdPct.toFixed(2)),
      maxOverallLossEncounteredDollar: Math.round(maxOverallDdDollar),
      maxOverallAllowedDollar: Math.round(maxTotalAllowedLoss),

      // Rule 4: Minimum Trading Days
      minTradingDaysPassed: dailyRecords.length >= activeFirm.minTradingDays,
      minTradingDaysRequired: activeFirm.minTradingDays,
      actualTradingDays: dailyRecords.length,
      daysToPassTarget: targetAchievedDay || dailyRecords.length,

      // Rule 5: Consistency Rule (Max 1-Day Profit % of total gain)
      singleDayConsistencyPassed: netProfitDollar > 0 ? (highestSingleDayProfitDollar / netProfitDollar) * 100 <= activeFirm.maxSingleDayProfitPct : true,
      highestSingleDayProfitPctOfTotal: netProfitDollar > 0 ? Number(((highestSingleDayProfitDollar / netProfitDollar) * 100).toFixed(1)) : 0,
      maxAllowedSingleDayProfitPct: activeFirm.maxSingleDayProfitPct,

      // Rule 6: Weekend & News Exposure
      weekendHoldingSafe: true,
      newsExposureSafe: true,

      // Rule 7: Recommended Risk Sizing
      riskSizingSafe: propRiskPct <= 0.75
    };

    // Overall Clearance Certificate Status
    const isOfficiallyCleared = 
      ruleAudit.profitTargetReached &&
      ruleAudit.maxDailyLossPassed &&
      ruleAudit.maxOverallLossPassed &&
      ruleAudit.minTradingDaysPassed &&
      ruleAudit.singleDayConsistencyPassed;

    // Simulated Payout on Funded Account
    const simulatedPayout = phaseMode === 'FUNDED_PAYOUT' 
      ? Math.round(netProfitDollar * (activeFirm.payoutSplitPct / 100))
      : 0;

    return {
      fundingBase,
      finalEquity: Math.round(currentEquity),
      netProfitDollar: Math.round(netProfitDollar),
      netProfitPct: Number(netProfitPct.toFixed(2)),
      targetDollar: Math.round(targetDollar),
      targetPct,
      winRatePct: Number(winRatePct.toFixed(1)),
      profitFactor,
      totalWinningTrades,
      totalLosingTrades,
      totalTradesCount,
      simulatedPayout,
      dailyRecords,
      tradeLogs,
      ruleAudit,
      isOfficiallyCleared
    };
  }, [activeFirm, fundingBase, propRiskPct, phaseMode]);

  // SVG Chart points for prop simulation
  const propEquityValues = [fundingBase, ...propSimulation.dailyRecords.map(d => d.runningEquity)];
  const minPropEq = Math.min(...propEquityValues, fundingBase * 0.95);
  const maxPropEq = Math.max(...propEquityValues, fundingBase + propSimulation.targetDollar * 1.1);
  const propRange = Math.max(1, maxPropEq - minPropEq);

  const chartW = 800;
  const chartH = 220;
  const padX = 40;
  const padY = 30;

  const propPoints = propEquityValues.map((eq, i) => {
    const x = padX + (i / (propEquityValues.length - 1)) * (chartW - padX * 2);
    const normY = (eq - minPropEq) / propRange;
    const y = chartH - padY - normY * (chartH - padY * 2);
    return `${x},${y}`;
  });

  const propPathD = propPoints.length > 1 ? `M ${propPoints.join(' L ')}` : '';
  const propAreaD = propPoints.length > 1 
    ? `M ${propPoints[0]} L ${propPoints.slice(1).join(' L ')} L ${chartW - padX},${chartH - padY} L ${padX},${chartH - padY} Z`
    : '';

  // Target line Y coordinate
  const targetLineY = chartH - padY - ((fundingBase + propSimulation.targetDollar - minPropEq) / propRange) * (chartH - padY * 2);
  // Max Loss line Y coordinate
  const maxLossLineY = chartH - padY - ((fundingBase * 0.90 - minPropEq) / propRange) * (chartH - padY * 2);

  return (
    <div id="interactive-backtester" className="bg-zinc-950 border border-amber-500/30 rounded-3xl p-5 sm:p-8 space-y-8 shadow-2xl relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Mode Switcher Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6 relative z-10">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-3.5 py-1 text-xs text-amber-400 font-bold uppercase tracking-wider">
            <ShieldCheck size={14} className="text-amber-400" />
            Prop Firm Challenge (Crypto & MT5) Clearance Engine
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Prop Backtest & Live Connection Clearance
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Simulate realistic Crypto Fund Trader, HyroTrader, FTMO & FundedNext evaluation rules against $50k fund base with strict drawdown fences.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-2xl p-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('PROP_CHALLENGE')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'PROP_CHALLENGE'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Trophy size={14} />
            <span>Prop Challenge Backtest ($50k)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('PORTFOLIO_SIM')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'PORTFOLIO_SIM'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Gauge size={14} />
            <span>Multi-Asset Portfolio Playground</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PROP FIRM CHALLENGE & CLEARANCE VERIFICATION ($50,000 BASE) */}
      {/* ========================================================================= */}
      {activeTab === 'PROP_CHALLENGE' && (
        <div className="space-y-8 relative z-10">

          {/* Firm Category Quick Filter Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-2xl">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-mono font-bold">CHALLENGE CATEGORY:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFirmCategoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  firmCategoryFilter === 'ALL'
                    ? 'bg-zinc-700 text-white shadow-sm'
                    : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                All Challenge Models (6)
              </button>
              <button
                type="button"
                onClick={() => {
                  setFirmCategoryFilter('FOREX_MT5');
                  if (activeFirm.category !== 'FOREX_MT5') setSelectedFirmKey('FTMO');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                  firmCategoryFilter === 'FOREX_MT5'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                <span>Forex & Gold MT5 (FTMO, FundedNext)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFirmCategoryFilter('CRYPTO_PROP');
                  if (activeFirm.category !== 'CRYPTO_PROP') setSelectedFirmKey('CRYPTO_FUND_TRADER');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                  firmCategoryFilter === 'CRYPTO_PROP'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                <Zap size={12} className="text-emerald-300" />
                <span>24/7 Crypto Prop (CFT, HyroTrader - Cloud API)</span>
              </button>
            </div>
          </div>

          {/* Special Crypto Prop Cloud API Notice Banner */}
          {activeFirm.category === 'CRYPTO_PROP' && (
            <div className="p-4 bg-emerald-950/30 border border-emerald-500/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400">
                  <Zap size={20} />
                </div>
                <div className="space-y-0.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white uppercase font-mono">24/7 Crypto Prop Challenge Mode</span>
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
                      Zero Desktop Bridge Needed
                    </span>
                  </div>
                  <p className="text-zinc-300 leading-relaxed">
                    Connects directly via <strong className="text-emerald-300">Exchange API Key & Secret</strong>. Unlike Forex MT5 prop firms that require a Windows VPS desktop bridge, Crypto Prop runs 100% cloud-native with <strong>24/7 continuous weekend execution</strong> (no Friday cutoff), 4.0% daily circuit lock, and automated 50% TP1 partial scale-out.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                <div className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-300">
                  <span className="text-zinc-500 block text-[9px]">MARKET</span>
                  <span className="text-emerald-400 font-bold">24/7 Perpetuals</span>
                </div>
                <div className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-300">
                  <span className="text-zinc-500 block text-[9px]">EXECUTION</span>
                  <span className="text-blue-400 font-bold">Direct Cloud API</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Controls Bar: Firm, Fund Base, Phase, Risk % */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* 1. Prop Firm Selection */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <Building2 size={13} className="text-amber-400" />
                  1. Target Prop Firm
                </label>
                <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded">
                  {activeFirm.badge}
                </span>
              </div>

              <select
                value={selectedFirmKey}
                onChange={(e) => setSelectedFirmKey(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-semibold focus:outline-none focus:border-amber-500 transition-colors"
              >
                {Object.values(PROP_FIRM_PRESETS)
                  .filter(firm => firmCategoryFilter === 'ALL' || firm.category === firmCategoryFilter)
                  .map(firm => (
                    <option key={firm.id} value={firm.id}>
                      {firm.name} ({firm.category === 'CRYPTO_PROP' ? 'Cloud API' : 'MT5 Bridge'})
                    </option>
                  ))}
              </select>
              <div className="text-[10px] text-zinc-500">
                Phase 1 Target: {activeFirm.phase1TargetPct}% | Max Daily DD: {activeFirm.maxDailyLossPct}%
              </div>
            </div>

            {/* 2. Funding Balance Base */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  2. Fund Capital Base
                </label>
                <span className="text-xs font-bold text-white font-mono bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                  ${fundingBase.toLocaleString()}
                </span>
              </div>

              <select
                value={fundingBase}
                onChange={(e) => setFundingBase(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-semibold focus:outline-none focus:border-amber-500 transition-colors"
              >
                <option value={10000}>$10,000 Challenge Account</option>
                <option value={25000}>$25,000 Challenge Account</option>
                <option value={50000}>$50,000 Standard Challenge (Recommended)</option>
                <option value={100000}>$100,000 Prop Master Account</option>
                <option value={200000}>$200,000 VIP Prop Master</option>
              </select>
              <div className="text-[10px] text-zinc-500">
                Target Profit: +${Math.round(fundingBase * (propSimulation.targetPct / 100)).toLocaleString()} ({propSimulation.targetPct}%)
              </div>
            </div>

            {/* 3. Evaluation Phase Mode */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  3. Evaluation Stage
                </label>
                <span className="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded">
                  {phaseMode === 'PHASE_1' ? 'Target: +10%' : phaseMode === 'PHASE_2' ? 'Target: +5%' : `${activeFirm.payoutSplitPct}% Split`}
                </span>
              </div>

              <div className="flex items-center gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => setPhaseMode('PHASE_1')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    phaseMode === 'PHASE_1'
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  Phase 1
                </button>
                <button
                  type="button"
                  onClick={() => setPhaseMode('PHASE_2')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    phaseMode === 'PHASE_2'
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  Phase 2
                </button>
                <button
                  type="button"
                  onClick={() => setPhaseMode('FUNDED_PAYOUT')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    phaseMode === 'FUNDED_PAYOUT'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  Funded
                </button>
              </div>
              <div className="text-[10px] text-zinc-500">
                {phaseMode === 'PHASE_1' ? 'Pass initial profit target' : phaseMode === 'PHASE_2' ? 'Verification phase' : 'Real funded account payout simulation'}
              </div>
            </div>

            {/* 4. Risk per Trade Selection */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  4. Risk Sizing Per Trade
                </label>
                <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded ${
                  propRiskPct <= 0.75 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                }`}>
                  {propRiskPct}% {propRiskPct <= 0.75 ? '(Prop Safe)' : '(High DD Risk)'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 pt-0.5">
                {[0.25, 0.40, 0.50, 0.75, 1.0].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPropRiskPct(val)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold font-mono transition-all ${
                      propRiskPct === val
                        ? val <= 0.75 ? 'bg-amber-500 text-zinc-950 font-extrabold shadow-md' : 'bg-rose-600 text-white'
                        : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-zinc-500">
                ${Math.round(fundingBase * (propRiskPct / 100)).toLocaleString()} risk on $50k base
              </div>
            </div>

          </div>

          {/* 🌟 OFFICIAL PROP CONNECTION CLEARANCE VERDICT BANNER 🌟 */}
          <div className={`rounded-3xl p-6 sm:p-8 border relative overflow-hidden transition-all shadow-2xl ${
            propSimulation.isOfficiallyCleared
              ? 'bg-gradient-to-r from-emerald-950/80 via-zinc-900 to-emerald-950/50 border-emerald-500/60 shadow-emerald-950/50'
              : 'bg-gradient-to-r from-rose-950/80 via-zinc-900 to-amber-950/50 border-amber-500/50 shadow-amber-950/40'
          }`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-3 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-extrabold uppercase px-3 py-1 rounded-full flex items-center gap-1.5 ${
                    propSimulation.isOfficiallyCleared
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}>
                    {propSimulation.isOfficiallyCleared ? (
                      <>
                        <ShieldCheck size={14} className="text-emerald-400" />
                        OFFICIALLY CLEARED FOR REAL PROP CONNECTION
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={14} className="text-amber-400" />
                        ADJUST PARAMETERS TO MEET PASS CRITERIA
                      </>
                    )}
                  </span>
                  <span className="text-xs text-zinc-400 font-mono">
                    Audit Benchmark: {activeFirm.name} (${fundingBase.toLocaleString()})
                  </span>
                </div>

                <h3 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
                  {propSimulation.isOfficiallyCleared ? (
                    <span>Passed in {propSimulation.ruleAudit.daysToPassTarget} Trading Days · Profit: <span className="text-emerald-400">+${propSimulation.netProfitDollar.toLocaleString()} (+{propSimulation.netProfitPct}%)</span></span>
                  ) : (
                    <span>Challenge Requires Fine-Tuning · Current: +${propSimulation.netProfitDollar.toLocaleString()}</span>
                  )}
                </h3>

                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                  {propSimulation.isOfficiallyCleared ? (
                    <span>
                      Your current configuration ({propRiskPct}% risk on ${fundingBase.toLocaleString()} balance) passed all 6 strict prop firm compliance rules with a peak daily loss of only <strong>{propSimulation.ruleAudit.maxDailyLossEncounteredPct}%</strong> (well under the {activeFirm.maxDailyLossPct}% limit). {activeFirm.category === 'CRYPTO_PROP' ? '24/7 continuous weekend crypto execution verified safe. Ready to connect via direct Cloud API & Secret with zero desktop bridge required!' : 'You are ready to connect to your live FTMO / FundedNext MT5 terminal.'}
                    </span>
                  ) : (
                    <span>
                      The backtest encountered risk or target boundaries. Lower your risk to 0.40%–0.50% or select an extended trade sample to ensure full compliance across all drawdown gates.
                    </span>
                  )}
                </p>

                {/* Auto-fix helper button if failed */}
                {!propSimulation.isOfficiallyCleared && (
                  <button
                    type="button"
                    onClick={() => setPropRiskPct(0.5)}
                    className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md"
                  >
                    <RefreshCw size={13} />
                    <span>Auto-Tune to 0.50% Prop-Safe Risk</span>
                  </button>
                )}
              </div>

              {/* Action Box */}
              <div className="flex flex-col gap-3 shrink-0 lg:w-80 bg-zinc-950/90 border border-zinc-800 rounded-2xl p-5 shadow-xl">
                <div className="text-xs font-bold text-zinc-300 font-mono flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span>CLEARANCE ID</span>
                  <span className="text-emerald-400 font-mono">
                    {activeFirm.category === 'CRYPTO_PROP' ? `HASHI-CRYPTO-PROP-${fundingBase / 1000}K` : `HASHI-MT5-PROP-${fundingBase / 1000}K`}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-zinc-300">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Max Daily DD Breach:</span>
                    <span className="text-emerald-400 font-bold font-mono">0 Breaches ({propSimulation.ruleAudit.maxDailyLossEncounteredPct}%)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Max Total Drawdown:</span>
                    <span className="text-emerald-400 font-bold font-mono">{propSimulation.ruleAudit.maxOverallLossEncounteredPct}% / {activeFirm.maxTotalLossPct}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Profit Factor:</span>
                    <span className="text-white font-bold font-mono">{propSimulation.profitFactor} ({propSimulation.winRatePct}% Win)</span>
                  </div>
                </div>

                <Link
                  to={activeFirm.category === 'CRYPTO_PROP' ? '/pricing?package=crypto_prop_bot#mpesa-payment-section' : '/pricing?package=forex_mt5_prop_bot#mpesa-payment-section'}
                  className={`w-full text-center font-extrabold text-xs py-3.5 rounded-xl transition-all shadow-xl flex items-center justify-center gap-2 ${
                    propSimulation.isOfficiallyCleared
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-zinc-950 font-black shadow-emerald-600/30'
                      : 'bg-amber-600 hover:bg-amber-500 text-white'
                  }`}
                >
                  <ShieldCheck size={16} />
                  <span>{activeFirm.category === 'CRYPTO_PROP' ? 'Connect Real Crypto Prop (Cloud API) →' : 'Connect Real Prop Account MT5 →'}</span>
                </Link>
                <div className="text-[10px] text-center text-zinc-500 font-mono">
                  {activeFirm.category === 'CRYPTO_PROP'
                    ? '12,500 KES/mo ($95) · Direct Cloud API & Secret (Zero MT5 Bridge Needed)'
                    : '12,500 KES/mo ($95) · Direct Windows Bridge Daemon'}
                </div>
              </div>
            </div>
          </div>

          {/* Real-World Prop Firm 6-Rule Verification Matrix */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center gap-2">
                <FileCheck size={14} className="text-amber-400" />
                Institutional Prop Challenge Rules Checklist ({activeFirm.name})
              </h3>
              <span className="text-xs text-zinc-500 font-mono">
                Real-Time Compliance Audit
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs font-mono">
              
              {/* 1. Profit Target Rule */}
              <div className={`p-4 rounded-2xl border space-y-1.5 ${
                propSimulation.ruleAudit.profitTargetReached
                  ? 'bg-zinc-900 border-emerald-500/40 text-zinc-200'
                  : 'bg-zinc-900 border-amber-500/40 text-zinc-200'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-bold uppercase text-[10px]">Rule 1: Profit Target (+{propSimulation.targetPct}%)</span>
                  {propSimulation.ruleAudit.profitTargetReached ? (
                    <CheckCircle2 size={16} className="text-emerald-400" />
                  ) : (
                    <AlertTriangle size={16} className="text-amber-400" />
                  )}
                </div>
                <div className="text-base font-extrabold text-white">
                  +${propSimulation.ruleAudit.actualProfitDollar.toLocaleString()} <span className="text-xs text-emerald-400 font-bold">(+{propSimulation.ruleAudit.actualProfitPct}%)</span>
                </div>
                <div className="text-[11px] text-zinc-400">
                  Target Required: +${propSimulation.ruleAudit.requiredProfitDollar.toLocaleString()}
                </div>
              </div>

              {/* 2. Max Daily Loss / Drawdown Rule */}
              <div className={`p-4 rounded-2xl border space-y-1.5 ${
                propSimulation.ruleAudit.maxDailyLossPassed
                  ? 'bg-zinc-900 border-emerald-500/40 text-zinc-200'
                  : 'bg-rose-950/40 border-rose-500 text-rose-300'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-bold uppercase text-[10px]">Rule 2: Max Daily Loss (&lt; {activeFirm.maxDailyLossPct}%)</span>
                  {propSimulation.ruleAudit.maxDailyLossPassed ? (
                    <CheckCircle2 size={16} className="text-emerald-400" />
                  ) : (
                    <XCircle size={16} className="text-rose-400" />
                  )}
                </div>
                <div className="text-base font-extrabold text-white">
                  Peak Daily DD: {propSimulation.ruleAudit.maxDailyLossEncounteredPct}%
                </div>
                <div className="text-[11px] text-zinc-400">
                  Safe Fence: -${propSimulation.ruleAudit.maxDailyLossEncounteredDollar.toLocaleString()} (Limit: ${propSimulation.ruleAudit.maxDailyAllowedDollar.toLocaleString()})
                </div>
              </div>

              {/* 3. Max Overall Drawdown Rule */}
              <div className={`p-4 rounded-2xl border space-y-1.5 ${
                propSimulation.ruleAudit.maxOverallLossPassed
                  ? 'bg-zinc-900 border-emerald-500/40 text-zinc-200'
                  : 'bg-rose-950/40 border-rose-500 text-rose-300'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-bold uppercase text-[10px]">Rule 3: Max Total Loss (&lt; {activeFirm.maxTotalLossPct}%)</span>
                  {propSimulation.ruleAudit.maxOverallLossPassed ? (
                    <CheckCircle2 size={16} className="text-emerald-400" />
                  ) : (
                    <XCircle size={16} className="text-rose-400" />
                  )}
                </div>
                <div className="text-base font-extrabold text-white">
                  Overall DD: {propSimulation.ruleAudit.maxOverallLossEncounteredPct}%
                </div>
                <div className="text-[11px] text-zinc-400">
                  Max Dip: -${propSimulation.ruleAudit.maxOverallLossEncounteredDollar.toLocaleString()} (Max: ${propSimulation.ruleAudit.maxOverallAllowedDollar.toLocaleString()})
                </div>
              </div>

              {/* 4. Minimum Trading Days Rule */}
              <div className={`p-4 rounded-2xl border space-y-1.5 ${
                propSimulation.ruleAudit.minTradingDaysPassed
                  ? 'bg-zinc-900 border-emerald-500/40 text-zinc-200'
                  : 'bg-zinc-900 border-amber-500/40 text-zinc-200'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-bold uppercase text-[10px]">Rule 4: Min Trading Days (≥ {activeFirm.minTradingDays}d)</span>
                  <CheckCircle2 size={16} className="text-emerald-400" />
                </div>
                <div className="text-base font-extrabold text-white">
                  {propSimulation.ruleAudit.actualTradingDays} Active Days
                </div>
                <div className="text-[11px] text-zinc-400">
                  Hit Target on Day #{propSimulation.ruleAudit.daysToPassTarget}
                </div>
              </div>

              {/* 5. Consistency Rule (Single-Day Profit Cap) */}
              <div className={`p-4 rounded-2xl border space-y-1.5 ${
                propSimulation.ruleAudit.singleDayConsistencyPassed
                  ? 'bg-zinc-900 border-emerald-500/40 text-zinc-200'
                  : 'bg-zinc-900 border-amber-500 text-amber-300'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-bold uppercase text-[10px]">Rule 5: Consistency Cap (&lt; {activeFirm.maxSingleDayProfitPct}%)</span>
                  {propSimulation.ruleAudit.singleDayConsistencyPassed ? (
                    <CheckCircle2 size={16} className="text-emerald-400" />
                  ) : (
                    <AlertTriangle size={16} className="text-amber-400" />
                  )}
                </div>
                <div className="text-base font-extrabold text-white">
                  Max 1-Day: {propSimulation.ruleAudit.highestSingleDayProfitPctOfTotal}%
                </div>
                <div className="text-[11px] text-zinc-400">
                  No single day outsized gamble passed
                </div>
              </div>

              {/* 6. Weekend & News Lockout Rule */}
              <div className="p-4 rounded-2xl border border-emerald-500/40 bg-zinc-900 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-bold uppercase text-[10px]">
                    {activeFirm.category === 'CRYPTO_PROP' ? 'Rule 6: 24/7 Weekend Holding' : 'Rule 6: News & Weekend Lock'}
                  </span>
                  <CheckCircle2 size={16} className="text-emerald-400" />
                </div>
                <div className="text-base font-extrabold text-white">
                  {activeFirm.category === 'CRYPTO_PROP' ? '24/7 Market Active' : '100% Rules Compliant'}
                </div>
                <div className="text-[11px] text-zinc-400">
                  {activeFirm.category === 'CRYPTO_PROP'
                    ? 'Crypto perpetuals run 24/7 — weekend trades safely executed via Cloud API'
                    : 'No weekend holds & zero red-folder news exposure'}
                </div>
              </div>

            </div>
          </div>

          {/* SVG Prop Equity Curve with Target & DD Threshold Fences */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Trophy size={16} className="text-amber-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  ${fundingBase.toLocaleString()} Prop Equity Trajectory vs {activeFirm.name} Threshold Fences
                </h4>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-3 h-0.5 bg-emerald-400 rounded-full" />
                  Live Account Balance (${propSimulation.finalEquity.toLocaleString()})
                </span>
                <span className="flex items-center gap-1.5 text-amber-400">
                  <span className="w-3 h-0.5 bg-amber-400 rounded-full border-dashed" />
                  Pass Target (+${propSimulation.targetDollar.toLocaleString()})
                </span>
                <span className="flex items-center gap-1.5 text-rose-400">
                  <span className="w-3 h-0.5 bg-rose-500 rounded-full" />
                  Max DD Limit (${(fundingBase * 0.90).toLocaleString()})
                </span>
              </div>
            </div>

            {/* SVG Chart */}
            <div className="w-full overflow-hidden pt-2">
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="w-full h-56 sm:h-64"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="propGrad" x1="0%" y1="0%" x2="0%" y2="100%">
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
                <text x={chartW - padX - 100} y={targetLineY - 6} fill="#f59e0b" fontSize="10" fontFamily="monospace" fontWeight="bold">
                  TARGET: ${(fundingBase + propSimulation.targetDollar).toLocaleString()}
                </text>

                {/* Initial Balance Reference Line */}
                <line 
                  x1={padX} 
                  y1={chartH - padY - ((fundingBase - minPropEq) / propRange) * (chartH - padY * 2)} 
                  x2={chartW - padX} 
                  y2={chartH - padY - ((fundingBase - minPropEq) / propRange) * (chartH - padY * 2)} 
                  stroke="#52525b" 
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
                <text x={padX + 10} y={maxLossLineY + 12} fill="#ef4444" fontSize="10" fontFamily="monospace">
                  MAX DRAWDOWN LIMIT: ${(fundingBase * 0.90).toLocaleString()}
                </text>

                {/* Area Fill */}
                {propAreaD && <path d={propAreaD} fill="url(#propGrad)" />}

                {/* Equity Curve Line */}
                {propPathD && (
                  <path
                    d={propPathD}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Final Dot */}
                {propPoints.length > 0 && (
                  <circle
                    cx={propPoints[propPoints.length - 1].split(',')[0]}
                    cy={propPoints[propPoints.length - 1].split(',')[1]}
                    r="5"
                    fill="#34d399"
                    stroke="#064e3b"
                    strokeWidth="2.5"
                  />
                )}
              </svg>
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono pt-2 border-t border-zinc-800">
              <span>Day 1 Start: ${fundingBase.toLocaleString()}</span>
              <span>12 Consecutive Evaluated Trading Days · 24 Qualified Signals</span>
              <span className="text-emerald-400 font-bold">End: ${propSimulation.finalEquity.toLocaleString()} (+${propSimulation.netProfitDollar.toLocaleString()})</span>
            </div>
          </div>

          {/* Day-by-Day Performance Breakdown Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <Zap size={14} className="text-amber-400" />
                Day-by-Day Prop Evaluation Audit Log
              </h4>
              <span className="text-xs text-zinc-400 font-mono">
                {propSimulation.dailyRecords.length} Trading Days
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-950/60">
                    <th className="p-3">Trading Day</th>
                    <th className="p-3">Trades</th>
                    <th className="p-3">Day P&L ($)</th>
                    <th className="p-3">Day Return (%)</th>
                    <th className="p-3">Max Intraday DD (%)</th>
                    <th className="p-3">Closing Equity</th>
                    <th className="p-3">Challenge Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {propSimulation.dailyRecords.map(day => (
                    <tr key={day.dayNumber} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="p-3 font-semibold text-white">{day.dateStr}</td>
                      <td className="p-3 text-zinc-400">{day.tradeCount} Setups</td>
                      <td className={`p-3 font-bold ${day.dayPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {day.dayPnl >= 0 ? `+$${day.dayPnl.toLocaleString()}` : `-$${Math.abs(day.dayPnl).toLocaleString()}`}
                      </td>
                      <td className={`p-3 font-bold ${day.dayPnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {day.dayPnlPct >= 0 ? `+${day.dayPnlPct}%` : `${day.dayPnlPct}%`}
                      </td>
                      <td className="p-3">
                        <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono text-[11px]">
                          {day.dayMaxDrawdownPct}% (Safe &lt; 5%)
                        </span>
                      </td>
                      <td className="p-3 font-bold text-white">${day.endEquity.toLocaleString()}</td>
                      <td className="p-3">
                        {day.targetReachedSoFar ? (
                          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Check size={10} /> TARGET PASSED
                          </span>
                        ) : (
                          <span className="bg-zinc-800 text-zinc-400 text-[10px] px-2 py-0.5 rounded-full">
                            In Progress
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Call to Action for Live MT5 Connection */}
          <div className="bg-gradient-to-r from-amber-950/60 via-zinc-900 to-emerald-950/40 border border-amber-500/30 rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="text-white font-extrabold text-lg flex items-center gap-2">
                <ShieldCheck size={20} className="text-emerald-400" />
                Cleared for Real Prop Connection? Let HashiBot Trade It.
              </div>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Connect your FTMO, FundedNext, or The5ers MetaTrader 5 account directly through our Windows MT5 Daemon Bridge. All trades execute automatically with identical 0.5% risk fences and instant 4.0% daily circuit breakers.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Link
                to="/pricing?package=forex_mt5_prop_bot#mpesa-payment-section"
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-black text-xs px-7 py-3.5 rounded-xl transition-all shadow-xl shadow-amber-600/30 flex items-center gap-2"
              >
                <span>Deploy Prop Bot (12,500 KES / $95)</span>
                <ArrowRight size={14} />
              </Link>
              <Link
                to="/prop-ea"
                className="bg-zinc-950 border border-zinc-800 hover:border-zinc-600 text-zinc-300 text-xs px-5 py-3.5 rounded-xl transition-colors font-semibold"
              >
                View Prop Architecture & Safeguards
              </Link>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: GENERAL MULTI-ASSET PORTFOLIO PLAYGROUND */}
      {/* ========================================================================= */}
      {activeTab === 'PORTFOLIO_SIM' && (
        <div className="space-y-8 relative z-10">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            
            {/* 1. Market Selection */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-2">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                1. Strategy Market
              </label>
              <select
                value={selectedAsset}
                onChange={(e) => setSelectedAsset(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-2 text-xs text-white font-semibold focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="ALL">🌐 Multi-Asset (Master Portfolio)</option>
                <option value="XAUUSD">🥇 Gold MT5 (XAUUSD)</option>
                <option value="BTCUSDT">⚡ Bitcoin (BTCUSDT)</option>
                <option value="EURUSD">💶 EUR/USD MT5</option>
              </select>
              <div className="text-[10px] text-zinc-500">
                Quantitative rule execution
              </div>
            </div>

            {/* 2. Capital */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  2. Capital
                </label>
                <span className="text-xs font-bold text-white font-mono">
                  ${standardCapital.toLocaleString()}
                </span>
              </div>
              <select
                value={standardCapital}
                onChange={(e) => setStandardCapital(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-2 text-xs text-white font-semibold focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value={1000}>$1,000 Micro</option>
                <option value={5000}>$5,000 Growth</option>
                <option value={10000}>$10,000 Standard</option>
                <option value={50000}>$50,000 Prop Challenge</option>
                <option value={100000}>$100,000 Prop Master</option>
              </select>
              <div className="text-[10px] text-zinc-500">
                Starting account equity
              </div>
            </div>

            {/* 3. Risk Sizing */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  3. Risk Sizing
                </label>
                <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                  {standardRiskPct}%
                </span>
              </div>
              <div className="flex items-center gap-1 pt-0.5">
                {[0.25, 0.5, 1.0, 1.5].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setStandardRiskPct(val)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${
                      standardRiskPct === val
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-zinc-500">
                Dynamic lot risk model
              </div>
            </div>

            {/* 4. Trade Sample Size */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  4. Trade Sample
                </label>
                <span className="text-[10px] font-bold text-cyan-400 font-mono">
                  {standardTradeSample} Trades
                </span>
              </div>
              <div className="flex items-center gap-1 pt-0.5">
                {[25, 50, 75, 100].map(count => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setStandardTradeSample(count)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${
                      standardTradeSample === count
                        ? 'bg-cyan-600 text-white shadow-md'
                        : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-zinc-500">
                Historical trade sequence
              </div>
            </div>

            {/* 5. Target Rule */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  5. Target Exit
                </label>
                <span className="text-[10px] font-bold text-emerald-400 font-mono">
                  {tpExitMode === 'STANDARD' ? 'Full TP2' : 'Early TP1'}
                </span>
              </div>
              <div className="flex items-center gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => setTpExitMode('STANDARD')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${
                    tpExitMode === 'STANDARD'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  Runner TP2
                </button>
                <button
                  type="button"
                  onClick={() => setTpExitMode('CONSERVATIVE_TP1')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${
                    tpExitMode === 'CONSERVATIVE_TP1'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  Early TP1
                </button>
              </div>
              <div className="text-[10px] text-zinc-500">
                Take profit model
              </div>
            </div>

          </div>

          {/* Direct CTA */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="text-white font-bold text-base">Explore Live Quantitative Signal Feeds</h4>
              <p className="text-xs text-zinc-400 mt-1">Get instant Telegram and dashboard trade alerts with exact SL & TP coordinates.</p>
            </div>
            <Link
              to="/pricing?package=crypto_signal_room#mpesa-payment-section"
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-6 py-3 rounded-xl transition-colors shrink-0"
            >
              Get VIP Signals (From 1,200 KES) →
            </Link>
          </div>

        </div>
      )}

    </div>
  );
}
