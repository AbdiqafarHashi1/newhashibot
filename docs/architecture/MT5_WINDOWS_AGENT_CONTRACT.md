# MT5 Windows Agent Contract — Phase 13 Integration Specification

Phase 12 does not install MT5. A future Windows agent registers `bridge_id`/`worker_id`, heartbeats with revision and observed time, ingests assigned Personal/Prop demo accounts, atomically claims commands by command/idempotency/execution-lineage identity, acknowledges accepted/rejected/filled/unknown results, and publishes account snapshots, symbol specifications and open positions.

Commands require account, symbol, side, quantity, order type, SL/TP, correlation, idempotency, expected truth version and certified lineage. Duplicate claims return the prior acknowledgement. Stale bridge/command or ambiguous terminal result is reconciled before retry. Secrets remain referenced, never logged or included in events. Phase 13 must certify restart, clock skew, network loss, duplicate poll, terminal rejection, partial fill, protection and orphan reconciliation against the existing `mt5-bridge` RPC protocol before shadow use.
