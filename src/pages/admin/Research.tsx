import {LaunchStrategyResearch} from './backtest/LaunchStrategyResearch';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/layout/AdminLayout';
import Mission2ResearchResults from './backtest/Mission2ResearchResults';

export default function Research() {
  return <AdminLayout title="Strategy research"><div className="mx-auto max-w-7xl space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">Trading engine improvement</p><h1 className="mt-2 text-3xl font-bold">Strategies & research</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">See what the scanner found, what each account could take and what happened after costs. Compare periods and entry methods before changing strategy settings.</p></header>
    <nav aria-label="Research tasks" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ['/admin/backtest?workspace=DATA','1. Get market history','Acquire candles, check coverage and include strategy warm-up.'],
        ['/admin/backtest?workspace=SCANNER','2. Run scanner replay','Inspect decisions, watches and account research evidence.'],
        ['/admin/backtest?workspace=CALIBRATION','3. Compare changes','Test a recorded hypothesis across separate periods.'],
        ['/admin/providers','4. Observe demo accounts','Connect Binance, Bybit and MT5 and inspect actual fills.'],
      ].map(([to,title,body]) => <Link key={to} to={to} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-cyan-700"><h2 className="text-sm font-semibold text-cyan-200">{title} →</h2><p className="mt-2 text-xs leading-5 text-zinc-400">{body}</p></Link>)}
    </nav>
    <LaunchStrategyResearch />
    <Mission2ResearchResults />
    <div className="flex flex-wrap gap-5 text-sm text-cyan-300"><Link to="/admin/strategies">Strategy settings →</Link><Link to="/admin/backtest?workspace=RESULTS">Research jobs & exports →</Link><Link to="/admin/scanner">Current scanner →</Link><Link to="/results">Public results page →</Link></div>
  </div></AdminLayout>;
}
