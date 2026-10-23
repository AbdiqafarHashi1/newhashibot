/** Falsifiable 15m research hypotheses, never a publication or risk authority. */
import { atrRootV1, emaRootV1 } from './indicator-engine.ts';
import { closedAggregate } from './regime-opportunities.ts';
import type { LegacyStrategyResult, StrategyDefinition, StrategyEvaluationContext } from './professional-strategies.ts';

export const INTRADAY_VERSION = '1.0.0';
export const INTRADAY_IDS = ['crypto.vwap-reclaim-15m', 'crypto.failed-auction-15m'] as const;
export type IntradayId = typeof INTRADAY_IDS[number];
export const INTRADAY_DEFAULTS = Object.freeze({ stopAtr: 1.8, minimumStopBps: 60,
  maximumStopBps: 350, targetR: 2.5, tp1R: 1.5, estimatedCostBps: 20.5, maximumCostR: .3 });
const rejected = (reason: string): LegacyStrategyResult => ({ status: 'rejected', direction: 'none',
  entry_low: 0, entry_high: 0, stop_loss: 0, tp1: 0, tp2: 0, risk_reward: 0,
  confidence_score: 0, grade: 'reject', reason, rejection_reason: reason,
  score_breakdown: { score_is_probability: false, measured_release_required: true } });

