import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { hash } from './develop.ts';
const [finalPath, baselinePath, directory] = process.argv.slice(2);
if (!finalPath || !baselinePath || !directory) throw Error('Usage: export.ts <final-report> <legacy-policy-report> <output-directory>');
const finalRaw = await readFile(finalPath, 'utf8'), baselineRaw = await readFile(baselinePath, 'utf8');
const final = JSON.parse(finalRaw), baseline = JSON.parse(baselineRaw);
await mkdir(directory, { recursive: true });
const compactTrial = (trial: typeof final.trials[number]) => ({ ...trial, perInstrument: trial.perInstrument.map(
  ({ trades, diagnostics, ...rest }: { trades: unknown[]; diagnostics: unknown[]; [key: string]: unknown }) =>
    ({ ...rest, persistedTradeCount: trades.length, persistedDiagnosticCount: diagnostics.length })) });
const columns = ['strategy', 'variant', 'symbol', 'candidateId', 'signalTime', 'entryTime', 'exitTime', 'status',
  'side', 'entryPrice', 'stop', 'tp1', 'tp2', 'exitPrice', 'grossR', 'costR', 'netR', 'partialExit', 'stopBps', 'maeR', 'mfeR', 'cashFlowEvents'];
const csv = [columns.join(',')];
for (const trial of final.trials) for (const run of trial.perInstrument) {
  if (run.trades.length !== run.diagnostics.length) throw Error('OUTCOME_DIAGNOSTIC_COUNT_MISMATCH');
  for (let i = 0; i < run.trades.length; i++) {
    const trade = run.trades[i], diagnostic = run.diagnostics[i];
    if (trade.candidateId !== diagnostic.candidateId || trade.netR === null ||
        Math.abs(trade.cashFlowEvents.reduce((n: number, e: { realizedR: number }) => n + e.realizedR, 0) - trade.netR) > 1e-9)
      throw Error('TRADE_ID_OR_CASH_FLOW_CONFLICT');
    const row = { ...trade, ...diagnostic, strategy: trial.strategy, variant: trial.variant.name,
      tp1: diagnostic.targets[0], tp2: diagnostic.targets.at(-1), cashFlowEvents: JSON.stringify(trade.cashFlowEvents) };
    csv.push(columns.map(k => `"${String(row[k] ?? '').replaceAll('"', '""')}"`).join(','));
  }
}
const evidence = csv.join('\n') + '\n';
await writeFile(`${directory}/trades.csv`, evidence);
await writeFile(`${directory}/development.json`, JSON.stringify({ ...final, rawReportSha256: hash(finalRaw),
  tradeEvidence: { file: 'trades.csv', sha256: hash(evidence), rows: csv.length - 1 }, trials: final.trials.map(compactTrial),
  priorLegacyPolicyDiagnostic: { rawReportSha256: hash(baselineRaw), engineHashes: baseline.engineHashes,
    trials: baseline.trials.map(compactTrial), disclosure: 'Initial integration diagnostic with legacy strategy-name no-trade gates. Six cases; all rejected. Not omitted from the research history.' },
  totalDevelopmentCasesThisIteration: final.trials.length + baseline.trials.length,
}, null, 2) + '\n');
console.log(JSON.stringify({ trades: csv.length - 1, sha256: hash(evidence), verdict: final.verdict }));
