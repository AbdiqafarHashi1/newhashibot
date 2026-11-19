import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { savedLedgerData } from './focused-portfolio/prepare.ts';
import { EXECUTION_CANONICAL_REVIEWS } from '../../supabase/functions/_shared/execution-canonical-reviews.ts';
const data = JSON.parse(savedLedgerData()), reports = new Map<string, any>();
for (const s of data.sources) {
    const bytes = gunzipSync(readFileSync(s.path));
    if (createHash('sha256').update(bytes).digest('hex') !== s.sha256)
        throw Error('SOURCE_HASH_MISMATCH');
    reports.set(s.sha256, JSON.parse(bytes.toString()));
}
const trades = data.trades.map((t: any) => {
    const report = reports.get(t.source);
    let entry: number | null = null, stop: number | null = null, cost: number | null = null, peak: number | null = null, peakBasis: string | null = null, side: string | null = null, volume: number | null = null, featureAt: string | null = null;
    if (report.accounts) {
        const period = EXECUTION_CANONICAL_REVIEWS.flatMap<{
            reportSha256: string;
            capital: number;
            riskPct: number;
        }>(r => r.periods).find(p => p.reportSha256 === t.source);
        if (!period)
            throw Error('REVIEW_MISSING');
        const account = report.accounts.find((a: any) => a.capital === period.capital && a.riskPct === period.riskPct), native = account?.trades.find((r: any) => r.signalId === t.id && r.strategy === t.strategy);
        if (!native || Math.abs(native.netR - t.netR) > 1e-8)
            throw Error('NATIVE_TRADE_MISMATCH');
        const snapshot = report.signalSnapshots?.find((r: any) => r.setup.id === t.id && Number(r.at) <= Number(t.entry));
        const setup = snapshot?.setup;
        entry = native.entry;
        stop = setup?.stop ?? null;
        if (setup?.intelligence && Number.isFinite(setup.intelligence.volumeRatio) && Date.parse(setup.intelligence.observedAt) <= Number(snapshot.at)) {
            volume = setup.intelligence.volumeRatio;
            featureAt = new Date(snapshot.at).toISOString();
        }
        side = native.side === 1 ? 'LONG' : 'SHORT';
        const risk = native.netR !== 0 ? native.net / native.netR : null;
        if (risk && risk > 0)
            cost = (native.gross - native.net) / risk;
        const state = report.checkpoint?.store?.records.find((r: any) => r.state.id === t.id)?.state, trail = state?.trailingState;
        if (trail && Number.isFinite(trail.bestFavorable) && trail.bestFavorable >= 0 && trail.initialDistance > 0) {
            peak = trail.bestFavorable / trail.initialDistance;
            peakBasis = 'SAVED_REFERENCE_TRAILING_STATE';
        }
    }
    else {
        const row = report.ledger.find((r: any) => r.outcome?.candidateId === t.id), c = row?.candidate, o = row?.outcome;
        if (!o || Math.abs(o.netR - t.netR) > 1e-8)
            throw Error('REFERENCE_TRADE_MISMATCH');
        entry = o.entryPrice;
        stop = c.stop;
        cost = o.costR;
        side = /buy|long/i.test(c.side) ? 'LONG' : 'SHORT';
    }
    return { id: t.id, strategy_id: t.strategy, symbol: t.symbol, market: t.symbol.endsWith('USDT') ? 'CRYPTO' : /^XAU|^XAG/.test(t.symbol) ? 'METALS' : 'FOREX', timeframe: t.timeframe, side, entry_time: new Date(t.entry).toISOString(), exit_time: new Date(t.exit).toISOString(), realized_r: t.netR, cost_r: Number.isFinite(cost) ? cost : null, entry_price: entry, initial_stop: stop, entry_volume_ratio: volume, entry_feature_at: featureAt, peak_r: peak, peak_r_basis: peakBasis, source_sha256: t.source };
});
if (trades.length !== 1159 || new Set(trades.map((t: any) => t.strategy_id + ':' + t.id)).size !== 1159 || new Set(trades.map((t: any) => t.strategy_id)).size !== 16)
    throw Error('EXPECTED_1159_UNIQUE_TRADES_16_CONFIGS');
const output = { schema: 'saved-ledger-trades/v1', costs: 'realized_r includes original source transaction costs/financing; monthly software fees excluded', limitations: ['Source-account admitted trades, unequal historical coverage; not every scanner opportunity.', 'Saved peak R is a reference trailing excursion, not a verified provider tick path.', 'No customer account identifiers or credentials are included.'], coverage: data.coverage, sources: data.sources, trades };
writeFileSync('src/data/saved-ledger-trades.json', JSON.stringify(output) + '\n');
console.log({ trades: trades.length, strategies: 16, withPeak: trades.filter((t: any) => t.peak_r !== null).length, withGeometry: trades.filter((t: any) => t.entry_price && t.initial_stop).length });
