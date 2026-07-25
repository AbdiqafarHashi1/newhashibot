import { PublicLayout } from '../../components/layout/PublicLayout';
import { 
  Search, Cpu, Shield, Terminal, Lock, Activity, 
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Features() {
  const featureGroups = [
    {
      id: 'intelligence',
      title: '1. Market Intelligence & Scanner',
      icon: Search,
      desc: 'Multi-timeframe market monitoring across crypto and forex pairs.',
      features: [
        {
          name: 'Multi-Market Adapters',
          detail: 'Continuous WebSocket and REST polling for Binance, Bybit, and Forex symbols.',
          why: 'Provides real-time price feeds and liquidity awareness without manual entry.',
          status: 'Available',
        },
        {
          name: 'Continuous Market Scanning',
          detail: 'Evaluates 10+ selected pairs on 5m, 15m, 1h, and 4h chart intervals.',
          why: 'Eliminates chart fatigue and detects compression breakouts immediately as they form.',
          status: 'Available',
        },
        {
          name: 'Rule-Based Strategy Evaluation',
          detail: 'Algorithmic checks for RSI divergence, volatility expansion, and trend alignment.',
          why: 'Ensures setup selection is strictly quantitative, not subjective.',
          status: 'Available',
        },
        {
          name: '7-Factor Signal Grading',
          detail: 'Assigns quality scores (A+ 90+, A 80+, B 70+) based on R:R, trend, and volume.',
          why: 'Only high-probability setups reach subscribers; low-grade noise is filtered out.',
          status: 'Available',
        },
        {
          name: 'Setup Rejection Auditing',
          detail: 'Logs explicit reasons when a market candidate fails qualification.',
          why: 'Provides complete transparency into why potential setups were rejected.',
          status: 'Available',
        },
      ],
    },
    {
      id: 'arbitrator',
      title: '2. Deterministic Decision Engine & Arbitrator',
      icon: Cpu,
      desc: 'Centralized arbitration logic that prevents signal conflicts and guarantees quality.',
      features: [
        {
          name: 'One Shared Arbitrator',
          detail: 'Single decision node evaluates all strategy candidates concurrently.',
          why: 'Prevents contradictory signals (e.g. simultaneous BUY and SELL on the same pair).',
          status: 'Available',
        },
        {
          name: 'One Winner or No Trade',
          detail: 'Selects the single highest-scoring setup per market cycle, or rejects all if grade is low.',
          why: 'Eliminates overtrading and ensures capital is focused on optimal opportunities.',
          status: 'Available',
        },
        {
          name: 'Duplicate Signal Suppression',
          detail: 'Cooldown timers and position overlap rules prevent duplicate entries.',
          why: 'Protects account margin from compounding risk on the same move.',
          status: 'Available',
        },
        {
          name: 'Immutable Signal Truth',
          detail: 'Approved signals are written to database with cryptographic parameters and evidence hash.',
          why: 'Guarantees the historical signal record cannot be altered or deleted after the fact.',
          status: 'Available',
        },
      ],
    },
    {
      id: 'risk',
      title: '3. Risk & Capital Engine',
      icon: Shield,
      desc: 'Account-level risk management tailored for personal and prop profiles.',
      features: [
        {
          name: 'Account-Specific Risk Sizing',
          detail: 'Calculates exact lot sizes or position quantities based on user balance and risk %.',
          why: 'Prevents fixed-lot blowout risks regardless of account size.',
          status: 'Available',
        },
        {
          name: 'Daily Loss & Drawdown Limits',
          detail: 'Enforces hard daily stop limits and automatically pauses trading if threshold is reached.',
          why: 'Safeguards account balance against tilt and market anomaly cascades.',
          status: 'Available',
        },
        {
          name: 'Leverage & Exposure Boundaries',
          detail: 'Restricts maximum leverage allowed per symbol and total open margin allocation.',
          why: 'Prevents over-leveraging in high-volatility market conditions.',
          status: 'Available',
        },
        {
          name: 'Personal vs Prop Risk Profiles',
          detail: 'Dedicated risk presets for Personal (growth) and Prop EA (conservative drawdown protection).',
          why: 'Tailors execution parameters to exact account rules and challenge constraints.',
          status: 'Available',
        },
      ],
    },
    {
      id: 'execution',
      title: '4. Order Execution Infrastructure',
      icon: Terminal,
      desc: 'Multi-exchange routing and durable command queue for可靠 atomic order delivery.',
      features: [
        {
          name: 'Binance & Bybit Direct Execution',
          detail: 'REST & WebSocket execution for Binance Spot/Futures and Bybit Unified Margin.',
          why: 'Fills orders directly on user exchange accounts with sub-second response times.',
          status: 'Available',
        },
        {
          name: 'MetaTrader 5 Windows Bridge Agent',
          detail: 'Standalone Python daemon running alongside MT5 terminal for local execution.',
          why: 'Enables direct MT5 order placement for forex personal and prop terminals.',
          status: 'Built — Pending Certification',
        },
        {
          name: 'Durable Command Queue with Atomic Leases',
          detail: 'Commands issued with 120s atomic leases and retry policies.',
          why: 'Guarantees zero lost orders even during temporary network disconnections.',
          status: 'Available',
        },
        {
          name: 'Write-Only Credential Vault',
          detail: 'Exchange API keys are write-only during configuration and never rendered in frontend.',
          why: 'Ensures strict credential security and zero key exposure.',
          status: 'Available',
        },
      ],
    },
    {
      id: 'protection',
      title: '5. Trade Protection & Reconciliation',
      icon: Lock,
      desc: 'Active trade lifecycle monitoring and automatic position protection.',
      features: [
        {
          name: 'Instant SL & TP Placement',
          detail: 'Stop Loss and Take Profit orders attached at position entry.',
          why: 'Ensures no trade exists without strict downside protection.',
          status: 'Available',
        },
        {
          name: 'Break-Even & Partial Profit Trailing',
          detail: 'Automatically moves Stop Loss to entry price once TP1 is achieved.',
          why: 'Locks in risk-free position management as price moves favorably.',
          status: 'Available',
        },
        {
          name: 'Orphan Position Detection & Repair',
          detail: 'Monitors exchange positions against database records to detect unmanaged trades.',
          why: 'Prevents manual trades or exchange glitches from remaining unprotected.',
          status: 'Available',
        },
        {
          name: 'Protection Drift Audit',
          detail: 'Flags positions where SL/TP orders on exchange do not match database specification.',
          why: 'Maintains strict compliance between risk model and exchange state.',
          status: 'Available',
        },
      ],
    },
    {
      id: 'reporting',
      title: '6. Operations & Telegram Reporting',
      icon: Activity,
      desc: 'Real-time telemetry, audit streams, and multi-channel customer notifications.',
      features: [
        {
          name: 'Instant Telegram Channel Delivery',
          detail: 'Formatted signal alerts dispatched to Telegram VIP channels within milliseconds.',
          why: 'Delivers instant alerts to trader smartphones for manual signal followers.',
          status: 'Available',
        },
        {
          name: 'Customer App Dashboard',
          detail: 'Responsive web application tracking active signals, history, and account settings.',
          why: 'Provides clean visibility into platform status from any desktop or mobile device.',
          status: 'Available',
        },
        {
          name: 'Admin MT5 Operations Center',
          detail: 'Deep operational dashboard for bridge health, commands stream, and diagnostics.',
          why: 'Gives administrators total oversight of all connected terminals and bridges.',
          status: 'Available',
        },
        {
          name: 'Transparent Outcome Auditing',
          detail: 'Every signal tracked to TP1/TP2 hit or SL exit with verified outcome metrics.',
          why: 'Eliminates cherry-picked performance marketing with raw, verifiable data.',
          status: 'Available',
        },
      ],
    },
  ];

  return (
    <PublicLayout>
      {/* Header */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-zinc-900/40 border-b border-zinc-800/80">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3.5 py-1 text-xs text-blue-400 font-bold uppercase tracking-wider">
            Technical Specification
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white">
            Complete Platform Feature Matrix
          </h1>
          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl mx-auto">
            Explore the architecture, algorithms, execution modules, and risk controls powering HashiBot across Crypto and MetaTrader 5.
          </p>
        </div>
      </section>

      {/* Feature Groups */}
      <section className="py-16 px-4 sm:px-6 max-w-7xl mx-auto space-y-16">
        {featureGroups.map((group) => {
          const GroupIcon = group.icon;
          return (
            <div key={group.id} className="space-y-6">
              <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                  <GroupIcon size={20} />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white">{group.title}</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">{group.desc}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {group.features.map((f) => {
                  const isAvailable = f.status === 'Available';
                  return (
                    <div key={f.name} className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-zinc-700 transition-colors">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-bold text-sm text-white">{f.name}</h3>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider shrink-0 ${
                            isAvailable
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {f.status}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed">{f.detail}</p>
                      </div>

                      <div className="p-3 bg-zinc-950 border border-zinc-800/80 rounded-lg text-[11px] text-zinc-400 leading-relaxed">
                        <span className="font-semibold text-zinc-300 block mb-0.5">Why It Matters:</span>
                        {f.why}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* CTA Footer */}
      <section className="py-16 px-4 sm:px-6 bg-zinc-900/60 border-t border-zinc-800/80 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Ready to Deploy These Capabilities?
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Subscribe to AI Signals or request Crypto / MT5 Automation setup today.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/pricing"
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
            >
              <span>View Pricing Plans</span>
              <ArrowRight size={14} />
            </Link>
            <Link
              to="/contact"
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
