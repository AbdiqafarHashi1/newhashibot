import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LAB_LINEUPS, normalizeLedger, runClientBacktest, alternateExit, parseLedgerCsv, sourceTradesCsv, resultTradesCsv, assertLabAdmin, labAdminAllowed, type BacktestOptions, type LedgerTrade } from '../src/lib/clientBacktestEngine';
import { onlineOrSaved } from '../src/lib/clientBacktestSources';
const raw = JSON.parse(readFileSync('src/data/saved-ledger-trades.json', 'utf8'));
const saved = normalizeLedger(raw.trades);
const trade = (changes: Partial<LedgerTrade> = {}): LedgerTrade => ({ id: 'a', strategy_id: 'test', symbol: 'BTCUSDT', market: 'CRYPTO', timeframe: '1h', side: 'LONG', entry_time: '2026-10-05T01:00:00Z', exit_time: '2026-10-05T02:00:00Z', realized_r: 2, cost_r: .1, entry_price: 100, initial_stop: 95, peak_r: null, peak_r_basis: null, source_sha256: null, ...changes });
const options = (changes: Partial<BacktestOptions> = {}): BacktestOptions => ({ strategyIds: ['test'], startingBalance: 10000, monthlyFee: 0, startDate: '2026-10-01', endDate: '2026-10-30', profile: 'STANDARD', customRiskPct: 1, exitMode: 'ORIGINAL', leverage: 10, marginEnabled: false, cryptoGuard: false, weekendMultiplier: false, maxOpenPositions: 3, oneTradePerDay: false, ...changes });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test('all 1,159 unique cost-netted trades / 16 configs are preserved and replay reconciles', () => {
    assert.equal(saved.length, 1159);
    assert.equal(new Set(saved.map(t => t.strategy_id)).size, 16);
    assert.equal(saved.filter(t => t.peak_r !== null).length, 130);
    assert.ok(saved.every(t => t.entry_price && t.initial_stop));
    const r = runClientBacktest(saved, options({ strategyIds: LAB_LINEUPS.ALL_16, startDate: '2025-01-01', endDate: '2026-10-31', monthlyFee: 29 }));
    assert.ok(r.closedTrades > 0);
    near(r.netProfit, r.trades.reduce((s, t) => s + t.pnl, 0) - r.fees);
    assert.equal(r.warnings.ALTERNATE_EXIT_ESTIMATE, undefined);
});
test('literal verified Admin identity gates routes and CSV tools', () => {
    assert.doesNotThrow(() => assertLabAdmin('admin'));
    for (const role of ['user', 'owner', null, undefined]) {
        assert.throws(() => assertLabAdmin(role), /ADMIN_REQUIRED/);
        assert.throws(() => parseLedgerCsv('', role), /ADMIN_REQUIRED/);
        assert.throws(() => sourceTradesCsv([], role), /ADMIN_REQUIRED/);
    }
    assert.equal(labAdminAllowed('u', { id: 'u', role: 'admin' }), true);
    assert.equal(labAdminAllowed('u', { id: 'v', role: 'admin' }), false);
    assert.equal(labAdminAllowed('u', { id: 'u', role: 'user' }), false);
    const gate = readFileSync('src/components/guards/StrictBacktestAdmin.tsx', 'utf8');
    assert.ok(gate.replace(/\s/g, '').includes('labAdminAllowed(user.id,profile??lastKnownProfile)'));
    assert.ok(!gate.includes('isOwnerPreview'));
    assert.ok(readFileSync('src/pages/admin/BacktestLab.tsx', 'utf8').includes('<StrictBacktestAdmin>'));
});
test('preset counts and single-strategy selection', () => {
    assert.deepEqual(Object.values(LAB_LINEUPS).map(v => v.length), [5, 8, 8, 16]);
    assert.ok(Object.values(LAB_LINEUPS).every(v => new Set(v).size === v.length));
    const r = runClientBacktest([trade(), trade({ id: 'b', strategy_id: 'other', symbol: 'ETHUSDT' })], options());
    assert.equal(r.closedTrades, 1);
    near(r.returnPct, 2);
});
test('fixed 1R/2R/3R account for known costs; fallback never invents a winning touch', () => {
    for (const n of [1, 2, 3] as const) {
        const t = trade({ realized_r: -1, peak_r: 4 });
        near(alternateExit(t, `FIXED_${n}R`).r, n - .1);
        near(alternateExit({ ...t, peak_r: null }, `FIXED_${n}R`).r, -1);
        const r = runClientBacktest([t], options({ exitMode: `FIXED_${n}R` }));
        near(r.netProfit, 100 * (n - .1));
        assert.equal(r.trades[0].exit_time, new Date(t.exit_time).toISOString());
        assert.equal(r.warnings.ALTERNATE_EXIT_ESTIMATE, 1);
    }
    near(alternateExit(trade({ realized_r: -1, peak_r: 2 }), 'BREAKEVEN_1_5R').r, -.1);
    near(alternateExit(trade({ realized_r: -1 }), 'BREAKEVEN_1_5R').r, -1);
    near(alternateExit(trade({ realized_r: 4 }), 'FIXED_2R').r, 2);
});
test('fees accrue during idle days; results CSV has summary even with zero trades', () => {
    const r = runClientBacktest([], options({ startingBalance: 1000, monthlyFee: 100 }));
    near(r.fees, 100);
    near(r.endingBalance, 900);
    near(r.maxDrawdownPct, 10);
    const csv = resultTradesCsv(r, 'admin');
    assert.equal(csv.split('\r\n').length, 2);
    assert.ok(csv.includes('portfolio_net_profit_after_fees'));
    assert.throws(() => resultTradesCsv(r, 'user'), /ADMIN_REQUIRED/);
});
test('STANDARD House-Money escalates using closed monthly trading profits', () => {
    const r = runClientBacktest([trade({ realized_r: 3 }), trade({ id: 'b', entry_time: '2026-10-06T01:00:00Z', exit_time: '2026-10-06T02:00:00Z', realized_r: 1 })], options({ customRiskPct: null }));
    assert.deepEqual(r.trades.map(t => t.applied_risk_pct), [1, 2]);
    near(r.netProfit, 506);
});
test('concurrent Crypto guard, symbol lock, VIP daily slot and weekend multiplier', () => {
    const input = [trade({ realized_r: -1, exit_time: '2026-10-05T04:00:00Z' }), trade({ id: 'b', symbol: 'ETHUSDT', realized_r: -1, entry_time: '2026-10-05T02:00:00Z', exit_time: '2026-10-05T03:00:00Z' })];
    const guarded = runClientBacktest(input, options({ profile: 'SMART_GROWTH', customRiskPct: null, cryptoGuard: true }));
    near(guarded.returnPct, -2.25);
    assert.deepEqual(guarded.trades.map(t => t.applied_risk_pct), [.75, 1.5]);
    assert.equal(runClientBacktest(input.map(t => ({ ...t, symbol: 'BTCUSDT' })), options()).skipped.SYMBOL_LOCK, 1);
    assert.equal(runClientBacktest(input, options({ oneTradePerDay: true })).skipped.DAILY_ENTRY_SLOT, 1);
    near(runClientBacktest([trade({ entry_time: '2026-10-03T01:00:00Z', exit_time: '2026-10-03T02:00:00Z', realized_r: 1 })], options({ weekendMultiplier: true })).returnPct, .75);
});
test('extreme risk/leverage warn, margin blocks and invalid controls fail', () => {
    const high = options({ profile: 'AGGRESSIVE_5PCT', customRiskPct: 10, openRiskCapPct: 20, factorRiskCapPct: 20, marginEnabled: true, leverage: 100 });
    assert.equal(runClientBacktest([trade()], high).warnings.POTENTIAL_ISOLATED_LIQUIDATION_BEFORE_STOP, 1);
    assert.equal(runClientBacktest([trade()], { ...high, leverage: 1 }).skipped.MARGIN_BUDGET_50_PERCENT, 1);
    assert.equal(runClientBacktest([trade({ initial_stop: null })], high).skipped.MISSING_INITIAL_STOP_FOR_MARGIN, 1);
    for (const change of [{ customRiskPct: 11 }, { leverage: 101 }, { startingBalance: 99 }, { monthlyFee: -1 }, { factorRiskCapPct: 101 }])
        assert.throws(() => runClientBacktest([trade()], options(change)));
});
test('CSV quotes, newlines, aliases, duplicate conflicts, malformed input and formula protection', () => {
    const input = normalizeLedger([trade({ id: 'hello,"world"\nrow' })] as unknown as Record<string, unknown>[]);
    const csv = sourceTradesCsv(input, 'admin');
    assert.deepEqual(parseLedgerCsv(csv, 'admin'), input);
    assert.deepEqual(parseLedgerCsv('\uFEFF' + csv, 'admin'), input);
    assert.equal(normalizeLedger([trade(), trade()] as unknown as Record<string, unknown>[]).length, 1);
    assert.throws(() => normalizeLedger([trade(), trade({ realized_r: 3 })] as unknown as Record<string, unknown>[]), /Conflicting/);
    assert.throws(() => parseLedgerCsv('strategy_id\n"oops', 'admin'), /Unclosed/);
    assert.ok(sourceTradesCsv([trade({ id: '=HYPERLINK("bad")' })], 'admin').includes("'=HYPERLINK"));
});
test('window cutoff leaves future exits open; Gold gate rejects future or absent features', () => {
    const r = runClientBacktest([trade({ exit_time: '2026-11-02T00:00:00Z' })], options());
    assert.equal(r.openAtEnd, 1);
    assert.equal(r.closedTrades, 0);
    near(r.returnPct, 0);
    const gold = trade({ strategy_id: 'gold.rsi-trailing-15-48-1.5-5-h96', symbol: 'XAUUSD', market: 'METALS' }), o = options({ strategyIds: [gold.strategy_id], productEntryFilters: true });
    assert.equal(runClientBacktest([gold], o).skipped.GOLD_ENTRY_VOLUME_GATE, 1);
    assert.equal(runClientBacktest([{ ...gold, entry_volume_ratio: 1, entry_feature_at: '2026-10-06T00:00:00Z' }], o).entries, 0);
    assert.equal(runClientBacktest([{ ...gold, entry_volume_ratio: 1, entry_feature_at: gold.entry_time }], o).entries, 1);
});
function dbMock(role = 'admin', paused = false) { return { from: (table: string) => { const result = paused ? { error: { message: 'paused' }, data: null } : table === 'profiles' ? { error: null, data: { id: 'u', role } } : table === 'validation_runs' ? { error: null, data: { id: 'run' } } : { error: null, data: [{ ...trade(), candidate_id: 'a', net_r: 2 }] }; const query: any = { then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject) }; for (const method of ['select', 'eq', 'in', 'order', 'limit', 'abortSignal', 'maybeSingle', 'range'])
        query[method] = () => query; return query; } }; }
