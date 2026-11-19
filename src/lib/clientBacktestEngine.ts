import { COST_POSITIVE_CONFIG_IDS } from '../../supabase/functions/_shared/cost-positive-configs';
import { PERSONAL_CRYPTO_DEFAULT_STRATEGIES, PERSONAL_FOREX_STRATEGIES } from '../../supabase/functions/_shared/strategy-deployment-policy';
import { VIP_CONFIG_IDS } from '../../supabase/functions/_shared/vip-signal-policy';
import { defaultTierStrategies } from '../../supabase/functions/_shared/execution-tier-presets';
import { houseMoneyRisk, topHourlyConfig } from '../../supabase/functions/_shared/house-money-risk';
import { PERSONAL_RISK_PROFILES, type CanonicalPersonalRiskProfile, concurrentCryptoRiskMultiplier } from '../../supabase/functions/_shared/personal-growth-policy';
import { weekendRotation } from '../../supabase/functions/_shared/conditional-market';
import { portfolioRiskGate } from '../../supabase/functions/_shared/portfolio-exposure';
export type Market = 'CRYPTO' | 'FOREX' | 'METALS';
export interface LedgerTrade {
    id: string;
    strategy_id: string;
    symbol: string;
    market: Market;
    timeframe: string;
    side: string | null;
    entry_time: string;
    exit_time: string;
    realized_r: number;
    cost_r: number | null;
    entry_price: number | null;
    initial_stop: number | null;
    peak_r: number | null;
    peak_r_basis: string | null;
    source_sha256: string | null;
    entry_volume_ratio?: number | null;
    entry_feature_at?: string | null;
}
export type ExitMode = 'ORIGINAL' | 'FIXED_1R' | 'FIXED_2R' | 'FIXED_3R' | 'BREAKEVEN_1_5R';
export type Lineup = 'PERSONAL_5' | 'VIP_8' | 'PROP_8' | 'ALL_16';
export const LAB_LINEUPS: Record<Lineup, readonly string[]> = { PERSONAL_5: [...PERSONAL_CRYPTO_DEFAULT_STRATEGIES, ...PERSONAL_FOREX_STRATEGIES], VIP_8: VIP_CONFIG_IDS, PROP_8: defaultTierStrategies('MT5_PROP', 'demo', 'PROP_EVALUATION'), ALL_16: COST_POSITIVE_CONFIG_IDS };
export interface BacktestOptions {
    strategyIds: readonly string[];
    startingBalance: number;
    monthlyFee: number;
    startDate: string;
    endDate: string;
    profile: CanonicalPersonalRiskProfile;
    customRiskPct: number | null;
    exitMode: ExitMode;
    leverage: number;
    marginEnabled: boolean;
    cryptoGuard: boolean;
    weekendMultiplier: boolean;
    maxOpenPositions: number;
    oneTradePerDay: boolean;
    openRiskCapPct?: number;
    factorRiskCapPct?: number;
    productEntryFilters?: boolean;
}
export interface ResultTrade extends LedgerTrade {
    applied_risk_pct: number;
    risk_cash: number;
    simulated_r: number;
    pnl: number;
    exit_basis: string;
}
export interface BacktestResult {
    settings: BacktestOptions;
    returnPct: number;
    netProfit: number;
    endingBalance: number;
    fees: number;
    maxDrawdownPct: number;
    winRate: number;
    closedTrades: number;
    entries: number;
    openAtEnd: number;
    skipped: Record<string, number>;
    warnings: Record<string, number>;
    equity: {
        at: string;
        balance: number;
    }[];
    trades: ResultTrade[];
}
export function assertLabAdmin(role: unknown) { if (role !== 'admin')
    throw Error('ADMIN_REQUIRED'); }
export function labAdminAllowed(userId: unknown, profile: {
    id?: string;
    role?: unknown;
} | null | undefined) { return typeof userId === 'string' && !!userId && profile?.id === userId && profile.role === 'admin'; }
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const optionalNumber = (x: unknown): number | null => x === null || x === undefined || x === '' ? null : typeof x !== 'boolean' && Number.isFinite(Number(x)) ? Number(x) : (() => { throw Error('Invalid numeric field'); })();
function iso(value: unknown) { let time: number; if (typeof value === 'number' || typeof value === 'string' && /^\d{10,13}$/.test(value)) {
    const n = Number(value);
    time = n < 1e12 ? n * 1000 : n;
}
else if (typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value))
    time = Date.parse(value);
else
    throw Error('Trade timestamps must use ISO with timezone or Unix time'); if (!Number.isFinite(time) || time < Date.UTC(2000, 0, 1) || time > Date.UTC(2100, 0, 1))
    throw Error('Invalid trade time'); return new Date(time).toISOString(); }
