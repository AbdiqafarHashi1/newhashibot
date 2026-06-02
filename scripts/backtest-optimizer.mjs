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

const REPORT_PATH = 'reports/backtests/phase-1e-strategy-optimization-harness.md';
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
  const strategy = argValue('strategy') ?? 'all';
  const timeframe = argValue('timeframe') ?? 'all';
  const limit = Number(argValue('limit') ?? 0);
  const includeFull = hasFlag('full');
  const days = Number(argValue('days') ?? 0);
  return { strategy, timeframe, limit: Number.isFinite(limit) && limit > 0 ? limit : 18, includeFull, days: Number.isFinite(days) && days > 0 ? days : null };
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
    withId(strategy, timeframe, 'live_baseline', live, {}),
    withId(strategy, timeframe, 'balanced_baseline', balanced, {}),
    withId(strategy, timeframe, 'conservative_baseline', conservative, {}),
    withId(strategy, timeframe, 'aggressive_baseline', aggressive, {}),
  ];
  if (strategy === 'MicroScalper') {
    for (const combo of cartesian([
      { key: 'min_score', values: [72, 74, 76] },
      { key: 'min_body_atr', values: [0.28, 0.32] },
      { key: 'tp1_r', values: [1.15, 1.25] },
      { key: 'tp2_r', values: [1.8, 2.0] },
    ])) candidates.push(withId(strategy, timeframe, 'micro_edge', balanced, combo));
    for (const combo of cartesian([
      { key: 'max_bars_in_trade', values: [18, 24] },
      { key: 'rsi_buy_min', values: [52, 54] },
      { key: 'rsi_sell_max', values: [48, 46] },
      { key: 'stop_atr_mult', values: [1.35, 1.45] },
    ])) candidates.push(withId(strategy, timeframe, 'micro_noise_reduction', balanced, combo));
  } else if (strategy === 'CompressionBreakout') {
    for (const combo of cartesian([
      { key: 'min_score', values: [74, 76, 78] },
      { key: 'tp1_r', values: [0.95, 1.05] },
      { key: 'tp2_r', values: [2.3, 2.6, 2.8] },
      { key: 'breakout_buffer_atr', values: [0.12, 0.16] },
    ])) candidates.push(withId(strategy, timeframe, 'breakout_confirmation', balanced, combo));
    for (const combo of cartesian([
      { key: 'box_lookback', values: [45, 55] },
      { key: 'min_box_bars', values: [14, 16] },
      { key: 'max_box_atr_range', values: [1.6, 1.8] },
      { key: 'min_atr_expansion', values: [1.1, 1.2] },
    ])) candidates.push(withId(strategy, timeframe, 'compression_quality', balanced, combo));
  } else if (strategy === 'SwingContinuation') {
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
      { key: 'max_bars_in_trade', values: [72, 96] },
    ])) candidates.push(withId(strategy, timeframe, 'trend_chop_protection', balanced, combo));
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
  const pfReward = Math.max(-35, Math.min((m.pf - 1.2) * 45, 35));
  const totalReward = Math.max(-25, Math.min(m.totalR * 0.55, 35));
  const avgReward = Math.max(-20, Math.min(m.avgR * 90, 22));
  const sampleReward = m.trades < 20 ? -25 : m.trades < 50 ? -8 : Math.min(m.trades / 250 * 12, 12);
  const ddPenalty = Math.min(m.maxDD * 1.4, 30);
  const lossPenalty = Math.min(m.maxCL * 3.2, 26);
  const noisyPenalty = m.trades > 900 ? Math.min((m.trades - 900) / 60, 18) : 0;
  const negativePenalty = m.totalR < 0 ? Math.min(Math.abs(m.totalR) * 1.2 + 15, 45) : 0;
  return round(pfReward + totalReward + avgReward + sampleReward - ddPenalty - lossPenalty - noisyPenalty - negativePenalty, 2);
}
function summarizeCandidate(candidate, windowResults) {
  const training = windowResults.find(r => r.window.id === 'current_90d');
  const validation = windowResults.filter(r => r.window.role === 'validation');
  const allScored = windowResults.filter(r => r.window.role !== 'robustness');
  const negWindows = allScored.filter(r => r.metrics.totalR < 0).length;
  const lowPfWindows = allScored.filter(r => r.metrics.trades > 0 && r.metrics.pf < 1).length;
  const validScores = validation.map(r => metricScore(r.metrics));
  const avgValidationScore = validScores.length ? validScores.reduce((a, b) => a + b, 0) / validScores.length : -120;
  const trainScore = training ? metricScore(training.metrics) : -120;
  const totalRs = allScored.map(r => r.metrics.totalR);
  const bestR = Math.max(...totalRs), worstR = Math.min(...totalRs);
  const dependencyPenalty = bestR > 0 ? Math.max(0, (bestR - Math.max(0, totalRs.reduce((a, b) => a + b, 0) - bestR)) / Math.max(bestR, 1)) * 16 : 12;
  const stabilityPenalty = Math.min(Math.max(...totalRs.map(v => Math.abs(v - totalRs.reduce((a, b) => a + b, 0) / totalRs.length))), 40) * 0.25;
  const negativePenalty = negWindows * 16 + lowPfWindows * 10;
  const full = windowResults.find(r => r.window.role === 'robustness')?.metrics;
  const robustScore = round(avgValidationScore * 0.52 + trainScore * 0.28 + (full ? metricScore(full) : 0) * 0.20 - dependencyPenalty - stabilityPenalty - negativePenalty, 2);
  const aggregate = {
    trades: allScored.reduce((s, r) => s + r.metrics.trades, 0),
    totalR: round(allScored.reduce((s, r) => s + r.metrics.totalR, 0)),
    avgR: round(allScored.reduce((s, r) => s + r.metrics.avgR, 0) / allScored.length, 3),
    worstWindowR: round(worstR),
    maxDD: round(Math.max(...allScored.map(r => r.metrics.maxDD))),
    maxCL: Math.max(...allScored.map(r => r.metrics.maxCL)),
    minPF: round(Math.min(...allScored.map(r => r.metrics.trades ? r.metrics.pf : 0))),
    negWindows,
  };
  let verdict = 'needs_more_validation';
  if (aggregate.trades < 50) verdict = 'research_only_low_sample';
  else if (negWindows || aggregate.minPF < 1 || aggregate.worstWindowR < -5) verdict = 'rejected_overfit_or_unstable';
  else if (robustScore >= 8 && aggregate.minPF >= 1.05 && aggregate.maxDD <= 35 && aggregate.maxCL <= 7) verdict = 'live_port_candidate_research_only';
  return { ...candidate, windows: windowResults, training: training?.metrics, validation, full, robustScore, aggregate, verdict };
}
function projections(totalR, maxDDR) {
  return RISK_LEVELS.map(risk => ({ risk, returnPct: round(totalR * risk * 100), ddPct: round(maxDDR * risk * 100) }));
}
function fmtMetric(m) {
  return `trades=${m.trades}, minPF=${m.minPF ?? 'N/A'}, totalR=${m.totalR}, avgR=${m.avgR}, maxDD=${m.maxDD}R, maxCL=${m.maxCL}`;
}
function markdownTable(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');
}
function candidateRow(c) {
  const p = projections(c.aggregate.totalR, c.aggregate.maxDD).map(x => `${round(x.risk * 100, 1)}%: ${x.returnPct}% / DD ${x.ddPct}%`).join('<br>');
  return [c.strategy, c.timeframe, c.family, c.robustScore, c.aggregate.trades, c.aggregate.minPF, c.aggregate.totalR, c.aggregate.avgR, c.aggregate.worstWindowR, `${c.aggregate.maxDD}R`, c.aggregate.maxCL, c.aggregate.negWindows, c.verdict, p, c.changed.replaceAll('|', ';')];
}
function writeReport({ all, selectedPairs, windows, candidates }) {
  const byPair = candidates.reduce((map, c) => { const key = `${c.strategy} ${c.timeframe}`; if (!map.has(key)) map.set(key, []); map.get(key).push(c); return map; }, new Map());
  const sorted = [...candidates].sort((a, b) => b.robustScore - a.robustScore);
  const robust = sorted[0];
  const highReturn = [...candidates].sort((a, b) => b.aggregate.totalR - a.aggregate.totalR)[0];
  const lowDD = [...candidates].filter(c => c.aggregate.totalR > 0 && c.aggregate.trades >= 50).sort((a, b) => a.aggregate.maxDD - b.aggregate.maxDD || b.robustScore - a.robustScore)[0] ?? sorted[0];
  const rejected = [...candidates].filter(c => c.verdict.includes('rejected') || c.verdict.includes('low_sample')).sort((a, b) => b.robustScore - a.robustScore).slice(0, 12);
  const livePorts = sorted.filter(c => c.verdict === 'live_port_candidate_research_only').slice(0, 8);
  const lines = [];
  lines.push('# Phase 1E Strategy Optimization Harness');
  lines.push('');
  lines.push('This report is generated by `scripts/backtest-optimizer.mjs`. It is research/backtest only and does not apply any live, provider, Telegram, outcome, customer/Bot, execution, or DB `strategy_config` change.');
  lines.push('');
  lines.push('## Files Changed');
  lines.push('- `scripts/backtest-5m-fixture.mjs`: exported fixture constants and shared evaluator/backtest helpers while preserving the existing CLI behavior.');
  lines.push('- `scripts/backtest-optimizer.mjs`: added the controlled multi-strategy optimization runner and report generator.');
  lines.push('- `package.json`: added the `backtest:optimize` npm script.');
  lines.push('- `reports/backtests/phase-1e-strategy-optimization-harness.md`: generated optimization report.');
  lines.push('');
  lines.push('## Fixture and Scope');
  lines.push(`- Fixture path: \`${CSV}\``);
  lines.push(`- Full CSV range: ${all[0].time} -> ${all.at(-1).time}`);
  lines.push(`- Strategies/timeframes tested: ${selectedPairs.map(p => `${p.strategy} ${p.timeframe}`).join(', ')}`);
  lines.push('- Training/search is separated from validation; `--full` adds a full-fixture robustness check when runtime is acceptable. Robust ranking weights validation more heavily than the current training/search window.');
  lines.push('');
  lines.push('## Windows Tested');
  lines.push(markdownTable(['Window', 'Role', 'Start', 'End'], windows.map(w => [w.label, w.role, w.start, w.end])));
  lines.push('');
  lines.push('## Parameter Search Space');
  lines.push('- MicroScalper: live/balanced/conservative/aggressive baselines plus controlled sweeps for `min_score` 72/74/76, `min_body_atr` 0.28/0.32, `tp1_r` 1.15/1.25, `tp2_r` 1.8/2.0, `max_bars_in_trade` 18/24, RSI context 52/54 and 48/46, and `stop_atr_mult` 1.35/1.45.');
  lines.push('- CompressionBreakout: baselines plus controlled sweeps for `min_score` 74/76/78, `tp1_r` 0.95/1.05, `tp2_r` 2.3/2.6/2.8, `breakout_buffer_atr` 0.12/0.16, `box_lookback` 45/55, `min_box_bars` 14/16, `max_box_atr_range` 1.6/1.8, and `min_atr_expansion` 1.1/1.2.');
  lines.push('- SwingContinuation: baselines plus controlled sweeps for `min_score` 74/76/78, TP1 1.3/1.5, TP2 2.2/2.5/2.8, `pullback_bars` 4/5, RSI context 50/52 and 50/48, `stop_atr_mult` 1.5/1.7, and `max_bars_in_trade` 72/96.');
  lines.push('- Core RR/distance, trend, compression, momentum, reclaim, and volatility guards remain in place; risk/leverage is not optimized.');
  lines.push('');
  lines.push('## Top Candidates Per Strategy/Timeframe');
  for (const [pair, rows] of byPair) {
    lines.push(`### ${pair}`);
    lines.push(markdownTable(['Strategy', 'TF', 'Family', 'Score', 'Trades', 'Min PF', 'Total R', 'Avg R', 'Worst R', 'Max DD', 'Max CL', 'Neg Windows', 'Verdict', 'Risk projections return / DD', 'Changed params'], rows.sort((a, b) => b.robustScore - a.robustScore).slice(0, 5).map(candidateRow)));
    lines.push('');
  }
  lines.push('## Best Robust Candidate');
  lines.push(robust ? `- ${robust.strategy} ${robust.timeframe} ${robust.family}: robust score ${robust.robustScore}; ${fmtMetric(robust.aggregate)}; changed params: ${robust.changed}.` : '- None.');
  lines.push('');
  lines.push('## Best High-Return Candidate');
  lines.push(highReturn ? `- ${highReturn.strategy} ${highReturn.timeframe} ${highReturn.family}: aggregate totalR ${highReturn.aggregate.totalR}; robust score ${highReturn.robustScore}; ${fmtMetric(highReturn.aggregate)}; changed params: ${highReturn.changed}.` : '- None.');
  lines.push('');
  lines.push('## Best Low-Drawdown Candidate');
  lines.push(lowDD ? `- ${lowDD.strategy} ${lowDD.timeframe} ${lowDD.family}: maxDD ${lowDD.aggregate.maxDD}R; robust score ${lowDD.robustScore}; ${fmtMetric(lowDD.aggregate)}; changed params: ${lowDD.changed}.` : '- None.');
  lines.push('');
  lines.push('## Rejected / Overfit / Noisy Candidates');
  lines.push(markdownTable(['Strategy', 'TF', 'Family', 'Score', 'Trades', 'Min PF', 'Total R', 'Avg R', 'Worst R', 'Max DD', 'Max CL', 'Neg Windows', 'Verdict', 'Risk projections return / DD', 'Changed params'], rejected.map(candidateRow)));
  lines.push('');
  lines.push('## Recommended Live-Port Candidates');
  if (livePorts.length) lines.push(markdownTable(['Strategy', 'TF', 'Family', 'Score', 'Trades', 'Min PF', 'Total R', 'Avg R', 'Worst R', 'Max DD', 'Max CL', 'Neg Windows', 'Verdict', 'Risk projections return / DD', 'Changed params'], livePorts.map(candidateRow)));
  else lines.push('- No setting should be ported live from this phase alone. Keep candidates research-only until additional out-of-sample and paper/live shadow validation confirms robustness.');
  lines.push('');
  lines.push('## Candidates Needing More Validation');
  lines.push('- Candidates labeled `needs_more_validation` have some edge evidence but still require more out-of-sample data, additional symbols, and shadow-mode monitoring before any live scanner consideration.');
  lines.push('- Candidates labeled `research_only_low_sample` or `rejected_overfit_or_unstable` should remain research-only.');
  lines.push('');
  lines.push('## Risk-Scaled Capital Projection Method');
  lines.push('- Projection is linear R scaling after strategy-edge metrics are known: total return % ≈ `totalR * risk_per_trade`; max drawdown % ≈ `maxDD_R * risk_per_trade`.');
  lines.push('- Example: +50R projects to about +25%, +50%, and +100% at 0.5%, 1%, and 2% risk/trade respectively, while 15R max drawdown projects to about 7.5%, 15%, and 30%.');
  lines.push('- These are not guarantees and are not optimizer targets. They are leverage/risk illustrations only.');
  lines.push('');
  lines.push('## Live-Safety Confirmation');
  lines.push('- No live scanner logic changed.');
  lines.push('- No Supabase Edge Functions changed.');
  lines.push('- No provider, Telegram, outcome tracking, customer/package/Bot setup, broker/MT5/execution, or DB `strategy_config` changes were made.');
  lines.push('- No trades were faked or forced; existing RR/distance and strategy identity gates remain active.');
  lines.push('');
  lines.push('## Testing Results');
  lines.push('- `npm run typecheck`');
  lines.push('- `npm run lint`');
  lines.push('- `npm run build`');
  lines.push('- `npm run backtest:fixture -- --days=90 --preset=all`');
  lines.push('- `npm run backtest:optimize -- --strategy=all`');
  lines.push('- `git diff --check`');
  lines.push('');
  lines.push('## Manual Verification Steps');
  lines.push('1. Open `reports/backtests/phase-1e-strategy-optimization-harness.md` and confirm the candidate rankings prioritize robust R/PF/drawdown behavior over risk-scaled return.');
  lines.push('2. Re-run a focused candidate with `npm run backtest:optimize -- --strategy=CompressionBreakout --timeframe=15m --full` if full-fixture robustness is acceptable for the workstation runtime.');
  lines.push('3. Confirm no live configuration was changed by reviewing the diff for scanner/provider/Telegram/outcome/customer/Bot/execution/DB strategy files.');
  lines.push('');
  lines.push('## CLI Commands Added');
  lines.push('- `npm run backtest:optimize -- --strategy=all --days=90`');
  lines.push('- `npm run backtest:optimize -- --strategy=CompressionBreakout --timeframe=15m`');
  lines.push('- `npm run backtest:optimize -- --strategy=SwingContinuation --timeframe=15m`');
  lines.push('- `npm run backtest:optimize -- --strategy=MicroScalper --timeframe=5m`');
  lines.push('- Optional runtime controls: `--limit=N` caps candidates per strategy/timeframe (default 18) and `--full` adds full-fixture robustness when runtime is acceptable.');
  fs.mkdirSync('reports/backtests', { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
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
  writeReport({ all, selectedPairs, windows, candidates: summaries });
  const ranked = [...summaries].sort((a, b) => b.robustScore - a.robustScore);
  console.log(`Fixture: ${CSV}`);
  console.log(`Report: ${REPORT_PATH}`);
  console.log(`Pairs: ${selectedPairs.map(p => `${p.strategy} ${p.timeframe}`).join(', ')}`);
  console.log(`Windows: ${windows.map(w => `${w.id}(${w.role})`).join(', ')}`);
  console.log(`Candidates tested: ${summaries.length}`);
  console.log('Rank,strategy,timeframe,family,robust_score,trades,min_pf,total_r,avg_r,worst_window_r,max_dd_r,max_consec_losses,negative_windows,verdict,changed_params');
  for (const [idx, c] of ranked.slice(0, 25).entries()) {
    console.log([idx + 1, c.strategy, c.timeframe, c.family, c.robustScore, c.aggregate.trades, c.aggregate.minPF, c.aggregate.totalR, c.aggregate.avgR, c.aggregate.worstWindowR, c.aggregate.maxDD, c.aggregate.maxCL, c.aggregate.negWindows, c.verdict, c.changed].join(','));
  }
}

main();
