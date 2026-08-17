import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { 
  ArrowRight, Shield, Activity, Cpu, CheckCircle2, 
  Terminal, Zap, Layers, BarChart2, Check,
  CreditCard, Search, Lock, HelpCircle
} from 'lucide-react';

const markets = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'EURUSD', 'GBPUSD', 'XAUUSD', 'US30'];

export default function Home() {
  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 sm:pt-20 pb-16 sm:pb-24 border-b border-zinc-800/80">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.18),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_60%,rgba(6,182,212,0.08),transparent_50%)]" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-xs text-blue-400 font-semibold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              One market-intelligence and execution platform
            </div>

            {/* Headline */}
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
              Scan markets. Qualify opportunities.{' '}
              <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400 bg-clip-text text-transparent">
                Execute with control.
              </span>
            </h1>

            {/* Supporting Copy */}
            <p className="text-base sm:text-lg text-zinc-300 max-w-2xl mx-auto leading-relaxed">
              HashiBot combines structured market scanning, rule-based strategy evaluation, one deterministic arbitrator, automated execution, risk and capital controls, trade protection, and operational monitoring across Crypto and MetaTrader 5.
            </p>

            {/* CTAs */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/pricing#pricing-plans"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-7 py-3.5 rounded-xl transition-all shadow-xl shadow-blue-600/25 active:scale-95 text-sm"
              >
                <span>Get Started & Choose Plan</span>
                <ArrowRight size={16} />
              </Link>
              <a
                href="#product-modes"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-200 hover:text-white font-semibold px-7 py-3.5 rounded-xl transition-all text-sm"
              >
                <span>Explore Products ↓</span>
              </a>
            </div>

            {/* Platform Badges */}
            <div className="pt-6 flex items-center justify-center gap-6 flex-wrap text-xs text-zinc-400">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>Binance & Bybit Live</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>Deterministic Arbitrator</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>MT5 Forex & Prop Automation Live</span>
              </div>
            </div>


          </div>
        </div>
      </section>

      {/* Market Ticker Strip */}
      <div className="bg-zinc-900/60 border-b border-zinc-800/80 py-3 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between gap-4 flex-wrap text-xs">
          <span className="text-zinc-500 font-mono font-semibold uppercase tracking-wider text-[11px] shrink-0">
            Active Scanned Markets:
          </span>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {markets.map(m => (
              <span key={m} className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 font-mono font-medium text-[11px] shrink-0">
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 1. Platform Architecture Pipeline */}
      <section className="py-20 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="text-center space-y-3 mb-14">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-400">Pipeline Engineering</div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white">
            End-to-End Platform Architecture
          </h2>
          <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto">
            From continuous market data feeds to position protection and operational reconciliation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { step: '01', title: 'Market Data & Scanning', desc: 'Continuous WebSocket and REST polling across Binance, Bybit, and Forex data adapters.', icon: Search },
            { step: '02', title: 'Strategy Qualification', desc: 'Rule-based evaluation across compression breakouts, trend pullbacks, and volatility structures.', icon: Layers },
            { step: '03', title: 'Deterministic Arbitrator', desc: 'One shared arbitrator ranks setup quality scores and approves exactly one winner or rejects all.', icon: Cpu },
            { step: '04', title: 'Immutable Signal Truth', desc: 'Approved setups are saved with full evidence hash, trade parameters, and strict risk levels.', icon: CheckCircle2 },
            { step: '05', title: 'Risk & Capital Engine', desc: 'User-specific risk limits, leverage boundaries, and account drawdown safety checks.', icon: Shield },
            { step: '06', title: 'Execution Routing', desc: 'Order dispatch to Binance, Bybit, or MetaTrader 5 durable command queue with atomic claims.', icon: Terminal },
            { step: '07', title: 'Trade Protection', desc: 'Continuous position monitoring, break-even adjustments, and SL/TP drift enforcement.', icon: Lock },
            { step: '08', title: 'Operations & Telegram', desc: 'Real-time telemetry, Telegram channel notifications, customer dashboard, and audit logs.', icon: Activity },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.step} className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    STAGE {s.step}
                  </span>
                  <Icon size={18} className="text-zinc-400" />
                </div>
                <h3 className="font-bold text-sm text-white">{s.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Product Cards */}
      <section id="product-modes" className="py-20 px-4 sm:px-6 bg-zinc-900/40 border-y border-zinc-800/80 scroll-mt-20">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-400">Three Execution Modes</div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white">Choose Your Operational Product</h2>
            <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto">
              Select structured manual signals, automated crypto execution, or MetaTrader 5 infrastructure.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* AI Signals */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between space-y-6 hover:border-blue-500/50 transition-colors shadow-xl">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Available Now
                  </span>
                  <Zap size={20} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-white">AI Signals</h3>
                  <p className="text-xs text-zinc-400 mt-1">Structured trading signal delivery for manual traders.</p>
                </div>
                <div className="text-2xl font-bold text-white">
                  5,000 KES <span className="text-xs text-zinc-500 font-normal">/ month</span>
                </div>
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <span>Real-time Telegram & Dashboard delivery</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <span>Defined entry zones, SL, TP1 & TP2</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <span>Transparent outcome tracking & signal history</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <span>No exchange API keys required</span>
                  </li>
                </ul>
              </div>
              <div className="space-y-2">
                <Link
                  to="/pricing?package=crypto_signal_room#mpesa-payment-section"
                  className="w-full text-center bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 block"
                >
                  Get AI Signals (5,000 KES) →
                </Link>
                <Link
                  to="/ai-signals"
                  className="w-full text-center text-zinc-400 hover:text-zinc-200 text-xs py-1.5 block transition-colors"
                >
                  Explore Signal Details & Features
                </Link>
              </div>
            </div>

            {/* Crypto Automation */}
            <div className="bg-zinc-900 border border-blue-500/40 rounded-2xl p-6 flex flex-col justify-between space-y-6 hover:border-blue-500 transition-colors shadow-2xl relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                Popular Choice
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Available Now
                  </span>
                  <Activity size={20} className="text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-white">Crypto Automation</h3>
                  <p className="text-xs text-zinc-400 mt-1">Direct Binance & Bybit automated execution for personal accounts.</p>
                </div>
                <div className="text-2xl font-bold text-white">
                  10,000 KES <span className="text-xs text-zinc-500 font-normal">/ month or $100</span>
                </div>
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <span>Includes full Signal Room access</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <span>Personal Binance & Bybit API key connection</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <span>Automated position sizing & risk controls</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <span>Write-only secrets & withdrawal protection</span>
                  </li>
                </ul>
              </div>
              <div className="space-y-2">
                <Link
                  to="/pricing?package=crypto_personal_bot#mpesa-payment-section"
                  className="w-full text-center bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 block"
                >
                  Get Crypto Bot (10,000 KES) →
                </Link>
                <Link
                  to="/crypto-automation"
                  className="w-full text-center text-zinc-400 hover:text-zinc-200 text-xs py-1.5 block transition-colors"
                >
                  Explore Crypto Automation Details
                </Link>
              </div>
            </div>

            {/* MT5 Automation */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between space-y-6 hover:border-purple-500/50 transition-colors shadow-xl">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Available Now
                  </span>
                  <Cpu size={20} className="text-purple-400" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-white">MT5 Automation</h3>
                  <p className="text-xs text-zinc-400 mt-1">Direct MetaTrader 5 execution for Personal & Prop accounts.</p>
                </div>
                <div className="text-2xl font-bold text-white">
                  10,000 KES <span className="text-xs text-zinc-500 font-normal">/ month or $100</span>
                </div>
                
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <span>Windows MT5 Daemon Bridge Agent</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <span>Durable command queue with 120s lease timeout</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <span>Personal & Prop Risk profile parameters</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <span>MT5 Operations Center telemetry & diagnostics</span>
                  </li>
                </ul>
              </div>
              <div className="space-y-2">
                <Link
                  to="/pricing?package=forex_mt5_personal_bot#mpesa-payment-section"
                  className="w-full text-center bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 block"
                >
                  Get MT5 Bot (10,000 KES) →
                </Link>
                <Link
                  to="/mt5-automation"
                  className="w-full text-center text-zinc-400 hover:text-zinc-200 text-xs py-1.5 block transition-colors"
                >
                  Explore MT5 Bridge & Specs
                </Link>
              </div>
            </div>


          </div>
        </div>
      </section>

      {/* 3. Why HashiBot */}
      <section className="py-20 px-4 sm:px-6 max-w-7xl mx-auto space-y-12">
        <div className="text-center space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-400">Institutional Principles</div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white">Why Traders Choose HashiBot</h2>
          <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto">
            Built to eliminate emotion, guesswork, and single-point-of-failure signal groups.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: 'One Shared Signal Truth',
              desc: 'Every subscriber sees the exact same qualified signals with immutable evidence records and precise entry zones.',
              icon: CheckCircle2,
            },
            {
              title: 'Quality-Based Arbitration',
              desc: 'Multiple strategy candidates compete. The arbitrator selects the single highest-graded setup or issues a NO-TRADE.',
              icon: Cpu,
            },
            {
              title: 'Account-Level Risk Controls',
              desc: 'Position sizing is automatically calculated per customer risk preset. Daily loss limits and drawdown gates prevent tilt.',
              icon: Shield,
            },
            {
              title: 'Continuous Trade Protection',
              desc: 'Positions are continuously monitored for stop-loss presence, break-even trailing, and protection drift.',
              icon: Lock,
            },
            {
              title: 'Operations & Telemetry',
              desc: 'Full visibility into provider health, command lifecycle, bridge heartbeats, and runtime reconciliation.',
              icon: Activity,
            },
            {
              title: 'Honest Outcome Tracking',
              desc: 'Signals are tracked to completion and verified against market history. No deleted losses or altered records.',
              icon: BarChart2,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-6 space-y-3 hover:border-zinc-700 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Icon size={20} />
                </div>
                <h3 className="font-bold text-base text-white">{item.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Operations Center Overview */}
      <section className="py-20 px-4 sm:px-6 bg-zinc-900/50 border-y border-zinc-800/80">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3.5 py-1 text-xs text-blue-400 font-bold uppercase tracking-wider">
              <Terminal size={14} />
              Unified Command & Telemetry
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight">
              Comprehensive Operations Center Monitoring
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              HashiBot doesn&apos;t run as a opaque black box. Operators and administrators have granular, real-time telemetry into daemon heartbeats, command queues, bridge state, and position reconciliation.
            </p>
            
            <div className="space-y-3 text-xs text-zinc-300">
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">Provider & Bridge Health</span>
                  <span className="text-zinc-500">Live latency & heartbeat monitoring for Binance, Bybit, and MT5 Daemons</span>
                </div>
                <span className="text-emerald-400 font-mono font-bold">HEALTHY</span>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">Durable Command Lifecycle</span>
                  <span className="text-zinc-500">Pending → Claimed → Executing → Acknowledged stream with retry policies</span>
                </div>
                <span className="text-blue-400 font-mono font-bold">120s Lease</span>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">Position Reconciliation & Protection</span>
                  <span className="text-zinc-500">Detects orphan positions, missing SL/TP orders, and account drift</span>
                </div>
                <span className="text-cyan-400 font-mono font-bold">Synced</span>
              </div>
            </div>
          </div>

          <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-zinc-400 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                HashiBot Operational Telemetry Stream
              </span>
              <span className="text-zinc-600">v1.0.0-prod</span>
            </div>

            <div className="space-y-2 text-zinc-300">
              <div className="text-zinc-500">[09:42:15] <span className="text-blue-400">SCANNER:</span> 10 crypto pairs evaluated across 5m/15m/1h timeframes.</div>
              <div className="text-zinc-500">[09:42:16] <span className="text-purple-400">ARBITRATOR:</span> BTCUSDT compression breakout qualified. Score: 92/100 (Grade A+).</div>
              <div className="text-zinc-500">[09:42:16] <span className="text-emerald-400">SIGNAL_TRUTH:</span> Immutable signal #sig-btc-892 stored with entry $68,200.</div>
              <div className="text-zinc-500">[09:42:17] <span className="text-cyan-400">TELEGRAM:</span> Delivered alert to VIP Channel (100% success).</div>
              <div className="text-zinc-500">[09:42:17] <span className="text-amber-400">ROUTER:</span> Dispatched to Binance Testnet & Bybit Testnet queues.</div>
              <div className="text-zinc-500">[09:42:18] <span className="text-emerald-400">EXECUTION:</span> Order executed on Binance. SL & TP1/TP2 verified on exchange.</div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Product Comparison */}
      <section className="py-20 px-4 sm:px-6 max-w-7xl mx-auto space-y-10">
        <div className="text-center space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-400">Feature Matrix</div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white">Compare Product Capabilities</h2>
        </div>

        <div className="overflow-x-auto border border-zinc-800 rounded-2xl bg-zinc-900/80 shadow-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/80 text-zinc-300">
                <th className="p-4 font-bold">Feature / Capability</th>
                <th className="p-4 font-bold text-blue-400">AI Signals</th>
                <th className="p-4 font-bold text-cyan-400">Crypto Automation</th>
                <th className="p-4 font-bold text-amber-400">MT5 Automation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              <tr>
                <td className="p-4 font-semibold text-white">Signal Delivery Mode</td>
                <td className="p-4">Dashboard & Telegram</td>
                <td className="p-4">Dashboard & Telegram</td>
                <td className="p-4">Dashboard & Telegram</td>
              </tr>
              <tr>
                <td className="p-4 font-semibold text-white">Automated Order Execution</td>
                <td className="p-4 text-zinc-500">Manual (No Auto-Trade)</td>
                <td className="p-4 text-emerald-400 font-bold">Automated (Binance & Bybit)</td>
                <td className="p-4 text-emerald-400 font-bold">Automated (MT5 Personal & Prop Bridge)</td>
              </tr>
              <tr>
                <td className="p-4 font-semibold text-white">API Key Requirement</td>
                <td className="p-4 text-emerald-400">None Required</td>
                <td className="p-4">Personal API Key (Write-Only)</td>
                <td className="p-4">MT5 Terminal Login</td>
              </tr>
              <tr>
                <td className="p-4 font-semibold text-white">Risk Sizing & Controls</td>
                <td className="p-4">Defined SL/TP on Alert</td>
                <td className="p-4 font-bold text-emerald-400">Auto Position Sizing & Limits</td>
                <td className="p-4 font-bold text-emerald-400">Personal & Prop Rules</td>
              </tr>
              <tr>
                <td className="p-4 font-semibold text-white">Availability Status</td>
                <td className="p-4"><span className="text-emerald-400 font-bold">Available Now</span></td>
                <td className="p-4"><span className="text-emerald-400 font-bold">Available Now</span></td>
                <td className="p-4"><span className="text-emerald-400 font-bold">Available Now</span></td>
              </tr>
              <tr className="bg-zinc-950/40">
                <td className="p-4 font-semibold text-white">Action / Checkout</td>
                <td className="p-4">
                  <Link
                    to="/pricing?package=crypto_signal_room#mpesa-payment-section"
                    className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shadow-sm"
                  >
                    <span>Get AI Signals</span>
                    <ArrowRight size={12} />
                  </Link>
                </td>
                <td className="p-4">
                  <Link
                    to="/pricing?package=crypto_personal_bot#mpesa-payment-section"
                    className="inline-flex items-center gap-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shadow-sm"
                  >
                    <span>Get Crypto Bot</span>
                    <ArrowRight size={12} />
                  </Link>
                </td>
                <td className="p-4">
                  <Link
                    to="/pricing?package=forex_mt5_personal_bot#mpesa-payment-section"
                    className="inline-flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shadow-sm"
                  >
                    <span>Get MT5 Bot</span>
                    <ArrowRight size={12} />
                  </Link>
                </td>
              </tr>

            </tbody>
          </table>
        </div>
      </section>

      {/* 6. Onboarding Flow */}
      <section className="py-20 px-4 sm:px-6 bg-zinc-900/40 border-t border-zinc-800/80">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-400">Seamless Activation</div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white">6-Step Onboarding Lifecycle</h2>
            <p className="text-xs sm:text-sm text-zinc-400">Click any step to jump straight to that stage of the process.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 text-center">
            {[
              { num: '1', title: 'Choose Product', desc: 'Select AI Signals or Automation', link: '#product-modes' },
              { num: '2', title: 'Create Account', desc: 'Sign up for customer dashboard', link: '/register' },
              { num: '3', title: 'Select Plan', desc: 'Pick package & review terms', link: '/pricing#pricing-plans' },
              { num: '4', title: 'Pay via M-Pesa', desc: 'Send exact plan amount to 0748 895 225', link: '/pricing#mpesa-payment-section' },
              { num: '5', title: 'Submit Details', desc: 'Submit transaction ref & Telegram handle', link: '/pricing#mpesa-payment-section' },
              { num: '6', title: 'Activation', desc: 'Verification & access activation', link: '/contact#contact-form' },
            ].map((step) => {
              const isExternalOrPage = step.link.startsWith('/');
              return isExternalOrPage ? (
                <Link
                  key={step.num}
                  to={step.link}
                  className="bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 rounded-xl p-4 space-y-2 transition-all group block hover:scale-[1.02]"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 group-hover:bg-blue-600 group-hover:text-white font-bold text-sm flex items-center justify-center mx-auto border border-blue-500/30 transition-colors">
                    {step.num}
                  </div>
                  <h3 className="font-bold text-xs text-white group-hover:text-blue-300">{step.title}</h3>
                  <p className="text-[11px] text-zinc-400 leading-normal">{step.desc}</p>
                </Link>
              ) : (
                <a
                  key={step.num}
                  href={step.link}
                  className="bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 rounded-xl p-4 space-y-2 transition-all group block hover:scale-[1.02]"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 group-hover:bg-blue-600 group-hover:text-white font-bold text-sm flex items-center justify-center mx-auto border border-blue-500/30 transition-colors">
                    {step.num}
                  </div>
                  <h3 className="font-bold text-xs text-white group-hover:text-blue-300">{step.title}</h3>
                  <p className="text-[11px] text-zinc-400 leading-normal">{step.desc}</p>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* 7. Final Pricing / Contact Call to Action */}
      <section className="py-20 px-4 sm:px-6 max-w-5xl mx-auto text-center space-y-8">
        <div className="bg-gradient-to-b from-blue-950/60 to-zinc-900 border border-blue-900/50 rounded-3xl p-8 sm:p-12 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Zap size={200} className="text-blue-400" />
          </div>

          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Ready to Experience Disciplined Trading?
          </h2>
          <p className="text-sm sm:text-base text-zinc-300 max-w-xl mx-auto leading-relaxed">
            Join HashiBot today for structured signals, transparent outcome tracking, or managed crypto execution. M-Pesa payment activation available.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/pricing#mpesa-payment-section"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-4 rounded-xl text-sm transition-all shadow-xl shadow-blue-600/30 active:scale-95"
            >
              <CreditCard size={18} />
              <span>Jump to Plans & M-Pesa Payment Form</span>
            </Link>
            <Link
              to="/contact#contact-form"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-zinc-200 font-semibold px-8 py-4 rounded-xl text-sm transition-all"
            >
              <HelpCircle size={18} />
              <span>Contact Support Form</span>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