export function normalizeLedger(rows: readonly Record<string, unknown>[]): LedgerTrade[] {
    if (!Array.isArray(rows) || rows.length > 20000)
        throw Error('Use at most 20,000 closed trades');
    const found = new Map<string, LedgerTrade>();
    for (const r of rows) {
        const strategy = String(r.strategy_id ?? r.strategy ?? ''), symbol = String(r.symbol ?? '').toUpperCase(), entry = iso(r.entry_time ?? r.entry), exit = iso(r.exit_time ?? r.exit), net = optionalNumber(r.realized_r ?? r.net_r ?? r.netR);
        if (!strategy || strategy.length > 250 || !/^[A-Z0-9._-]{2,30}$/.test(symbol) || net === null || Math.abs(net) > 10000 || Date.parse(exit) < Date.parse(entry))
            throw Error('Invalid closed trade identity, R or chronology');
        const inferred: Market = /USDT$|^(BTC|ETH|SOL)USD(?:[._-].*)?$/.test(symbol) ? 'CRYPTO' : /^(XAU|XAG)/.test(symbol) ? 'METALS' : 'FOREX';
        const market = String(r.market ?? inferred).toUpperCase();
        if (!['CRYPTO', 'FOREX', 'METALS'].includes(market))
            throw Error('Invalid market');
        if ((/USDT$|^(XAU|XAG)/.test(symbol)) && market !== inferred)
            throw Error('Symbol/market mismatch');
        const t: LedgerTrade = { id: String(r.id ?? r.candidate_id ?? `${symbol}:${entry}:${exit}`), strategy_id: strategy, symbol, market: market as Market, timeframe: String(r.timeframe ?? 'unknown'), side: r.side == null || r.side === '' ? null : String(r.side), entry_time: entry, exit_time: exit, realized_r: net, cost_r: optionalNumber(r.cost_r), entry_price: optionalNumber(r.entry_price), initial_stop: optionalNumber(r.initial_stop), peak_r: optionalNumber(r.peak_r ?? r.mfe_r), peak_r_basis: r.peak_r_basis == null || r.peak_r_basis === '' ? null : String(r.peak_r_basis), source_sha256: r.source_sha256 == null || r.source_sha256 === '' ? null : String(r.source_sha256), entry_volume_ratio: optionalNumber(r.entry_volume_ratio), entry_feature_at: r.entry_feature_at == null || r.entry_feature_at === '' ? null : iso(r.entry_feature_at) };
        if (!t.id || t.id.length > 1000 || t.peak_r !== null && t.peak_r < 0 || t.entry_price !== null && t.entry_price <= 0 || t.initial_stop !== null && t.initial_stop <= 0)
            throw Error('Invalid trade geometry or peak R');
        const key = t.strategy_id + ':' + t.id, prior = found.get(key);
        if (prior && JSON.stringify(prior) !== JSON.stringify(t))
            throw Error('Conflicting duplicate trade');
        found.set(key, t);
    }
    return [...found.values()].sort((a, b) => Date.parse(a.entry_time) - Date.parse(b.entry_time) || a.id.localeCompare(b.id));
}
/** RFC4180-style parsing, including quoted commas, escaped quotes and embedded newlines. */
export function parseLedgerCsv(text: string, role: unknown): LedgerTrade[] {
    assertLabAdmin(role);
    text = text.replace(/^\uFEFF/, '');
    if (text.length > 10000000)
        throw Error('CSV limit is 10 MB');
    const rows: string[][] = [];
    let row: string[] = [], field = '', quoted = false, closedQuote = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            }
            else if (c === '"') {
                quoted = false;
                closedQuote = true;
            }
            else
                field += c;
        }
        else if (c === '"') {
            if (field || closedQuote)
                throw Error('Malformed CSV quote');
            quoted = true;
        }
        else if (c === ',' || c === '\n' || c === '\r') {
            row.push(field);
            field = '';
            closedQuote = false;
            if (c !== ',') {
                if (row.some(Boolean))
                    rows.push(row);
                row = [];
                if (c === '\r' && text[i + 1] === '\n')
                    i++;
            }
        }
        else {
            if (closedQuote)
                throw Error('Unexpected content after CSV quote');
            field += c;
        }
    }
    if (quoted)
        throw Error('Unclosed CSV quote');
    row.push(field);
    if (row.some(Boolean))
        rows.push(row);
    const headers = rows.shift()?.map((h, i) => (i === 0 ? h.replace(/^\uFEFF/, '') : h).trim().toLowerCase());
    if (!headers || new Set(headers).size !== headers.length)
        throw Error('CSV headers are missing or duplicated');
    if (!headers.includes('strategy_id') && !headers.includes('strategy'))
        throw Error('CSV requires strategy_id');
    return normalizeLedger(rows.map(r => { if (r.length !== headers.length)
        throw Error('CSV column count mismatch'); return Object.fromEntries(headers.map((h, i) => [h, r[i]])); }));
}
const cell = (value: unknown) => { const s = value === null || value === undefined ? '' : String(value), safe = typeof value === 'string' && /^[\s]*[=+\-@]/.test(s) ? "'" + s : s; return '"' + safe.replaceAll('"', '""') + '"'; };
const csv = (rows: readonly Record<string, unknown>[], headers: string[]) => [headers.map(cell).join(','), ...rows.map(r => headers.map(h => cell(r[h])).join(','))].join('\r\n');
const sourceHeaders = ['id', 'strategy_id', 'symbol', 'market', 'timeframe', 'side', 'entry_time', 'exit_time', 'realized_r', 'cost_r', 'entry_price', 'initial_stop', 'peak_r', 'peak_r_basis', 'source_sha256', 'entry_volume_ratio', 'entry_feature_at'];
export function sourceTradesCsv(trades: LedgerTrade[], role: unknown) { assertLabAdmin(role); return csv(trades as unknown as Record<string, unknown>[], sourceHeaders); }
export function resultTradesCsv(result: BacktestResult, role: unknown) { assertLabAdmin(role); const summary = { portfolio_return_pct: result.returnPct, portfolio_net_profit_after_fees: result.netProfit, portfolio_fee_total: result.fees, portfolio_realized_dd_pct: result.maxDrawdownPct, portfolio_ending_balance: result.endingBalance, open_at_end: result.openAtEnd, starting_balance: result.settings.startingBalance, monthly_fee: result.settings.monthlyFee, risk_profile: result.settings.profile, custom_risk_pct: result.settings.customRiskPct, exit_mode: result.settings.exitMode, leverage: result.settings.leverage, margin_enabled: result.settings.marginEnabled, crypto_guard: result.settings.cryptoGuard, weekend_multiplier: result.settings.weekendMultiplier, start_date: result.settings.startDate, end_date: result.settings.endDate, selected_strategy_ids: JSON.stringify(result.settings.strategyIds), max_open_positions: result.settings.maxOpenPositions, one_trade_per_day: result.settings.oneTradePerDay, product_entry_filters: result.settings.productEntryFilters ?? false, open_risk_cap_pct: result.settings.openRiskCapPct ?? PERSONAL_RISK_PROFILES[result.settings.profile].open, factor_risk_cap_pct: result.settings.factorRiskCapPct ?? PERSONAL_RISK_PROFILES[result.settings.profile].correlated, skipped_counts: JSON.stringify(result.skipped), warning_counts: JSON.stringify(result.warnings) }; const rows = result.trades.length ? result.trades.map(t => ({ ...t, ...summary })) : [summary]; return csv(rows as unknown as Record<string, unknown>[], [...sourceHeaders, 'applied_risk_pct', 'risk_cash', 'simulated_r', 'pnl', 'exit_basis', ...Object.keys(summary)]); }
export function alternateExit(t: LedgerTrade, mode: ExitMode): {
    r: number;
    basis: string;
} {
    if (mode === 'ORIGINAL')
        return { r: t.realized_r, basis: 'Recorded net R' };
    if (mode === 'BREAKEVEN_1_5R') {
        if (t.peak_r !== null && t.peak_r >= 1.5 && t.cost_r !== null)
            return { r: Math.max(t.realized_r, -t.cost_r), basis: 'Estimated breakeven after saved reference peak; chronology unknown' };
        return { r: t.realized_r, basis: 'Realized-R fallback: no provable earlier breakeven' };
    }
    const target = Number(mode.match(/\d/)?.[0]);
    if (![1, 2, 3].includes(target))
        throw Error('Invalid exit mode');
    if (t.peak_r !== null && t.peak_r >= target && t.cost_r !== null)
        return { r: target - t.cost_r, basis: 'Estimated target touch from saved reference peak; chronology unknown' };
    return { r: Math.min(t.realized_r, target), basis: 'Net realized-R cap; no reconstructed price path' };
}
export function runClientBacktest(input: LedgerTrade[], o: BacktestOptions): BacktestResult {
    input = normalizeLedger(input as unknown as Record<string, unknown>[]);
    const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(Date.parse(s)).toISOString().slice(0, 10) === s;
    if (!validDate(o.startDate) || !validDate(o.endDate))
        throw Error('Invalid UTC date window');
    const p = PERSONAL_RISK_PROFILES[o.profile], start = Date.parse(o.startDate + 'T00:00:00Z'), end = Date.parse(o.endDate + 'T00:00:00Z') + 86400000;
    if (!p || !['ORIGINAL', 'FIXED_1R', 'FIXED_2R', 'FIXED_3R', 'BREAKEVEN_1_5R'].includes(o.exitMode) || ![o.startingBalance, o.monthlyFee, o.leverage, o.maxOpenPositions, start, end].every(Number.isFinite) || o.startingBalance < 100 || o.startingBalance > 1e9 || o.monthlyFee < 0 || o.monthlyFee > 10000 || o.leverage < 1 || o.leverage > 100 || !Number.isInteger(o.maxOpenPositions) || o.maxOpenPositions < 1 || o.maxOpenPositions > 100 || end <= start || end - start > 20 * 366 * 86400000 || o.customRiskPct !== null && (!finite(o.customRiskPct) || o.customRiskPct < .25 || o.customRiskPct > 10) || !o.strategyIds.length)
        throw Error('Invalid capital, dates, risk or leverage controls');
    const openCap = o.openRiskCapPct ?? p.open, factorCap = o.factorRiskCapPct ?? p.correlated;
    if (![openCap, factorCap].every(v => Number.isFinite(v) && v > 0 && v <= 100) || factorCap > openCap)
        throw Error('Invalid open/factor risk caps');
    const skipped: Record<string, number> = {}, warnings: Record<string, number> = {}, bump = (r: Record<string, number>, key: string) => { r[key] = (r[key] ?? 0) + 1; };
    const trades: ResultTrade[] = [], equity: {
        at: string;
        balance: number;
    }[] = [{ at: new Date(start).toISOString(), balance: o.startingBalance }];
    let balance = o.startingBalance, peak = balance, dd = 0, fees = 0, entries = 0, wins = 0, month = '', day = '', monthBase = balance, monthlyTradingNet = 0, dailyBase = balance, losses = 0, peakLocked = false, dailyLocked = false, lastEntryDay = '';
    const open = new Map<string, {
        trade: LedgerTrade;
        risk: number;
        pct: number;
        margin: number;
    }>(), events: {
        at: number;
        kind: number;
        t?: LedgerTrade;
        fee?: number;
    }[] = [];
    for (const t of input)
        if (o.strategyIds.includes(t.strategy_id) && Date.parse(t.entry_time) >= start && Date.parse(t.entry_time) < end) {
            events.push({ at: Date.parse(t.entry_time), kind: 2, t }, { at: Date.parse(t.exit_time), // Same-timestamp closes must follow their own admission.
                kind: Date.parse(t.exit_time) === Date.parse(t.entry_time) ? 3 : 1, t });
        }
    for (let at = start; at < end; at += 86400000)
        events.push({ at: Math.min(end, at + 86400000), kind: 0, fee: o.monthlyFee / 30 * Math.min(1, (end - at) / 86400000) });
    const mark = (at: number) => { peak = Math.max(peak, balance); dd = Math.max(dd, (peak - balance) / peak * 100); if ((peak - balance) / peak * 100 >= p.peak)
        peakLocked = true; if ((balance - dailyBase) / dailyBase * 100 <= -p.daily)
        dailyLocked = true; equity.push({ at: new Date(at).toISOString(), balance }); if (balance <= 0)
        bump(warnings, 'ACCOUNT_INSOLVENT'); };
    events.sort((a, b) => a.at - b.at || a.kind - b.kind || (a.t?.id ?? '').localeCompare(b.t?.id ?? ''));
    for (const e of events) {
        if (e.at > end || e.at === end && e.kind !== 0)
            break;
        const iso = new Date(e.at).toISOString(), m = iso.slice(0, 7), d = iso.slice(0, 10);
        if (m !== month) {
            month = m;
            monthBase = balance;
            monthlyTradingNet = 0;
        }
        if (d !== day) {
            day = d;
            dailyBase = balance;
            dailyLocked = false;
        }
        if (e.kind === 0) {
            balance -= e.fee ?? 0;
            fees += e.fee ?? 0;
            mark(e.at);
            continue;
        }
        const t = e.t!, key = t.strategy_id + ':' + t.id;
        if (e.kind === 1 || e.kind === 3) {
            const held = open.get(key);
            if (!held)
                continue;
            const outcome = alternateExit(t, o.exitMode), pnl = held.risk * outcome.r;
            if (!Number.isFinite(balance + pnl))
                throw Error('Scenario exceeds numeric range; reduce risk or date range');
            balance += pnl;
            monthlyTradingNet += pnl;
            wins += Number(pnl > 0);
            losses = pnl < 0 ? losses + 1 : pnl > 0 ? 0 : losses;
            trades.push({ ...t, applied_risk_pct: held.pct, risk_cash: held.risk, simulated_r: outcome.r, pnl, exit_basis: outcome.basis });
            open.delete(key);
            if (o.exitMode !== 'ORIGINAL')
                bump(warnings, 'ALTERNATE_EXIT_ESTIMATE');
            mark(e.at);
            continue;
        }
        if (balance <= 0 || peakLocked || dailyLocked) {
            bump(skipped, balance <= 0 ? 'INSOLVENT' : peakLocked ? 'PEAK_LOCK' : 'DAILY_LOCK');
            continue;
        }
        if (o.oneTradePerDay && lastEntryDay === d) {
            bump(skipped, 'DAILY_ENTRY_SLOT');
            continue;
        }
        if (open.size >= o.maxOpenPositions) {
            bump(skipped, 'MAX_OPEN_POSITIONS');
            continue;
        }
        if ([...open.values()].some(h => h.trade.symbol === t.symbol)) {
            bump(skipped, 'SYMBOL_LOCK');
            continue;
        }
        if (o.productEntryFilters && t.strategy_id === 'gold.rsi-trailing-15-48-1.5-5-h96' && !(typeof t.entry_volume_ratio === 'number' && t.entry_volume_ratio >= 1 && t.entry_feature_at && Date.parse(t.entry_feature_at) <= Date.parse(t.entry_time))) {
            bump(skipped, 'GOLD_ENTRY_VOLUME_GATE');
            continue;
        }
        const weekend = o.weekendMultiplier && t.market === 'CRYPTO' && weekendRotation(e.at) ? .75 : 1;
        const dynamic = houseMoneyRisk('PERSONAL', { customerId: 'browser', accountId: 'research', observedAt: iso, monthlyPnlPct: monthBase > 0 ? monthlyTradingNet / monthBase * 100 : 0, dailyPnlPct: (balance - dailyBase) / dailyBase * 100, peakDrawdownPct: (peak - balance) / peak * 100, totalDrawdownPct: Math.max(0, (o.startingBalance - balance) / o.startingBalance * 100), consecutiveLosses: losses, phase: 1 }, iso, topHourlyConfig(t.strategy_id, t.timeframe), 1);
        const base = o.customRiskPct ?? (o.profile === 'STANDARD' ? dynamic.applied_risk_pct : p.risk);
        const pct = base * weekend * (o.cryptoGuard ? concurrentCryptoRiskMultiplier(t.symbol, [...open.values()].map(h => ({ symbol: h.trade.symbol }))) : 1);
        const gate = portfolioRiskGate({ symbol: t.symbol, positions: [...open.values()].map(h => ({ symbol: h.trade.symbol, open_risk_pct: h.risk / balance * 100 })), requestedRiskPct: pct, portfolioLimitPct: openCap, correlatedLimitPct: factorCap });
        if (!gate.allowed || pct <= 0) {
            bump(skipped, 'EXPOSURE_OR_RISK_CAP');
            continue;
        }
        const risk = balance * pct / 100;
        let margin = 0;
        if (o.marginEnabled) {
            if (t.entry_price === null || t.initial_stop === null || t.entry_price === t.initial_stop) {
                bump(skipped, 'MISSING_INITIAL_STOP_FOR_MARGIN');
                bump(warnings, 'MARGIN_DATA_MISSING');
                continue;
            }
            const notional = risk * t.entry_price / Math.abs(t.entry_price - t.initial_stop);
            margin = notional / o.leverage;
            if (risk >= margin)
                bump(warnings, 'POTENTIAL_ISOLATED_LIQUIDATION_BEFORE_STOP');
            const used = [...open.values()].reduce((n, h) => n + h.margin, 0);
            if (used + margin > balance * .5) {
                bump(skipped, 'MARGIN_BUDGET_50_PERCENT');
                bump(warnings, 'INSUFFICIENT_MARGIN');
                continue;
            }
        }
        entries++;
        lastEntryDay = d;
        open.set(key, { trade: t, risk, pct, margin });
    }
    return { settings: { ...o, strategyIds: [...o.strategyIds] }, returnPct: (balance / o.startingBalance - 1) * 100, netProfit: balance - o.startingBalance, endingBalance: balance, fees, maxDrawdownPct: dd, winRate: trades.length ? wins / trades.length * 100 : 0, closedTrades: trades.length, entries, openAtEnd: open.size, skipped, warnings, equity, trades };
}