test('online Admin history loads, paused Supabase falls back, revoked Admin cannot fall back', async () => {
    const online = await onlineOrSaved(dbMock(), 'u', 'admin', async () => saved);
    assert.equal(online.mode, 'ONLINE');
    assert.equal(online.trades.length, 1);
    assert.equal(online.runId, 'run');
    const offline = await onlineOrSaved(dbMock('admin', true), 'u', 'admin', async () => saved);
    assert.equal(offline.mode, 'OFFLINE');
    assert.equal(offline.trades.length, 1159);
    await assert.rejects(() => onlineOrSaved(dbMock('user'), 'u', 'admin', async () => saved), /ADMIN_REQUIRED/);
});
test('same-bar recorded exits settle after admission instead of remaining open', () => { const r = runClientBacktest([trade({ exit_time: '2026-10-05T01:00:00Z' })], options()); assert.equal(r.closedTrades, 1); assert.equal(r.openAtEnd, 0); near(r.returnPct, 2); });
test('growth preset sizes and observed daily/peak locks are enforced', () => {
    for (const [profile, risk] of [['SMART_GROWTH', 1.5], ['GROWTH_2PCT', 2], ['AGGRESSIVE_5PCT', 5]] as const) {
        const r = runClientBacktest([trade()], options({ profile, customRiskPct: null, openRiskCapPct: 20, factorRiskCapPct: 20 }));
        near(r.trades[0].applied_risk_pct, risk);
    }
    const first = trade({ realized_r: -5 }), second = trade({ id: 'b', entry_time: '2026-10-05T03:00:00Z', exit_time: '2026-10-05T04:00:00Z' });
    assert.equal(runClientBacktest([first, second], options()).skipped.DAILY_LOCK, 1);
    const peak = runClientBacktest([trade({ realized_r: -20 }), { ...second, entry_time: '2026-10-06T03:00:00Z', exit_time: '2026-10-06T04:00:00Z' }], options());
    assert.equal(peak.skipped.PEAK_LOCK, 1);
    assert.throws(() => runClientBacktest([], options({ startDate: '2026-02-30' })), /Invalid UTC date/);
});
