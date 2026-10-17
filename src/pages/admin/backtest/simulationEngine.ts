import {
  AICalibrationReport,
  StrategyTweakProposal,
  BtCandle,
  BtTrade,
  BtMetrics,
  AssetCategory,
  AssetCapitalPool,
  MultiAssetFeedItem,
  MarketEnvironment,
  ArbitrationCandidate,
  ArbitrationEvent,
  StrategyContributionStat,
  CategoryPerformanceSummary,
  SymbolPerformanceSummary,
  STRATEGY_ASSET_MAP,
} from './types';
import { STRATEGY_DEFINITIONS, StrategyName } from '../StrategyConfig';
import { evaluateStrategySetup } from './evaluators';
import { runCanonicalReplay, type CanonicalCompletedTradeResult, type TradePlan } from '../../../../supabase/functions/_shared/trading-domain/index.ts';
import { runCandidatePipelineReplay } from '../../../lib/research/canonicalPipelineReplay';

const CANONICAL_PRODUCTION_NAMES = new Set<StrategyName>(['LondonBreakout', 'NYContinuation', 'FXTrendPullback', 'GoldVolatilityBreakout']);
const CANONICAL_SINGLE_IDS: Partial<Record<StrategyName, string>> = {
  LondonBreakout: 'forex.london-breakout',
  NYContinuation: 'forex.new-york-continuation',
  FXTrendPullback: 'forex.trend-pullback',
  GoldVolatilityBreakout: 'gold.volatility-breakout',
  CryptoReversalExhaustion: 'crypto.reversal-exhaustion',
};

function canonicalSingleReplay(candles: BtCandle[], strategyName: StrategyName, env: MarketEnvironment, minScore: number) {
  const strategyId = CANONICAL_SINGLE_IDS[strategyName];
  if (!strategyId) return null;
  const datasetId = `backtest:${env.symbol}:15m`;
  return runCandidatePipelineReplay({
    datasets: [{ datasetId, symbol: env.symbol, timeframe: '15m', provider: env.assetClass === 'crypto' ? 'BINANCE' : 'CSV', bars: candles.map((bar) => ({ timestamp: Date.parse(bar.time), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume })) }],
    strategyIds: [strategyId], configurationVersion: 'backtest-config/current',
    initialAccount: { balance: env.accountSizeUsd, equity: env.accountSizeUsd, availableCapital: env.accountSizeUsd, currentOpenRisk: 0, dailyLoss: 0, drawdownPercent: 0, exposedSymbols: [] },
    riskPolicy: { version: 'backtest-risk/v1', riskPercent: env.riskPctPerTrade, maxOpenRisk: env.accountSizeUsd * 0.03, maxDailyLoss: env.accountSizeUsd * 0.05, maxDrawdownPercent: 10 },
    portfolioPolicy: { minimumScore: minScore, oneActivePerSymbol: true, maximumConcurrentPositions: 1, maximumTotalOpenRisk: env.accountSizeUsd * 0.03, maximumPortfolioExposure: env.accountSizeUsd, perSymbolExposure: {}, perStrategyExposure: {}, maxAllocationPerTrade: env.accountSizeUsd },
    executionModel: { version: 'backtest-cost/v2', currency: 'USD', provenance: 'HISTORICAL_ESTIMATE', forex: { spreadCost: env.spreadPipsOrPts * env.pipOrPointSize, slippageCost: 0, commissionPerTrade: 0 }, crypto: { liquidity: 'TAKER', makerFeeRate: 0.0002, takerFeeRate: (env.feePctPerSide ?? 0.05) / 100, slippageRate: 0.0001, quantityStep: 0.000001, minimumQuantity: 0.000001 } },
    runReference: `single:${strategyId}:${datasetId}`,
  });
}