export function evaluateIntradayOpportunity(id: IntradayId, context: StrategyEvaluationContext,
  overrides: Readonly<Record<string, number>> = {}): LegacyStrategyResult {
  if (!INTRADAY_IDS.includes(id)) return rejected('UNKNOWN_INTRADAY_STRATEGY');
  const p = { ...INTRADAY_DEFAULTS, ...overrides };
  if (Object.keys(overrides).some(k => !(k in INTRADAY_DEFAULTS)) ||
      !Object.values(p).every(x => Number.isFinite(x) && x > 0) || p.tp1R >= p.targetR ||
      p.minimumStopBps >= p.maximumStopBps) return rejected('INVALID_PARAMETERS');
  const rows = context.candles, at = Date.parse(context.evaluated_at), width = 900000;
  if (context.market !== 'crypto' || context.timeframe !== '15m' || rows.length < 110 || !Number.isFinite(at))
    return rejected('REQUIRES_110_CLOSED_CRYPTO_15M_BARS');
  if (rows.some((r, i) => r.symbol !== context.symbol || r.timeframe !== '15m' ||
      ![r.open, r.high, r.low, r.close, r.volume].every(Number.isFinite) || r.low <= 0 || r.volume < 0 ||
      r.high < Math.max(r.open, r.close) || r.low > Math.min(r.open, r.close) ||
      !Number.isFinite(Date.parse(r.open_time)) || Date.parse(r.open_time) % width !== 0 ||
      Date.parse(r.open_time) + width > at ||
      (i > 0 && Date.parse(r.open_time) - Date.parse(rows[i - 1].open_time) !== width)))
    return rejected('INVALID_OPEN_OR_GAPPED_DATA');
  if (at - Date.parse(rows.at(-1)!.open_time) - width >= width) return rejected('STALE_DATA');
  const last = rows.at(-1)!, previous = rows.at(-2)!, prior = rows.slice(0, -1);
  // Current impulse cannot inflate the volatility yardstick used to admit itself.
  const atr = atrRootV1([...prior], 14);
  if (!(atr > 0) || Math.max(last.high - last.low, Math.abs(last.high - previous.close),
      Math.abs(last.low - previous.close)) > 3 * atr || Math.abs(last.open - previous.close) > atr)
    return rejected('SHOCK_OR_INVALID_VOLATILITY');
  const higher = closedAggregate(rows, 60, context.evaluated_at), closes = higher.map(r => r.close);
  if (higher.length < 24) return rejected('CLOSED_HOURLY_CONTEXT_MISSING');
  const fast = emaRootV1(closes, 8), slow = emaRootV1(closes, 20), old = emaRootV1(closes.slice(0, -1), 8);
  const direction = fast > slow && fast > old ? 1 : fast < slow && fast < old ? -1 : 0;
  const path = rows.slice(-17, -1).map(r => r.close);
  const travel = path.slice(1).reduce((n, x, i) => n + Math.abs(x - path[i]), 0);
  const efficiency = travel ? Math.abs(path.at(-1)! - path[0]) / travel : 0;
  const range = prior.slice(-24), high = Math.max(...range.map(r => r.high)), low = Math.min(...range.map(r => r.low));
  // Rolling 24-bar VWAP avoids an arbitrary midnight jump on a 24/7 venue.
  const volume = range.reduce((n, r) => n + r.volume, 0);
  if (!(volume > 0)) return rejected('VOLUME_UNAVAILABLE');
  const vwap = range.reduce((n, r) => n + (r.high + r.low + r.close) / 3 * r.volume, 0) / volume;
  let side = 0, setup = '', targetBoundary: number | null = null;
  if (id === INTRADAY_IDS[0]) {
    if (!direction || efficiency < .2 || Math.abs(fast - slow) / atr < .4)
      return rejected('RECLAIM_REQUIRES_HOURLY_TREND');
    const touched = direction === 1 ? previous.low <= vwap && previous.close <= vwap :
      previous.high >= vwap && previous.close >= vwap;
    const reclaimed = direction === 1 ? last.close > vwap && last.close > previous.high :
      last.close < vwap && last.close < previous.low;
    if (!touched || !reclaimed || direction * (last.close - last.open) < .15 * atr ||
        Math.abs(last.close - vwap) > 1.5 * atr) return rejected('NO_ACCEPTED_VWAP_RECLAIM');
    side = direction; setup = 'CLOSED_HOURLY_TREND_VWAP_RECLAIM';
  } else {
    if (efficiency > .3 || Math.abs(fast - slow) / atr > 1.2 || high - low < 4 * atr)
      return rejected('FAILED_AUCTION_REQUIRES_BALANCE');
    const buy = last.low < low - .1 * atr && last.close > low + .1 * atr && last.close > last.open;
    const sell = last.high > high + .1 * atr && last.close < high - .1 * atr && last.close < last.open;
    if (buy === sell || last.volume < volume / range.length) return rejected('NO_FAILED_AUCTION');
    side = buy ? 1 : -1; setup = 'PRIOR_RANGE_SWEEP_AND_REJECTION';
    targetBoundary = (high + low) / 2;
  }
  const entry = last.close, structural = side === 1 ? Math.min(...rows.slice(-3).map(r => r.low)) - .15 * atr :
    Math.max(...rows.slice(-3).map(r => r.high)) + .15 * atr;
  const risk = Math.max((entry - structural) * side, atr * p.stopAtr, entry * p.minimumStopBps / 10000);
  if (risk / entry * 10000 > p.maximumStopBps || entry * p.estimatedCostBps / 10000 / risk > p.maximumCostR)
    return rejected('COST_OR_STOP_INFEASIBLE');
  const reward = targetBoundary === null ? risk * p.targetR : Math.min(risk * p.targetR, (targetBoundary - entry) * side);
  if (reward / risk < 1.5) return rejected('INSUFFICIENT_STRUCTURAL_REWARD');
  const tp1 = entry + side * Math.min(risk * p.tp1R, reward * .6), tp2 = entry + side * reward;
  return { status: 'candidate', direction: side === 1 ? 'buy' : 'sell', entry_low: entry, entry_high: entry,
    stop_loss: entry - side * risk, tp1, tp2, risk_reward: reward / risk, confidence_score: 80, grade: 'A',
    reason: setup, rejection_reason: '', score_breakdown: { setup, hourly_direction: direction, efficiency,
      rolling_vwap: vwap, estimated_cost_r: entry * p.estimatedCostBps / 10000 / risk,
      intraday_policy_version: 'intraday-opportunity/v1', hourly_trend_atr: Math.abs(fast - slow) / atr,
      score_is_probability: false, measured_release_required: true, order_flow_observed: false } };
}

export function intradayResearchDefinitions(): StrategyDefinition[] {
  return INTRADAY_IDS.map(id => ({ id, version: INTRADAY_VERSION, legacyName: id, market: 'crypto',
    lifecycle: 'DISABLED', publicationMode: 'SHADOW', certification: 'RESEARCH',
    config: { strategy_name: id, enabled: false, min_score: 75, min_rr: 1.5, max_bars_in_trade: 48,
      allowed_symbols: ['BTCUSDT', 'ETHUSDT'], allowed_timeframes: ['15m'], params: { ...INTRADAY_DEFAULTS } },
    evaluate: context => evaluateIntradayOpportunity(id, context, context.strategy_parameters) }));
}
