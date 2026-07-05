# PORTFOLIO_RULES

HashiCore Trading Brain component implemented in `services/hashicore`. It is research-ready and platform-agnostic: it does not import Supabase, Telegram, exchange adapters, MT5, Binance, or Bybit.

## Deterministic design
- Accepts strategy candidates only.
- Produces either no-trade decisions or immutable approved signals.
- Records deterministic reasons for validation, rejection, scoring, risk, and capital decisions.
- Keeps runtime state in memory only.

## Scope
This module belongs after strategies and before execution. Execution planning, command queues, adapters, persistence, and notification delivery are intentionally excluded.
