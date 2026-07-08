export interface CanonicalApprovedSignal {
  signal_id: string;
  idempotency_key: string;
  market_type: 'crypto' | 'forex';
  provider_route: 'binance' | 'bybit' | 'mt5' | string;
  customer_id: string;
  account_id: string;
  package: string;
  execution_mode: 'signal_only' | 'demo' | 'live' | string;
  symbol: string;
  direction: 'buy' | 'sell';
  strategy: string;
  timeframe: string;
  score: number;
  grade: string;
  entry: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  risk_percent: number;
  leverage: number;
  calculated_position_size: number;
  created_at: string;
  expires_at: string;
}
