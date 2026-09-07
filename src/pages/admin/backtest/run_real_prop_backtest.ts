/**
 * End-to-End Institutional Prop Firm Backtest with Live Real Market Bars
 * Fetches real OHLCV data from Yahoo Finance (Forex, Metals) and Binance (Crypto),
 * executes the multi-asset pipeline arbitration engine, and evaluates prop firm
 * clearance rules (FTMO, FundedNext, The 5%ers) across 30, 60, 90, and 180-day horizons.
 */

import { BtCandle, MultiAssetFeedItem, AssetCategory, AssetCapitalPool } from './types';
import { PIPELINE_UNIVERSE } from './syntheticData';
import { runMultiAssetPipelineEngine } from './simulationEngine';
import { StrategyName } from '../StrategyConfig';

// ---------------------------------------------------------------------------
// 1. LIVE DATA INGESTION ENGINE (BINANCE & YAHOO FINANCE)
// ---------------------------------------------------------------------------

async function fetchBinanceRealBars(symbol: string, interval: string = '15m', totalLimit: number = 3000): Promise<BtCandle[]> {
  try {
    const candles: BtCandle[] = [];
    let endTime: number | undefined = undefined;

    while (candles.length < totalLimit) {
      const fetchCount = Math.min(1000, totalLimit - candles.length);
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${fetchCount}${endTime ? `&endTime=${endTime}` : ''}`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!resp.ok) break;
      const raw = (await resp.json()) as [number, string, string, string, string, string][];
      if (!raw || raw.length === 0) break;

      const batch: BtCandle[] = raw.map((k) => ({
        time: new Date(k[0]).toISOString().replace('T', ' ').slice(0, 19),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));

      candles.unshift(...batch);
      endTime = raw[0][0] - 1;
      if (raw.length < fetchCount) break;
    }

    return candles;
  } catch (err) {
    console.warn(`[Binance] Failed to fetch ${symbol}:`, err);
    return [];
  }
}

async function fetchYahooRealBars(symbol: string, yahooSymbol: string, range: string = '60d', interval: string = '15m'): Promise<BtCandle[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!resp.ok) throw new Error(`Yahoo HTTP ${resp.status}`);
    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result || !result.timestamp || result.timestamp.length === 0) {
      throw new Error('No timestamp data');
    }

    const timestamps = result.timestamp as number[];
    const quote = result.indicators?.quote?.[0] || {};
    const opens = quote.open || [];
    const highs = quote.high || [];
    const lows = quote.low || [];
    const closes = quote.close || [];
    const volumes = quote.volume || [];

    const candles: BtCandle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = opens[i];
      const high = highs[i];
      const low = lows[i];
      const close = closes[i];
      const vol = volumes[i] ?? 100;

      if (open != null && high != null && low != null && close != null && !isNaN(open) && !isNaN(close)) {
        candles.push({
          time: new Date(timestamps[i] * 1000).toISOString().replace('T', ' ').slice(0, 19),
          open: parseFloat(open.toFixed(5)),
          high: parseFloat(high.toFixed(5)),
          low: parseFloat(low.toFixed(5)),
          close: parseFloat(close.toFixed(5)),
          volume: isNaN(vol) ? 100 : vol,
        });
      }
    }
    return candles;
  } catch (err) {
    console.warn(`[Yahoo Finance] Failed to fetch ${symbol} (${yahooSymbol}):`, err);
    return [];
  }
}

async function loadUniverseWithRealBars(): Promise<Record<string, MultiAssetFeedItem>> {
  console.log('📡 Fetching Real Market Bars across Universe from Binance & Yahoo Finance...');
  const feeds: Record<string, MultiAssetFeedItem> = {};

  const yahooSymbolMap: Record<string, string> = {
    EURUSD: 'EURUSD=X',
    GBPUSD: 'GBPUSD=X',
    USDJPY: 'USDJPY=X',
    AUDUSD: 'AUDUSD=X',
    XAUUSD: 'GC=F',
    XAGUSD: 'SI=F',
  };

  for (const inst of PIPELINE_UNIVERSE) {
    let candles: BtCandle[] = [];
    let source = 'unknown';

    if (inst.category === 'crypto') {
      candles = await fetchBinanceRealBars(inst.symbol, '15m', 3000);
      source = 'binance';
    } else {
      const yfSym = yahooSymbolMap[inst.symbol] || `${inst.symbol}=X`;
      candles = await fetchYahooRealBars(inst.symbol, yfSym, '60d', '15m');
      source = 'yahoo_finance';
    }

    if (candles.length > 0) {
      feeds[inst.symbol] = {
        category: inst.category,
        symbol: inst.symbol,
        displayName: inst.displayName,
        assetClass: inst.assetClass,
        pipOrPointSize: inst.pipOrPointSize,
        spreadPipsOrPts: inst.spreadPipsOrPts,
        decimals: inst.decimals,
        fridayWeekendClose: inst.fridayWeekendClose,
        enforceSessionWindows: inst.enforceSessionWindows,
        candles,
        count: candles.length,
        status: 'ready',
        source,
        lastUpdated: new Date().toISOString(),
      };
      const firstBar = candles[0];
      const lastBar = candles[candles.length - 1];
      console.log(`   ✓ ${inst.symbol.padEnd(8)} | Source: ${source.padEnd(14)} | Bars: ${String(candles.length).padStart(5)} | Range: ${firstBar.time.slice(0, 10)} -> ${lastBar.time.slice(0, 10)} | Last: ${lastBar.close}`);
    }
  }

  if (feeds['EURUSD']) feeds['forex'] = feeds['EURUSD'];
  if (feeds['XAUUSD']) feeds['metals'] = feeds['XAUUSD'];
  if (feeds['BTCUSDT']) feeds['crypto'] = feeds['BTCUSDT'];

  return feeds;
}

// ---------------------------------------------------------------------------
// 2. PROP FIRM RULES & EVALUATION MODELS
// ---------------------------------------------------------------------------

interface PropRules {
  name: string;
  firm: string;
  accountCapital: number;
  riskPctPerTrade: number;
  phase1TargetPct: number;
  phase2TargetPct: number;
  maxDailyLossPct: number;
  maxTotalLossPct: number;
  minTradingDays: number;
  maxSingleDayProfitPct: number;
  weekendHoldingAllowed: boolean;
  spreadSlippageMult: number;
}

const PROP_PROFILES: Record<string, PropRules> = {
  FTMO_STANDARD: {
    name: 'FTMO Standard ($100k Challenge)',
    firm: 'FTMO',
    accountCapital: 100000,
    riskPctPerTrade: 0.75, // Scaled safe risk for 5% daily fence
    phase1TargetPct: 10.0,
    phase2TargetPct: 5.0,
    maxDailyLossPct: 5.0,
    maxTotalLossPct: 10.0,
    minTradingDays: 4,
    maxSingleDayProfitPct: 50.0,
    weekendHoldingAllowed: false,
    spreadSlippageMult: 1.0,
  },
  FUNDEDNEXT_STELLAR: {
    name: 'FundedNext Stellar 2-Step ($100k)',
    firm: 'FundedNext',
    accountCapital: 100000,
    riskPctPerTrade: 0.65,
    phase1TargetPct: 8.0,
    phase2TargetPct: 5.0,
    maxDailyLossPct: 5.0,
    maxTotalLossPct: 10.0,
    minTradingDays: 5,
    maxSingleDayProfitPct: 45.0,
    weekendHoldingAllowed: true,
    spreadSlippageMult: 1.0,
  },
  THE_5ERS_HIGH_STAKES: {
    name: 'The 5%ers High Stakes ($100k)',
    firm: 'The 5%ers',
    accountCapital: 100000,
    riskPctPerTrade: 0.60,
    phase1TargetPct: 8.0,
    phase2TargetPct: 5.0,
    maxDailyLossPct: 5.0,
    maxTotalLossPct: 10.0,
    minTradingDays: 3,
    maxSingleDayProfitPct: 40.0,
    weekendHoldingAllowed: true,
    spreadSlippageMult: 1.1,
  },
  FTMO_AGGRESSIVE: {
    name: 'FTMO Aggressive ($100k Challenge)',
    firm: 'FTMO',
    accountCapital: 100000,
    riskPctPerTrade: 1.25,
    phase1TargetPct: 20.0,
    phase2TargetPct: 10.0,
    maxDailyLossPct: 10.0,
    maxTotalLossPct: 20.0,
    minTradingDays: 4,
    maxSingleDayProfitPct: 50.0,
    weekendHoldingAllowed: false,
    spreadSlippageMult: 1.0,
  },
};

// ---------------------------------------------------------------------------
// 3. EXECUTE END-TO-END PROP CLEARANCE SIMULATION
// ---------------------------------------------------------------------------

function evaluatePropClearance(
  rules: PropRules,
  horizonDays: number,
  fetchedFeeds: Record<string, MultiAssetFeedItem>
) {
  const capital = rules.accountCapital;
  const targetDollar = capital * (rules.phase1TargetPct / 100);
  const maxDailyAllowedLossDollar = capital * (rules.maxDailyLossPct / 100);
  const maxTotalAllowedLossDollar = capital * (rules.maxTotalLossPct / 100);

  // Only evaluate bars fetched in this run. Never manufacture bars to make
  // an unavailable or short historical window appear to pass.
  // Forex/Metals trade ~68 15m bars/calendar day (weekends closed); Crypto trades 96 bars/day.
  const requiredBarsForex = Math.round(horizonDays * 65);
  const requiredBarsCrypto = Math.round(horizonDays * 96);
  
  const hasEnoughForex = (fetchedFeeds['EURUSD']?.candles.length ?? 0) >= requiredBarsForex;
  const hasEnoughCrypto = (fetchedFeeds['BTCUSDT']?.candles.length ?? 0) >= Math.min(requiredBarsCrypto, 2800);

  if (!hasEnoughForex || !hasEnoughCrypto) {
    throw new Error(`insufficient_real_history:${horizonDays}d (Available: Forex ${fetchedFeeds['EURUSD']?.candles.length ?? 0} bars, Crypto ${fetchedFeeds['BTCUSDT']?.candles.length ?? 0} bars)`);
  }

  const feeds: Record<string, MultiAssetFeedItem> = {};
  for (const [symbol, feed] of Object.entries(fetchedFeeds)) {
    const barsToTake = feed.category === 'crypto' 
      ? Math.min(feed.candles.length, requiredBarsCrypto)
      : Math.min(feed.candles.length, requiredBarsForex);
    feeds[symbol] = { ...feed, candles: feed.candles.slice(-barsToTake), count: barsToTake };
  }
  feeds.forex = feeds.EURUSD;
  feeds.metals = feeds.XAUUSD;
  feeds.crypto = feeds.BTCUSDT;
  const totalTimelineBars = Math.max(...Object.values(feeds).map((f) => f.candles.length));

  // Configure Capital Pools scaled to the Prop Account
  const pools: Record<AssetCategory, AssetCapitalPool> = {
    forex: {
      category: 'forex',
      name: 'Forex Majors',
      symbol: 'EURUSD',
      capitalUsd: capital,
      riskPct: rules.riskPctPerTrade,
      pipOrPointSize: 0.0001,
      spreadPipsOrPts: 1.2 * rules.spreadSlippageMult,
      decimals: 5,
      fridayClose: !rules.weekendHoldingAllowed,
      sessionFilter: true,
    },
    metals: {
      category: 'metals',
      name: 'Metals & Gold',
      symbol: 'XAUUSD',
      capitalUsd: capital,
      riskPct: rules.riskPctPerTrade,
      pipOrPointSize: 0.01,
      spreadPipsOrPts: 30.0 * rules.spreadSlippageMult,
      decimals: 2,
      fridayClose: !rules.weekendHoldingAllowed,
      sessionFilter: false,
    },
    crypto: {
      category: 'crypto',
      name: 'Crypto Pool',
      symbol: 'BTCUSDT',
      capitalUsd: capital,
      riskPct: rules.riskPctPerTrade,
      pipOrPointSize: 0.01,
      spreadPipsOrPts: 2.0 * rules.spreadSlippageMult,
      decimals: 2,
      fridayClose: false,
      sessionFilter: false,
    },
  };

  // Vetted Premier A+ Institutional Strategy Pipeline - 1 Best per Category
  const activeStrategies: StrategyName[] = [
    'FXTrendPullback',
    'GoldVolatilityBreakout',
    'CryptoMomentumBreakout',
  ];

  // Run Real Pipeline Arbitration Engine
  const pipelineResult = runMultiAssetPipelineEngine(feeds, pools, activeStrategies, {
    maxConcurrentPositions: 2,
    minScore: 80,
    conflictPolicy: 'strict_no_conflict',
    enableWeights: true,
  });

  const rawTrades = pipelineResult.trades;
  const baseRiskDollar = capital * (rules.riskPctPerTrade / 100);

  // Group trades by chronological trading day across the calendar
  const dayGroups: Record<number, typeof rawTrades> = {};
  for (let d = 1; d <= horizonDays; d++) dayGroups[d] = [];

  rawTrades.forEach((t) => {
    const entryBar = t.entryIndex ?? 0;
    const assignedDay = Math.min(horizonDays, Math.max(1, Math.floor((entryBar / totalTimelineBars) * horizonDays) + 1));
    dayGroups[assignedDay].push(t);
  });

  // Evaluate Daily PnL & Intraday Fences
  let currentEquity = capital;
  let peakEquity = capital;
  let maxOverallDdDollar = 0;
  let maxDailyLossDollar = 0;
  let targetAchievedDay: number | null = null;
  let dailyLossBreached = false;
  let totalLossBreached = false;
  let highestSingleDayProfit = 0;
  let tradingDaysCount = 0;

  interface DayLog {
    day: number;
    startEq: number;
    endEq: number;
    dayPnl: number;
    dayMaxDd: number;
    trades: number;
    isBreached: boolean;
  }
  const dayLogs: DayLog[] = [];

  for (let day = 1; day <= horizonDays; day++) {
    const dayTrades = dayGroups[day] || [];
    const dayStartEquity = currentEquity;
    let dayTrough = dayStartEquity;
    let dayPnl = 0;

    // Check if target was already secured and minimum trading days met, AND consistency rule satisfied
    const currentProfit = currentEquity - capital;
    const isConsistencyMet = highestSingleDayProfit <= 0 || (highestSingleDayProfit / Math.max(1, currentProfit)) * 100 <= rules.maxSingleDayProfitPct;
    const targetAlreadyLocked = targetAchievedDay !== null && day > targetAchievedDay && tradingDaysCount >= rules.minTradingDays && isConsistencyMet;

    if (dayTrades.length > 0 && !targetAlreadyLocked) {
      tradingDaysCount++;
      // Limit to institutional max 4 trades per day
      const cappedTrades = dayTrades.slice(0, 4);

      for (const t of cappedTrades) {
        // Intraday Risk Circuit Breaker: If day loss has exceeded 50% of the daily limit, halt trading for the day
        if (dayStartEquity - currentEquity >= maxDailyAllowedLossDollar * 0.5) {
          break;
        }

        // If target is already achieved but we need more trading days for consistency/min days, scale down risk to 0.1% to preserve capital
        const effectiveRiskDollar = (targetAchievedDay !== null && day > targetAchievedDay) ? baseRiskDollar * 0.2 : baseRiskDollar;

        const netPnl = t.pnl_r * effectiveRiskDollar;
        currentEquity += netPnl;
        dayPnl += netPnl;

        if (currentEquity < dayTrough) {
          dayTrough = currentEquity;
        }
        if (currentEquity > peakEquity) {
          peakEquity = currentEquity;
        }

        const overallDd = peakEquity - currentEquity;
        if (overallDd > maxOverallDdDollar) {
          maxOverallDdDollar = overallDd;
        }
      }
    }

    const dayMaxLoss = dayStartEquity - dayTrough;
    if (dayMaxLoss > maxDailyLossDollar) {
      maxDailyLossDollar = dayMaxLoss;
    }

    if (dayMaxLoss >= maxDailyAllowedLossDollar) {
      dailyLossBreached = true;
    }

    const totalDdFromCapital = capital - currentEquity;
    if (totalDdFromCapital >= maxTotalAllowedLossDollar) {
      totalLossBreached = true;
    }

    if (dayPnl > highestSingleDayProfit) {
      highestSingleDayProfit = dayPnl;
    }

    if (targetAchievedDay === null && currentEquity >= capital + targetDollar) {
      targetAchievedDay = day;
    }

    dayLogs.push({
      day,
      startEq: dayStartEquity,
      endEq: currentEquity,
      dayPnl,
      dayMaxDd: dayMaxLoss,
      trades: dayTrades.length,
      isBreached: dayMaxLoss >= maxDailyAllowedLossDollar,
    });
  }

  const netProfit = currentEquity - capital;
  const netProfitPct = (netProfit / capital) * 100;
  const maxOverallDdPct = (maxOverallDdDollar / capital) * 100;
  const maxDailyLossPct = (maxDailyLossDollar / capital) * 100;
  const highestDayProfitPct = netProfit > 0 ? (highestSingleDayProfit / netProfit) * 100 : 0;
  const consistencyPassed = highestDayProfitPct <= rules.maxSingleDayProfitPct;
  const targetReached = currentEquity >= capital + targetDollar;
  const minTradingDaysMet = tradingDaysCount >= rules.minTradingDays;

  const isCleared = targetReached && !dailyLossBreached && !totalLossBreached && consistencyPassed && minTradingDaysMet;

  return {
    rules,
    horizonDays,
    pipelineTradesCount: rawTrades.length,
    pipelineMetrics: pipelineResult.metrics,
    capital,
    currentEquity,
    netProfit,
    netProfitPct,
    maxDailyLossDollar,
    maxDailyLossPct,
    maxOverallDdDollar,
    maxOverallDdPct,
    targetAchievedDay,
    tradingDaysCount,
    highestDayProfitPct,
    dailyLossBreached,
    totalLossBreached,
    consistencyPassed,
    targetReached,
    minTradingDaysMet,
    isCleared,
    strategyStats: pipelineResult.strategyStats,
    dayLogs,
  };
}

// ---------------------------------------------------------------------------
// 4. MAIN BENCHMARK RUNNER
// ---------------------------------------------------------------------------

async function runRealBarPropBacktestSuite() {
  console.log('========================================================================================');
  console.log('🏛️ INSTITUTIONAL PROP FIRM END-TO-END BACKTEST (LIVE REAL MARKET BARS)');
  console.log('   Data Source: Real Yahoo Finance (Forex, Gold, Silver) + Binance (Crypto Perps)');
  console.log('========================================================================================\n');

  // 1. Fetch Real Bars
  const feeds = await loadUniverseWithRealBars();
  const loadedSymbols = Object.keys(feeds).filter((k) => k !== 'forex' && k !== 'metals' && k !== 'crypto');
  const totalBars = loadedSymbols.reduce((acc, s) => acc + (feeds[s]?.candles?.length || 0), 0);

  console.log(`\n📊 Data Ingestion Summary:`);
  console.log(`   Total Instruments: ${loadedSymbols.length}`);
  console.log(`   Total Real Bars:   ${totalBars.toLocaleString()}`);
  console.log(`   Coverage:          Forex Majors (EURUSD, GBPUSD, USDJPY, AUDUSD), Spot Metals (XAUUSD, XAGUSD), Crypto (BTC, ETH, SOL)`);

  if (!loadedSymbols.length || !totalBars) throw new Error('real_market_data_unavailable: no prop verdict was produced');

  // 2. Evaluate across Prop Profiles & Horizons (7 days, 14 days, 30 days)
  const horizons = [7, 14, 30];
  const profileKeys = Object.keys(PROP_PROFILES);

  for (const pKey of profileKeys) {
    const rules = PROP_PROFILES[pKey];
    console.log(`\n========================================================================================`);
    console.log(`🏢 PROP PROFILE: ${rules.name.toUpperCase()} (${rules.firm})`);
    console.log(`   Account: $${rules.accountCapital.toLocaleString()} | Risk/Trade: ${rules.riskPctPerTrade}% | Target Phase 1: ${rules.phase1TargetPct}% ($${(rules.accountCapital * rules.phase1TargetPct / 100).toLocaleString()})`);
    console.log(`   Fences: Max Daily Loss: ${rules.maxDailyLossPct}% ($${(rules.accountCapital * rules.maxDailyLossPct / 100).toLocaleString()}) | Max Total DD: ${rules.maxTotalLossPct}% ($${(rules.accountCapital * rules.maxTotalLossPct / 100).toLocaleString()})`);
    console.log(`   Consistency Cap: ${rules.maxSingleDayProfitPct}% | Min Days: ${rules.minTradingDays} | Weekend Holding: ${rules.weekendHoldingAllowed ? 'ALLOWED' : 'PROHIBITED'}`);
    console.log(`========================================================================================`);

    for (const hDays of horizons) {
      try {
        const audit = evaluatePropClearance(rules, hDays, feeds);

        const statusBadge = audit.isCleared
          ? '✅ PASSED & FULLY CLEARED'
          : audit.dailyLossBreached || audit.totalLossBreached
          ? '❌ BREACHED DRAWDOWN FENCE'
          : audit.targetReached
          ? '⚠️ TARGET MET (REVIEW CONSISTENCY/MIN DAYS)'
          : '⏳ SURVIVED (IN PROGRESS / TARGET PENDING)';

        console.log(`\n  ⏱️  [${hDays}-DAY HORIZON] Verdict: ${statusBadge}`);
        console.log(`      Final Equity: $${Math.round(audit.currentEquity).toLocaleString()} | Net Gain: ${audit.netProfit >= 0 ? '+' : ''}$${Math.round(audit.netProfit).toLocaleString()} (${audit.netProfitPct.toFixed(2)}%)`);
        console.log(`      Max Daily Loss: $${Math.round(audit.maxDailyLossDollar).toLocaleString()} (${audit.maxDailyLossPct.toFixed(2)}% of ${rules.maxDailyLossPct}% limit) -> ${audit.dailyLossBreached ? '🚨 BREACHED' : '🛡️ PASSED'}`);
        console.log(`      Max Total DD:   $${Math.round(audit.maxOverallDdDollar).toLocaleString()} (${audit.maxOverallDdPct.toFixed(2)}% of ${rules.maxTotalLossPct}% limit) -> ${audit.totalLossBreached ? '🚨 BREACHED' : '🛡️ PASSED'}`);
        console.log(`      Trades Executed: ${audit.pipelineTradesCount} | Win Rate: ${audit.pipelineMetrics.winRate}% | Profit Factor: ${audit.pipelineMetrics.profitFactor}`);
        console.log(`      Trading Days: ${audit.tradingDaysCount}/${hDays} | Target Passed Day: ${audit.targetAchievedDay ? `Day #${audit.targetAchievedDay}` : 'Not reached within horizon'}`);
        console.log(`      Consistency Rule: Top Day was ${audit.highestDayProfitPct.toFixed(1)}% of profit (Cap: ${rules.maxSingleDayProfitPct}%) -> ${audit.consistencyPassed ? 'PASSED' : 'FLAGGED'}`);
        
        const clearanceCode = `PROP-${rules.firm.slice(0, 4).toUpperCase()}-${hDays}D-${audit.isCleared ? 'PASS' : 'WARN'}-${Math.abs(Math.round(audit.netProfit))}`;
        console.log(`      Clearance Audit Hash: [${clearanceCode}]`);

        if (hDays === 30 && pKey === 'FTMO_STANDARD') {
          console.log(`      📈 Strategy Performance Breakdown (30-Day Real Bars):`);
          audit.strategyStats?.forEach((st) => {
            console.log(`         • ${st.strategy.padEnd(26)} | Trades: ${String(st.trades).padStart(2)} | WinRate: ${st.winRate.toFixed(1)}% | PF: ${String(st.profitFactor).padEnd(4)} | Total R: ${st.totalR >= 0 ? '+' : ''}${st.totalR.toFixed(2)}R`);
          });
        }
      } catch (hErr) {
        console.log(`\n  ⏱️  [${hDays}-DAY HORIZON] Notice: ${hErr instanceof Error ? hErr.message : String(hErr)}`);
      }
    }
  }

  console.log('\n========================================================================================');
  console.log('🎯 END-TO-END REAL-BAR PROP CLEARANCE SUITE COMPLETED SUCCESSFULLY');
  console.log('========================================================================================\n');
}

runRealBarPropBacktestSuite().catch((err) => {
  console.error('Fatal backtest error:', err);
});
