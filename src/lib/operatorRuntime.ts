export type RuntimeTruthStatus = 'LIVE' | 'STALE' | 'FAILED' | 'DISABLED' | 'NOT RUN' | 'UNKNOWN' | 'DESYNCHRONIZED' | 'NO DATA';

export interface RuntimeHeartbeat {
  label?: string;
  at?: string | null;
  enabled?: boolean;
  error?: string | null;
  staleAfterMs?: number;
}

export function runtimeTruth({ at, enabled = true, error, staleAfterMs = 120_000 }: RuntimeHeartbeat): RuntimeTruthStatus {
  if (!enabled) return 'DISABLED';
  if (error) return 'FAILED';
  if (!at) return 'NOT RUN';
  const age = Date.now() - new Date(at).getTime();
  if (!Number.isFinite(age) || age > staleAfterMs) return 'STALE';
  return 'LIVE';
}

export function statusClasses(status: RuntimeTruthStatus): string {
  if (status === 'LIVE') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'FAILED') return 'border-red-500/30 bg-red-500/10 text-red-300';
  if (status === 'DESYNCHRONIZED') return 'border-red-500/50 bg-red-950/20 text-red-400 font-bold animate-pulse';
  if (status === 'DISABLED') return 'border-zinc-700 bg-zinc-900 text-zinc-400';
  if (status === 'NOT RUN') return 'border-yellow-600/30 bg-yellow-600/5 text-yellow-500 font-mono';
  if (status === 'STALE') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  if (status === 'NO DATA') return 'border-zinc-800 bg-zinc-950/20 text-zinc-500';
  return 'border-zinc-800 bg-zinc-950/20 text-zinc-400';
}

export interface ProviderNeutralTradePlan {
  plan_id: string;
  source_signal_id: string;
  symbol: string;
  side: 'long' | 'short';
  entry: { type: 'market' | 'limit'; price?: number; quantity: number };
  protection: { stop_loss: number; take_profit_1: number; take_profit_2: number; profit_lock_after_tp1: boolean };
  risk: { mode: 'testnet' | 'paper'; max_loss_usd: number; leverage?: number };
  providers: Array<'binance' | 'bybit'>;
}

export interface ProviderExecutionTruth {
  provider: 'binance' | 'bybit';
  symbol: string;
  order_id: string | null;
  status: 'pending' | 'submitted' | 'protected' | 'blocked' | 'failed' | 'closed';
  blocker: string | null;
  entry_order: unknown | null;
  sl_order: unknown | null;
  tp1_order: unknown | null;
  tp2_order: unknown | null;
  latest_sync: string | null;
  latest_error: string | null;
}

export interface RuntimeProofItem {
  key: string;
  label: string;
  yes: boolean;
  blocker: string | null;
}

export const RUNTIME_PROOF_CONTRACT: RuntimeProofItem[] = [
  'Binance wallet reachable', 'Binance order placement works', 'Binance SL/TP placement works', 'Binance monitor works',
  'Bybit wallet reachable', 'Bybit order placement works', 'Bybit SL/TP placement works', 'Bybit monitor works',
  'Telegram admin works', 'Telegram VIP works', 'Telegram free works',
].map((label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), label, yes: false, blocker: 'Not proven in this UI session' }));
