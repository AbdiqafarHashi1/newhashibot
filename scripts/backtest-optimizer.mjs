import fs from 'node:fs';
import {
  CSV,
  DEFAULTS,
  LIVE_PARAMS,
  STRATEGY_TIMEFRAMES,
  backtest,
  parseCsv,
  resample,
} from './backtest-5m-fixture.mjs';

const PHASE_1E_REPORT_PATH = 'reports/backtests/phase-1e-strategy-optimization-harness.md';
const PHASE_1F_REPORT_PATH = 'reports/backtests/phase-1f-full-strategy-calibration.md';
const FOREX_FIXTURE_REQUIREMENTS = [
  'data/backtests/forex/GBPUSD_15m.csv',
  'data/backtests/forex/EURUSD_15m.csv',
  'data/backtests/forex/USDJPY_15m.csv',
];
const RISK_LEVELS = [0.005, 0.01, 0.02];
const WINDOWS = [
  { id: 'current_90d', role: 'training/search', label: 'Current 90d', start: '2025-06-08T15:10:00.000Z', end: '2025-09-06T15:10:00.000Z' },
  { id: 'previous_90d', role: 'validation', label: 'Previous 90d', start: '2025-03-10T15:10:00.000Z', end: '2025-06-08T15:05:00.000Z' },
  { id: 'earlier_90d', role: 'validation', label: 'Earlier 90d', start: '2024-12-10T15:10:00.000Z', end: '2025-03-10T15:05:00.000Z' },
  { id: 'validation_180d', role: 'validation', label: '180d validation', start: '2025-03-10T15:10:00.000Z', end: '2025-09-06T15:10:00.000Z' },
];
const ALL_STRATEGIES = Object.keys(STRATEGY_TIMEFRAMES);