export function runSingleStrategyEngine(
  candles: BtCandle[],
  strategyName: StrategyName,
  params: Record<string, number>,
  env: MarketEnvironment,
  maxBarsInTrade: number,
  minScore: number
): { trades: BtTrade[]; metrics: BtMetrics; canonicalCompletedTrades: CanonicalCompletedTradeResult[] } {
  const trades: BtTrade[] = [];
  const canonicalCompletedTrades: CanonicalCompletedTradeResult[] = [];
  let inTrade: BtTrade | null = null;
  let evaluations = 0;
  let candidates = 0;
  let rejected = 0;
  const rejectionReasons: Record<string, number> = {};

  const assetMeta = STRATEGY_ASSET_MAP[strategyName] || { category: 'forex' as AssetCategory, defaultSymbol: env.symbol, decimals: 5 };
  const equityCurve: { bar: number; time: string; equityR: number; equityUsd: number }[] = [];
  let cumulativeR = 0;
  let cumulativeUsd = env.accountSizeUsd;

  const canonicalPipeline = canonicalSingleReplay(candles, strategyName, env, minScore);
  if (canonicalPipeline) {
    const canonicalTrades: BtTrade[] = canonicalPipeline.trades.map((result, index) => ({ id: result.tradeId, entryIndex: Math.max(0, candles.findIndex((b) => b.time >= result.openedAt)), entryTime: result.openedAt, strategy: strategyName, category: assetMeta.category, symbol: result.symbol, direction: result.fill.price >= result.stop ? 'buy' : 'sell', entry: result.fill.price, stop_loss: result.stop, tp1: result.targets[0], tp2: result.targets[1] ?? result.targets[0], result: result.closeReason === 'STOP' ? 'sl_hit' : result.closeReason === 'BREAKEVEN' ? 'breakeven_exit' : result.closeReason === 'TARGET' ? (result.exits.length > 1 ? 'tp2_hit' : 'tp1_hit') : 'expired', exitIndex: Math.max(0, candles.findIndex((b) => b.time >= result.closedAt)), exitTime: result.closedAt, exitPrice: result.closePrice, pnl_r: result.netR, pnl_net_usd: result.netPnl ?? result.netR * env.accountSizeUsd * env.riskPctPerTrade / 100, categoryCapitalUsd: env.accountSizeUsd, capitalPoolReturnPct: ((result.netPnl ?? 0) / env.accountSizeUsd) * 100, durationBars: 0, spreadDeductionPipsOrPts: env.spreadPipsOrPts, grade: 'canonical', score: canonicalPipeline.accepted[index]?.candidate.score ?? 0, reason: canonicalPipeline.accepted[index]?.candidate.evidence.reasonCodes.join(',') ?? 'canonical', riskUsd: canonicalPipeline.accepted[index]?.plan.risk.riskAmount ?? 0, feeDeductedUsd: result.costs.commission, initialRiskDistance: Math.abs(result.fill.price - result.stop), tp1HitAndPartialBanked: result.exits.length > 1, partialBankedR: result.exits.length > 1 ? result.exits[0].fraction * Math.abs((result.exits[0].price - result.fill.price) / Math.abs(result.fill.price - result.stop)) : undefined, isBreakevenMoved: result.exits.some((exit) => exit.reason === 'BREAKEVEN') }));
    const wins = canonicalTrades.filter((t) => t.pnl_r > 0), losses = canonicalTrades.filter((t) => t.pnl_r < 0), grossProfit = wins.reduce((n, t) => n + t.pnl_r, 0), grossLoss = Math.abs(losses.reduce((n, t) => n + t.pnl_r, 0));
    return { trades: canonicalTrades, canonicalCompletedTrades: [...canonicalPipeline.trades], metrics: { totalTrades: canonicalTrades.length, wins: wins.length, tp1Hits: canonicalTrades.filter((t) => t.result === 'tp1_hit').length, tp2Hits: canonicalTrades.filter((t) => t.result === 'tp2_hit').length, losses: losses.length, expired: canonicalTrades.filter((t) => t.result === 'expired').length, winRate: canonicalTrades.length ? wins.length / canonicalTrades.length * 100 : 0, profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? 99.9 : 0, totalR: canonicalPipeline.metrics.netR, netUsd: canonicalPipeline.metrics.netPnl, avgR: canonicalPipeline.metrics.expectancyR, avgWin: wins.length ? grossProfit / wins.length : 0, avgLoss: losses.length ? grossLoss / losses.length : 0, bestTrade: canonicalTrades.length ? Math.max(...canonicalTrades.map((t) => t.pnl_r)) : 0, worstTrade: canonicalTrades.length ? Math.min(...canonicalTrades.map((t) => t.pnl_r)) : 0, maxConsecWins: 0, maxConsecLosses: 0, maxDrawdownPct: canonicalPipeline.metrics.maxDrawdown / Math.max(env.accountSizeUsd, 1) * 100, maxDrawdownR: canonicalPipeline.metrics.maxDrawdown, evaluations: candles.length, candidates: canonicalPipeline.accepted.length + canonicalPipeline.rejected.length, rejected: canonicalPipeline.rejected.length, rejectionReasons: canonicalPipeline.rejected.reduce<Record<string, number>>((out, item) => { for (const reason of item.reasonCodes) out[reason] = (out[reason] ?? 0) + 1; return out; }, {}), equityCurve: canonicalPipeline.trades.reduce<{ bar: number; time: string; equityR: number; equityUsd: number }[]>((out, result, i) => { const previous = out.at(-1) ?? { equityR: 0, equityUsd: env.accountSizeUsd }; out.push({ bar: i, time: result.closedAt, equityR: previous.equityR + result.netR, equityUsd: previous.equityUsd + (result.netPnl ?? 0) }); return out; }, []) } };
  }

  for (let i = 50; i < candles.length; i++) {
    const window = candles.slice(Math.max(0, i - 120), i + 1);
    const current = candles[i];
    evaluations++;

    const dateObj = new Date(current.time.includes('T') ? current.time : current.time.replace(' ', 'T') + 'Z');
    const dayOfWeek = dateObj.getUTCDay();
    const hour = dateObj.getUTCHours();

    if (inTrade) {
      inTrade.durationBars++;
      const isBuy = inTrade.direction === 'buy';
      const tradeRisk = inTrade.riskUsd || ((env.accountSizeUsd * env.riskPctPerTrade) / 100);
      const feeUsd = inTrade.feeDeductedUsd || 0;
      const initialRiskDistance = inTrade.initialRiskDistance || Math.max(Math.abs(inTrade.entry - inTrade.stop_loss), inTrade.entry * 0.0005);

      if (env.fridayWeekendClose && dayOfWeek === 5 && hour >= 20) {
        inTrade.exitIndex = i;
        inTrade.exitTime = current.time;
        inTrade.exitPrice = current.close;
        inTrade.result = 'weekend_cut';
        const rawR = isBuy
          ? (current.close - inTrade.entry) / initialRiskDistance
          : (inTrade.entry - current.close) / initialRiskDistance;
        const grossDollar = rawR * tradeRisk;
        const netDollar = grossDollar - feeUsd;
        inTrade.pnl_net_usd = parseFloat(netDollar.toFixed(2));
        inTrade.pnl_r = parseFloat((netDollar / tradeRisk).toFixed(2));
        inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / env.accountSizeUsd) * 100).toFixed(2));
        cumulativeR += inTrade.pnl_r;
        cumulativeUsd += inTrade.pnl_net_usd;
        equityCurve.push({ bar: i, time: current.time, equityR: parseFloat(cumulativeR.toFixed(2)), equityUsd: parseFloat(cumulativeUsd.toFixed(2)) });
        trades.push(inTrade);
        inTrade = null;
        continue;
      }

      // Trailing to Breakeven once excursion reaches +1.25R
      const excursionR = isBuy
        ? (current.high - inTrade.entry) / initialRiskDistance
        : (inTrade.entry - current.low) / initialRiskDistance;
      if (!inTrade.isBreakevenMoved && excursionR >= 1.25) {
        inTrade.isBreakevenMoved = true;
        inTrade.stop_loss = inTrade.entry;
      }

      // Check TP1 hit -> Bank 50% partial profit, lock Stop Loss firmly at Breakeven
      const tp1Hit = isBuy ? current.high >= inTrade.tp1 : current.low <= inTrade.tp1;
      if (tp1Hit && !inTrade.tp1HitAndPartialBanked) {
        inTrade.tp1HitAndPartialBanked = true;
        const rMult = params.tp1_r ?? 1.3;
        inTrade.partialBankedR = parseFloat((0.5 * rMult).toFixed(2));
        inTrade.partialBankedUsd = parseFloat(((0.5 * rMult * tradeRisk) - (feeUsd * 0.5)).toFixed(2));
        inTrade.isBreakevenMoved = true;
        inTrade.stop_loss = inTrade.entry;
      }

      // Check TP2 (Full Target on runner or remaining position)
      const tp2Hit = isBuy ? current.high >= inTrade.tp2 : current.low <= inTrade.tp2;
      if (tp2Hit) {
        inTrade.exitIndex = i;
        inTrade.exitTime = current.time;
        inTrade.exitPrice = inTrade.tp2;
        inTrade.result = 'tp2_hit';
        const rMult = params.tp2_r ?? 2.5;
        if (inTrade.tp1HitAndPartialBanked) {
          const runnerR = 0.5 * rMult;
          const runnerUsd = (0.5 * rMult * tradeRisk) - (feeUsd * 0.5);
          inTrade.pnl_r = parseFloat(((inTrade.partialBankedR || 0) + runnerR).toFixed(2));
          inTrade.pnl_net_usd = parseFloat(((inTrade.partialBankedUsd || 0) + runnerUsd).toFixed(2));
        } else {
          const grossDollar = rMult * tradeRisk;
          const netDollar = grossDollar - feeUsd;
          inTrade.pnl_net_usd = parseFloat(netDollar.toFixed(2));
          inTrade.pnl_r = parseFloat((netDollar / tradeRisk).toFixed(2));
        }
        inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / env.accountSizeUsd) * 100).toFixed(2));
        cumulativeR += inTrade.pnl_r;
        cumulativeUsd += inTrade.pnl_net_usd;
        equityCurve.push({ bar: i, time: current.time, equityR: parseFloat(cumulativeR.toFixed(2)), equityUsd: parseFloat(cumulativeUsd.toFixed(2)) });
        trades.push(inTrade);
        inTrade = null;
        continue;
      }

      // Check Stop Loss hit
      const slHit = isBuy ? current.low <= inTrade.stop_loss : current.high >= inTrade.stop_loss;
      if (slHit) {
        inTrade.exitIndex = i;
        inTrade.exitTime = current.time;
        inTrade.exitPrice = inTrade.stop_loss;
        if (inTrade.tp1HitAndPartialBanked) {
          inTrade.result = 'tp1_hit';
          inTrade.pnl_r = inTrade.partialBankedR || 0;
          inTrade.pnl_net_usd = inTrade.partialBankedUsd || 0;
        } else if (inTrade.isBreakevenMoved) {
          inTrade.result = 'breakeven_exit';
          inTrade.pnl_r = 0;
          inTrade.pnl_net_usd = parseFloat((-feeUsd * 0.5).toFixed(2));
        } else {
          inTrade.result = 'sl_hit';
          const grossDollar = -tradeRisk;
          const netDollar = grossDollar - feeUsd;
          inTrade.pnl_net_usd = parseFloat(netDollar.toFixed(2));
          inTrade.pnl_r = parseFloat((netDollar / tradeRisk).toFixed(2));
        }
        inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / env.accountSizeUsd) * 100).toFixed(2));
        cumulativeR += inTrade.pnl_r;
        cumulativeUsd += inTrade.pnl_net_usd;
        equityCurve.push({ bar: i, time: current.time, equityR: parseFloat(cumulativeR.toFixed(2)), equityUsd: parseFloat(cumulativeUsd.toFixed(2)) });
        trades.push(inTrade);
        inTrade = null;
        continue;
      }

      if (inTrade.durationBars >= maxBarsInTrade) {
        inTrade.exitIndex = i;
        inTrade.exitTime = current.time;
        inTrade.exitPrice = current.close;
        inTrade.result = inTrade.tp1HitAndPartialBanked ? 'tp1_hit' : 'expired';
        const rawR = isBuy
          ? (current.close - inTrade.entry) / initialRiskDistance
          : (inTrade.entry - current.close) / initialRiskDistance;
        if (inTrade.tp1HitAndPartialBanked) {
          const runnerR = Math.max(0, 0.5 * rawR);
          const runnerUsd = (runnerR * tradeRisk) - (feeUsd * 0.5);
          inTrade.pnl_r = parseFloat(((inTrade.partialBankedR || 0) + runnerR).toFixed(2));
          inTrade.pnl_net_usd = parseFloat(((inTrade.partialBankedUsd || 0) + runnerUsd).toFixed(2));
        } else {
          const grossDollar = rawR * tradeRisk;
          const netDollar = grossDollar - feeUsd;
          inTrade.pnl_net_usd = parseFloat(netDollar.toFixed(2));
          inTrade.pnl_r = parseFloat((netDollar / tradeRisk).toFixed(2));
        }
        inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / env.accountSizeUsd) * 100).toFixed(2));
        cumulativeR += inTrade.pnl_r;
        cumulativeUsd += inTrade.pnl_net_usd;
        equityCurve.push({ bar: i, time: current.time, equityR: parseFloat(cumulativeR.toFixed(2)), equityUsd: parseFloat(cumulativeUsd.toFixed(2)) });
        trades.push(inTrade);
        inTrade = null;
        continue;
      }
    }

    if (!inTrade) {
      const evalOut = evaluateStrategySetup(strategyName, window, '15m', params, env.enforceSessionWindows, env.symbol);
      if (evalOut.ok && evalOut.score >= minScore) {
        candidates++;
        const spreadAmount = env.spreadPipsOrPts * env.pipOrPointSize;
        const entryPrice =
          evalOut.direction === 'buy'
            ? evalOut.entry + spreadAmount / 2
            : evalOut.entry - spreadAmount / 2;

        const tradeRiskUsd = (env.accountSizeUsd * env.riskPctPerTrade) / 100;
        const stopDist = Math.max(Math.abs(entryPrice - evalOut.stop_loss), entryPrice * 0.0005);
        const units = tradeRiskUsd / stopDist;
        const notionalUsd = units * entryPrice;
        const feePct = env.feePctPerSide ?? 0;
        const roundTurnFeeUsd = feePct > 0 ? (notionalUsd * (feePct / 100) * 2) : 0;

        if (CANONICAL_PRODUCTION_NAMES.has(strategyName)) {
          const strategyId = strategyName === 'LondonBreakout' ? 'forex.london-breakout' : strategyName === 'NYContinuation' ? 'forex.new-york-continuation' : strategyName === 'FXTrendPullback' ? 'forex.trend-pullback' : 'gold.volatility-breakout';
          const plan: TradePlan = { version: 'trade-plan/v1', candidateId: `backtest:${strategyId}:${env.symbol}:${current.time}`, symbol: env.symbol, side: evalOut.direction === 'buy' ? 'BUY' : 'SELL', entryModel: 'CANDLE_CLOSE_INTENT', intendedEntry: evalOut.entry, stop: evalOut.stop_loss, targets: [evalOut.tp1, evalOut.tp2], initialRiskDistance: stopDist, partialExit: { targetIndex: 0, fraction: 0.5 }, breakevenAfterTarget: 0, trailing: 'AFTER_TP1', expiry: candles[Math.min(candles.length - 1, i + maxBarsInTrade)]?.time ?? current.time, strategyId, strategyVersion: '1.0.0', risk: { version: 'risk-intent/v1', allowed: true, riskPercent: env.riskPctPerTrade, riskAmount: tradeRiskUsd, desiredSize: units, reasonCodes: [], limits: { version: 'backtest-risk/v1', riskPercent: env.riskPctPerTrade, maxOpenRisk: env.riskPctPerTrade, maxDailyLoss: 100, maxDrawdownPercent: 100 } }, capital: { version: 'capital-intent/v1', allowed: true, allocatedAmount: tradeRiskUsd, reasonCodes: [] } };
          const future = candles.slice(i + 1, Math.min(candles.length, i + 1 + maxBarsInTrade));
          const replay = runCanonicalReplay({ plan, configurationVersion: 'backtest-config/current', market: assetMeta.category === 'metals' ? 'METALS' : assetMeta.category === 'crypto' ? 'CRYPTO' : 'FOREX', primaryTimeframe: '15m', datasetIds: [`backtest:${env.symbol}:15m`], observations: future.map((bar, offset) => ({ id: `${plan.candidateId}:bar:${i + 1 + offset}`, timestamp: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, provenance: 'HISTORICAL_SIMULATION' as const })), fillPrice: entryPrice, quantity: units, costs: { version: 'backtest-cost/v1', spread: 0, slippage: 0, commission: roundTurnFeeUsd, financing: 0, latencyMs: 0, currency: 'USD' }, riskAmount: tradeRiskUsd, runReference: plan.candidateId });
          if (replay.result) { const result = replay.result; canonicalCompletedTrades.push(result); const lastExit = result.exits[result.exits.length - 1]; const trade: BtTrade = { id: `trade-${strategyName}-${i}`, entryIndex: i, entryTime: result.openedAt, strategy: strategyName, category: assetMeta.category, symbol: env.symbol, direction: evalOut.direction, entry: result.fill.price, stop_loss: result.stop, tp1: result.targets[0], tp2: result.targets[1], result: result.closeReason === 'STOP' ? 'sl_hit' : result.closeReason === 'BREAKEVEN' ? 'breakeven_exit' : result.closeReason === 'TARGET' ? (result.exits.length > 1 ? 'tp2_hit' : 'tp1_hit') : 'expired', exitIndex: i + future.length, exitTime: result.closedAt, exitPrice: result.closePrice, pnl_r: result.netR, pnl_net_usd: result.netPnl ?? 0, categoryCapitalUsd: env.accountSizeUsd, capitalPoolReturnPct: parseFloat((((result.netPnl ?? 0) / env.accountSizeUsd) * 100).toFixed(2)), durationBars: future.length, spreadDeductionPipsOrPts: env.spreadPipsOrPts, grade: evalOut.grade, score: evalOut.score, reason: evalOut.reason, riskUsd: tradeRiskUsd, feeDeductedUsd: roundTurnFeeUsd, initialRiskDistance: Math.abs(result.fill.price - result.stop), tp1HitAndPartialBanked: result.exits.length > 1, partialBankedR: result.exits.length > 1 ? result.exits[0].fraction * Math.abs((result.exits[0].price - result.fill.price) / Math.abs(result.fill.price - result.stop)) : undefined, partialBankedUsd: undefined, isBreakevenMoved: result.exits.some(exit => exit.reason === 'BREAKEVEN') }; void lastExit; trades.push(trade); cumulativeR += result.netR; cumulativeUsd += result.netPnl ?? 0; equityCurve.push({ bar: i + future.length, time: result.closedAt, equityR: parseFloat(cumulativeR.toFixed(2)), equityUsd: parseFloat(cumulativeUsd.toFixed(2)) }); i += future.length; }
          continue;
        }

        inTrade = {
          id: `trade-${strategyName}-${i}`,
          entryIndex: i,
          entryTime: current.time,
          strategy: strategyName,
          category: assetMeta.category,
          symbol: env.symbol,
          direction: evalOut.direction,
          entry: entryPrice,
          stop_loss: evalOut.stop_loss,
          tp1: evalOut.tp1,
          tp2: evalOut.tp2,
          result: 'expired',
          exitIndex: null,
          exitTime: null,
          exitPrice: null,
          pnl_r: 0,
          pnl_net_usd: 0,
          categoryCapitalUsd: env.accountSizeUsd,
          capitalPoolReturnPct: 0,
          durationBars: 0,
          spreadDeductionPipsOrPts: env.spreadPipsOrPts,
          grade: evalOut.grade,
          score: evalOut.score,
          reason: evalOut.reason,
          riskUsd: tradeRiskUsd,
          feeDeductedUsd: roundTurnFeeUsd,
          initialRiskDistance: Math.max(Math.abs(entryPrice - evalOut.stop_loss), entryPrice * 0.0005),
        };
      } else if (!evalOut.ok && evalOut.rejectionCause) {
        rejected++;
        rejectionReasons[evalOut.rejectionCause] = (rejectionReasons[evalOut.rejectionCause] ?? 0) + 1;
      }
    }
  }

  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.pnl_r > 0).length;
  const tp1Hits = trades.filter((t) => t.result === 'tp1_hit').length;
  const tp2Hits = trades.filter((t) => t.result === 'tp2_hit').length;
  const losses = trades.filter((t) => t.pnl_r < 0).length;
  const expired = trades.filter((t) => t.result === 'expired' || t.result === 'weekend_cut').length;

  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const totalR = trades.reduce((acc, t) => acc + t.pnl_r, 0);
  const netUsd = trades.reduce((acc, t) => acc + t.pnl_net_usd, 0);
  const avgR = totalTrades > 0 ? totalR / totalTrades : 0;

  const winTrades = trades.filter((t) => t.pnl_r > 0);
  const lossTrades = trades.filter((t) => t.pnl_r < 0);
  const avgWin = winTrades.length > 0 ? winTrades.reduce((s, t) => s + t.pnl_r, 0) / winTrades.length : 0;
  const avgLoss = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, t) => s + t.pnl_r, 0) / lossTrades.length) : 0;
  const grossProfit = winTrades.reduce((s, t) => s + t.pnl_r, 0);
  const grossLoss = Math.abs(lossTrades.reduce((s, t) => s + t.pnl_r, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;

  let maxConsecWins = 0, curConsecWins = 0;
  let maxConsecLosses = 0, curConsecLosses = 0;
  let peakUsd = env.accountSizeUsd, runningUsd = env.accountSizeUsd, maxDrawdownUsd = 0;
  let peakR = 0, runningR = 0, maxDrawdownR = 0;

  trades.forEach((t) => {
    runningUsd += t.pnl_net_usd;
    if (runningUsd > peakUsd) peakUsd = runningUsd;
    const ddUsd = peakUsd - runningUsd;
    if (ddUsd > maxDrawdownUsd) maxDrawdownUsd = ddUsd;

    runningR += t.pnl_r;
    if (runningR > peakR) peakR = runningR;
    const dd = peakR - runningR;
    if (dd > maxDrawdownR) maxDrawdownR = dd;

    if (t.pnl_r > 0) {
      curConsecWins++;
      curConsecLosses = 0;
      if (curConsecWins > maxConsecWins) maxConsecWins = curConsecWins;
    } else if (t.pnl_r < 0) {
      curConsecLosses++;
      curConsecWins = 0;
      if (curConsecLosses > maxConsecLosses) maxConsecLosses = curConsecLosses;
    }
  });

  const maxDrawdownPct = peakUsd > 0 ? (maxDrawdownUsd / peakUsd) * 100 : 0;

  const metrics: BtMetrics = {
    totalTrades,
    wins,
    tp1Hits,
    tp2Hits,
    losses,
    expired,
    winRate: parseFloat(winRate.toFixed(1)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    totalR: parseFloat(totalR.toFixed(2)),
    netUsd: parseFloat(netUsd.toFixed(2)),
    avgR: parseFloat(avgR.toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    bestTrade: trades.length > 0 ? Math.max(...trades.map((t) => t.pnl_r)) : 0,
    worstTrade: trades.length > 0 ? Math.min(...trades.map((t) => t.pnl_r)) : 0,
    maxConsecWins,
    maxConsecLosses,
    maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(1)),
    maxDrawdownR: parseFloat(maxDrawdownR.toFixed(2)),
    evaluations,
    candidates,
    rejected,
    rejectionReasons,
    equityCurve,
  };

  return { trades, metrics, canonicalCompletedTrades };
}

// ─── Multi-Asset Synchronized Pipeline & Arbitration Engine ───────────────────

export interface ReplayProgressState {
  currentBar: number;
  totalBars: number;
  currentTime: string;
  openPositions: number;
  cumulativeUsd: number;
  cumulativeR: number;
  tradesCount: number;
  signalsCount: number;
  pct: number;
  recentEvent?: string;
  activeCandidate?: string;
}

export function runMultiAssetPipelineEngine(
  multiAssetFeeds: Record<string, MultiAssetFeedItem>,
  capitalPools: Record<AssetCategory, AssetCapitalPool>,
  activeStrategies: StrategyName[],
  arbitrationConfig: {
    maxConcurrentPositions: number;
    minScore: number;
    conflictPolicy: 'highest_score' | 'strict_no_conflict' | 'trend_priority';
    enableWeights: boolean;
  }
): {
  trades: BtTrade[];
  metrics: BtMetrics;
  arbitrationEvents: ArbitrationEvent[];
  strategyStats: StrategyContributionStat[];
  categorySummaries: Record<AssetCategory, CategoryPerformanceSummary>;
  symbolSummaries: Record<string, SymbolPerformanceSummary>;
} {
  const trades: BtTrade[] = [];
  const openTrades: BtTrade[] = [];
  const arbitrationEvents: ArbitrationEvent[] = [];

  let evaluations = 0;
  let candidatesTotal = 0;
  let rejected = 0;
  const rejectionReasons: Record<string, number> = {};

  const totalStartingCapital = Object.values(capitalPools).reduce((sum, p) => sum + p.capitalUsd, 0);
  let cumulativeR = 0;
  let cumulativeUsd = totalStartingCapital;
  const equityCurve: { bar: number; time: string; equityR: number; equityUsd: number }[] = [];

  // Per-category running balance tracker
  const categoryBalances: Record<AssetCategory, { netUsd: number; totalR: number; wins: number; losses: number; trades: number }> = {
    forex: { netUsd: 0, totalR: 0, wins: 0, losses: 0, trades: 0 },
    metals: { netUsd: 0, totalR: 0, wins: 0, losses: 0, trades: 0 },
    crypto: { netUsd: 0, totalR: 0, wins: 0, losses: 0, trades: 0 },
  };

  // Per-strategy statistics tracker
  const stratStatMap: Record<
    string,
    {
      category: AssetCategory;
      candidatesCount: number;
      wonArbitrationCount: number;
      executedTrades: number;
      wins: number;
      losses: number;
      totalR: number;
      netUsd: number;
    }
  > = {};

  activeStrategies.forEach((s) => {
    const meta = STRATEGY_ASSET_MAP[s] || { category: 'forex' as AssetCategory };
    stratStatMap[s] = {
      category: meta.category,
      candidatesCount: 0,
      wonArbitrationCount: 0,
      executedTrades: 0,
      wins: 0,
      losses: 0,
      totalR: 0,
      netUsd: 0,
    };
  });

  // Determine timeline length from available feeds (use max candle count to evaluate full real historical span)
  const allFeedItems = Object.values(multiAssetFeeds).filter((f) => f && f.candles && f.candles.length >= 50);
  const sortedFeeds = [...allFeedItems].sort((a, b) => (b.candles?.length || 0) - (a.candles?.length || 0));
  const clockFeed = sortedFeeds[0] || multiAssetFeeds.EURUSD || multiAssetFeeds.forex || multiAssetFeeds.BTCUSDT || allFeedItems[0];
  const maxTimelineBars = clockFeed?.candles?.length || 0;

  let currentDayKey = '';
  let dailyTradesCount = 0;
  let dailyRealizedLossUsd = 0;

  for (let i = 50; i < maxTimelineBars; i++) {
    evaluations++;
    const timelineTime = clockFeed?.candles[i]?.time || clockFeed?.candles[clockFeed.candles.length - 1]?.time || `Bar-${i}`;
    const dateObj = new Date(timelineTime.includes('T') ? timelineTime : timelineTime.replace(' ', 'T') + 'Z');
    const dayOfWeek = isNaN(dateObj.getTime()) ? 1 : dateObj.getUTCDay();
    const hour = isNaN(dateObj.getTime()) ? 12 : dateObj.getUTCHours();

    const dayKey = timelineTime.slice(0, 10);
    if (dayKey !== currentDayKey) {
      currentDayKey = dayKey;
      dailyTradesCount = 0;
      dailyRealizedLossUsd = 0;
    }

    // 1. Manage Active Positions in Portfolio
    for (let tIdx = openTrades.length - 1; tIdx >= 0; tIdx--) {
      const inTrade = openTrades[tIdx];
      const feed = multiAssetFeeds[inTrade.symbol] || multiAssetFeeds[inTrade.category];
      const candle = feed?.candles?.[i];
      if (!candle) {
        // If feed ended before the master timeline, safely exit at the feed's final candle
        if (feed && feed.candles && feed.candles.length > 0 && i >= feed.candles.length) {
          const lastCandle = feed.candles[feed.candles.length - 1];
          inTrade.exitIndex = feed.candles.length - 1;
          inTrade.exitTime = lastCandle.time;
          inTrade.exitPrice = lastCandle.close;
          inTrade.result = 'expired';
          const isBuy = inTrade.direction === 'buy';
          const pool = capitalPools[inTrade.category] || capitalPools.forex;
          const riskUsd = inTrade.riskUsd || ((pool.capitalUsd * pool.riskPct) / 100);
          const feeUsd = inTrade.feeDeductedUsd || 0;
          const initialRiskDistance = Math.max(Math.abs(inTrade.entry - inTrade.stop_loss), 1e-6);
          const rawR = isBuy
            ? (lastCandle.close - inTrade.entry) / initialRiskDistance
            : (inTrade.entry - lastCandle.close) / initialRiskDistance;
          const grossUsd = rawR * riskUsd;
          const netUsd = grossUsd - feeUsd;
          inTrade.pnl_net_usd = parseFloat(netUsd.toFixed(2));
          inTrade.pnl_r = parseFloat((netUsd / riskUsd).toFixed(2));
          inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / pool.capitalUsd) * 100).toFixed(2));

          cumulativeR += inTrade.pnl_r;
          cumulativeUsd += inTrade.pnl_net_usd;
          categoryBalances[inTrade.category].netUsd += inTrade.pnl_net_usd;
          categoryBalances[inTrade.category].totalR += inTrade.pnl_r;
          categoryBalances[inTrade.category].trades++;
          if (inTrade.pnl_r > 0) categoryBalances[inTrade.category].wins++;
          else if (inTrade.pnl_r < 0) {
            categoryBalances[inTrade.category].losses++;
            dailyRealizedLossUsd += Math.abs(inTrade.pnl_net_usd);
          }

          if (stratStatMap[inTrade.strategy]) {
            stratStatMap[inTrade.strategy].totalR += inTrade.pnl_r;
            stratStatMap[inTrade.strategy].netUsd += inTrade.pnl_net_usd;
            if (inTrade.pnl_r > 0) stratStatMap[inTrade.strategy].wins++;
            else if (inTrade.pnl_r < 0) stratStatMap[inTrade.strategy].losses++;
          }

          trades.push(inTrade);
          openTrades.splice(tIdx, 1);
        }
        continue;
      }

      inTrade.durationBars++;
      const isBuy = inTrade.direction === 'buy';
      const pool = capitalPools[inTrade.category] || capitalPools.forex;
      const riskUsd = inTrade.riskUsd || ((pool.capitalUsd * pool.riskPct) / 100);
      const feeUsd = inTrade.feeDeductedUsd || 0;
      const initialRiskDistance = inTrade.initialRiskDistance || Math.max(Math.abs(inTrade.entry - inTrade.stop_loss), inTrade.entry * 0.0005);

      // Friday 20:00 UTC Liquidation for Forex & Metals
      const shouldFridayClose = feed.fridayWeekendClose !== undefined ? feed.fridayWeekendClose : pool.fridayClose;
      if (shouldFridayClose && dayOfWeek === 5 && hour >= 20) {
        inTrade.exitIndex = i;
        inTrade.exitTime = candle.time;
        inTrade.exitPrice = candle.close;
        inTrade.result = 'weekend_cut';
        const rawR = isBuy
          ? (candle.close - inTrade.entry) / initialRiskDistance
          : (inTrade.entry - candle.close) / initialRiskDistance;
        const grossUsd = rawR * riskUsd;
        const netUsd = grossUsd - feeUsd;
        inTrade.pnl_net_usd = parseFloat(netUsd.toFixed(2));
        inTrade.pnl_r = parseFloat((netUsd / riskUsd).toFixed(2));
        inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / pool.capitalUsd) * 100).toFixed(2));

        cumulativeR += inTrade.pnl_r;
        cumulativeUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].netUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].totalR += inTrade.pnl_r;
        categoryBalances[inTrade.category].trades++;
        if (inTrade.pnl_r > 0) categoryBalances[inTrade.category].wins++;
        else if (inTrade.pnl_r < 0) {
          categoryBalances[inTrade.category].losses++;
          dailyRealizedLossUsd += Math.abs(inTrade.pnl_net_usd);
        }

        if (stratStatMap[inTrade.strategy]) {
          stratStatMap[inTrade.strategy].totalR += inTrade.pnl_r;
          stratStatMap[inTrade.strategy].netUsd += inTrade.pnl_net_usd;
          if (inTrade.pnl_r > 0) stratStatMap[inTrade.strategy].wins++;
          else if (inTrade.pnl_r < 0) stratStatMap[inTrade.strategy].losses++;
        }

        trades.push(inTrade);
        openTrades.splice(tIdx, 1);
        continue;
      }

      // Dynamic Breakeven Trailing: Once price moves +1.25R favorable, move SL to Entry
      const excursionR = isBuy
        ? (candle.high - inTrade.entry) / initialRiskDistance
        : (inTrade.entry - candle.low) / initialRiskDistance;
      if (!inTrade.isBreakevenMoved && excursionR >= 1.25) {
        inTrade.isBreakevenMoved = true;
        inTrade.stop_loss = inTrade.entry;
      }

      // Partial TP at TP1: Bank 50% profits and lock Stop Loss firmly at Breakeven
      const tp1Hit = isBuy ? candle.high >= inTrade.tp1 : candle.low <= inTrade.tp1;
      if (tp1Hit && !inTrade.tp1HitAndPartialBanked) {
        inTrade.tp1HitAndPartialBanked = true;
        const rMult1 = isBuy
          ? (inTrade.tp1 - inTrade.entry) / initialRiskDistance
          : (inTrade.entry - inTrade.tp1) / initialRiskDistance;
        inTrade.partialBankedR = parseFloat((0.5 * rMult1).toFixed(2));
        inTrade.partialBankedUsd = parseFloat(((0.5 * rMult1 * riskUsd) - (feeUsd * 0.5)).toFixed(2));
        inTrade.isBreakevenMoved = true;
        inTrade.stop_loss = inTrade.entry;
      }

      // Full Target at TP2 (Runner or full position)
      const tp2Hit = isBuy ? candle.high >= inTrade.tp2 : candle.low <= inTrade.tp2;
      if (tp2Hit) {
        inTrade.exitIndex = i;
        inTrade.exitTime = candle.time;
        inTrade.exitPrice = inTrade.tp2;
        inTrade.result = 'tp2_hit';
        const rMult2 = isBuy
          ? (inTrade.tp2 - inTrade.entry) / initialRiskDistance
          : (inTrade.entry - inTrade.tp2) / initialRiskDistance;

        if (inTrade.tp1HitAndPartialBanked) {
          const runnerR = 0.5 * rMult2;
          const runnerUsd = (0.5 * rMult2 * riskUsd) - (feeUsd * 0.5);
          inTrade.pnl_r = parseFloat(((inTrade.partialBankedR || 0) + runnerR).toFixed(2));
          inTrade.pnl_net_usd = parseFloat(((inTrade.partialBankedUsd || 0) + runnerUsd).toFixed(2));
        } else {
          const grossUsd = rMult2 * riskUsd;
          const netUsd = grossUsd - feeUsd;
          inTrade.pnl_net_usd = parseFloat(netUsd.toFixed(2));
          inTrade.pnl_r = parseFloat((netUsd / riskUsd).toFixed(2));
        }

        inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / pool.capitalUsd) * 100).toFixed(2));
        cumulativeR += inTrade.pnl_r;
        cumulativeUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].netUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].totalR += inTrade.pnl_r;
        categoryBalances[inTrade.category].trades++;
        categoryBalances[inTrade.category].wins++;

        if (stratStatMap[inTrade.strategy]) {
          stratStatMap[inTrade.strategy].totalR += inTrade.pnl_r;
          stratStatMap[inTrade.strategy].netUsd += inTrade.pnl_net_usd;
          stratStatMap[inTrade.strategy].wins++;
        }

        trades.push(inTrade);
        openTrades.splice(tIdx, 1);
        continue;
      }

      // Check Stop Loss hit
      const slHit = isBuy ? candle.low <= inTrade.stop_loss : candle.high >= inTrade.stop_loss;
      if (slHit) {
        inTrade.exitIndex = i;
        inTrade.exitTime = candle.time;
        inTrade.exitPrice = inTrade.stop_loss;

        if (inTrade.tp1HitAndPartialBanked) {
          // 50% was already banked at TP1! Remaining 50% stopped at breakeven. Trade is net positive!
          inTrade.result = 'tp1_hit';
          inTrade.pnl_r = inTrade.partialBankedR || 0;
          inTrade.pnl_net_usd = inTrade.partialBankedUsd || 0;
        } else if (inTrade.isBreakevenMoved) {
          // Exited at Breakeven
          inTrade.result = 'breakeven_exit';
          inTrade.pnl_r = 0;
          inTrade.pnl_net_usd = parseFloat((-feeUsd * 0.5).toFixed(2));
        } else {
          // Full stop loss
          inTrade.result = 'sl_hit';
          const grossUsd = -riskUsd;
          const netUsd = grossUsd - feeUsd;
          inTrade.pnl_net_usd = parseFloat(netUsd.toFixed(2));
          inTrade.pnl_r = parseFloat((netUsd / riskUsd).toFixed(2));
        }

        inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / pool.capitalUsd) * 100).toFixed(2));
        cumulativeR += inTrade.pnl_r;
        cumulativeUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].netUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].totalR += inTrade.pnl_r;
        categoryBalances[inTrade.category].trades++;
        if (inTrade.pnl_r > 0) categoryBalances[inTrade.category].wins++;
        else if (inTrade.pnl_r < 0) {
          categoryBalances[inTrade.category].losses++;
          dailyRealizedLossUsd += Math.abs(inTrade.pnl_net_usd);
        }

        if (stratStatMap[inTrade.strategy]) {
          stratStatMap[inTrade.strategy].totalR += inTrade.pnl_r;
          stratStatMap[inTrade.strategy].netUsd += inTrade.pnl_net_usd;
          if (inTrade.pnl_r > 0) stratStatMap[inTrade.strategy].wins++;
          else if (inTrade.pnl_r < 0) stratStatMap[inTrade.strategy].losses++;
        }

        trades.push(inTrade);
        openTrades.splice(tIdx, 1);
        continue;
      }

      // Max Bars Expiry (36 bars)
      if (inTrade.durationBars >= 36) {
        inTrade.exitIndex = i;
        inTrade.exitTime = candle.time;
        inTrade.exitPrice = candle.close;
        inTrade.result = inTrade.tp1HitAndPartialBanked ? 'tp1_hit' : 'expired';
        const rawR = isBuy
          ? (candle.close - inTrade.entry) / initialRiskDistance
          : (inTrade.entry - candle.close) / initialRiskDistance;

        if (inTrade.tp1HitAndPartialBanked) {
          const runnerR = Math.max(0, 0.5 * rawR);
          const runnerUsd = (runnerR * riskUsd) - (feeUsd * 0.5);
          inTrade.pnl_r = parseFloat(((inTrade.partialBankedR || 0) + runnerR).toFixed(2));
          inTrade.pnl_net_usd = parseFloat(((inTrade.partialBankedUsd || 0) + runnerUsd).toFixed(2));
        } else {
          const grossUsd = rawR * riskUsd;
          const netUsd = grossUsd - feeUsd;
          inTrade.pnl_net_usd = parseFloat(netUsd.toFixed(2));
          inTrade.pnl_r = parseFloat((netUsd / riskUsd).toFixed(2));
        }

        inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / pool.capitalUsd) * 100).toFixed(2));
        cumulativeR += inTrade.pnl_r;
        cumulativeUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].netUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].totalR += inTrade.pnl_r;
        categoryBalances[inTrade.category].trades++;
        if (inTrade.pnl_r > 0) categoryBalances[inTrade.category].wins++;
        else if (inTrade.pnl_r < 0) {
          categoryBalances[inTrade.category].losses++;
          dailyRealizedLossUsd += Math.abs(inTrade.pnl_net_usd);
        }

        if (stratStatMap[inTrade.strategy]) {
          stratStatMap[inTrade.strategy].totalR += inTrade.pnl_r;
          stratStatMap[inTrade.strategy].netUsd += inTrade.pnl_net_usd;
          if (inTrade.pnl_r > 0) stratStatMap[inTrade.strategy].wins++;
          else if (inTrade.pnl_r < 0) stratStatMap[inTrade.strategy].losses++;
        }

        trades.push(inTrade);
        openTrades.splice(tIdx, 1);
        continue;
      }
    }

    equityCurve.push({
      bar: i,
      time: timelineTime,
      equityR: parseFloat(cumulativeR.toFixed(2)),
      equityUsd: parseFloat(cumulativeUsd.toFixed(2)),
    });

    // 2. Scan All Active Strategies Across Respective Supported Multi-Asset Feeds
    const candidateList: ArbitrationCandidate[] = [];

    for (const stratName of activeStrategies) {
      const def = STRATEGY_DEFINITIONS[stratName];
      if (!def) continue;

      const meta = STRATEGY_ASSET_MAP[stratName] || {
        category: 'forex' as AssetCategory,
        defaultSymbol: 'EURUSD',
        supportedSymbols: ['EURUSD'],
      };

      const matchingFeedSymbols = Object.values(multiAssetFeeds)
        .filter((f) => f && f.category === meta.category && f.symbol && !['forex', 'metals', 'crypto'].includes(f.symbol))
        .map((f) => f.symbol);

      const targetSymbols = Array.from(new Set([
        ...(meta.supportedSymbols && meta.supportedSymbols.length > 0 ? meta.supportedSymbols : [meta.defaultSymbol]),
        ...matchingFeedSymbols,
      ]));

      for (const sym of targetSymbols) {
        const feed = multiAssetFeeds[sym] || (sym === meta.defaultSymbol ? multiAssetFeeds[meta.category] : null);
        if (!feed || !feed.candles || feed.candles.length < i + 1) continue;

        const startIdx = Math.max(0, i - 120);
        const assetWindow = feed.candles.slice(startIdx, i + 1);
        const evalOut = evaluateStrategySetup(stratName, assetWindow, '15m', def.defaultParams, feed.enforceSessionWindows, sym);

        if (evalOut.ok && evalOut.score >= arbitrationConfig.minScore) {
          candidatesTotal++;
          if (stratStatMap[stratName]) stratStatMap[stratName].candidatesCount++;

          const weight = arbitrationConfig.enableWeights ? def.defaultAI.weight_multiplier || 1.0 : 1.0;
          const weightedScore = parseFloat((evalOut.score * weight).toFixed(1));

          candidateList.push({
            strategy: stratName,
            category: feed.category,
            symbol: feed.symbol,
            direction: evalOut.direction,
            entry: evalOut.entry,
            stop_loss: evalOut.stop_loss,
            tp1: evalOut.tp1,
            tp2: evalOut.tp2,
            score: evalOut.score,
            weight,
            weightedScore,
            grade: evalOut.grade,
            reason: evalOut.reason,
          });
        } else if (!evalOut.ok && evalOut.rejectionCause) {
          rejected++;
          rejectionReasons[evalOut.rejectionCause] = (rejectionReasons[evalOut.rejectionCause] ?? 0) + 1;
        }
      }
    }

    // 3. Multi-Asset Arbitration Engine
    if (candidateList.length > 0) {
      candidateList.sort((a, b) => b.weightedScore - a.weightedScore);
      const topCand = candidateList[0];

      // Check Intraday Risk Circuit Breaker: Halt if today's realized loss reaches 1.5% of starting capital
      if (dailyRealizedLossUsd >= totalStartingCapital * 0.015) {
        arbitrationEvents.push({
          id: `arb-circuit-${i}`,
          barIndex: i,
          time: timelineTime,
          candidates: candidateList.map((c) => ({
            strategy: c.strategy,
            category: c.category,
            symbol: c.symbol,
            direction: c.direction,
            score: c.score,
            weightedScore: c.weightedScore,
            grade: c.grade,
            reason: c.reason,
          })),
          winner: null,
          decision: 'rejected_risk',
          notes: `Intraday Circuit Breaker active: Daily realized loss reached -$${dailyRealizedLossUsd.toFixed(2)} (>= 1.5% limit). Halting trading for remainder of today to protect prop challenge capital.`,
        });
        continue;
      }

      // Check Daily Trade Frequency Cap: Max 3 trades per day across portfolio to prevent overtrading
      if (dailyTradesCount >= 3) {
        arbitrationEvents.push({
          id: `arb-maxdaily-${i}`,
          barIndex: i,
          time: timelineTime,
          candidates: candidateList.map((c) => ({
            strategy: c.strategy,
            category: c.category,
            symbol: c.symbol,
            direction: c.direction,
            score: c.score,
            weightedScore: c.weightedScore,
            grade: c.grade,
            reason: c.reason,
          })),
          winner: null,
          decision: 'rejected_risk',
          notes: `Daily trade frequency cap reached (3 trades executed today). Enforcing institutional selectivity and eliminating overtrading.`,
        });
        continue;
      }

      // Check Portfolio Maximum Concurrent Positions
      if (openTrades.length >= arbitrationConfig.maxConcurrentPositions) {
        arbitrationEvents.push({
          id: `arb-event-${i}`,
          barIndex: i,
          time: timelineTime,
          candidates: candidateList.map((c) => ({
            strategy: c.strategy,
            category: c.category,
            symbol: c.symbol,
            direction: c.direction,
            score: c.score,
            weightedScore: c.weightedScore,
            grade: c.grade,
            reason: c.reason,
          })),
          winner: null,
          decision: 'rejected_max_exposure',
          notes: `Portfolio capacity limit reached (${openTrades.length}/${arbitrationConfig.maxConcurrentPositions} max open positions). Rejected top candidate ${topCand.strategy} (${topCand.symbol}).`,
        });
        continue;
      }

      // Check Directional Conflict Policy
      const hasConflict = openTrades.some(
        (t) => (t.symbol === topCand.symbol || t.category === topCand.category) && t.direction !== topCand.direction
      );
      if (hasConflict && arbitrationConfig.conflictPolicy === 'strict_no_conflict') {
        arbitrationEvents.push({
          id: `arb-event-${i}`,
          barIndex: i,
          time: timelineTime,
          candidates: candidateList.map((c) => ({
            strategy: c.strategy,
            category: c.category,
            symbol: c.symbol,
            direction: c.direction,
            score: c.score,
            weightedScore: c.weightedScore,
            grade: c.grade,
            reason: c.reason,
          })),
          winner: null,
          decision: 'rejected_conflict',
          notes: `Directional conflict: Cannot open ${topCand.direction.toUpperCase()} (${topCand.strategy} on ${topCand.symbol}) while holding opposing ${topCand.category.toUpperCase()} exposure.`,
        });
        continue;
      }

      // Candidate Approved and Executed!
      const pool = capitalPools[topCand.category] || capitalPools.forex;
      const targetFeed = multiAssetFeeds[topCand.symbol] || multiAssetFeeds[topCand.category];
      const spreadPts = targetFeed?.spreadPipsOrPts ?? pool.spreadPipsOrPts;
      const pipSize = targetFeed?.pipOrPointSize ?? pool.pipOrPointSize;
      const spreadAmount = spreadPts * pipSize;
      const entryPrice =
        topCand.direction === 'buy'
          ? topCand.entry + spreadAmount / 2
          : topCand.entry - spreadAmount / 2;

      // Institutional fixed-fractional risk anchored to initial capital pool (standard prop firm model):
      const tradeRiskUsd = (pool.capitalUsd * pool.riskPct) / 100;
      const stopDistance = Math.max(Math.abs(entryPrice - topCand.stop_loss), entryPrice * 0.0005);
      const positionUnits = tradeRiskUsd / stopDistance;
      const notionalUsd = positionUnits * entryPrice;
      const feePct = pool.feePctPerSide !== undefined
        ? pool.feePctPerSide
        : topCand.category === 'crypto'
        ? 0.04
        : topCand.category === 'forex'
        ? 0.003
        : 0.01;
      const roundTurnFeeUsd = (notionalUsd * (feePct / 100)) * 2;

      const newTrade: BtTrade = {
        id: `trade-${topCand.strategy}-${topCand.symbol}-${i}`,
        entryIndex: i,
        entryTime: timelineTime,
        strategy: topCand.strategy,
        category: topCand.category,
        symbol: topCand.symbol,
        direction: topCand.direction,
        entry: entryPrice,
        stop_loss: topCand.stop_loss,
        tp1: topCand.tp1,
        tp2: topCand.tp2,
        result: 'expired',
        exitIndex: null,
        exitTime: null,
        exitPrice: null,
        pnl_r: 0,
        pnl_net_usd: 0,
        categoryCapitalUsd: pool.capitalUsd,
        capitalPoolReturnPct: 0,
        durationBars: 0,
        spreadDeductionPipsOrPts: spreadPts,
        grade: topCand.grade,
        score: topCand.score,
        reason: topCand.reason,
        riskUsd: tradeRiskUsd,
        feeDeductedUsd: roundTurnFeeUsd,
        initialRiskDistance: stopDistance,
      };

      openTrades.push(newTrade);
      dailyTradesCount++;

      if (stratStatMap[topCand.strategy]) {
        stratStatMap[topCand.strategy].wonArbitrationCount++;
        stratStatMap[topCand.strategy].executedTrades++;
      }

      const loserNotes =
        candidateList.length > 1
          ? `Out-ranked ${candidateList
              .slice(1)
              .map((c) => `${c.strategy} [${c.symbol}] (${c.weightedScore}pts)`)
              .join(', ')}`
          : 'Sole qualified candidate';

      arbitrationEvents.push({
        id: `arb-event-${i}`,
        barIndex: i,
        time: timelineTime,
        candidates: candidateList.map((c) => ({
          strategy: c.strategy,
          category: c.category,
          symbol: c.symbol,
          direction: c.direction,
          score: c.score,
          weightedScore: c.weightedScore,
          grade: c.grade,
          reason: c.reason,
        })),
        winner: {
          strategy: topCand.strategy,
          category: topCand.category,
          symbol: topCand.symbol,
          direction: topCand.direction,
          score: topCand.score,
          weightedScore: topCand.weightedScore,
        },
        decision: 'executed',
        notes: `Arbitration Winner: ${topCand.strategy} on ${topCand.symbol} (Score ${topCand.score} × ${topCand.weight}x = ${topCand.weightedScore} pts). ${loserNotes}.`,
      });
    }
  }

  // Calculate Overall Portfolio Metrics
  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.pnl_r > 0).length;
  const tp1Hits = trades.filter((t) => t.result === 'tp1_hit').length;
  const tp2Hits = trades.filter((t) => t.result === 'tp2_hit').length;
  const losses = trades.filter((t) => t.pnl_r < 0).length;
  const expired = trades.filter((t) => t.result === 'expired' || t.result === 'weekend_cut').length;

  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const totalR = trades.reduce((acc, t) => acc + t.pnl_r, 0);
  const netUsd = trades.reduce((acc, t) => acc + t.pnl_net_usd, 0);
  const avgR = totalTrades > 0 ? totalR / totalTrades : 0;

  const winTrades = trades.filter((t) => t.pnl_r > 0);
  const lossTrades = trades.filter((t) => t.pnl_r < 0);
  const avgWin = winTrades.length > 0 ? winTrades.reduce((s, t) => s + t.pnl_r, 0) / winTrades.length : 0;
  const avgLoss = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, t) => s + t.pnl_r, 0) / lossTrades.length) : 0;
  const grossProfit = winTrades.reduce((s, t) => s + t.pnl_r, 0);
  const grossLoss = Math.abs(lossTrades.reduce((s, t) => s + t.pnl_r, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;

  let maxConsecWins = 0, curConsecWins = 0;
  let maxConsecLosses = 0, curConsecLosses = 0;
  let peakEquityUsd = totalStartingCapital;
  let runningEquityUsd = totalStartingCapital;
  let maxDrawdownUsd = 0;
  let peakR = 0, runningR = 0, maxDrawdownR = 0;

  trades.forEach((t) => {
    runningEquityUsd += t.pnl_net_usd;
    if (runningEquityUsd > peakEquityUsd) {
      peakEquityUsd = runningEquityUsd;
    }
    const dd = peakEquityUsd - runningEquityUsd;
    if (dd > maxDrawdownUsd) {
      maxDrawdownUsd = dd;
    }

    runningR += t.pnl_r;
    if (runningR > peakR) peakR = runningR;
    const ddR = peakR - runningR;
    if (ddR > maxDrawdownR) maxDrawdownR = ddR;

    if (t.pnl_r > 0) {
      curConsecWins++;
      curConsecLosses = 0;
      if (curConsecWins > maxConsecWins) maxConsecWins = curConsecWins;
    } else if (t.pnl_r < 0) {
      curConsecLosses++;
      curConsecWins = 0;
      if (curConsecLosses > maxConsecLosses) maxConsecLosses = curConsecLosses;
    }
  });

  const maxDrawdownPct = peakEquityUsd > 0 ? (maxDrawdownUsd / peakEquityUsd) * 100 : 0;

  const metrics: BtMetrics = {
    totalTrades,
    wins,
    tp1Hits,
    tp2Hits,
    losses,
    expired,
    winRate: parseFloat(winRate.toFixed(1)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    totalR: parseFloat(totalR.toFixed(2)),
    netUsd: parseFloat(netUsd.toFixed(2)),
    avgR: parseFloat(avgR.toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    bestTrade: trades.length > 0 ? Math.max(...trades.map((t) => t.pnl_r)) : 0,
    worstTrade: trades.length > 0 ? Math.min(...trades.map((t) => t.pnl_r)) : 0,
    maxConsecWins,
    maxConsecLosses,
    maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(1)),
    maxDrawdownR: parseFloat(maxDrawdownR.toFixed(2)),
    evaluations,
    candidates: candidatesTotal,
    rejected,
    rejectionReasons,
    equityCurve,
  };

  // Compile Strategy Alpha Matrix
  const totalPositiveR = Object.values(stratStatMap).reduce((s, st) => s + Math.max(0, st.totalR), 0);
  const strategyStats: StrategyContributionStat[] = Object.entries(stratStatMap).map(([stratName, st]) => {
    const sDef = STRATEGY_DEFINITIONS[stratName as StrategyName];
    const sTrades = st.executedTrades;
    const sWinRate = sTrades > 0 ? parseFloat(((st.wins / sTrades) * 100).toFixed(1)) : 0;
    const stratTrades = trades.filter((t) => t.strategy === stratName);
    const grossW = stratTrades.filter((t) => t.pnl_r > 0).reduce((a, b) => a + b.pnl_r, 0);
    const grossL = Math.abs(stratTrades.filter((t) => t.pnl_r < 0).reduce((a, b) => a + b.pnl_r, 0));
    const sPf = grossL > 0 ? parseFloat((grossW / grossL).toFixed(2)) : grossW > 0 ? 99.9 : 0;
    const alphaShare = totalPositiveR > 0 && st.totalR > 0 ? parseFloat(((st.totalR / totalPositiveR) * 100).toFixed(1)) : 0;

    return {
      strategy: stratName as StrategyName,
      displayName: sDef?.displayName || stratName,
      category: st.category,
      marketType: sDef?.marketType || 'forex',
      weight: sDef?.defaultAI?.weight_multiplier || 1.0,
      candidatesCount: st.candidatesCount,
      wonArbitrationCount: st.wonArbitrationCount,
      executedTrades: sTrades,
      wins: st.wins,
      losses: st.losses,
      winRate: sWinRate,
      profitFactor: sPf,
      totalR: parseFloat(st.totalR.toFixed(2)),
      netUsd: parseFloat(st.netUsd.toFixed(2)),
      alphaSharePct: alphaShare,
    };
  });

  // Compile Segregated Category Performance Summaries
  const categorySummaries: Record<AssetCategory, CategoryPerformanceSummary> = {
    forex: compileCategorySummary('forex', 'Forex Majors', capitalPools.forex, categoryBalances.forex, trades, totalPositiveR),
    metals: compileCategorySummary('metals', 'Metals & Gold', capitalPools.metals, categoryBalances.metals, trades, totalPositiveR),
    crypto: compileCategorySummary('crypto', 'Crypto Pool', capitalPools.crypto, categoryBalances.crypto, trades, totalPositiveR),
  };

  // Compile Symbol-Level Performance Summaries across universe
  const symbolSummaries: Record<string, SymbolPerformanceSummary> = {};
  Object.values(multiAssetFeeds).forEach((f) => {
    if (f && f.symbol && !symbolSummaries[f.symbol]) {
      symbolSummaries[f.symbol] = compileSymbolSummary(f.symbol, f.displayName || f.symbol, f.category, trades, totalPositiveR);
    }
  });
  trades.forEach((t) => {
    if (!symbolSummaries[t.symbol]) {
      const feed = multiAssetFeeds[t.symbol];
      const category = feed?.category || t.category;
      const displayName = feed?.displayName || t.symbol;
      symbolSummaries[t.symbol] = compileSymbolSummary(t.symbol, displayName, category, trades, totalPositiveR);
    }
  });

  return { trades, metrics, arbitrationEvents, strategyStats, categorySummaries, symbolSummaries };
}

export async function runMultiAssetPipelineReplayAsync(
  multiAssetFeeds: Record<string, MultiAssetFeedItem>,
  capitalPools: Record<AssetCategory, AssetCapitalPool>,
  activeStrategies: StrategyName[],
  arbitrationConfig: {
    maxConcurrentPositions: number;
    minScore: number;
    conflictPolicy: 'highest_score' | 'strict_no_conflict' | 'trend_priority';
    enableWeights: boolean;
  },
  onProgress?: (progress: ReplayProgressState) => void,
  chunkDelayMs: number = 12,
  batchSize: number = 35
): Promise<{
  trades: BtTrade[];
  metrics: BtMetrics;
  arbitrationEvents: ArbitrationEvent[];
  strategyStats: StrategyContributionStat[];
  categorySummaries: Record<AssetCategory, CategoryPerformanceSummary>;
  symbolSummaries: Record<string, SymbolPerformanceSummary>;
}> {
  const trades: BtTrade[] = [];
  const openTrades: BtTrade[] = [];
  const arbitrationEvents: ArbitrationEvent[] = [];

  let candidatesTotal = 0;
  let rejected = 0;
  const rejectionReasons: Record<string, number> = {};

  const totalStartingCapital = Object.values(capitalPools).reduce((sum, p) => sum + p.capitalUsd, 0);
  let cumulativeR = 0;
  let cumulativeUsd = totalStartingCapital;
  const equityCurve: { bar: number; time: string; equityR: number; equityUsd: number }[] = [];

  const categoryBalances: Record<AssetCategory, { netUsd: number; totalR: number; wins: number; losses: number; trades: number }> = {
    forex: { netUsd: 0, totalR: 0, wins: 0, losses: 0, trades: 0 },
    metals: { netUsd: 0, totalR: 0, wins: 0, losses: 0, trades: 0 },
    crypto: { netUsd: 0, totalR: 0, wins: 0, losses: 0, trades: 0 },
  };

  const stratStatMap: Record<
    string,
    {
      category: AssetCategory;
      candidatesCount: number;
      wonArbitrationCount: number;
      executedTrades: number;
      wins: number;
      losses: number;
      totalR: number;
      netUsd: number;
    }
  > = {};

  activeStrategies.forEach((s) => {
    const meta = STRATEGY_ASSET_MAP[s] || { category: 'forex' as AssetCategory };
    stratStatMap[s] = {
      category: meta.category,
      candidatesCount: 0,
      wonArbitrationCount: 0,
      executedTrades: 0,
      wins: 0,
      losses: 0,
      totalR: 0,
      netUsd: 0,
    };
  });

  const allFeedItems = Object.values(multiAssetFeeds).filter((f) => f && f.candles && f.candles.length >= 50);
  const sortedFeeds = [...allFeedItems].sort((a, b) => (b.candles?.length || 0) - (a.candles?.length || 0));
  const clockFeed = sortedFeeds[0] || multiAssetFeeds.EURUSD || multiAssetFeeds.forex || multiAssetFeeds.BTCUSDT || allFeedItems[0];
  const maxTimelineBars = clockFeed?.candles?.length || 0;

  for (let i = 50; i < maxTimelineBars; i++) {
    const timelineTime = clockFeed?.candles[i]?.time || clockFeed?.candles[clockFeed.candles.length - 1]?.time || `Bar-${i}`;
    const dateObj = new Date(timelineTime.includes('T') ? timelineTime : timelineTime.replace(' ', 'T') + 'Z');
    const dayOfWeek = isNaN(dateObj.getTime()) ? 1 : dateObj.getUTCDay();
    const hour = isNaN(dateObj.getTime()) ? 12 : dateObj.getUTCHours();

    // 1. Manage Active Positions in Portfolio
    for (let tIdx = openTrades.length - 1; tIdx >= 0; tIdx--) {
      const inTrade = openTrades[tIdx];
      const feed = multiAssetFeeds[inTrade.symbol] || multiAssetFeeds[inTrade.category];
      const candle = feed?.candles?.[i];
      if (!candle) {
        if (feed && feed.candles && feed.candles.length > 0 && i >= feed.candles.length) {
          const lastCandle = feed.candles[feed.candles.length - 1];
          inTrade.exitIndex = feed.candles.length - 1;
          inTrade.exitTime = lastCandle.time;
          inTrade.exitPrice = lastCandle.close;
          inTrade.result = 'expired';
          const isBuy = inTrade.direction === 'buy';
          const pool = capitalPools[inTrade.category] || capitalPools.forex;
          const riskUsd = inTrade.riskUsd || ((pool.capitalUsd * pool.riskPct) / 100);
          const feeUsd = inTrade.feeDeductedUsd || 0;
          const initialRiskDistance = inTrade.initialRiskDistance || Math.max(Math.abs(inTrade.entry - inTrade.stop_loss), inTrade.entry * 0.0005);
          const rawR = isBuy
            ? (lastCandle.close - inTrade.entry) / initialRiskDistance
            : (inTrade.entry - lastCandle.close) / initialRiskDistance;
          const grossUsd = rawR * riskUsd;
          const netUsd = grossUsd - feeUsd;
          inTrade.pnl_net_usd = parseFloat(netUsd.toFixed(2));
          inTrade.pnl_r = parseFloat((netUsd / riskUsd).toFixed(2));
          inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / pool.capitalUsd) * 100).toFixed(2));

          cumulativeR += inTrade.pnl_r;
          cumulativeUsd += inTrade.pnl_net_usd;
          categoryBalances[inTrade.category].netUsd += inTrade.pnl_net_usd;
          categoryBalances[inTrade.category].totalR += inTrade.pnl_r;
          categoryBalances[inTrade.category].trades++;
          if (inTrade.pnl_r > 0) categoryBalances[inTrade.category].wins++;
          else if (inTrade.pnl_r < 0) categoryBalances[inTrade.category].losses++;

          if (stratStatMap[inTrade.strategy]) {
            stratStatMap[inTrade.strategy].totalR += inTrade.pnl_r;
            stratStatMap[inTrade.strategy].netUsd += inTrade.pnl_net_usd;
            if (inTrade.pnl_r > 0) stratStatMap[inTrade.strategy].wins++;
            else if (inTrade.pnl_r < 0) stratStatMap[inTrade.strategy].losses++;
          }

          trades.push(inTrade);
          openTrades.splice(tIdx, 1);
        }
        continue;
      }

      inTrade.durationBars++;
      const isBuy = inTrade.direction === 'buy';
      const pool = capitalPools[inTrade.category] || capitalPools.forex;
      const riskUsd = inTrade.riskUsd || ((pool.capitalUsd * pool.riskPct) / 100);
      const feeUsd = inTrade.feeDeductedUsd || 0;

      // Friday 20:00 UTC Liquidation for Forex & Metals
      const shouldFridayClose = feed.fridayWeekendClose !== undefined ? feed.fridayWeekendClose : pool.fridayClose;
      if (shouldFridayClose && dayOfWeek === 5 && hour >= 20) {
        inTrade.exitIndex = i;
        inTrade.exitTime = candle.time;
        inTrade.exitPrice = candle.close;
        inTrade.result = 'weekend_cut';
        const initialRiskDistance = inTrade.initialRiskDistance || Math.max(Math.abs(inTrade.entry - inTrade.stop_loss), inTrade.entry * 0.0005);
        const rawR = isBuy
          ? (candle.close - inTrade.entry) / initialRiskDistance
          : (inTrade.entry - candle.close) / initialRiskDistance;
        const grossUsd = rawR * riskUsd;
        const netUsd = grossUsd - feeUsd;
        inTrade.pnl_net_usd = parseFloat(netUsd.toFixed(2));
        inTrade.pnl_r = parseFloat((netUsd / riskUsd).toFixed(2));
        inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / pool.capitalUsd) * 100).toFixed(2));

        cumulativeR += inTrade.pnl_r;
        cumulativeUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].netUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].totalR += inTrade.pnl_r;
        categoryBalances[inTrade.category].trades++;
        if (inTrade.pnl_r > 0) categoryBalances[inTrade.category].wins++;
        else if (inTrade.pnl_r < 0) categoryBalances[inTrade.category].losses++;

        if (stratStatMap[inTrade.strategy]) {
          stratStatMap[inTrade.strategy].totalR += inTrade.pnl_r;
          stratStatMap[inTrade.strategy].netUsd += inTrade.pnl_net_usd;
          if (inTrade.pnl_r > 0) stratStatMap[inTrade.strategy].wins++;
          else if (inTrade.pnl_r < 0) stratStatMap[inTrade.strategy].losses++;
        }

        trades.push(inTrade);
        openTrades.splice(tIdx, 1);
        continue;
      }

      // Check Stop Loss hit
      const slHit = isBuy ? candle.low <= inTrade.stop_loss : candle.high >= inTrade.stop_loss;
      if (slHit) {
        inTrade.exitIndex = i;
        inTrade.exitTime = candle.time;
        inTrade.exitPrice = inTrade.stop_loss;
        inTrade.result = 'sl_hit';
        const grossUsd = -riskUsd;
        const netUsd = grossUsd - feeUsd;
        inTrade.pnl_net_usd = parseFloat(netUsd.toFixed(2));
        inTrade.pnl_r = parseFloat((netUsd / riskUsd).toFixed(2));
        inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / pool.capitalUsd) * 100).toFixed(2));

        cumulativeR += inTrade.pnl_r;
        cumulativeUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].netUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].totalR += inTrade.pnl_r;
        categoryBalances[inTrade.category].trades++;
        categoryBalances[inTrade.category].losses++;

        if (stratStatMap[inTrade.strategy]) {
          stratStatMap[inTrade.strategy].totalR += inTrade.pnl_r;
          stratStatMap[inTrade.strategy].netUsd += inTrade.pnl_net_usd;
          stratStatMap[inTrade.strategy].losses++;
        }

        trades.push(inTrade);
        openTrades.splice(tIdx, 1);
        continue;
      }

      // Check TP2 (Full Target Hit)
      const tp2Hit = isBuy ? candle.high >= inTrade.tp2 : candle.low <= inTrade.tp2;
      if (tp2Hit) {
        inTrade.exitIndex = i;
        inTrade.exitTime = candle.time;
        inTrade.exitPrice = inTrade.tp2;
        inTrade.result = 'tp2_hit';
        const initialRiskDistance = inTrade.initialRiskDistance || Math.max(Math.abs(inTrade.entry - inTrade.stop_loss), inTrade.entry * 0.0005);
        const rMult = isBuy
          ? (inTrade.tp2 - inTrade.entry) / initialRiskDistance
          : (inTrade.entry - inTrade.tp2) / initialRiskDistance;
        const grossUsd = rMult * riskUsd;
        const netUsd = grossUsd - feeUsd;
        inTrade.pnl_net_usd = parseFloat(netUsd.toFixed(2));
        inTrade.pnl_r = parseFloat((netUsd / riskUsd).toFixed(2));
        inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / pool.capitalUsd) * 100).toFixed(2));

        cumulativeR += inTrade.pnl_r;
        cumulativeUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].netUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].totalR += inTrade.pnl_r;
        categoryBalances[inTrade.category].trades++;
        categoryBalances[inTrade.category].wins++;

        if (stratStatMap[inTrade.strategy]) {
          stratStatMap[inTrade.strategy].totalR += inTrade.pnl_r;
          stratStatMap[inTrade.strategy].netUsd += inTrade.pnl_net_usd;
          stratStatMap[inTrade.strategy].wins++;
        }

        trades.push(inTrade);
        openTrades.splice(tIdx, 1);
        continue;
      }

      // Check TP1 hit
      const tp1Hit = isBuy ? candle.high >= inTrade.tp1 : candle.low <= inTrade.tp1;
      if (tp1Hit) {
        inTrade.exitIndex = i;
        inTrade.exitTime = candle.time;
        inTrade.exitPrice = inTrade.tp1;
        inTrade.result = 'tp1_hit';
        const initialRiskDistance = inTrade.initialRiskDistance || Math.max(Math.abs(inTrade.entry - inTrade.stop_loss), inTrade.entry * 0.0005);
        const rMult = isBuy
          ? (inTrade.tp1 - inTrade.entry) / initialRiskDistance
          : (inTrade.entry - inTrade.tp1) / initialRiskDistance;
        const grossUsd = rMult * riskUsd;
        const netUsd = grossUsd - feeUsd;
        inTrade.pnl_net_usd = parseFloat(netUsd.toFixed(2));
        inTrade.pnl_r = parseFloat((netUsd / riskUsd).toFixed(2));
        inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / pool.capitalUsd) * 100).toFixed(2));

        cumulativeR += inTrade.pnl_r;
        cumulativeUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].netUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].totalR += inTrade.pnl_r;
        categoryBalances[inTrade.category].trades++;
        categoryBalances[inTrade.category].wins++;

        if (stratStatMap[inTrade.strategy]) {
          stratStatMap[inTrade.strategy].totalR += inTrade.pnl_r;
          stratStatMap[inTrade.strategy].netUsd += inTrade.pnl_net_usd;
          stratStatMap[inTrade.strategy].wins++;
        }

        trades.push(inTrade);
        openTrades.splice(tIdx, 1);
        continue;
      }

      // Max Bars Expiry (36 bars)
      if (inTrade.durationBars >= 36) {
        inTrade.exitIndex = i;
        inTrade.exitTime = candle.time;
        inTrade.exitPrice = candle.close;
        inTrade.result = 'expired';
        const initialRiskDistance = inTrade.initialRiskDistance || Math.max(Math.abs(inTrade.entry - inTrade.stop_loss), inTrade.entry * 0.0005);
        const rawR = isBuy
          ? (candle.close - inTrade.entry) / initialRiskDistance
          : (inTrade.entry - candle.close) / initialRiskDistance;
        const grossUsd = rawR * riskUsd;
        const netUsd = grossUsd - feeUsd;
        inTrade.pnl_net_usd = parseFloat(netUsd.toFixed(2));
        inTrade.pnl_r = parseFloat((netUsd / riskUsd).toFixed(2));
        inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / pool.capitalUsd) * 100).toFixed(2));

        cumulativeR += inTrade.pnl_r;
        cumulativeUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].netUsd += inTrade.pnl_net_usd;
        categoryBalances[inTrade.category].totalR += inTrade.pnl_r;
        categoryBalances[inTrade.category].trades++;
        if (inTrade.pnl_r > 0) categoryBalances[inTrade.category].wins++;
        else if (inTrade.pnl_r < 0) categoryBalances[inTrade.category].losses++;

        if (stratStatMap[inTrade.strategy]) {
          stratStatMap[inTrade.strategy].totalR += inTrade.pnl_r;
          stratStatMap[inTrade.strategy].netUsd += inTrade.pnl_net_usd;
          if (inTrade.pnl_r > 0) stratStatMap[inTrade.strategy].wins++;
          else if (inTrade.pnl_r < 0) stratStatMap[inTrade.strategy].losses++;
        }

        trades.push(inTrade);
        openTrades.splice(tIdx, 1);
        continue;
      }
    }

    equityCurve.push({
      bar: i,
      time: timelineTime,
      equityR: parseFloat(cumulativeR.toFixed(2)),
      equityUsd: parseFloat(cumulativeUsd.toFixed(2)),
    });

    // 2. Scan All Active Strategies Across Respective Supported Multi-Asset Feeds
    const candidateList: ArbitrationCandidate[] = [];

    for (const stratName of activeStrategies) {
      const def = STRATEGY_DEFINITIONS[stratName];
      if (!def) continue;

      const meta = STRATEGY_ASSET_MAP[stratName] || {
        category: 'forex' as AssetCategory,
        defaultSymbol: 'EURUSD',
        supportedSymbols: ['EURUSD'],
      };

      const matchingFeedSymbols = Object.values(multiAssetFeeds)
        .filter((f) => f && f.category === meta.category && f.symbol && !['forex', 'metals', 'crypto'].includes(f.symbol))
        .map((f) => f.symbol);

      const targetSymbols = Array.from(new Set([
        ...(meta.supportedSymbols && meta.supportedSymbols.length > 0 ? meta.supportedSymbols : [meta.defaultSymbol]),
        ...matchingFeedSymbols,
      ]));

      for (const sym of targetSymbols) {
        const feed = multiAssetFeeds[sym] || (sym === meta.defaultSymbol ? multiAssetFeeds[meta.category] : null);
        if (!feed || !feed.candles || feed.candles.length < i + 1) continue;

        const startIdx = Math.max(0, i - 120);
        const assetWindow = feed.candles.slice(startIdx, i + 1);
        const evalOut = evaluateStrategySetup(stratName, assetWindow, '15m', def.defaultParams, feed.enforceSessionWindows, sym);

        if (evalOut.ok && evalOut.score >= arbitrationConfig.minScore) {
          candidatesTotal++;
          if (stratStatMap[stratName]) stratStatMap[stratName].candidatesCount++;

          const weight = arbitrationConfig.enableWeights ? def.defaultAI.weight_multiplier || 1.0 : 1.0;
          const weightedScore = parseFloat((evalOut.score * weight).toFixed(1));

          candidateList.push({
            strategy: stratName,
            category: feed.category,
            symbol: feed.symbol,
            direction: evalOut.direction,
            entry: evalOut.entry,
            stop_loss: evalOut.stop_loss,
            tp1: evalOut.tp1,
            tp2: evalOut.tp2,
            score: evalOut.score,
            weight,
            weightedScore,
            grade: evalOut.grade,
            reason: evalOut.reason,
          });
        } else if (!evalOut.ok && evalOut.rejectionCause) {
          rejected++;
          rejectionReasons[evalOut.rejectionCause] = (rejectionReasons[evalOut.rejectionCause] ?? 0) + 1;
        }
      }
    }

    // 3. Multi-Asset Arbitration Engine
    if (candidateList.length > 0) {
      candidateList.sort((a, b) => b.weightedScore - a.weightedScore);
      const topCand = candidateList[0];

      // Check Portfolio Capacity
      if (openTrades.length >= arbitrationConfig.maxConcurrentPositions) {
        arbitrationEvents.push({
          id: `arb-event-${i}`,
          barIndex: i,
          time: timelineTime,
          candidates: candidateList.map((c) => ({
            strategy: c.strategy,
            category: c.category,
            symbol: c.symbol,
            direction: c.direction,
            score: c.score,
            weightedScore: c.weightedScore,
            grade: c.grade,
            reason: c.reason,
          })),
          winner: null,
          decision: 'rejected_capacity',
          notes: `Portfolio capacity limit reached (${openTrades.length}/${arbitrationConfig.maxConcurrentPositions} max open positions). Rejected top candidate ${topCand.strategy} (${topCand.symbol}).`,
        });
      } else {
        // Check Directional Conflict Policy
        const hasConflict = openTrades.some(
          (t) => (t.symbol === topCand.symbol || t.category === topCand.category) && t.direction !== topCand.direction
        );
        if (hasConflict && arbitrationConfig.conflictPolicy === 'strict_no_conflict') {
          arbitrationEvents.push({
            id: `arb-event-${i}`,
            barIndex: i,
            time: timelineTime,
            candidates: candidateList.map((c) => ({
              strategy: c.strategy,
              category: c.category,
              symbol: c.symbol,
              direction: c.direction,
              score: c.score,
              weightedScore: c.weightedScore,
              grade: c.grade,
              reason: c.reason,
            })),
            winner: null,
            decision: 'rejected_conflict',
            notes: `Directional conflict: Cannot open ${topCand.direction.toUpperCase()} (${topCand.strategy} on ${topCand.symbol}) while holding opposing ${topCand.category.toUpperCase()} exposure.`,
          });
        } else {
          // Candidate Approved and Executed!
          const pool = capitalPools[topCand.category] || capitalPools.forex;
          const targetFeed = multiAssetFeeds[topCand.symbol] || multiAssetFeeds[topCand.category];
          const spreadPts = targetFeed?.spreadPipsOrPts ?? pool.spreadPipsOrPts;
          const pipSize = targetFeed?.pipOrPointSize ?? pool.pipOrPointSize;
          const spreadAmount = spreadPts * pipSize;
          const entryPrice =
            topCand.direction === 'buy'
              ? topCand.entry + spreadAmount / 2
              : topCand.entry - spreadAmount / 2;

          // Compounding position sizing based on running category pool balance:
          const currentCategoryCapital = Math.max(100, pool.capitalUsd + categoryBalances[topCand.category].netUsd);
          const tradeRiskUsd = (currentCategoryCapital * pool.riskPct) / 100;
          const stopDistance = Math.max(Math.abs(entryPrice - topCand.stop_loss), entryPrice * 0.0005);
          const positionUnits = tradeRiskUsd / stopDistance;
          const notionalUsd = positionUnits * entryPrice;
          const feePct = pool.feePctPerSide !== undefined
            ? pool.feePctPerSide
            : topCand.category === 'crypto'
            ? 0.04
            : topCand.category === 'forex'
            ? 0.003
            : 0.01;
          const roundTurnFeeUsd = (notionalUsd * (feePct / 100)) * 2;

          const newTrade: BtTrade = {
            id: `trade-${topCand.strategy}-${topCand.symbol}-${i}`,
            entryIndex: i,
            entryTime: timelineTime,
            strategy: topCand.strategy,
            category: topCand.category,
            symbol: topCand.symbol,
            direction: topCand.direction,
            entry: entryPrice,
            stop_loss: topCand.stop_loss,
            tp1: topCand.tp1,
            tp2: topCand.tp2,
            result: 'expired',
            exitIndex: null,
            exitTime: null,
            exitPrice: null,
            pnl_r: 0,
            pnl_net_usd: 0,
            categoryCapitalUsd: pool.capitalUsd,
            capitalPoolReturnPct: 0,
            durationBars: 0,
            spreadDeductionPipsOrPts: spreadPts,
            grade: topCand.grade,
            score: topCand.score,
            reason: topCand.reason,
            riskUsd: tradeRiskUsd,
            feeDeductedUsd: roundTurnFeeUsd,
          };

          openTrades.push(newTrade);

          if (stratStatMap[topCand.strategy]) {
            stratStatMap[topCand.strategy].wonArbitrationCount++;
            stratStatMap[topCand.strategy].executedTrades++;
          }

          const loserNotes =
            candidateList.length > 1
              ? `Out-ranked ${candidateList
                  .slice(1)
                  .map((c) => `${c.strategy} [${c.symbol}] (${c.weightedScore}pts)`)
                  .join(', ')}`
              : 'Sole qualified candidate';

          arbitrationEvents.push({
            id: `arb-event-${i}`,
            barIndex: i,
            time: timelineTime,
            candidates: candidateList.map((c) => ({
              strategy: c.strategy,
              category: c.category,
              symbol: c.symbol,
              direction: c.direction,
              score: c.score,
              weightedScore: c.weightedScore,
              grade: c.grade,
              reason: c.reason,
            })),
            winner: {
              strategy: topCand.strategy,
              category: topCand.category,
              symbol: topCand.symbol,
              direction: topCand.direction,
              score: topCand.score,
              weightedScore: topCand.weightedScore,
            },
            decision: 'approved',
            notes: `Trade allocated to ${topCand.strategy} (${topCand.symbol} ${topCand.direction.toUpperCase()}). ${loserNotes}`,
          });
        }
      }
    }

    // Interactive Replay Progress Reporting
    if (i % batchSize === 0 || i === maxTimelineBars - 1) {
      if (onProgress) {
        const lastEv = arbitrationEvents.length > 0 ? arbitrationEvents[arbitrationEvents.length - 1] : null;
        onProgress({
          currentBar: i,
          totalBars: maxTimelineBars,
          currentTime: timelineTime,
          openPositions: openTrades.length,
          cumulativeUsd: parseFloat(cumulativeUsd.toFixed(2)),
          cumulativeR: parseFloat(cumulativeR.toFixed(2)),
          tradesCount: trades.length,
          signalsCount: candidatesTotal,
          pct: Math.min(100, Math.round((i / maxTimelineBars) * 100)),
          recentEvent: lastEv?.winner
            ? `${lastEv.winner.strategy} won on ${lastEv.winner.symbol} (${candidatesTotal} signals, ${rejected} filtered)`
            : `${candidatesTotal} setups evaluated across universe (${rejected} filtered)`,
        });
      }
      if (chunkDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, chunkDelayMs));
      }
    }
  }

  // Close remaining open positions at timeline termination
  openTrades.forEach((inTrade) => {
    const feed = multiAssetFeeds[inTrade.symbol] || multiAssetFeeds[inTrade.category];
    const lastCandle = feed?.candles?.[feed.candles.length - 1];
    if (lastCandle) {
      inTrade.exitIndex = maxTimelineBars - 1;
      inTrade.exitTime = lastCandle.time;
      inTrade.exitPrice = lastCandle.close;
      inTrade.result = 'expired';
      const isBuy = inTrade.direction === 'buy';
      const pool = capitalPools[inTrade.category] || capitalPools.forex;
      const riskUsd = inTrade.riskUsd || ((pool.capitalUsd * pool.riskPct) / 100);
      const feeUsd = inTrade.feeDeductedUsd || 0;
      const initialRiskDistance = inTrade.initialRiskDistance || Math.max(Math.abs(inTrade.entry - inTrade.stop_loss), inTrade.entry * 0.0005);
      const rawR = isBuy
        ? (lastCandle.close - inTrade.entry) / initialRiskDistance
        : (inTrade.entry - lastCandle.close) / initialRiskDistance;
      const grossUsd = rawR * riskUsd;
      const netUsd = grossUsd - feeUsd;
      inTrade.pnl_net_usd = parseFloat(netUsd.toFixed(2));
      inTrade.pnl_r = parseFloat((netUsd / riskUsd).toFixed(2));
      inTrade.capitalPoolReturnPct = parseFloat(((inTrade.pnl_net_usd / pool.capitalUsd) * 100).toFixed(2));

      cumulativeR += inTrade.pnl_r;
      cumulativeUsd += inTrade.pnl_net_usd;
      categoryBalances[inTrade.category].netUsd += inTrade.pnl_net_usd;
      categoryBalances[inTrade.category].totalR += inTrade.pnl_r;
      categoryBalances[inTrade.category].trades++;
      if (inTrade.pnl_r > 0) categoryBalances[inTrade.category].wins++;
      else if (inTrade.pnl_r < 0) categoryBalances[inTrade.category].losses++;

      if (stratStatMap[inTrade.strategy]) {
        stratStatMap[inTrade.strategy].totalR += inTrade.pnl_r;
        stratStatMap[inTrade.strategy].netUsd += inTrade.pnl_net_usd;
        if (inTrade.pnl_r > 0) stratStatMap[inTrade.strategy].wins++;
        else if (inTrade.pnl_r < 0) stratStatMap[inTrade.strategy].losses++;
      }
    }
    trades.push(inTrade);
  });

  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.pnl_r > 0).length;
  const losses = trades.filter((t) => t.pnl_r < 0).length;
  const expired = trades.filter((t) => t.result === 'expired').length;
  const tp1Hits = trades.filter((t) => t.result === 'tp1_hit').length;
  const tp2Hits = trades.filter((t) => t.result === 'tp2_hit').length;

  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const totalR = trades.reduce((acc, t) => acc + t.pnl_r, 0);
  const netUsd = trades.reduce((acc, t) => acc + t.pnl_net_usd, 0);
  const avgR = totalTrades > 0 ? totalR / totalTrades : 0;

  const winTrades = trades.filter((t) => t.pnl_r > 0);
  const lossTrades = trades.filter((t) => t.pnl_r < 0);
  const avgWin = winTrades.length > 0 ? winTrades.reduce((s, t) => s + t.pnl_r, 0) / winTrades.length : 0;
  const avgLoss = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, t) => s + t.pnl_r, 0) / lossTrades.length) : 0;
  const grossProfit = winTrades.reduce((s, t) => s + t.pnl_r, 0);
  const grossLoss = Math.abs(lossTrades.reduce((s, t) => s + t.pnl_r, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;

  let maxConsecWins = 0, curConsecWins = 0;
  let maxConsecLosses = 0, curConsecLosses = 0;
  let peakEquityUsd = totalStartingCapital;
  let runningEquityUsd = totalStartingCapital;
  let maxDrawdownUsd = 0;
  let peakR = 0, runningR = 0, maxDrawdownR = 0;

  trades.forEach((t) => {
    runningEquityUsd += t.pnl_net_usd;
    if (runningEquityUsd > peakEquityUsd) {
      peakEquityUsd = runningEquityUsd;
    }
    const dd = peakEquityUsd - runningEquityUsd;
    if (dd > maxDrawdownUsd) {
      maxDrawdownUsd = dd;
    }

    runningR += t.pnl_r;
    if (runningR > peakR) peakR = runningR;
    const ddR = peakR - runningR;
    if (ddR > maxDrawdownR) maxDrawdownR = ddR;

    if (t.pnl_r > 0) {
      curConsecWins++;
      curConsecLosses = 0;
      if (curConsecWins > maxConsecWins) maxConsecWins = curConsecWins;
    } else if (t.pnl_r < 0) {
      curConsecLosses++;
      curConsecWins = 0;
      if (curConsecLosses > maxConsecLosses) maxConsecLosses = curConsecLosses;
    }
  });

  const maxDrawdownPct = peakEquityUsd > 0 ? (maxDrawdownUsd / peakEquityUsd) * 100 : 0;
  const bestTrade = trades.length > 0 ? Math.max(...trades.map((t) => t.pnl_r)) : 0;
  const worstTrade = trades.length > 0 ? Math.min(...trades.map((t) => t.pnl_r)) : 0;

  const metrics: BtMetrics = {
    totalTrades,
    wins,
    tp1Hits,
    tp2Hits,
    losses,
    expired,
    winRate: parseFloat(winRate.toFixed(1)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    totalR: parseFloat(totalR.toFixed(2)),
    netUsd: parseFloat(netUsd.toFixed(2)),
    avgR: parseFloat(avgR.toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    avgWinR: parseFloat(avgWin.toFixed(2)),
    avgLossR: parseFloat(avgLoss.toFixed(2)),
    bestTrade: parseFloat(bestTrade.toFixed(2)),
    worstTrade: parseFloat(worstTrade.toFixed(2)),
    maxConsecWins,
    maxConsecLosses,
    maxConsecutiveWins: maxConsecWins,
    maxConsecutiveLosses: maxConsecLosses,
    maxDrawdownR: parseFloat(maxDrawdownR.toFixed(2)),
    maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(2)),
    equityCurve,
  };

  const strategyStats: StrategyContributionStat[] = Object.keys(stratStatMap).map((stratName) => {
    const s = stratStatMap[stratName];
    const sWinRate = s.executedTrades > 0 ? (s.wins / s.executedTrades) * 100 : 0;
    const stratTrades = trades.filter((t) => t.strategy === stratName);
    const sWinTrades = stratTrades.filter((t) => t.pnl_r > 0);
    const sLossTrades = stratTrades.filter((t) => t.pnl_r < 0);
    const sGrossProfit = sWinTrades.reduce((acc, t) => acc + t.pnl_r, 0);
    const sGrossLoss = Math.abs(sLossTrades.reduce((acc, t) => acc + t.pnl_r, 0));
    const sPF = sGrossLoss > 0 ? sGrossProfit / sGrossLoss : sGrossProfit > 0 ? 99.9 : 0;

    return {
      strategy: stratName as StrategyName,
      displayName: STRATEGY_DEFINITIONS[stratName as StrategyName]?.name || stratName,
      category: s.category,
      marketType: s.category,
      weight: STRATEGY_DEFINITIONS[stratName as StrategyName]?.defaultAI?.weight_multiplier ?? 1,
      alphaSharePct: totalR > 0 && s.totalR > 0 ? Number((s.totalR / totalR * 100).toFixed(1)) : 0,
      candidatesCount: s.candidatesCount,
      wonArbitrationCount: s.wonArbitrationCount,
      executedTrades: s.executedTrades,
      wins: s.wins,
      losses: s.losses,
      winRate: parseFloat(sWinRate.toFixed(1)),
      profitFactor: parseFloat(sPF.toFixed(2)),
      totalR: parseFloat(s.totalR.toFixed(2)),
      netUsd: parseFloat(s.netUsd.toFixed(2)),
      contributionPct: totalR > 0 && s.totalR > 0 ? parseFloat(((s.totalR / totalR) * 100).toFixed(1)) : 0,
    };
  });

  const totalPositiveR = (trades || []).filter((t) => t.pnl_r > 0).reduce((s, t) => s + t.pnl_r, 0);

  const safePools: Record<AssetCategory, AssetCapitalPool> = {
    forex: capitalPools?.forex || {
      category: 'forex',
      name: 'Forex Majors',
      symbol: 'EURUSD',
      capitalUsd: 50000,
      riskPct: 0.5,
      pipOrPointSize: 0.0001,
      spreadPipsOrPts: 1.2,
      decimals: 5,
      fridayClose: true,
      sessionFilter: true,
    },
    metals: capitalPools?.metals || {
      category: 'metals',
      name: 'Metals & Gold',
      symbol: 'XAUUSD',
      capitalUsd: 50000,
      riskPct: 0.5,
      pipOrPointSize: 0.01,
      spreadPipsOrPts: 35.0,
      decimals: 2,
      fridayClose: true,
      sessionFilter: false,
    },
    crypto: capitalPools?.crypto || {
      category: 'crypto',
      name: 'Crypto Perpetuals',
      symbol: 'BTCUSDT',
      capitalUsd: 50000,
      riskPct: 0.5,
      pipOrPointSize: 0.1,
      spreadPipsOrPts: 15.0,
      decimals: 2,
      fridayClose: false,
      sessionFilter: false,
    },
  };

  const categorySummaries: Record<AssetCategory, CategoryPerformanceSummary> = {
    forex: compileCategorySummary('forex', 'Forex Majors & Crosses', safePools.forex, categoryBalances.forex, trades, totalPositiveR),
    metals: compileCategorySummary('metals', 'Precious Metals', safePools.metals, categoryBalances.metals, trades, totalPositiveR),
    crypto: compileCategorySummary('crypto', 'Crypto Perpetuals', safePools.crypto, categoryBalances.crypto, trades, totalPositiveR),
  };
  const symbolSummaries: Record<string, SymbolPerformanceSummary> = {};
  Object.values(multiAssetFeeds).forEach((f) => {
    if (f && f.symbol && !symbolSummaries[f.symbol]) {
      symbolSummaries[f.symbol] = compileSymbolSummary(f.symbol, f.displayName || f.symbol, f.category, trades, totalPositiveR);
    }
  });
  trades.forEach((t) => {
    if (!symbolSummaries[t.symbol]) {
      const feed = multiAssetFeeds[t.symbol];
      const category = feed?.category || t.category;
      const displayName = feed?.displayName || t.symbol;
      symbolSummaries[t.symbol] = compileSymbolSummary(t.symbol, displayName, category, trades, totalPositiveR);
    }
  });

  return { trades, metrics, arbitrationEvents, strategyStats, categorySummaries, symbolSummaries };
}

export function generateAICalibrationReport(
  trades: BtTrade[],
  metrics: BtMetrics,
  strategyStats: StrategyContributionStat[],
  categorySummaries: Record<AssetCategory, CategoryPerformanceSummary>,
  capitalPools: Record<AssetCategory, AssetCapitalPool>
): AICalibrationReport {
  const lossDiagnosis: string[] = [];
  const drawdownDiagnosis: string[] = [];
  const recommendations: StrategyTweakProposal[] = [];

  const safeStrategyStats = Array.isArray(strategyStats) ? strategyStats : [];
  const safeTrades = Array.isArray(trades) ? trades : [];

  // Identify loss drivers
  const underperformers = safeStrategyStats.filter((s) => s && s.executedTrades > 0 && s.totalR < 0);
  const primePerformers = safeStrategyStats.filter((s) => s && s.executedTrades > 0 && s.totalR > 0 && s.winRate >= 50);

  if (underperformers.length > 0) {
    underperformers.forEach((s) => {
      lossDiagnosis.push(
        `${s.displayName} (${s.category.toUpperCase()}) experienced capital bleed of ${s.totalR}R over ${s.executedTrades} trades (Win Rate: ${s.winRate}%, PF: ${s.profitFactor}). The cause requires inspection of the recorded trades.`
      );
    });
  } else {
    lossDiagnosis.push('No individual strategy recorded net negative R in the supplied evidence. This does not establish a positive edge.');
  }

  if (primePerformers.length > 0) {
    primePerformers.forEach((s) => {
      lossDiagnosis.push(
        `High-performing engine: ${s.displayName} delivered +${s.totalR}R with ${s.winRate}% win rate across ${s.executedTrades} trades.`
      );
    });
  }

  // Category specific risk diagnosis & pool analysis
  Object.keys(categorySummaries).forEach((catKey) => {
    const cat = categorySummaries[catKey as AssetCategory];
    const pool = capitalPools[catKey as AssetCategory];
    if (cat && pool && cat.netUsd < 0 && cat.totalTrades > 0) {
      drawdownDiagnosis.push(
        `${cat.displayName} pool (${pool.symbol}) recorded -$${Math.abs(cat.netUsd).toLocaleString()} (${cat.returnPct}% of $${pool.capitalUsd.toLocaleString()}). Recommend dialing risk from ${pool.riskPct}% to 0.75% per trade.`
      );
    }
  });

  if (safeTrades.length === 0) {
    lossDiagnosis.push('No completed trades were supplied. Performance and parameter improvements are unmeasured.');
  }

  if (metrics.maxDrawdownPct > 8.0) {
    drawdownDiagnosis.push(
      `Peak Drawdown reached ${metrics.maxDrawdownPct}%. No causal attribution is established by this aggregate metric.`
    );
    drawdownDiagnosis.push('Inspect chronological trade and exposure evidence before proposing a change.');
  } else if (metrics.maxDrawdownPct > 4.0) {
    drawdownDiagnosis.push(
      `Drawdown is controlled at ${metrics.maxDrawdownPct}%. A lower drawdown after changes has not been measured.`
    );
  } else {
    drawdownDiagnosis.push(`Recorded peak drawdown: ${metrics.maxDrawdownPct}%.`);
  }

  // Generate Proposals per strategy
  strategyStats.forEach((s) => {
    const sDef = STRATEGY_DEFINITIONS[s.strategy];
    const curWeight = sDef?.defaultAI?.weight_multiplier || 1.0;
    const curMinScore = sDef?.defaultMeta?.min_score || 80;
    const curParams = sDef?.defaultParams || {};
    const curTp1 = curParams.tp1_r || 1.3;
    const curTp2 = curParams.tp2_r || 2.5;
    const curAtr = curParams.stop_atr_mult || 1.4;

    if (s.totalR < 0) {
      recommendations.push({
        strategy: s.strategy,
        currentWeight: curWeight,
        recommendedWeight: parseFloat(Math.max(0.5, curWeight * 0.75).toFixed(2)),
        currentMinScore: curMinScore,
        recommendedMinScore: Math.min(92, curMinScore + 6),
        currentTp1R: curTp1,
        recommendedTp1R: parseFloat((curTp1 * 1.2).toFixed(1)),
        currentTp2R: curTp2,
        recommendedTp2R: parseFloat((curTp2 * 1.25).toFixed(1)),
        currentStopAtrMult: curAtr,
        recommendedStopAtrMult: parseFloat((curAtr * 1.15).toFixed(1)),
        status: s.winRate < 40 ? 'CHOP_BLEED' : 'OVER_TRADING',
        rationale: `Dampen arbitration weight & raise quality gate to 88+ to filter low-probability chop while expanding take-profit asymmetric targets.`,
        expectedImprovement: `Unmeasured hypothesis; compare chronological replay and untouched holdout before adoption.`,
      });
    } else if (s.winRate >= 60 && s.totalR > 0) {
      recommendations.push({
        strategy: s.strategy,
        currentWeight: curWeight,
        recommendedWeight: parseFloat(Math.min(1.6, curWeight * 1.25).toFixed(2)),
        currentMinScore: curMinScore,
        recommendedMinScore: Math.max(78, curMinScore - 2),
        currentTp1R: curTp1,
        recommendedTp1R: parseFloat((curTp1 * 1.1).toFixed(1)),
        currentTp2R: curTp2,
        recommendedTp2R: parseFloat((curTp2 * 1.2).toFixed(1)),
        currentStopAtrMult: curAtr,
        recommendedStopAtrMult: curAtr,
        status: 'PRIME_ALPHA',
        rationale: `Boost priority in arbitration to allow high-conviction breakout setups to capture primary position slots.`,
        expectedImprovement: `Unmeasured hypothesis; additional returns are unknown.`,
      });
    } else {
      recommendations.push({
        strategy: s.strategy,
        currentWeight: curWeight,
        recommendedWeight: 1.0,
        currentMinScore: curMinScore,
        recommendedMinScore: 82,
        currentTp1R: curTp1,
        recommendedTp1R: 1.5,
        currentTp2R: curTp2,
        recommendedTp2R: 2.8,
        currentStopAtrMult: curAtr,
        recommendedStopAtrMult: 1.5,
        status: 'OPTIMAL',
        rationale: `Calibrate R:R skew to 1:2.0+ with normalized ATR stop protection.`,
        expectedImprovement: `Unmeasured hypothesis; expectancy and drawdown must be replayed.`,
      });
    }
  });

  const overallHealth =
    metrics.totalR > 5 ? 'PROFITABLE' : metrics.totalR >= 0 ? 'HEALTHY' : metrics.maxDrawdownPct > 10 ? 'SEVERE_DRAWDOWN' : 'MODERATE_BLEED';

  return {
    overallHealth,
    lossDiagnosis,
    drawdownDiagnosis,
    recommendations,
    globalTweaks: {
      recommendedMinScore: 85,
      recommendedMaxPositions: 3,
      recommendedConflictPolicy: 'strict_no_conflict',
      recommendedForexRiskPct: capitalPools.forex?.riskPct ?? 0,
      recommendedMetalsRiskPct: capitalPools.metals?.riskPct ?? 0,
      recommendedCryptoRiskPct: capitalPools.crypto?.riskPct ?? 0,
    },
    projectedPortfolioReturnR: metrics.totalR,
    projectedWinRatePct: metrics.winRate,
    projectedDrawdownPct: metrics.maxDrawdownPct,
  };
}

function compileCategorySummary(
  category: AssetCategory,
  displayName: string,
  pool: AssetCapitalPool,
  _balance: { netUsd: number; totalR: number; wins: number; losses: number; trades: number },
  allTrades: BtTrade[] = [],
  totalPositiveR: number = 0
): CategoryPerformanceSummary {
  const safeTrades = Array.isArray(allTrades) ? allTrades : [];
  const catTrades = safeTrades.filter((t) => t && t.category === category);
  const totalTrades = catTrades.length;
  const wins = catTrades.filter((t) => t.pnl_r > 0).length;
  const losses = catTrades.filter((t) => t.pnl_r < 0).length;
  const winRate = totalTrades > 0 ? parseFloat(((wins / totalTrades) * 100).toFixed(1)) : 0;
  const grossW = catTrades.filter((t) => t.pnl_r > 0).reduce((a, b) => a + b.pnl_r, 0);
  const grossL = Math.abs(catTrades.filter((t) => t.pnl_r < 0).reduce((a, b) => a + b.pnl_r, 0));
  const pf = grossL > 0 ? parseFloat((grossW / grossL).toFixed(2)) : grossW > 0 ? 99.9 : 0;
  const totalR = parseFloat(catTrades.reduce((s, t) => s + t.pnl_r, 0).toFixed(2));
  const netUsd = parseFloat(catTrades.reduce((s, t) => s + t.pnl_net_usd, 0).toFixed(2));
  const capital = pool?.capitalUsd || 50000;
  const returnPct = capital > 0 ? parseFloat(((netUsd / capital) * 100).toFixed(2)) : 0;
  const endingCapitalUsd = parseFloat((capital + netUsd).toFixed(2));
  const alphaShare = totalPositiveR > 0 && totalR > 0 ? parseFloat(((totalR / totalPositiveR) * 100).toFixed(1)) : 0;

  return {
    category,
    displayName,
    symbol: pool?.symbol || (category === 'forex' ? 'EURUSD' : category === 'metals' ? 'XAUUSD' : 'BTCUSDT'),
    initialCapitalUsd: capital,
    endingCapitalUsd,
    netUsd,
    returnPct,
    totalTrades,
    wins,
    losses,
    winRate,
    profitFactor: pf,
    totalR,
    alphaSharePct: alphaShare,
  };
}

function compileSymbolSummary(
  symbol: string,
  displayName: string,
  category: AssetCategory,
  allTrades: BtTrade[] = [],
  totalPositiveR: number = 0
): SymbolPerformanceSummary {
  const safeTrades = Array.isArray(allTrades) ? allTrades : [];
  const symTrades = safeTrades.filter((t) => t && t.symbol === symbol);
  const totalTrades = symTrades.length;
  const wins = symTrades.filter((t) => t.pnl_r > 0).length;
  const losses = symTrades.filter((t) => t.pnl_r < 0).length;
  const winRate = totalTrades > 0 ? parseFloat(((wins / totalTrades) * 100).toFixed(1)) : 0;
  const grossW = symTrades.filter((t) => t.pnl_r > 0).reduce((a, b) => a + b.pnl_r, 0);
  const grossL = Math.abs(symTrades.filter((t) => t.pnl_r < 0).reduce((a, b) => a + b.pnl_r, 0));
  const pf = grossL > 0 ? parseFloat((grossW / grossL).toFixed(2)) : grossW > 0 ? 99.9 : 0;
  const totalR = parseFloat(symTrades.reduce((s, t) => s + t.pnl_r, 0).toFixed(2));
  const netUsd = parseFloat(symTrades.reduce((s, t) => s + t.pnl_net_usd, 0).toFixed(2));
  const alphaShare = totalPositiveR > 0 && totalR > 0 ? parseFloat(((totalR / totalPositiveR) * 100).toFixed(1)) : 0;

  return {
    symbol,
    displayName,
    category,
    totalTrades,
    wins,
    losses,
    winRate,
    profitFactor: pf,
    totalR,
    netUsd,
    alphaSharePct: alphaShare,
  };
}

export type PipelineEngineResult = ReturnType<typeof runMultiAssetPipelineEngine>;
