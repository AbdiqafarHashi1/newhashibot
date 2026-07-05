# STORAGE_EGRESS_GUARDRAILS

Market data is not stored in Supabase in the V2 runtime foundation. Indicators are not stored in Supabase. Runtime cache is memory-only and must not be used as a database write-through layer.

Later persistence should be limited to finalized signals, finalized trades, meaningful lifecycle events, audit facts, reports, and analytics snapshots. High-volume ticks, candles, indicator snapshots, heartbeats, and loop diagnostics stay in memory unless a separate research/certification dataset explicitly opts into storage with retention and ownership.

This rule avoids the V1 storage and egress problem where scanner/runtime tables can become noisy operational memory and expensive dashboard read surfaces.
