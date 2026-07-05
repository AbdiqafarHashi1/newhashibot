# STORAGE_EGRESS_GUARDRAILS

Ticks, open candles, closed candles, indicators, market features, feed heartbeats, and loop diagnostics stay in memory in the V2 runtime foundation. The market intelligence packages do not import or reference a database client.

Durable storage is reserved for finalized signals, finalized trades, meaningful lifecycle events, audit facts, reports, analytics snapshots, and explicit research datasets with retention policy.

This prevents high-volume market intelligence from becoming a storage and egress surface.
