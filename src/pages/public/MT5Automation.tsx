import { PublicLayout } from '../../components/layout/PublicLayout';
import { 
  Cpu, Terminal, AlertTriangle, ArrowRight, Check,
  Activity, Layers, ShieldCheck
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MT5Automation() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-zinc-900/40 border-b border-zinc-800/80">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          
          {/* Status Banner */}
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-1.5 text-xs text-emerald-300 font-bold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            MetaTrader 5 account automation
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Automated MetaTrader 5 Execution Infrastructure
          </h1>

          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl mx-auto">
            Directly connect HashiBot&apos;s institutional market scanner and deterministic arbitrator to MetaTrader 5 personal and prop firm trading terminals via our dedicated high-performance Windows IPC Bridge.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/execution/mt5"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-7 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 text-xs"
            >
              <span>Deploy MT5 Personal Bot ($100/month per connected execution account)</span>
              <ArrowRight size={14} />
            </Link>
            <Link
              to="/execution/prop"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-bold px-7 py-3 rounded-xl transition-all shadow-lg shadow-amber-600/20 text-xs"
            >
              <span>Deploy MT5 Prop Bot ($100/month per connected execution account)</span>
              <ShieldCheck size={14} />
            </Link>
            <Link
              to="/pricing#pricing-plans"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-semibold px-7 py-3 rounded-xl transition-all text-xs"
            >
              <span>View All Pricing Plans</span>
            </Link>
          </div>
        </div>
      </section>

      {/* MT5 Architecture Diagram */}
      <section className="py-16 px-4 sm:px-6 max-w-7xl mx-auto space-y-10">
        <div className="text-center space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-400">Bridge Architecture</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">How The MT5 Bridge Operates</h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto">
            Local Windows daemon polls HashiBot cloud command queue and executes orders directly in MetaTrader 5 via MetaTrader 5 Python IPC API.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {[
            { step: '1', name: 'Scanner & Arbitrator', detail: 'Evaluates EURUSD, GBPUSD, XAUUSD, US30 forex setups.', icon: Cpu },
            { step: '2', name: 'Durable Command Queue', detail: 'Orders written to Supabase queue with 120s lease timeout.', icon: Terminal },
            { step: '3', name: 'Windows Bridge Daemon', detail: 'Local daemon running beside MT5 claims and executes commands.', icon: Layers },
            { step: '4', name: 'Reconciliation Engine', detail: 'Monitors MT5 open positions, equity, and SL/TP drift.', icon: Activity },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.step} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    STAGE {item.step}
                  </span>
                  <Icon size={18} className="text-zinc-400" />
                </div>
                <h3 className="font-bold text-white text-sm">{item.name}</h3>
                <p className="text-zinc-400 text-xs leading-relaxed">{item.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Personal vs Prop Profiles */}
      <section className="py-16 px-4 sm:px-6 bg-zinc-900/50 border-y border-zinc-800/80">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-400">Profile Configurations</div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Personal & Prop Trading Support</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Personal MT5 Bot */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Forex MT5 Personal Bot</h3>
                <span className="text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-full">
                  Personal Account
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Designed for personal broker accounts (IC Markets, Exness, Pepperstone, OANDA, etc.) with custom risk tolerance.
              </p>
              <ul className="space-y-2 text-xs text-zinc-300">
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-400 shrink-0" /> User-configurable risk % per trade (0.5% – 3.0%)</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-400 shrink-0" /> Custom leverage and position sizing limits</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-400 shrink-0" /> Flexible break-even and partial profit trailing</li>
              </ul>
              <div className="pt-2">
                <Link
                  to="/execution/mt5"
                  className="inline-flex items-center gap-2 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <span>Activate Personal MT5 Bot ($100/month per connected execution account)</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>

            {/* Prop MT5 Bot */}
            <div className="bg-zinc-950 border border-amber-500/30 rounded-2xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Forex MT5 Prop Bot</h3>
                <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                  Prop Firm Account
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Engineered for strict prop firm challenges and funded accounts (FTMO, FundedNext, MFF, etc.).
              </p>
              <ul className="space-y-2 text-xs text-zinc-300">
                <li className="flex items-center gap-2"><Check size={14} className="text-amber-400 shrink-0" /> Conservative risk sizing (0.25% – 0.50% per trade)</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-amber-400 shrink-0" /> Hard daily loss locks (e.g. 3.5% daily drawdown cap)</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-amber-400 shrink-0" /> Maximum total trailing drawdown safety gate</li>
              </ul>
              <div className="pt-2">
                <Link
                  to="/execution/prop"
                  className="inline-flex items-center gap-2 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <span>Activate Prop MT5 Bot ($100/month per connected execution account)</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>

          </div>

          {/* Prop Firm Disclaimer Notice */}
          <div className="p-4 bg-zinc-950 border border-amber-500/30 rounded-xl flex items-start gap-3 text-xs text-zinc-400 leading-relaxed">
            <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300 block mb-0.5">Prop Firm Compliance Disclaimer:</strong>
              Prop firm rules vary significantly by firm (e.g., news trading bans, weekend hold limits, minimum trading days, IP location constraints). While HashiBot provides conservative drawdown risk gates, customers are solely responsible for ensuring compliance with their specific prop firm terms. HashiBot does not guarantee passing prop firm evaluation challenges or maintaining funded status.
            </div>
          </div>

        </div>
      </section>

      {/* Operations Center Telemetry */}
      <section className="py-16 px-4 sm:px-6 max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-400">MT5 Operations Center</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Full Bridge Telemetry & Diagnostics</h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto">
            Monitor bridge heartbeats, execution latency, command acknowledgements, and terminal state in real time.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 space-y-1">
            <span className="text-zinc-500 font-mono text-[10px]">DAEMON HEARTBEAT</span>
            <div className="font-bold text-white text-sm">30s Pulse Cycle</div>
            <p className="text-zinc-400 text-[11px]">Detects terminal crashes or internet disconnections instantly.</p>
          </div>
          <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 space-y-1">
            <span className="text-zinc-500 font-mono text-[10px]">ATOMIC COMMAND LEASE</span>
            <div className="font-bold text-white text-sm">120s Lease Lock</div>
            <p className="text-zinc-400 text-[11px]">Prevents duplicate order execution if network pauses during submission.</p>
          </div>
          <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 space-y-1">
            <span className="text-zinc-500 font-mono text-[10px]">DRIFT RECONCILIATION</span>
            <div className="font-bold text-white text-sm">Continuous Drift Check</div>
            <p className="text-zinc-400 text-[11px]">Verifies MT5 order tickets match database position parameters.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 sm:px-6 bg-zinc-900/60 border-t border-zinc-800/80 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Deploy MetaTrader 5 Automation Today
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Activate your MT5 Personal ($100/month per connected account) or Prop trading bot ($100/month per connected account) subscription and connect your Windows terminal.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/execution/mt5"
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20"
            >
              Get Started with MT5 Bot (From $100/month per connected account)
            </Link>
            <Link
              to="/contact?category=MT5%20Automation#contact-form"
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs px-6 py-3 rounded-xl transition-all border border-zinc-700"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

