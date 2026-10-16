import { useState } from 'react';
import {
  Network,
  Zap,
  Server,
  Activity,
  Layers,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

export interface VenueChannel {
  venue_id: string;
  name: string;
  type: 'BINANCE_FUTURES' | 'BYBIT_DERIVATIVES' | 'MT5_TERMINAL';
  endpoint: string;
  best_bid: number;
  best_ask: number;
  spread_bps: number;
  latency_ms: number;
  available_depth_usd: number;
  status: 'ONLINE' | 'DEGRADED' | 'STANDBY';
}

const VENUES_DATA: Record<string, VenueChannel[]> = {
  BTCUSDT: [
    { venue_id: 'VENUE_BINANCE_FUTURES_01', name: 'Binance Futures (Trend Isolated)', type: 'BINANCE_FUTURES', endpoint: 'wss://fstream.binance.com', best_bid: 64210.50, best_ask: 64211.00, spread_bps: 0.78, latency_ms: 4.2, available_depth_usd: 485000, status: 'ONLINE' },
    { venue_id: 'VENUE_BYBIT_DERIVATIVES_02', name: 'Bybit Derivatives (Scalp Isolated)', type: 'BYBIT_DERIVATIVES', endpoint: 'wss://stream.bybit.com/v5', best_bid: 64211.80, best_ask: 64212.40, spread_bps: 0.93, latency_ms: 6.8, available_depth_usd: 310000, status: 'ONLINE' },
    { venue_id: 'VENUE_MT5_PERSONAL_01', name: 'MT5 Personal ZeroMQ', type: 'MT5_TERMINAL', endpoint: 'tcp://127.0.0.1:5555', best_bid: 64209.20, best_ask: 64210.80, spread_bps: 2.49, latency_ms: 1.8, available_depth_usd: 250000, status: 'ONLINE' },
    { venue_id: 'VENUE_MT5_PROP_FTMO_02', name: 'MT5 Prop FTMO Engine', type: 'MT5_TERMINAL', endpoint: 'tcp://127.0.0.1:5556', best_bid: 64208.50, best_ask: 64210.20, spread_bps: 2.65, latency_ms: 2.1, available_depth_usd: 500000, status: 'ONLINE' },
  ],
  ETHUSDT: [
    { venue_id: 'VENUE_BINANCE_FUTURES_01', name: 'Binance Futures (Trend Isolated)', type: 'BINANCE_FUTURES', endpoint: 'wss://fstream.binance.com', best_bid: 3450.20, best_ask: 3450.50, spread_bps: 0.87, latency_ms: 4.1, available_depth_usd: 390000, status: 'ONLINE' },
    { venue_id: 'VENUE_BYBIT_DERIVATIVES_02', name: 'Bybit Derivatives (Scalp Isolated)', type: 'BYBIT_DERIVATIVES', endpoint: 'wss://stream.bybit.com/v5', best_bid: 3450.90, best_ask: 3451.30, spread_bps: 1.15, latency_ms: 7.2, available_depth_usd: 240000, status: 'ONLINE' },
    { venue_id: 'VENUE_MT5_PERSONAL_01', name: 'MT5 Personal ZeroMQ', type: 'MT5_TERMINAL', endpoint: 'tcp://127.0.0.1:5555', best_bid: 3449.80, best_ask: 3450.80, spread_bps: 2.90, latency_ms: 1.9, available_depth_usd: 180000, status: 'ONLINE' },
    { venue_id: 'VENUE_MT5_PROP_FTMO_02', name: 'MT5 Prop FTMO Engine', type: 'MT5_TERMINAL', endpoint: 'tcp://127.0.0.1:5556', best_bid: 3449.50, best_ask: 3450.60, spread_bps: 3.18, latency_ms: 2.2, available_depth_usd: 350000, status: 'ONLINE' },
  ],
  EURUSD: [
    { venue_id: 'VENUE_MT5_PERSONAL_01', name: 'MT5 Personal Raw ECN', type: 'MT5_TERMINAL', endpoint: 'tcp://127.0.0.1:5555', best_bid: 1.08542, best_ask: 1.08545, spread_bps: 0.28, latency_ms: 1.4, available_depth_usd: 750000, status: 'ONLINE' },
    { venue_id: 'VENUE_MT5_PROP_FTMO_02', name: 'MT5 Prop FTMO Raw', type: 'MT5_TERMINAL', endpoint: 'tcp://127.0.0.1:5556', best_bid: 1.08540, best_ask: 1.08544, spread_bps: 0.36, latency_ms: 1.7, available_depth_usd: 1200000, status: 'ONLINE' },
  ],
};

export function SmartOrderRouterVisualizer() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [orderSizeUsd, setOrderSizeUsd] = useState<number>(25000);
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [isScanningArbitrage, setIsScanningArbitrage] = useState<boolean>(false);
  const [lastArbExecuted, setLastArbExecuted] = useState<string | null>(null);

  const venues = VENUES_DATA[selectedSymbol] || VENUES_DATA.BTCUSDT;

  // Venue score: Score = (100 / Latency_ms) + (50 / Spread_bps) + (Depth / 10000)
  const scoredVenues = venues.map((v) => {
    const latScore = 100.0 / Math.max(0.5, v.latency_ms);
    const spreadScore = 50.0 / Math.max(0.2, v.spread_bps);
    const depthScore = Math.min(20, v.available_depth_usd / 10000);
    const totalScore = latScore + spreadScore + depthScore;
    return { ...v, totalScore };
  }).sort((a, b) => b.totalScore - a.totalScore);

  const primaryVenue = scoredVenues[0];
  const backupVenue = scoredVenues.length > 1 ? scoredVenues[1] : null;

  // Cross-Venue Latency Arbitrage Detection
  // Check if any Bid(Venue_A) > Ask(Venue_B) + Fees
  const arbOpportunities = [];
  for (let i = 0; i < venues.length; i++) {
    for (let j = 0; j < venues.length; j++) {
      if (i === j) continue;
      const buyVenue = venues[i];  // Buying at Ask
      const sellVenue = venues[j]; // Selling at Bid

      if (sellVenue.best_bid > buyVenue.best_ask) {
        const grossSpreadBps = ((sellVenue.best_bid - buyVenue.best_ask) / buyVenue.best_ask) * 10000;
        const feeBps = 4.5;
        const netProfitBps = grossSpreadBps - feeBps;
        arbOpportunities.push({
          buyVenue,
          sellVenue,
          buyPrice: buyVenue.best_ask,
          sellPrice: sellVenue.best_bid,
          grossSpreadBps,
          netProfitBps,
          isExecutable: netProfitBps > 1.0,
        });
      }
    }
  }

  const triggerArbitrageSim = () => {
    setIsScanningArbitrage(true);
    setTimeout(() => {
      setIsScanningArbitrage(false);
      setLastArbExecuted(`Simulated dual-leg latency execution: Bought at ${venues[0].best_ask} on ${venues[0].name}, Sold at ${venues[1].best_bid} on ${venues[1].name}. Realized Net PnL: +$14.80.`);
    }, 600);
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 space-y-6 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Network size={18} />
            </span>
            <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              Multi-Venue Smart Order Router & Arbitrage Loop
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                HOT-ROUTED
              </span>
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Dynamic low-latency liquidity routing across Binance Futures, Bybit Derivatives, and MT5 ZeroMQ nodes.
          </p>
        </div>

        {/* Symbol Selector */}
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800 self-start sm:self-auto">
          {Object.keys(VENUES_DATA).map((sym) => (
            <button
              key={sym}
              onClick={() => setSelectedSymbol(sym)}
              className={`px-3 py-1 text-xs font-mono font-bold rounded-lg transition ${
                selectedSymbol === sym
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
      </div>

      {/* Real-time Liquidity Channels Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
            <Server size={14} className="text-blue-400" /> Active Multi-Venue Liquidity Nodes ({venues.length})
          </h4>
          <span className="text-[10px] font-mono text-zinc-500">Latency Polling: 50ms</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {scoredVenues.map((v, idx) => {
            const isTop = idx === 0;
            return (
              <div
                key={v.venue_id}
                className={`p-3.5 rounded-xl border flex flex-col justify-between transition ${
                  isTop
                    ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm'
                    : 'bg-zinc-950 border-zinc-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                      {v.type}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-1">
                      <Activity size={10} /> {v.latency_ms.toFixed(1)}ms
                    </span>
                  </div>

                  <div className="font-bold text-xs text-zinc-100 mt-2 truncate">{v.name}</div>
                  <div className="text-[10px] font-mono text-zinc-500 truncate">{v.endpoint}</div>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs font-mono">
                    <div className="bg-zinc-900/60 p-1.5 rounded border border-zinc-800/60">
                      <div className="text-[9px] text-zinc-500">Bid / Ask</div>
                      <div className="text-zinc-200 font-bold text-[11px] truncate">
                        {v.best_bid} / {v.best_ask}
                      </div>
                    </div>
                    <div className="bg-zinc-900/60 p-1.5 rounded border border-zinc-800/60">
                      <div className="text-[9px] text-zinc-500">Spread / Depth</div>
                      <div className="text-zinc-200 font-bold text-[11px]">
                        {v.spread_bps.toFixed(2)} bps | ${(v.available_depth_usd / 1000).toFixed(0)}k
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-zinc-400">SOR Score</span>
                  <span className={`font-bold ${isTop ? 'text-emerald-400' : 'text-zinc-300'}`}>
                    {v.totalScore.toFixed(1)} pts
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Smart Order Routing Plan & Failover Simulator */}
      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800/80 pb-3">
          <div>
            <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={14} className="text-indigo-400" /> Optimal Execution Path & Residual Slicing
            </h4>
            <p className="text-[11px] text-zinc-400">
              Zero-lag order dispatch algorithm assigns primary liquidity pool with configured secondary failover route.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="flex rounded-lg border border-zinc-800 overflow-hidden bg-zinc-900 p-0.5">
              <button
                onClick={() => setOrderSide('BUY')}
                className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                  orderSide === 'BUY' ? 'bg-emerald-500 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                BUY
              </button>
              <button
                onClick={() => setOrderSide('SELL')}
                className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                  orderSide === 'SELL' ? 'bg-red-500 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                SELL
              </button>
            </div>
            <span className="text-zinc-400">Size:</span>
            <input
              type="number"
              value={orderSizeUsd}
              onChange={(e) => setOrderSizeUsd(Number(e.target.value))}
              className="w-24 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono font-bold text-zinc-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Primary Route */}
          <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-emerald-400 font-mono font-bold uppercase flex items-center gap-1">
                <CheckCircle2 size={13} /> PRIMARY ROUTE (100% Volume)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                SCORE: {primaryVenue?.totalScore.toFixed(1)}
              </span>
            </div>
            <div className="text-sm font-bold text-zinc-100">{primaryVenue?.name}</div>
            <div className="text-xs text-zinc-400 font-mono">
              Expected Slippage: ~{(primaryVenue?.spread_bps * 0.5).toFixed(2)} bps | Latency: {primaryVenue?.latency_ms.toFixed(1)}ms
            </div>
          </div>

          {/* Backup Failover Route */}
          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-blue-400 font-mono font-bold uppercase flex items-center gap-1">
                <ShieldCheck size={13} /> FAILOVER FALLBACK (Hot-Standby)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                SCORE: {backupVenue?.totalScore.toFixed(1)}
              </span>
            </div>
            <div className="text-sm font-bold text-zinc-100">{backupVenue?.name ?? 'None'}</div>
            <div className="text-xs text-zinc-400 font-mono">
              Auto-activates on execution timeout (&gt;45ms) or partial fill rejection.
            </div>
          </div>
        </div>
      </div>

      {/* Latency Arbitrage Radar */}
      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap size={14} /> Cross-Venue Latency Arbitrage Radar
            </h4>
            <p className="text-[11px] text-zinc-400">
              Detects momentary pricing dislocations across fragmented venues: <span className="font-mono text-zinc-300">Bid(A) &gt; Ask(B) + Fees</span>
            </p>
          </div>

          <button
            onClick={triggerArbitrageSim}
            disabled={isScanningArbitrage}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold font-mono transition flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
          >
            <RefreshCw size={13} className={isScanningArbitrage ? 'animate-spin' : ''} />
            Scan & Execute Dual-Leg Arbitrage
          </button>
        </div>

        {arbOpportunities.length > 0 ? (
          <div className="space-y-2">
            {arbOpportunities.map((arb, i) => (
              <div
                key={i}
                className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs font-mono"
              >
                <div>
                  <span className="font-bold text-amber-300">
                    Buy {arb.buyVenue.name} (${arb.buyPrice}) ➔ Sell {arb.sellVenue.name} (${arb.sellPrice})
                  </span>
                  <div className="text-[10px] text-zinc-400">
                    Gross Spread: +{arb.grossSpreadBps.toFixed(2)} bps | Est Fees: ~4.5 bps
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                    Net: +{arb.netProfitBps.toFixed(2)} bps
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 text-xs font-mono text-zinc-400 flex items-center justify-between">
            <span>Venues tightly synchronized. Spread efficiency within standard 0.8 bps corridor.</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 size={12} /> Synchronized
            </span>
          </div>
        )}

        {lastArbExecuted && (
          <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-xs font-mono text-emerald-300 flex items-center gap-2">
            <Zap size={14} className="text-amber-400 shrink-0" />
            <span>{lastArbExecuted}</span>
          </div>
        )}
      </div>
    </div>
  );
}

