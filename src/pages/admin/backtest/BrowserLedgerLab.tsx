import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase, isSupabaseClientEnabled } from '../../../lib/supabase';
import { LAB_LINEUPS, assertLabAdmin, labAdminAllowed, normalizeLedger, parseLedgerCsv, sourceTradesCsv, resultTradesCsv, runClientBacktest, type LedgerTrade, type BacktestOptions, type BacktestResult, type Lineup, type ExitMode } from '../../../lib/clientBacktestEngine';
import { canUseOfflineBacktestWorkspace } from '../../../lib/backtestWorkspaceAccess';
import { onlineOrSaved } from '../../../lib/clientBacktestSources';
import { executionStrategyDisplayName } from '../../../../supabase/functions/_shared/execution-strategy-presets';
import { PERSONAL_RISK_PROFILES, type CanonicalPersonalRiskProfile } from '../../../../supabase/functions/_shared/personal-growth-policy';
const invalidate = (ref: {
    current: number;
}) => { ref.current++; };
const saved = async () => normalizeLedger((await import('../../../data/saved-ledger-trades.json')).default.trades);
const lineups: Record<Lineup, string> = { PERSONAL_5: 'Personal · 5 engines', VIP_8: 'VIP · 8 sources · 1 trade/day', PROP_8: 'Prop · 8-engine selection', ALL_16: 'All 16 reviewed configurations' };
const exits: Record<ExitMode, string> = { ORIGINAL: 'Original recorded exit', FIXED_1R: 'Fixed 1R estimate', FIXED_2R: 'Fixed 2R estimate', FIXED_3R: 'Fixed 3R estimate', BREAKEVEN_1_5R: '1.5R breakeven estimate' };
const initial: BacktestOptions = { strategyIds: LAB_LINEUPS.PERSONAL_5, startingBalance: 10000, monthlyFee: 100, startDate: '2026-09-16', endDate: '2026-10-31', profile: 'STANDARD', customRiskPct: null, exitMode: 'ORIGINAL', leverage: 15, marginEnabled: true, cryptoGuard: false, weekendMultiplier: true, maxOpenPositions: 3, oneTradePerDay: false, productEntryFilters: true };
const inputClass = 'mt-1 min-h-11 min-w-0 max-w-full w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100';
const button = 'min-h-11 rounded-lg border border-cyan-800 px-3 py-2 text-sm text-cyan-200 disabled:opacity-40';
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
function download(text: string, name: string) { const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function EquityCurve({ points }: {
    points: BacktestResult['equity'];
}) {
    const sampled = points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 600)) === 0 || i === points.length - 1), values = sampled.map(p => p.balance), low = Math.min(...values), high = Math.max(...values), span = high - low || 1, first = Date.parse(points[0].at), duration = Date.parse(points.at(-1)!.at) - first || 1;
    return <figure className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><figcaption className="mb-3 font-medium">Realized balance after fees</figcaption><svg role="img" aria-label="Realized balance curve after closed trades and service fees; floating equity is unavailable" viewBox="0 0 640 210" className="w-full"><title>Recorded-close balance, not floating equity</title><line x1="45" x2="630" y1="175" y2="175" stroke="#52525b"/><text x="4" y="20" fill="#a1a1aa" fontSize="11">{Math.round(high).toLocaleString()}</text><text x="4" y="175" fill="#a1a1aa" fontSize="11">{Math.round(low).toLocaleString()}</text><polyline fill="none" stroke="#22d3ee" strokeWidth="2" points={sampled.map(p => `${45 + (Date.parse(p.at) - first) / duration * 580},${175 - (p.balance - low) / span * 155}`).join(' ')}/><text x="45" y="200" fill="#a1a1aa" fontSize="11">{points[0].at.slice(0, 10)}</text><text x="535" y="200" fill="#a1a1aa" fontSize="11">{points.at(-1)!.at.slice(0, 10)}</text></svg><p className="text-xs text-zinc-500">Chart sampled to 600 points; KPIs use every close and fee event. Floating losses and liquidation fills are not reconstructed.</p></figure>;
}
export default function BrowserLedgerLab({ onServer }: {
    onServer: () => void;
}) {
    const { user, profile, lastKnownProfile } = useAuth(), [denied, setDenied] = useState(false), offlineWorkspace = canUseOfflineBacktestWorkspace(user?.id), role = (offlineWorkspace || labAdminAllowed(user?.id, profile ?? lastKnownProfile)) && !denied ? 'admin' : null, roleRef = useRef<string | null>(role);
    roleRef.current = role;
    const [trades, setTrades] = useState<LedgerTrade[]>([]), [source, setSource] = useState('OFFLINE'), [sourceChoice, setSourceChoice] = useState('SAVED'), [notice, setNotice] = useState('Loading saved ledger…'), [error, setError] = useState(''), [busy, setBusy] = useState(false), [o, setOptions] = useState<BacktestOptions>(initial), [lineup, setLineup] = useState<Lineup | 'SINGLE' | 'CUSTOM'>('PERSONAL_5'), [result, setResult] = useState<BacktestResult | null>(null), [runKey, setRunKey] = useState(''), [revision, setRevision] = useState(0);
    const generation = useRef(0);
    useEffect(() => { roleRef.current = role; if (role !== 'admin')
        return; const token = generation.current; let active = true; void saved().then(rows => { if (active && token === generation.current && roleRef.current === 'admin') {
        setTrades(rows);
        setNotice('Saved research ledger. No candles or provider orders are requested.');
    } }).catch(() => { if (active && token === generation.current)
        setError('Saved ledger could not be loaded.'); }); return () => { active = false; invalidate(generation); roleRef.current = null; }; }, [role]);
    const set = <K extends keyof BacktestOptions>(key: K, value: BacktestOptions[K]) => setOptions(old => ({ ...old, [key]: value }));
    const install = (rows: LedgerTrade[], kind: string, text: string) => { setTrades(rows); setSource(kind); setNotice(text); setRevision(r => r + 1); setResult(null); if (rows.length && !rows.some(t => t.entry_price !== null && t.initial_stop !== null)) {
        set('marginEnabled', false);
        setNotice(text + ' Initial-stop data is unavailable; margin model is off.');
    } };
    async function chooseSource(value: string) { setSourceChoice(value); const token = ++generation.current; setBusy(true); setError(''); try {
        assertLabAdmin(roleRef.current);
        if (value === 'SAVED') {
            const rows = await saved();
            if (token !== generation.current)
                return;
            assertLabAdmin(roleRef.current);
            install(rows, 'OFFLINE', 'Saved cost-inclusive research ledger.');
        }
        else if (offlineWorkspace || !isSupabaseClientEnabled) {
            const rows = await saved();
            if (token !== generation.current)
                return;
            assertLabAdmin(roleRef.current);
            install(rows, 'OFFLINE', offlineWorkspace ? 'Admin workspace is offline. Using the saved ledger; sign in after Supabase activation for online history.' : 'Online connection unavailable. Using the saved ledger.');
        }
        else {
            const loaded = await onlineOrSaved(supabase, user?.id ?? '', roleRef.current, saved);
            if (token !== generation.current)
                return;
            assertLabAdmin(roleRef.current);
            install(loaded.trades, loaded.mode, loaded.notice + (loaded.runId ? ' Run ' + loaded.runId : ''));
        }
    }
    catch (e) {
        if (token === generation.current) {
            if (e instanceof Error && e.message === 'ADMIN_REQUIRED') {
                roleRef.current = null;
                setDenied(true);
            }
            setError(e instanceof Error ? e.message : 'Source unavailable');
        }
    }
    finally {
        if (token === generation.current)
            setBusy(false);
    } }
    async function upload(file: File | undefined) { if (!file)
        return; const token = ++generation.current; setBusy(true); setError(''); try {
        assertLabAdmin(roleRef.current);
        if (file.size > 10000000)
            throw Error('CSV limit is 10 MB');
        const text = await file.text();
        if (token !== generation.current)
            return;
        const rows = parseLedgerCsv(text, roleRef.current);
        if (!rows.length)
            throw Error('CSV contains no closed trades');
        install(rows, 'CSV', 'Uploaded CSV · user-supplied historical outcomes.');
        setSourceChoice('CSV');
    }
    catch (e) {
        if (token === generation.current)
            setError(e instanceof Error ? e.message : 'CSV unavailable');
    }
    finally {
        if (token === generation.current)
            setBusy(false);
    } }
    const strategies = [...new Set([...LAB_LINEUPS.ALL_16, ...trades.map(t => t.strategy_id)])].sort(), stale = runKey !== JSON.stringify({ o, revision });
    function applyLineup(value: typeof lineup) { setLineup(value); if (value in LAB_LINEUPS) {
        const key = value as Lineup;
        setOptions(old => ({ ...old, strategyIds: [...LAB_LINEUPS[key]], oneTradePerDay: key === 'VIP_8', productEntryFilters: key === 'VIP_8' || key === 'PERSONAL_5', maxOpenPositions: key === 'PROP_8' ? 2 : 3, monthlyFee: key === 'VIP_8' ? 29 : key === 'ALL_16' ? 0 : 100 }));
    }
    else if (value === 'SINGLE')
        set('strategyIds', [strategies[0]]); }
    async function run() { setBusy(true); setError(''); try {
        await new Promise(resolve => setTimeout(resolve, 0));
        assertLabAdmin(roleRef.current);
        setResult(runClientBacktest(trades, o));
        setRunKey(JSON.stringify({ o, revision }));
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Comparison failed');
    }
    finally {
        setBusy(false);
    } }
    function exportSource() { try {
        download(sourceTradesCsv(trades, roleRef.current), 'hashibot-source-trades.csv');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Admin access required');
    } }
    function exportResults() { try {
        assertLabAdmin(roleRef.current);
        if (result && !stale)
            download(resultTradesCsv(result, roleRef.current), 'hashibot-backtest-results.csv');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Admin access required');
    } }
    if (denied || role !== 'admin')
        return <p role="alert" className="p-6 text-amber-200">A verified Admin profile is required for the lab and CSV tools.</p>;
    const peaks = trades.filter(t => t.peak_r !== null).length, flags = result ? Object.entries(result.warnings).filter(([key]) => key !== 'ALTERNATE_EXIT_ESTIMATE').reduce((n, [, count]) => n + count, 0) : 0;
    return <div className="mx-auto max-w-6xl space-y-5 text-zinc-100"><header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-cyan-300">Admin research · browser replay</p><h1 className="text-3xl font-semibold">Backtest Lab</h1><p className="mt-2 max-w-2xl text-sm text-zinc-400">Explore saved trades, fees and account sizing. These controls never change strategies or customer execution settings.</p></div><div className="flex flex-wrap gap-2"><span role="status" className="rounded-full border border-cyan-800 px-3 py-2 text-sm">{source === 'ONLINE' ? 'Online Supabase' : source === 'CSV' ? 'Uploaded CSV' : 'Offline'} · {trades.length.toLocaleString()} Trades</span><button className={button} onClick={onServer}>Server research workspace →</button></div></header>
 <section className="space-y-3 rounded-xl border border-zinc-800 p-4"><div className="flex flex-wrap items-end gap-3"><label className="min-w-48 flex-1 text-sm">Trade source<select aria-label="Trade source" disabled={busy} className={inputClass} value={sourceChoice} onChange={e => void chooseSource(e.target.value)}><option value="SAVED">Saved ledger · offline</option><option value="ONLINE">Supabase history · auto offline fallback</option>{sourceChoice === 'CSV' && <option value="CSV">Uploaded CSV</option>}</select></label><label className={button + ' cursor-pointer'}>Upload CSV<input aria-label="Upload trade ledger CSV" disabled={busy} type="file" accept=".csv,text/csv" className="sr-only" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }}/></label><button disabled={busy || !trades.length} onClick={exportSource} className={button}>Download Source CSV</button><button disabled={busy || !result || stale} onClick={exportResults} className={button}>Download Results CSV</button></div><p className="break-words text-xs text-zinc-400">{notice}</p><p className="text-xs text-zinc-400">{peaks}/{trades.length} rows have saved reference peak R. Other rows use net-R caps for alternate exits. All alternate exits retain the original exit timestamp; their touch/stop order is unknown.</p></section>
 <fieldset disabled={busy} className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-800 p-4 sm:grid-cols-2 lg:grid-cols-3"><legend className="px-2 font-medium">Build a comparison</legend>
 <label className="text-sm">Strategy lineup<select className={inputClass} value={lineup} onChange={e => applyLineup(e.target.value as typeof lineup)}>{Object.entries(lineups).map(([id, label]) => <option key={id} value={id}>{label}</option>)}<option value="SINGLE">Single strategy</option><option value="CUSTOM">Custom checkboxes</option></select></label>
 <label className="text-sm">Exit method<select className={inputClass} value={o.exitMode} onChange={e => set('exitMode', e.target.value as ExitMode)}>{Object.entries(exits).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
 <label className="text-sm">Starting balance · USD<input className={inputClass} type="number" min="100" max="1000000000" step="100" value={o.startingBalance} onChange={e => set('startingBalance', Number(e.target.value))}/></label>
 <label className="text-sm">Monthly software fee<select className={inputClass} value={o.monthlyFee} onChange={e => set('monthlyFee', Number(e.target.value))}>{[0, 29, 100].map(v => <option key={v} value={v}>{money(v)} / 30 days</option>)}</select></label>
 <label className="text-sm">From · UTC<input className={inputClass} type="date" value={o.startDate} onChange={e => set('startDate', e.target.value)}/></label><label className="text-sm">Through · UTC, inclusive<input className={inputClass} type="date" value={o.endDate} onChange={e => set('endDate', e.target.value)}/></label>
 <label className="text-sm">Risk preset<select className={inputClass} value={o.profile} onChange={e => { const profile = e.target.value as CanonicalPersonalRiskProfile; setOptions(old => ({ ...old, profile, customRiskPct: null, cryptoGuard: profile === 'SMART_GROWTH', openRiskCapPct: undefined, factorRiskCapPct: undefined })); }}><option value="STANDARD">Standard · 1% + House-Money</option><option value="SMART_GROWTH">Smart Growth · 1.5%</option><option value="GROWTH_2PCT">Growth · 2%</option><option value="AGGRESSIVE_5PCT">Aggressive research · 5%</option></select></label>
 <label className="text-sm">Leverage · {o.leverage}x<input className="mt-4 w-full accent-cyan-400" type="range" min="1" max="100" value={o.leverage} onChange={e => set('leverage', Number(e.target.value))}/></label><label className="text-sm">Maximum open trades<input className={inputClass} type="number" min="1" max="100" value={o.maxOpenPositions} onChange={e => set('maxOpenPositions', Number(e.target.value))}/></label>
 <label className="text-sm sm:col-span-2"><input type="checkbox" checked={o.customRiskPct !== null} onChange={e => set('customRiskPct', e.target.checked ? PERSONAL_RISK_PROFILES[o.profile].risk : null)}/> Custom risk · {o.customRiskPct ?? 'preset'}%<input aria-label="Custom risk percent" className="mt-3 w-full accent-cyan-400" disabled={o.customRiskPct === null} type="range" min="0.25" max="10" step="0.25" value={o.customRiskPct ?? PERSONAL_RISK_PROFILES[o.profile].risk} onChange={e => set('customRiskPct', Number(e.target.value))}/></label>
 <div className="space-y-2 text-sm">{[['cryptoGuard', '0.50x second/later concurrent Crypto risk'], ['weekendMultiplier', '0.75x weekend Crypto risk'], ['marginEnabled', 'Model margin · 50% balance budget'], ['oneTradePerDay', 'One new trade per UTC day'], ['productEntryFilters', 'Gold RSI product entry-volume gate']].map(([key, label]) => <label key={key} className="block"><input type="checkbox" checked={Boolean(o[key as keyof BacktestOptions])} onChange={e => set(key as 'cryptoGuard' | 'weekendMultiplier' | 'marginEnabled' | 'oneTradePerDay' | 'productEntryFilters', e.target.checked)}/> {label}</label>)}</div>
 {lineup === 'SINGLE' && <label className="text-sm sm:col-span-2 lg:col-span-3">Choose one engine<select className={inputClass} value={o.strategyIds[0] ?? ''} onChange={e => set('strategyIds', [e.target.value])}>{strategies.map(id => <option key={id} value={id}>{executionStrategyDisplayName(id, id)}</option>)}</select></label>}
 <details className="sm:col-span-2 lg:col-span-3"><summary className="cursor-pointer text-sm text-cyan-300">Custom engines and exposure limits · {o.strategyIds.length} selected</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{strategies.map(id => <label key={id} className="break-words text-xs"><input type="checkbox" checked={o.strategyIds.includes(id)} onChange={e => { setLineup('CUSTOM'); set('strategyIds', e.target.checked ? [...o.strategyIds, id] : o.strategyIds.filter(s => s !== id)); }}/> {executionStrategyDisplayName(id, id)} <span className="text-zinc-500">({trades.filter(t => t.strategy_id === id).length} source trades)</span></label>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">Open risk cap %<input className={inputClass} type="number" min="0.25" max="100" step="0.25" value={o.openRiskCapPct ?? PERSONAL_RISK_PROFILES[o.profile].open} onChange={e => set('openRiskCapPct', Number(e.target.value))}/></label><label className="text-sm">Shared-factor risk cap %<input className={inputClass} type="number" min="0.25" max="100" step="0.25" value={o.factorRiskCapPct ?? PERSONAL_RISK_PROFILES[o.profile].correlated} onChange={e => set('factorRiskCapPct', Number(e.target.value))}/></label></div></details>
 <div className="space-y-2 text-xs text-zinc-400 sm:col-span-2 lg:col-span-3"><p>Fees accrue daily at the monthly fee ÷ 30, including idle/halted days. Custom risk overrides trade sizing; daily/peak locks and visible exposure caps remain. A requested trade can be blocked when its risk exceeds a cap.</p><p>The Gold RSI product gate needs recorded entry volume ≥1; unknown/future features are skipped. Turn it off for unfiltered research. Saved periods differ by engine. This replays admitted closed trades, not every scanner opportunity. Prop engine selection does not certify firm rules. Saved ETH spot-reference leverage is hypothetical financing.</p><p>Alternate exits are scenario estimates. Margin alerts cannot establish liquidation prices or floating drawdown. Existing position risk stays at its original stop until its recorded exit.</p></div>
 </fieldset>
 <div className="flex flex-wrap gap-3"><button disabled={busy || !trades.length || !o.strategyIds.length} className="min-h-12 rounded-lg bg-cyan-600 px-6 py-3 font-semibold disabled:opacity-40" onClick={() => void run()}>{busy ? 'Working…' : 'Run browser comparison'}</button><button disabled={busy || !trades.length} className={button} onClick={() => { setOptions(old => ({ ...old, startDate: trades.reduce((a, t) => t.entry_time < a ? t.entry_time : a, trades[0].entry_time).slice(0, 10), endDate: trades.reduce((a, t) => t.exit_time > a ? t.exit_time : a, trades[0].exit_time).slice(0, 10) })); }}>Use all saved dates</button></div>
 {error && <p role="alert" className="rounded border border-red-800 p-3 text-sm text-red-200">{error}</p>}{result && <><p role="status" className="text-sm text-amber-200">{stale ? 'Settings changed. Run again to update these results.' : o.exitMode === 'ORIGINAL' ? 'Recorded-exit ledger replay.' : 'Alternate-exit estimate; not a new candle backtest.'}</p><div className={`grid grid-cols-2 gap-3 lg:grid-cols-6 ${stale ? 'opacity-60' : ''}`}>{[['Net return', result.returnPct.toFixed(2) + '%'], ['Net profit after fees', money(result.netProfit)], ['Worst realized DD', result.maxDrawdownPct.toFixed(2) + '%'], ['Margin/liquidation flags', String(flags)], ['Trade win rate', result.winRate.toFixed(1) + '%'], ['Closed / entered trades', `${result.closedTrades} / ${result.entries}`]].map(([label, value]) => <article key={label} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="text-xs text-zinc-400">{label}</h2><p className="mt-2 break-words text-lg font-semibold">{value}</p></article>)}</div><p className="text-xs text-zinc-400">Service fees deducted: {money(result.fees)} · Ending balance: {money(result.endingBalance)} · Unmarked open trades at window end: {result.openAtEnd}. Win rate uses trade outcomes before monthly service fees.</p><EquityCurve points={result.equity}/><details className="rounded-xl border border-zinc-800 p-4"><summary className="cursor-pointer font-medium">Skipped trades and margin/exit flags</summary><div className="mt-3 grid gap-4 sm:grid-cols-2"><ul className="space-y-2 text-sm">{Object.entries(result.skipped).map(([key, count]) => <li key={key}>{key.toLowerCase().replaceAll('_', ' ')}: {count}</li>)}{!Object.keys(result.skipped).length && <li>No entries skipped.</li>}</ul><ul className="space-y-2 text-sm text-amber-200">{Object.entries(result.warnings).map(([key, count]) => <li key={key}>{key.toLowerCase().replaceAll('_', ' ')}: {count}</li>)}{!Object.keys(result.warnings).length && <li>No scenario flags. This does not prove liquidation safety.</li>}</ul></div></details></>}
 </div>;
}