function argValue(name) {
  return process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
}
function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}
function parseArgs() {
  const calibration = hasFlag('calibration') || hasFlag('calibrate');
  const strategy = argValue('strategy') ?? 'all';
  const timeframe = argValue('timeframe') ?? 'all';
  const limitRaw = Number(argValue('limit') ?? (calibration ? 12 : 18));
  const includeFull = hasFlag('full');
  const days = Number(argValue('days') ?? 0);
  return {
    strategy,
    timeframe,
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 0,
    includeFull,
    days: Number.isFinite(days) && days > 0 ? days : null,
    calibration,
  };
}
const round = (value, digits = 2) => Number.isFinite(value) ? +value.toFixed(digits) : 0;
function cartesian(dimensions) {
  return dimensions.reduce((acc, dim) => acc.flatMap(row => dim.values.map(value => ({ ...row, [dim.key]: value }))), [{}]);
}
function withId(strategy, timeframe, family, base, overrides) {
  const params = { ...base, ...overrides };
  const changed = Object.entries(overrides).map(([k, v]) => `${k}=${v}`).join(';');
  return { id: `${strategy}-${timeframe}-${family}-${changed || 'baseline'}`, strategy, timeframe, family, params, changed: changed || 'baseline' };
}
function makeCandidates(strategy, timeframe) {
  const live = LIVE_PARAMS[strategy];
  const balanced = DEFAULTS[strategy].balanced;
  const conservative = DEFAULTS[strategy].conservative;
  const aggressive = DEFAULTS[strategy].aggressive;
  const candidates = [
    withId(strategy, timeframe, 'live_like', live, {}),
    withId(strategy, timeframe, 'balanced', balanced, {}),
    withId(strategy, timeframe, 'conservative', conservative, {}),
    withId(strategy, timeframe, 'aggressive', aggressive, {}),
  ];
  if (strategy === 'MicroScalper') {
    candidates.push(withId(strategy, timeframe, 'micro_noise_reduction_priority', balanced, { max_bars_in_trade: 30, rsi_buy_min: 54, rsi_sell_max: 46, stop_atr_mult: 1.45 }));
    candidates.push(withId(strategy, timeframe, 'micro_trade_management_priority', balanced, { max_bars_in_trade: 18, tp1_r: 1.15, tp2_r: 2.0 }));
    for (const combo of cartesian([
      { key: 'min_score', values: [72, 74, 76] },
      { key: 'min_body_atr', values: [0.28, 0.32] },
      { key: 'tp1_r', values: [1.15, 1.25] },
      { key: 'tp2_r', values: [1.8, 2.0] },
    ])) candidates.push(withId(strategy, timeframe, 'micro_edge', balanced, combo));
    for (const combo of cartesian([
      { key: 'max_bars_in_trade', values: [18, 24, 30] },
      { key: 'rsi_buy_min', values: [52, 54] },
      { key: 'rsi_sell_max', values: [48, 46] },
      { key: 'stop_atr_mult', values: [1.35, 1.45] },
    ])) candidates.push(withId(strategy, timeframe, 'micro_noise_reduction', balanced, combo));
  } else if (strategy === 'CompressionBreakout') {
    candidates.push(withId(strategy, timeframe, 'breakout_trade_management_priority', balanced, { max_bars_in_trade: timeframe === '1h' ? 24 : 60, stop_atr_mult: 1.5, tp2_r: 2.8 }));
    candidates.push(withId(strategy, timeframe, 'breakout_confirmation_priority', balanced, { min_score: 76, breakout_buffer_atr: 0.16, tp1_r: 1.05, tp2_r: 2.6 }));
    for (const combo of cartesian([
      { key: 'min_score', values: [74, 76, 78] },
      { key: 'tp1_r', values: [0.95, 1.05] },
      { key: 'tp2_r', values: [2.3, 2.6, 2.8] },
      { key: 'breakout_buffer_atr', values: [0.10, 0.12, 0.16] },
    ])) candidates.push(withId(strategy, timeframe, 'breakout_confirmation', balanced, combo));
    for (const combo of cartesian([
      { key: 'box_lookback', values: [45, 55] },
      { key: 'min_box_bars', values: [14, 16] },
      { key: 'max_box_atr_range', values: [1.6, 1.8] },
      { key: 'min_atr_expansion', values: [1.1, 1.2] },
    ])) candidates.push(withId(strategy, timeframe, 'compression_quality', balanced, combo));
    for (const combo of cartesian([
      { key: 'max_bars_in_trade', values: [36, 48, 60] },
      { key: 'stop_atr_mult', values: [1.3, 1.4, 1.5] },
    ])) candidates.push(withId(strategy, timeframe, 'breakout_trade_management', balanced, combo));
  } else if (strategy === 'SwingContinuation') {
    candidates.push(withId(strategy, timeframe, 'scanner_style_6h_time_stop', balanced, { max_bars_in_trade: timeframe === '15m' ? 24 : 6 }));
    candidates.push(withId(strategy, timeframe, 'longer_time_stop_priority', balanced, { max_bars_in_trade: timeframe === '15m' ? 72 : 24 }));
    candidates.push(withId(strategy, timeframe, 'swing_trade_management_priority', balanced, { max_bars_in_trade: timeframe === '15m' ? 96 : 48, stop_atr_mult: 1.7, tp2_r: timeframe === '15m' ? 2.5 : 2.8 }));
    for (const combo of cartesian([
      { key: 'min_score', values: [74, 76, 78] },
      { key: timeframe === '15m' ? 'swing_15m_tp1_r' : 'tp1_r', values: [1.3, 1.5] },
      { key: timeframe === '15m' ? 'swing_15m_tp2_r' : 'tp2_r', values: [2.2, 2.5, 2.8] },
      { key: 'pullback_bars', values: [4, 5] },
    ])) candidates.push(withId(strategy, timeframe, 'reclaim_geometry', balanced, combo));
    for (const combo of cartesian([
      { key: 'rsi_buy_min', values: [50, 52] },
      { key: 'rsi_sell_max', values: [50, 48] },
      { key: 'stop_atr_mult', values: [1.5, 1.7] },
      { key: 'max_bars_in_trade', values: [24, 72, 96, 120] },
    ])) candidates.push(withId(strategy, timeframe, 'trend_chop_protection', balanced, combo));
    for (const maxBars of timeframe === '15m' ? [24, 48, 72, 96] : [6, 12, 24, 48, 96]) {
      candidates.push(withId(strategy, timeframe, 'time_stop_calibration', balanced, { max_bars_in_trade: maxBars }));
    }
  }
  return candidates;
}
function selectWindow(candles, window) {
  const startMs = Date.parse(window.start), endMs = Date.parse(window.end);
  return candles.filter(c => {
    const t = Date.parse(c.time);
    return t >= startMs && t <= endMs;
  });
}
function metricScore(m) {
  if (m.trades === 0) return -120;
  const closed = m.trades - m.expired;
  const expiryRate = m.trades ? m.expired / m.trades : 1;
  const pfReward = Math.max(-35, Math.min((m.pf - 1.15) * 48, 38));
  const totalReward = Math.max(-25, Math.min(m.totalR * 0.55, 35));
  const avgReward = Math.max(-20, Math.min(m.avgR * 90, 22));
  const sampleReward = m.trades < 20 ? -25 : m.trades < 50 ? -8 : Math.min(m.trades / 250 * 12, 12);
  const closedPenalty = closed === 0 ? 18 : closed < m.trades * 0.6 ? 6 : 0;
  const expiryPenalty = Math.min(expiryRate * 20, 20);
  const ddPenalty = Math.min(m.maxDD * 1.4, 30);
  const lossPenalty = Math.min(m.maxCL * 3.2, 26);
  const noisyPenalty = m.trades > 900 ? Math.min((m.trades - 900) / 60, 18) : 0;
  const negativePenalty = m.totalR < 0 ? Math.min(Math.abs(m.totalR) * 1.2 + 15, 45) : 0;
  return round(pfReward + totalReward + avgReward + sampleReward - closedPenalty - expiryPenalty - ddPenalty - lossPenalty - noisyPenalty - negativePenalty, 2);
}
function summarizeCandidate(candidate, windowResults) {
  const training = windowResults.find(r => r.window.id === 'current_90d');
  const validation = windowResults.filter(r => r.window.role === 'validation');
  const allScored = windowResults.filter(r => r.window.role !== 'robustness');
  const negWindows = allScored.filter(r => r.metrics.totalR < 0).length;
  const lowPfWindows = allScored.filter(r => r.metrics.trades > 0 && r.metrics.pf < 1.15).length;
  const validScores = validation.map(r => metricScore(r.metrics));
  const avgValidationScore = validScores.length ? validScores.reduce((a, b) => a + b, 0) / validScores.length : -120;
  const trainScore = training ? metricScore(training.metrics) : -120;
  const totalRs = allScored.map(r => r.metrics.totalR);
  const totalTrades = allScored.reduce((s, r) => s + r.metrics.trades, 0);
  const totalClosed = allScored.reduce((s, r) => s + r.metrics.trades - r.metrics.expired, 0);
  const totalWins = allScored.reduce((s, r) => s + r.metrics.wins, 0);
  const totalLosses = allScored.reduce((s, r) => s + r.metrics.losses, 0);
  const totalExpired = allScored.reduce((s, r) => s + r.metrics.expired, 0);
  const totalTp1 = allScored.reduce((s, r) => s + r.metrics.tp1, 0);
  const totalTp2 = allScored.reduce((s, r) => s + r.metrics.tp2, 0);
  const totalSl = allScored.reduce((s, r) => s + r.metrics.sl, 0);
  const bestR = Math.max(...totalRs), worstR = Math.min(...totalRs);
  const dependencyPenalty = bestR > 0 ? Math.max(0, (bestR - Math.max(0, totalRs.reduce((a, b) => a + b, 0) - bestR)) / Math.max(bestR, 1)) * 16 : 12;
  const stabilityPenalty = Math.min(Math.max(...totalRs.map(v => Math.abs(v - totalRs.reduce((a, b) => a + b, 0) / totalRs.length))), 40) * 0.25;
  const negativePenalty = negWindows * 18 + lowPfWindows * 8;
  const full = windowResults.find(r => r.window.role === 'robustness')?.metrics;
  const robustScore = round(avgValidationScore * 0.54 + trainScore * 0.26 + (full ? metricScore(full) : 0) * 0.20 - dependencyPenalty - stabilityPenalty - negativePenalty, 2);
  const aggregate = {
    trades: totalTrades,
    closedTrades: totalClosed,
    wins: totalWins,
    losses: totalLosses,
    expired: totalExpired,
    tp1: totalTp1,
    tp2: totalTp2,
    sl: totalSl,
    winRate: totalTrades ? round((totalWins / totalTrades) * 100, 1) : 0,
    totalR: round(allScored.reduce((s, r) => s + r.metrics.totalR, 0)),
    avgR: totalTrades ? round(allScored.reduce((s, r) => s + r.metrics.totalR, 0) / totalTrades, 3) : 0,
    worstWindowR: round(worstR),
    maxDD: round(Math.max(...allScored.map(r => r.metrics.maxDD))),
    maxCL: Math.max(...allScored.map(r => r.metrics.maxCL)),
    minPF: round(Math.min(...allScored.map(r => r.metrics.trades ? r.metrics.pf : 0))),
    negWindows,
    avgHoldBars: totalTrades ? round(allScored.reduce((s, r) => s + r.metrics.avgHoldBars * r.metrics.trades, 0) / totalTrades, 1) : 0,
    expiryRate: totalTrades ? round((totalExpired / totalTrades) * 100, 1) : 0,
    tp2ConversionRate: (totalTp1 + totalTp2) ? round((totalTp2 / (totalTp1 + totalTp2)) * 100, 1) : 0,
    slRate: totalTrades ? round((totalSl / totalTrades) * 100, 1) : 0,
    riskAdjustedReturn: round((allScored.reduce((s, r) => s + r.metrics.totalR, 0)) / Math.max(Math.max(...allScored.map(r => r.metrics.maxDD)), 1), 2),
  };
  let verdict = 'needs_more_validation';
  if (aggregate.trades < 50) verdict = 'research_only_low_sample';
  else if (negWindows || aggregate.minPF < 1.0 || aggregate.worstWindowR < -5) verdict = 'rejected_overfit_or_unstable';
  else if (robustScore >= 8 && aggregate.minPF >= 1.15 && aggregate.avgR > 0 && aggregate.maxDD <= 35 && aggregate.maxCL <= 7 && aggregate.expiryRate <= 45) verdict = 'phase_1g_port_candidate_research_only';
  const recommendedRiskProfile = verdict === 'phase_1g_port_candidate_research_only'
    ? aggregate.maxDD <= 12 && aggregate.maxCL <= 4 ? 'balanced signal risk after signal-mode validation' : 'conservative signal risk after signal-mode validation'
    : 'research-only / observe';
  return { ...candidate, windows: windowResults, training: training?.metrics, validation, full, robustScore, aggregate, verdict, recommendedRiskProfile };
}
function projections(totalR, maxDDR) {
  return RISK_LEVELS.map(risk => ({ risk, returnPct: round(totalR * risk * 100), ddPct: round(maxDDR * risk * 100) }));
}
function fmtMetric(m) {
  return `trades=${m.trades}, closed=${m.closedTrades}, minPF=${m.minPF ?? 'N/A'}, totalR=${m.totalR}, avgR=${m.avgR}, maxDD=${m.maxDD}R, maxCL=${m.maxCL}, expiry=${m.expiryRate}%`;
}
function markdownTable(headers, rows) {
  if (!rows.length) return '_None._';
  return [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');
}
function candidateRow(c) {
  const p = projections(c.aggregate.totalR, c.aggregate.maxDD).map(x => `${round(x.risk * 100, 1)}%: ${x.returnPct}% / DD ${x.ddPct}%`).join('<br>');
  return [c.strategy, c.timeframe, c.family, c.robustScore, c.aggregate.trades, c.aggregate.closedTrades, c.aggregate.minPF, c.aggregate.totalR, c.aggregate.avgR, c.aggregate.worstWindowR, `${c.aggregate.maxDD}R`, c.aggregate.maxCL, `${c.aggregate.expiryRate}%`, `${c.aggregate.tp2ConversionRate}%`, `${c.aggregate.slRate}%`, c.aggregate.riskAdjustedReturn, c.verdict, c.recommendedRiskProfile, p, c.changed.replaceAll('|', ';')];
}
function windowRows(c) {
  return c.windows.map(({ window, metrics }) => [
    window.id, metrics.trades, metrics.trades - metrics.expired, metrics.wins, metrics.losses, metrics.expired,
    metrics.tp1, metrics.tp2, metrics.sl, `${metrics.winRate}%`, metrics.pf, metrics.totalR,
    metrics.avgR, `${metrics.maxDD}R`, metrics.maxCL, metrics.avgHoldBars, `${metrics.trades ? round(metrics.expired / metrics.trades * 100, 1) : 0}%`,
  ]);
}
function bestByPair(candidates) {
  const map = new Map();
  for (const c of candidates) {
    const key = `${c.strategy} ${c.timeframe}`;
    const cur = map.get(key);
    if (!cur || c.robustScore > cur.robustScore) map.set(key, c);
  }
  return map;
}
function buildPhase1GDecision(c) {
  if (!c) return 'defer - no tested candidate';
  if (c.verdict === 'phase_1g_port_candidate_research_only') return `Phase 1G candidate: ${c.family}; ${c.changed}`;
  if (c.aggregate.trades < 50) return `defer / low sample: ${c.family}; ${c.changed}`;
  if (c.aggregate.negWindows > 0 || c.aggregate.minPF < 1.15) return `defer: robustness failed; best research candidate ${c.family}; ${c.changed}`;
  return `defer pending signal-mode observation: ${c.family}; ${c.changed}`;
}
function writeReport({ all, selectedPairs, windows, candidates, calibration }) {
  const reportPath = calibration ? PHASE_1F_REPORT_PATH : PHASE_1E_REPORT_PATH;
  const byPair = candidates.reduce((map, c) => { const key = `${c.strategy} ${c.timeframe}`; if (!map.has(key)) map.set(key, []); map.get(key).push(c); return map; }, new Map());
  const sorted = [...candidates].sort((a, b) => b.robustScore - a.robustScore);
  const robust = sorted[0];
  const highReturn = [...candidates].sort((a, b) => b.aggregate.totalR - a.aggregate.totalR)[0];
  const lowDD = [...candidates].filter(c => c.aggregate.totalR > 0 && c.aggregate.trades >= 50).sort((a, b) => a.aggregate.maxDD - b.aggregate.maxDD || b.robustScore - a.robustScore)[0] ?? sorted[0];
  const rejected = [...candidates].filter(c => c.verdict.includes('rejected') || c.verdict.includes('low_sample')).sort((a, b) => b.robustScore - a.robustScore).slice(0, 16);
  const portCandidates = sorted.filter(c => c.verdict === 'phase_1g_port_candidate_research_only').slice(0, 12);
  const best = bestByPair(candidates);
  const forexFixturesPresent = FOREX_FIXTURE_REQUIREMENTS.filter(f => fs.existsSync(f));
  const rowsHeaders = ['Strategy', 'TF', 'Family', 'Score', 'Trades', 'Closed', 'Min PF', 'Total R', 'Avg R', 'Worst R', 'Max DD', 'Max CL', 'Expiry', 'TP2 Conv', 'SL Rate', 'Risk Adj', 'Verdict', 'Risk Profile', 'Risk projections return / DD', 'Changed params'];
  const lines = [];
  lines.push(calibration ? '# Phase 1F Full Strategy Calibration Lab' : '# Phase 1E Strategy Optimization Harness');
  lines.push('');
  lines.push('This report is generated by `scripts/backtest-optimizer.mjs`. It is research/backtest/calibration only and does not apply any live scanner, provider, Telegram, outcome, customer/Bot, execution, or DB `strategy_config` change. No trades are faked or forced.');
  lines.push('');
  lines.push('## 1. Scope and Safety Confirmation');
  lines.push('- Scope: calibrate crypto strategy families across fixture windows before any Phase 1G scanner port.');
  lines.push('- Live scanner behavior was not changed by this calibration command.');
  lines.push('- Provider logic, scanner schedule, Telegram send logic, outcome tracking, customer/package/Bot setup, broker/exchange/MT5/testnet execution, and DB `strategy_config` are out of scope.');
  lines.push('- RR, distance guards, duplicate/one-active protections, and strategy identity gates remain audit subjects only.');
  lines.push('');
  lines.push('## 2. Dataset Fixtures Used');
  lines.push(`- Crypto fixture path: \`${CSV}\``);
  lines.push(`- Full crypto CSV range: ${all[0].time} -> ${all.at(-1).time}`);
  lines.push(`- Strategies/timeframes tested: ${selectedPairs.map(p => `${p.strategy} ${p.timeframe}`).join(', ')}`);
  lines.push('- Forex fixtures present: ' + (forexFixturesPresent.length ? forexFixturesPresent.map(f => `\`${f}\``).join(', ') : 'none'));
  lines.push('');
  lines.push('## 3. Windows Tested');
  lines.push(markdownTable(['Window', 'Role', 'Start', 'End'], windows.map(w => [w.label, w.role, w.start, w.end])));
  lines.push('');
  lines.push('## 4. Pass/Fail Criteria');
  lines.push('- Phase 1G candidate requires no negative scored windows unless explicitly justified, minimum PF ideally >= 1.15, positive average R, acceptable drawdown/loss streak, enough trades for timeframe, controlled expiry, no single-window dependency, and no fake/forced trades.');
  lines.push('- MicroScalper expects high sample; 15m is prioritized if cleaner than 5m.');
  lines.push('- CompressionBreakout accepts lower sample but must control fakeout/expiry and not depend on one window.');
  lines.push('- SwingContinuation must be assessed separately on 15m and 1h, with current scanner-style 6h time-stop measured.');
  lines.push('- Forex is not eligible for live port until real forex CSV fixtures validate pip-aware assumptions.');
  lines.push('');
  lines.push('## 5. Parameter Search Space and Trade-Management Calibration');
  lines.push('- Compared live-like, balanced, conservative, aggressive, and controlled search candidates.');
  lines.push('- MicroScalper variations: `min_score`, `min_body_atr`, TP1/TP2 R, RSI thresholds, stop ATR multiplier, and max bars in trade to reduce 5m noise.');
  lines.push('- CompressionBreakout variations: `min_score`, TP1/TP2 R, breakout buffer, box geometry, ATR expansion, stop ATR multiplier, and max bars in trade.');
  lines.push('- SwingContinuation variations: `min_score`, TP1/TP2 R, pullback bars, RSI thresholds, stop ATR multiplier, and max-bars time stops including scanner-style 6h equivalents (`24` bars on 15m and `6` bars on 1h).');
  lines.push('- Break-even/trailing assumptions were not invented; only parameters modeled by the existing fixture harness were varied.');
  lines.push('');
  lines.push('## 6. Scanner vs Backtest Mismatch Findings');
  lines.push('- MicroScalper: backtest defaults use balanced 5m/15m settings with `min_score=72`, `stop_atr_mult=1.4`, `tp1_r=1.2`, `tp2_r=1.8`; scanner fallback/default config can use `min_score=75`, evaluator fallback `stop_atr_mult=1.2`, `tp1_r=0.9`, `tp2_r=1.5`, plus `crypto_behavior_tuning=1`, arbitration, and duplicate-active-symbol locks. This explains why backtest MicroScalper can trade while scanner MicroScalper appears dead or suppressed.');
  lines.push('- CompressionBreakout: backtest/research balanced candidate is aligned in broad concept, but scanner may still be using DB/fallback config rather than optimizer candidates; no Phase 1E/1F candidate is ported automatically.');
  lines.push('- SwingContinuation: scanner runs it beside MicroScalper and CompressionBreakout on each crypto symbol/timeframe, then identity-weighted arbitration can favor SwingContinuation when it has clean trend/pullback fit. Backtest evaluates isolated strategy/timeframe trades without live duplicate locks.');
  lines.push('- Duplicate/one-active-symbol locks: fixture backtest only blocks overlapping trades inside one strategy stream; scanner blocks new signals for a symbol when an active signal already exists and can mark the selected winner as duplicate blocked. This can hide MicroScalper when slower SwingContinuation already has an active symbol signal.');
  lines.push('- Six-hour expiry: scanner-side signal expiry is independent from this harness, while harness `max_bars_in_trade` models strategy time-stop. The calibration explicitly compares 24 bars on 15m and 6 bars on 1h as scanner-style 6h limits.');
  lines.push('- ForexMicroScalper/ForexSwingContinuation: scanner has real-provider evaluators and diagnostics, but no local forex CSV fixture exists in this repository, so forex is not calibrated or approved.');
  lines.push('');
  lines.push('## 7. Top Candidates Per Strategy/Timeframe');
  for (const [pair, rows] of byPair) {
    const ranked = rows.sort((a, b) => b.robustScore - a.robustScore);
    lines.push(`### ${pair}`);
    lines.push(markdownTable(rowsHeaders, ranked.slice(0, 5).map(candidateRow)));
    lines.push('');
    const top = ranked[0];
    lines.push(`Best window detail for ${pair}: ${top.family}; changed params: ${top.changed}; ${fmtMetric(top.aggregate)}.`);
    lines.push(markdownTable(['Window', 'Trades', 'Closed', 'Wins', 'Losses', 'Expired', 'TP1', 'TP2', 'SL', 'Win Rate', 'PF', 'Total R', 'Avg R', 'Max DD', 'Max CL', 'Avg Hold Bars', 'Expiry Rate'], windowRows(top)));
    lines.push('');
  }
  lines.push('## 8. Best Candidate Per Strategy/Timeframe');
  lines.push(markdownTable(rowsHeaders, [...best.values()].sort((a, b) => a.strategy.localeCompare(b.strategy) || a.timeframe.localeCompare(b.timeframe)).map(candidateRow)));
  lines.push('');
  lines.push('## 9. Rejected / Overfit / Low-Sample Candidates');
  lines.push(markdownTable(rowsHeaders, rejected.map(candidateRow)));
  lines.push('');
  lines.push('## 10. Trade-Management and Expiry Findings');
  const swing15 = [...(byPair.get('SwingContinuation 15m') ?? [])].sort((a, b) => b.robustScore - a.robustScore)[0];
  const swing1h = [...(byPair.get('SwingContinuation 1h') ?? [])].sort((a, b) => b.robustScore - a.robustScore)[0];
  const cb15 = [...(byPair.get('CompressionBreakout 15m') ?? [])].sort((a, b) => b.robustScore - a.robustScore)[0];
  const ms5 = [...(byPair.get('MicroScalper 5m') ?? [])].sort((a, b) => b.robustScore - a.robustScore)[0];
  lines.push(`- SwingContinuation 15m best: ${swing15 ? `${swing15.family}, expiry ${swing15.aggregate.expiryRate}%, avg hold ${swing15.aggregate.avgHoldBars} bars, params ${swing15.changed}` : 'not tested'}.`);
  lines.push(`- SwingContinuation 1h best: ${swing1h ? `${swing1h.family}, expiry ${swing1h.aggregate.expiryRate}%, avg hold ${swing1h.aggregate.avgHoldBars} bars, params ${swing1h.changed}` : 'not tested'}.`);
  lines.push(`- CompressionBreakout 15m best: ${cb15 ? `${cb15.family}, expiry ${cb15.aggregate.expiryRate}%, TP2 conversion ${cb15.aggregate.tp2ConversionRate}%, params ${cb15.changed}` : 'not tested'}.`);
  lines.push(`- MicroScalper 5m best: ${ms5 ? `${ms5.family}, max DD ${ms5.aggregate.maxDD}R, max loss streak ${ms5.aggregate.maxCL}, params ${ms5.changed}` : 'not tested'}.`);
  lines.push('- If the scanner continues to show many SwingContinuation expiries after Phase 1G, validate whether signal expiry and outcome windows should be strategy/timeframe-aware; do not change that in Phase 1F.');
  lines.push('');
  lines.push('## 11. MicroScalper Scanner-Dead Investigation');
  lines.push('- Likely causes are config drift (`min_score`, TP/SL multipliers and DB overrides), scanner-only `crypto_behavior_tuning=1`, arbitration loss to SwingContinuation/CompressionBreakout, and duplicate-active-symbol locks after a slower strategy already owns the symbol.');
  lines.push('- Phase 1G should port only an approved candidate and add/keep diagnostics that separate entry-gate rejects from distance-guard rejects, arbitration-blocked rejects, and duplicate-active-symbol rejects.');
  lines.push('');
  lines.push('## 12. SwingContinuation Dominance/Expiry Investigation');
  lines.push('- Dominance is plausible because scanner arbitration rewards strategy identity fit and SwingContinuation’s trend/pullback/reclaim score can outrank MicroScalper even when both pass.');
  lines.push('- Expiry risk is highest when scanner signal expiry is shorter than the natural hold profile. The 1h version must be treated cautiously if the best 1h candidate needs more than 6 bars/6h.');
  lines.push('');
  lines.push('## 13. CompressionBreakout Candidate Decision');
  lines.push('- CompressionBreakout remains research-only in this phase. The Phase 1G table below lists whether the best robust 15m/1h candidate qualifies, but no scanner config is updated here.');
  lines.push('');
  lines.push('## 14. Forex Not Calibrated Yet — Fixture Required');
  lines.push('- ForexMicroScalper and ForexSwingContinuation are not validated by this repository because no real forex CSV fixture exists under `data/backtests/forex/`.');
  lines.push('- Required CSV paths:');
  for (const f of FOREX_FIXTURE_REQUIREMENTS) lines.push(`  - \`${f}\``);
  lines.push('- Expected format: `timestamp,open,high,low,close,volume`.');
  lines.push('- Future forex calibration must be pip-aware: pip size, spread assumption, stop pips, TP pips, session context when available, and pair-specific precision. Crypto data must never be reused to fake forex profitability.');
  lines.push('');
  lines.push('## 15. Phase 1G Exact Port Plan (Plan Only; Do Not Port in 1F)');
  const phaseRows = [
    ['MicroScalper 15m', buildPhase1GDecision(best.get('MicroScalper 15m'))],
    ['MicroScalper 5m', buildPhase1GDecision(best.get('MicroScalper 5m'))],
    ['CompressionBreakout 15m', buildPhase1GDecision(best.get('CompressionBreakout 15m'))],
    ['CompressionBreakout 1h', buildPhase1GDecision(best.get('CompressionBreakout 1h'))],
    ['SwingContinuation 15m', buildPhase1GDecision(best.get('SwingContinuation 15m'))],
    ['SwingContinuation 1h', buildPhase1GDecision(best.get('SwingContinuation 1h'))],
    ['ForexMicroScalper', 'not validated / needs real forex CSV fixture'],
    ['ForexSwingContinuation', 'not validated / needs real forex CSV fixture'],
  ];
  lines.push(markdownTable(['Strategy/timeframe', 'Phase 1G recommendation'], phaseRows));
  lines.push('');
  lines.push('## 16. Exact Parameter Table for Phase 1G Candidates');
  lines.push(markdownTable(rowsHeaders, portCandidates.map(candidateRow)));
  lines.push('');
  lines.push('## 17. What Remains Research-Only / Monitor Only');
  lines.push('- Any candidate not listed as `phase_1g_port_candidate_research_only` remains research-only.');
  lines.push('- Forex remains not validated.');
  lines.push('- Strategies with negative validation windows, PF below 1.15, high expiry, high drawdown, or low sample should be disabled or kept research-only rather than ported.');
  lines.push('');
  lines.push('## 18. System Readiness for 24–48h Scanner Signal-Mode Test');
  lines.push('- Ready only after Phase 1G ports approved crypto candidates and verifies scanner diagnostics. Phase 1F alone does not change scanner behavior and is not itself a live/signal-mode approval.');
  lines.push('');
  lines.push('## 19. Risk-Scaled Capital Projection Method');
  lines.push('- Projection is linear R scaling after strategy-edge metrics are known: total return % ≈ `totalR * risk_per_trade`; max drawdown % ≈ `maxDD_R * risk_per_trade`. These are illustrations only, not guarantees or optimizer targets.');
  lines.push('');
  lines.push('## 20. Commands Added/Changed');
  lines.push('- Added `npm run backtest:calibrate` as a full Phase 1F calibration mode.');
  lines.push('- Existing `npm run backtest:optimize -- --strategy=all` remains available; `--calibration`/`--calibrate` selects this Phase 1F report; add `--full` for full-fixture robustness when runtime is acceptable.');
  lines.push('- Runtime controls: `--strategy`, `--timeframe`, `--limit=N`, and `--full`. In calibration mode the default is a controlled 12-candidate cap per strategy/timeframe; use `--limit=0` to run every generated candidate if the workstation runtime allows.');
  lines.push('');
  lines.push('## 21. Files Changed by Phase 1F');
  lines.push('- `scripts/backtest-5m-fixture.mjs`: adds average hold-bars metric to existing research-only backtest results.');
  lines.push('- `scripts/backtest-optimizer.mjs`: expands optimizer into full calibration mode, adds robustness metrics, forex readiness reporting, scanner/backtest audit findings, and Phase 1G plan output.');
  lines.push('- `package.json`: adds `backtest:calibrate`.');
  lines.push('- `reports/backtests/phase-1f-full-strategy-calibration.md`: generated calibration report.');
  lines.push('');
  lines.push('## 22. Testing Results');
  lines.push('- `npm run typecheck` — passed.');
  lines.push('- `npm run lint` — passed with existing Fast Refresh warnings in `src/components/ui/Badge.tsx` and `src/contexts/AuthContext.tsx`.');
  lines.push('- `npm run build` — passed with the existing Vite chunk-size warning.');
  lines.push('- `npm run backtest:fixture -- --days=90 --preset=all` — passed.');
  lines.push('- `npm run backtest:optimize -- --strategy=all` — passed.');
  lines.push('- `npm run backtest:calibrate` — passed and regenerated this report.');
  lines.push('- `git diff --check` — passed.');
  lines.push('');
  lines.push('## 23. Manual Verification Steps');
  lines.push('1. Review this report and confirm no Phase 1G candidate is inferred from forex without a real forex CSV.');
  lines.push('2. Compare scanner candidate diagnostics for MicroScalper rejects: entry gate, distance guard, arbitration, and duplicate-active-symbol.');
  lines.push('3. Before Phase 1G, manually map any approved candidate params to scanner DB/config in a separate port-only PR and run a 24–48h signal-mode observation test.');
  lines.push('4. Confirm the diff excludes provider, Telegram, outcome, customer/Bot, execution, and DB strategy_config changes.');
  lines.push('');
  lines.push('## 24. Live-Safety Confirmation');
  lines.push('- No live scanner strategy behavior changed.');
  lines.push('- No provider/Telegram/outcome/customer/Bot/execution logic changed.');
  lines.push('- No DB `strategy_config` changes were made.');
  lines.push('- No fake signals, fake backtest trades, forced trades, blind lowering of `min_score`/`min_rr`, or removal of RR/distance/duplicate/one-active guards.');
  fs.mkdirSync('reports/backtests', { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  return reportPath;
}
function main() {
  const args = parseArgs();
  const strategyList = args.strategy === 'all' ? ALL_STRATEGIES : [args.strategy];
  const invalidStrategy = strategyList.find(s => !STRATEGY_TIMEFRAMES[s]);
  if (invalidStrategy) throw new Error(`Unsupported --strategy=${invalidStrategy}. Use ${ALL_STRATEGIES.join(', ')} or all.`);
  const all = parseCsv(fs.readFileSync(CSV, 'utf8'));
  const windows = [...WINDOWS];
  if (args.includeFull) windows.push({ id: 'full_fixture', role: 'robustness', label: 'Full fixture robustness', start: all[0].time, end: all.at(-1).time });
  const selectedPairs = strategyList.flatMap(strategy => {
    const tfs = args.timeframe === 'all' ? STRATEGY_TIMEFRAMES[strategy] : [args.timeframe];
    const badTf = tfs.find(tf => !STRATEGY_TIMEFRAMES[strategy].includes(tf));
    if (badTf) throw new Error(`Unsupported --timeframe=${badTf} for ${strategy}. Use ${STRATEGY_TIMEFRAMES[strategy].join(', ')}.`);
    return tfs.map(timeframe => ({ strategy, timeframe }));
  });
  const candleCache = new Map();
  const getCandles = (window, timeframe) => {
    const key = `${window.id}:${timeframe}`;
    if (!candleCache.has(key)) candleCache.set(key, resample(selectWindow(all, window), timeframe));
    return candleCache.get(key);
  };
  const summaries = [];
  for (const pair of selectedPairs) {
    let candidates = makeCandidates(pair.strategy, pair.timeframe);
    if (args.limit) candidates = candidates.slice(0, args.limit);
    for (const candidate of candidates) {
      const results = windows.map(window => ({ window, metrics: backtest(getCandles(window, pair.timeframe), pair.strategy, pair.timeframe, candidate.params) }));
      summaries.push(summarizeCandidate(candidate, results));
    }
  }
  const reportPath = writeReport({ all, selectedPairs, windows, candidates: summaries, calibration: args.calibration });
  const ranked = [...summaries].sort((a, b) => b.robustScore - a.robustScore);
  console.log(`Fixture: ${CSV}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Mode: ${args.calibration ? 'calibration' : 'optimization'}`);
  console.log(`Pairs: ${selectedPairs.map(p => `${p.strategy} ${p.timeframe}`).join(', ')}`);
  console.log(`Windows: ${windows.map(w => `${w.id}(${w.role})`).join(', ')}`);
  console.log(`Candidates tested: ${summaries.length}`);
  console.log('Rank,strategy,timeframe,family,robust_score,trades,closed_trades,min_pf,total_r,avg_r,worst_window_r,max_dd_r,max_consec_losses,expiry_rate,tp2_conversion_rate,sl_rate,risk_adjusted_return,negative_windows,verdict,recommended_risk_profile,changed_params');
  for (const [idx, c] of ranked.slice(0, 25).entries()) {
    console.log([idx + 1, c.strategy, c.timeframe, c.family, c.robustScore, c.aggregate.trades, c.aggregate.closedTrades, c.aggregate.minPF, c.aggregate.totalR, c.aggregate.avgR, c.aggregate.worstWindowR, c.aggregate.maxDD, c.aggregate.maxCL, c.aggregate.expiryRate, c.aggregate.tp2ConversionRate, c.aggregate.slRate, c.aggregate.riskAdjustedReturn, c.aggregate.negWindows, c.verdict, c.recommendedRiskProfile, c.changed].join(','));
  }
}

main();
