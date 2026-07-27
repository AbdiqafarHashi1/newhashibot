# Provider-by-provider certification verdicts

| Provider/environment | Planning | Submission/idempotency | Fill/protection | Verdict |
|---|---|---|---|---|
| Binance testnet | Native payload adapter and shadow comparison implemented | deterministic client identity and lookup-before-retry certified in fixtures | partial-fill binding and truth verification certified | `PASS_WITH_LIMITATIONS` — adoption remains disabled; runtime proof pending |
| Bybit demo | isolated V5 payload validation implemented | deterministic `orderLinkId` seam | provider truth proof pending | `BLOCKED_BY_MISSING_TRUTH` |
| MT5 Personal demo | isolated exact-lot queue validation implemented | deterministic queue identity seam | terminal/attached-protection proof pending | `BLOCKED_BY_MISSING_TRUTH` |
| MT5 Prop demo | separate Prop adapter and pre-submit lineage gates | no Personal fallback | stage/policy/runtime truth proof pending | `BLOCKED_BY_MISSING_TRUTH` |

No verdict authorizes production or continuous scheduling. Promotion requires exact or explained economic parity, manual evidence, provider protection verification, recovery proof, and an explicit policy change reviewed in Phase 1G.
