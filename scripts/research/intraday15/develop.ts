/** Isolated research using the shared registry, qualification, arbitration and outcome authority. */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { INTRADAY_IDS, INTRADAY_VERSION, evaluateIntradayOpportunity } from '../../../supabase/functions/_shared/intraday-opportunities.ts';
import { calculateActiveIndicators, createApprovedReplayRegistry } from '../../../supabase/functions/_shared/active-validation-runtime.ts';
import { runBoundedValidation } from '../../../supabase/functions/_shared/phase-l-validation.ts';
import { evaluateReplayOutcome, type ReplayOutcome } from '../../../supabase/functions/_shared/replay-outcomes.ts';
import type { StrategyCandle, StrategyEvaluationContext } from '../../../supabase/functions/_shared/professional-strategies.ts';
import { engineHashes, summarize } from '../../release1/regime/replay.ts';

export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export interface Variant { name: string; parameters: Record<string, number>; breakeven: boolean }
export interface IntradayProtocol {
  symbols: string[]; developmentFrom: string; developmentToExclusive: string; horizonBars: number;
  variants: Variant[]; costsBps: { feeBps: number; spreadBps: number; slippageBps: number; fundingBps: number };
  stressMultiplier: number; trialCount: number;
  gates: { minimumResolvedTrades: number; minimumProfitFactor: number; minimumExpectancyR: number; positiveEachInstrument: boolean };
}
export async function loadDevelopment(root: string, protocol: IntradayProtocol) {
  const all = await readdir(root), datasets = [];
  for (const symbol of protocol.symbols) {
    const files = all.filter(f => f.startsWith(`${symbol}-15m-`) && f.endsWith('.json') && !f.endsWith('.manifest.json')).sort();
    if (files.length !== 18) throw Error(`INCOMPLETE_DEVELOPMENT_FILES:${symbol}`);
    const rows: StrategyCandle[] = [], sources = [];
    for (const file of files) {
      const raw = await readFile(`${root}/${file}`, 'utf8');
      const meta = JSON.parse(await readFile(`${root}/${file.replace('.json', '.manifest.json')}`, 'utf8'));
      if (meta.datasetSha256 !== hash(raw) || meta.instrumentType !== 'USDT_PERPETUAL' || !/^[a-f0-9]{64}$/.test(meta.archiveSha256) ||
          meta.sourceUrl !== `https://data.binance.vision/data/futures/um/monthly/klines/${symbol}/15m/${file.replace('.json', '.zip')}`)
        throw Error(`SOURCE_HASH_OR_IDENTITY_MISMATCH:${file}`);
      const part = JSON.parse(raw) as StrategyCandle[];
      if (part.length !== meta.rows) throw Error(`SOURCE_COUNT_MISMATCH:${file}`);
      rows.push(...part); sources.push({ file, ...meta });
    }
    const start = Date.parse(protocol.developmentFrom), end = Date.parse(protocol.developmentToExclusive);
    if (rows.length !== (end - start) / 900000 || rows.some((r, i) => r.symbol !== symbol || r.timeframe !== '15m' ||
        r.source !== 'BINANCE_UM_FUTURES_ARCHIVE' || Date.parse(r.open_time) !== start + i * 900000 ||
        ![r.open, r.high, r.low, r.close, r.volume].every(Number.isFinite) || r.low <= 0 || r.volume < 0 ||
        r.high < Math.max(r.open, r.close) || r.low > Math.min(r.open, r.close)))
      throw Error(`INCOMPLETE_MALFORMED_OR_NONCHRONOLOGICAL_DEVELOPMENT:${symbol}`);
    datasets.push({ symbol, rows, sources, datasetHash: hash(JSON.stringify(rows)) });
  }
  return datasets;
}
export function runIntraday(strategy: typeof INTRADAY_IDS[number], variant: Variant,
  data: { symbol: string; rows: StrategyCandle[]; datasetHash: string }, protocol: IntradayProtocol, multiplier = 1) {
  const { rows, symbol } = data, trades: ReplayOutcome[] = [], diagnostics: unknown[] = [], rejections: Record<string, number> = {};
  const reject = (reason: string) => { rejections[reason] = (rejections[reason] ?? 0) + 1; };
  const registry = createApprovedReplayRegistry({ version: 'intraday15-research/v1', minSignalGrade: 'A', strategies: [{
    id: strategy, version: INTRADAY_VERSION, enabled: true, minScore: 75, minRiskReward: 1.5,
    maxBarsInTrade: protocol.horizonBars, symbols: [symbol], timeframes: ['15m'], parameters: variant.parameters,
  }] }, symbol, '15m');
  let activeUntil = -Infinity, eligible = 0;
  for (let i = 109; i < rows.length - 1; i++) {
    const asOf = new Date(Date.parse(rows[i].open_time) + 900000).toISOString(), history = rows.slice(i - 109, i + 1);
    // Cheap direct rejection is the same definition, not a second engine. Winners are re-evaluated below.
    const context = { symbol, market: 'crypto', timeframe: '15m', candles: history,
      indicators: {} as StrategyEvaluationContext['indicators'], evaluated_at: asOf } as StrategyEvaluationContext;
    const direct = evaluateIntradayOpportunity(strategy, context, variant.parameters);
    if (direct.status !== 'candidate') { reject(direct.rejection_reason); continue; }
    eligible++;
    // A decision on the candle that contains an exit cannot assume the exit happened before its close.
    if (Date.parse(asOf) <= activeUntil) { reject('ONE_ACTIVE_PER_SYMBOL'); continue; }
    if (i + protocol.horizonBars >= rows.length) { reject('SPLIT_BOUNDARY_HORIZON'); continue; }
    context.indicators = calculateActiveIndicators(history);
    const [decision] = runBoundedValidation({ runId: 'intraday15-development', mode: 'REPLAY',
      dataset: { id: symbol, source: 'BINANCE_UM_FUTURES_ARCHIVE', provenance: 'OFFICIAL_CHECKSUM', sha256: data.datasetHash, timezone: 'UTC' },
      configurationVersion: 'intraday15-research/v1', parameterVersion: hash(JSON.stringify(variant)), symbol, market: 'crypto',
      timeframe: '15m', start: asOf, end: asOf, maxCycles: 1, minimumScore: 0, allowedGrades: ['A+', 'A'], minSignalGrade: 'A',
    }, registry, [context]);
    const winner = decision?.arbitration.winner;
    if (!winner) { reject('QUALIFICATION_OR_ARBITRATION'); continue; }
    const future = rows.slice(i + 1, i + 1 + protocol.horizonBars);
    const costs = Object.fromEntries(Object.entries(protocol.costsBps).map(([k, v]) => [k, v * multiplier])) as IntradayProtocol['costsBps'];
    const outcome = evaluateReplayOutcome(winner, future, asOf, { entryTiming: 'NEXT_OPEN', ...costs,
      partialExitPct: .5, moveStopToBreakevenAfterTp1: variant.breakeven, trailingStopR: null,
      sameCandlePolicy: 'STOP_FIRST', tp1StopPolicy: 'CONSERVATIVE_SAME_BAR', maxBarsInTrade: protocol.horizonBars, closeAtHorizon: true });
    if (!outcome || outcome.status === 'EXCLUDED') { reject(outcome?.exclusionReason ?? 'NO_OUTCOME'); continue; }
    activeUntil = Date.parse(outcome.exitTime!) + 900000;
    trades.push(outcome);
    const exitPath = future.filter(r => Date.parse(r.open_time) <= Date.parse(outcome.exitTime!)), risk = Math.abs(outcome.entryPrice - winner.stop);
    const max = Math.max(...exitPath.map(r => r.high)), min = Math.min(...exitPath.map(r => r.low));
    diagnostics.push({ candidateId: winner.id, signalTime: asOf, entry: outcome.entryPrice, stop: winner.stop,
      targets: winner.targets, side: winner.side, setup: direct.reason,
      stopBps: risk / outcome.entryPrice * 10000,
      maeR: Math.max(0, winner.side === 'buy' ? outcome.entryPrice - min : max - outcome.entryPrice) / risk,
      mfeR: Math.max(0, winner.side === 'buy' ? max - outcome.entryPrice : outcome.entryPrice - min) / risk,
      excursionDisclosure: 'Includes whole exit candle; intrabar order is unknown. Diagnostic only, not an executable trailing rule.' });
  }
  return { symbol, strategy, variant, metrics: summarize(trades), grossNetR: trades.reduce((n, r) => n + (r.grossR ?? 0), 0),
    totalCostR: trades.reduce((n, r) => n + r.costR, 0), eligible, rejections, trades, diagnostics };
}
export async function develop(root: string, output: string) {
  const raw = await readFile('scripts/research/intraday15/protocol.json', 'utf8'), protocol: IntradayProtocol = JSON.parse(raw);
  const sources = await loadDevelopment(root, protocol), hashes = await engineHashes();
  for (const file of ['supabase/functions/_shared/intraday-opportunities.ts', 'scripts/research/intraday15/develop.ts',
    'scripts/research/intraday15/download.py', 'scripts/research/intraday15/protocol.json']) hashes[file] = hash(await readFile(file, 'utf8'));
  const trials = [];
  for (const strategy of INTRADAY_IDS) for (const variant of protocol.variants) {
    const perInstrument = sources.map(d => runIntraday(strategy, variant, d, protocol));
    const stress = sources.map(d => runIntraday(strategy, variant, d, protocol, protocol.stressMultiplier));
    const ordered = perInstrument.flatMap(r => r.trades).sort((a, b) => Date.parse(a.exitTime!) - Date.parse(b.exitTime!));
    const metrics = summarize(ordered), stressMetrics = summarize(stress.flatMap(r => r.trades));
    const reasons = [ ...(metrics.resolvedCount < protocol.gates.minimumResolvedTrades ? ['INSUFFICIENT_TRADES'] : []),
      ...((metrics.profitFactor ?? 0) < protocol.gates.minimumProfitFactor ? ['NET_PF_BELOW_GATE'] : []),
      ...((metrics.expectancyR ?? 0) <= protocol.gates.minimumExpectancyR ? ['NONPOSITIVE_EXPECTANCY'] : []),
      ...(perInstrument.some(r => (r.metrics.expectancyR ?? 0) <= 0) ? ['NONPOSITIVE_INSTRUMENT'] : []),
      ...((stressMetrics.expectancyR ?? 0) <= 0 ? ['COST_STRESS_FAILED'] : []) ];
    trials.push({ strategy, variant, metrics, stressMetrics, reasons, perInstrument });
    console.log(JSON.stringify({ strategy, variant: variant.name, trades: metrics.resolvedCount,
      pf: metrics.profitFactor, expectancyR: metrics.expectancyR, reasons }));
  }
  if (trials.length !== protocol.trialCount) throw Error('UNDISCLOSED_TRIAL_COUNT');
  await writeFile(output, JSON.stringify({ schema: 'intraday15-development/v1', generatedAt: new Date().toISOString(),
    protocolHash: hash(raw), engineHashes: hashes, sources: sources.map(({ symbol, datasetHash, sources }) => ({ symbol, datasetHash, sources })),
    trials, verdict: trials.some(t => !t.reasons.length) ? 'DEVELOPMENT_ONLY_REQUIRES_NEW_UNTOUCHED_EVIDENCE' : 'REJECTED_DEVELOPMENT',
    publication: false, execution: false, promotion: false,
    limitations: ['Reused calendar periods are development, never fresh holdout.', 'No actual order book, historic funding, provider fill or live evidence.',
      'Two symbols pooled as independent signal outcomes, not portfolio or Prop account performance.', 'All trials disclosed; selecting among them creates multiple-testing bias.',
      'OHLC stop-first and same-candle breakeven are conservative; no intrabar path inferred.', 'MAE/MFE includes whole exit candle; never calibrated only on winners.'],
  }, null, 2) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root, output] = process.argv.slice(2);
  if (!root || !output) throw Error('Usage: develop.ts <development-directory> <report.json>');
  await develop(root, output);
}
