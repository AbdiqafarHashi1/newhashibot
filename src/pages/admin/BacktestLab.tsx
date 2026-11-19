import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StrictBacktestAdmin } from '../../components/guards/StrictBacktestAdmin';
import { AdminLayout } from '../../components/layout/AdminLayout';
const BrowserLedgerLab = lazy(() => import('./backtest/BrowserLedgerLab'));
const LegacyBacktestLab = lazy(() => import('./LegacyBacktestLab'));
/** Every lab workspace, including legacy CSV tools, shares the literal Admin-role gate. */
export default function BacktestLab() { return <StrictBacktestAdmin><LabMode /></StrictBacktestAdmin>; }
function LabMode() {
    const [query] = useSearchParams(), [server, setServer] = useState(query.has('workspace'));
    return <Suspense fallback={<p className="p-8 text-zinc-300">Loading research workspace…</p>}>{server ? <LegacyBacktestLab onBrowser={() => setServer(false)}/> : <AdminLayout><BrowserLedgerLab onServer={() => setServer(true)}/></AdminLayout>}</Suspense>;
}
