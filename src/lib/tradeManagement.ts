import { Signal } from './types';

export interface TradeManagementPlan {
  tp1PartialPct: number;
  breakEvenRule: string;
  trailingStopRule: string;
  timeStopRule: string;
  invalidationNote: string;
  strategyNote: string;
  riskGuidance: string;
  exposureGuidance: string;
  signalOnlyWarning: string;
}

type SignalLike = Partial<Signal> & {
  risk_profile_snapshot?: Record<string, unknown> | null;
};

function title(value: string | null | undefined) {
  return String(value ?? '').replace(/_/g, ' ');
}

export function getTradeManagementPlan(signal: SignalLike): TradeManagementPlan {
  const snapshot = signal.risk_profile_snapshot;
  const recorded = snapshot && typeof snapshot === 'object' && snapshot.trade_management && typeof snapshot.trade_management === 'object'
    ? snapshot.trade_management as Partial<TradeManagementPlan>
    : null;
  const strategy = String(signal.strategy_name ?? 'SignalMode');
  const market = String(signal.market_type ?? '').toLowerCase();
  const isForex = market === 'forex';
  const riskPct = Number(signal.recommended_risk_pct);
  const riskText = Number.isFinite(riskPct)
    ? `Keep position risk near ${riskPct.toFixed(2)}% of account unless your plan is lower.`
    : 'Default guidance: risk no more than 0.50% of account per signal.';
  const levMin = Number(signal.suggested_leverage_min);
  const levMax = Number(signal.suggested_leverage_max);
  const exposureText = isForex
    ? 'Use effective exposure / lot size that keeps loss at the planned risk; account for spread and slippage.'
    : Number.isFinite(levMin) && Number.isFinite(levMax)
      ? `Effective leverage guidance: ${levMin.toFixed(0)}x–${levMax.toFixed(0)}x maximum only if stop-risk stays within plan.`
      : 'Use effective leverage only if stop-risk stays within the planned account risk.';

  let defaults: TradeManagementPlan;
  const stratLower = strategy.toLowerCase();

  if (stratLower.includes('scalp') || stratLower.includes('micro')) {
    defaults = {
      tp1PartialPct: 50,
      breakEvenRule: 'Move stop to break-even after TP1 is tagged or price reaches roughly +0.75R to +1R.',
      trailingStopRule: 'After TP1, trail tightly behind the latest micro swing or fast EMA; do not widen the stop.',
      timeStopRule: 'Expire quickly if entry is not triggered or momentum stalls within the expected scalping window.',
      invalidationNote: 'Invalid if price closes beyond the stop or momentum immediately reverses through the entry zone.',
      strategyNote: 'Scalper profile: take faster TP1, reduce exposure on correlated stacked signals, and avoid chasing late entries.',
      riskGuidance: riskText,
      exposureGuidance: exposureText,
      signalOnlyWarning: 'Signal guidance only — no broker, MT5, or order execution is performed.',
    };
  } else if (stratLower.includes('compression') || stratLower.includes('breakout') || stratLower.includes('orb')) {
    defaults = {
      tp1PartialPct: 40,
      breakEvenRule: 'Move stop to break-even after TP1 or after breakout acceptance/retest confirmation.',
      trailingStopRule: 'Trail only after volatility expands; allow normal retest room before tightening.',
      timeStopRule: 'Expire if breakout follow-through does not arrive within the expected bars/time for this timeframe.',
      invalidationNote: 'Watch for fakeouts: invalid if price closes back inside the compression box or beyond the stop.',
      strategyNote: 'Breakout profile: allow retest room, avoid early stop tightening, and require momentum expansion for runners.',
      riskGuidance: riskText,
      exposureGuidance: exposureText,
      signalOnlyWarning: 'Signal guidance only — no broker, MT5, or order execution is performed.',
    };
  } else if (stratLower.includes('swing') || stratLower.includes('continuation') || stratLower.includes('pullback')) {
    defaults = {
      tp1PartialPct: 35,
      breakEvenRule: 'Move stop to break-even more slowly: after TP1 confirms or trend structure advances in your favor.',
      trailingStopRule: 'Use wider trailing behind higher-timeframe swing structure; keep TP2 as the runner target.',
      timeStopRule: 'Use a longer time stop than scalps; expire if continuation does not develop within the swing window.',
      invalidationNote: 'Invalid if trend structure fails, key pullback level breaks, or price closes beyond the stop.',
      strategyNote: 'Swing continuation profile: wider hold, slower break-even, and TP2 runner logic are preferred.',
      riskGuidance: riskText,
      exposureGuidance: exposureText,
      signalOnlyWarning: 'Signal guidance only — no broker, MT5, or order execution is performed.',
    };
  } else if (stratLower.includes('reversal') || stratLower.includes('exhaustion')) {
    defaults = {
      tp1PartialPct: 50,
      breakEvenRule: 'Move stop to break-even promptly after first impulsive reaction from the exhaustion level.',
      trailingStopRule: 'Trail behind intermediate pivot structure; lock gains as mean reversion completes.',
      timeStopRule: 'Expire if price grinds past the exhaustion level without sharp reversal momentum.',
      invalidationNote: 'Invalid if trend continuation breaks the structural exhaustion sweep high/low.',
      strategyNote: 'Reversal exhaustion profile: swift profit taking at mean, tight risk boundary at sweep extreme.',
      riskGuidance: riskText,
      exposureGuidance: exposureText,
      signalOnlyWarning: 'Signal guidance only — no broker, MT5, or order execution is performed.',
    };
  } else if (stratLower.includes('yield') || stratLower.includes('macro')) {
    defaults = {
      tp1PartialPct: 30,
      breakEvenRule: 'Move stop to break-even after macroeconomic rate differentials establish multi-session drift.',
      trailingStopRule: 'Trail behind 4H / Daily swing points aligned with rate divergence.',
      timeStopRule: 'Hold across session cycles; exit if central bank commentary or bond spreads reverse.',
      invalidationNote: 'Invalid if 2Y bond yield spreads compress below key divergence threshold.',
      strategyNote: 'Macro yield differential profile: fundamental catalyst holding structure with extended runners.',
      riskGuidance: riskText,
      exposureGuidance: exposureText,
      signalOnlyWarning: 'Signal guidance only — no broker, MT5, or order execution is performed.',
    };
  } else {
    defaults = {
      tp1PartialPct: 40,
      breakEvenRule: 'Consider break-even only after TP1 or clear confirmation in your favor.',
      trailingStopRule: 'Trail only after meaningful follow-through; never widen the original stop.',
      timeStopRule: 'Expire if the setup does not trigger or follow through within your plan.',
      invalidationNote: signal.invalidation || 'Invalid if price closes beyond the stop loss.',
      strategyNote: `Manage according to ${title(strategy)} signal-mode rules.`,
      riskGuidance: riskText,
      exposureGuidance: exposureText,
      signalOnlyWarning: 'Signal guidance only — no broker, MT5, or order execution is performed.',
    };
  }

  return { ...defaults, ...recorded };
}
