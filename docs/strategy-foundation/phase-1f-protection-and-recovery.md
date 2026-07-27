# Fill, protection, monitor, and recovery contract

Actual fill quantity, remaining quantity, average price, fee and timestamp append to certified intent. Partial-fill policy either waits within a versioned lifetime or protects the fill and cancels the remainder; it never increases quantity. Protection requirements scale from actual open quantity using the certified target split.

`protection-verification/v1` compares provider truth with required stop/TP coverage, identity, triggers and reduce-only equivalence. Results are `VERIFIED`, `DEGRADED`, `MISSING`, or `UNVERIFIABLE`; acknowledgement alone never verifies. Missing/under-covered stops reconcile then authorize safety close under policy; target failure degrades; stale truth is unverifiable; duplicate/orphan/over-coverage is explicit.

Existing monitors remain the sole ongoing observers. Recovery resolves uncertain submission, stale leases, duplicate identity and stale truth. Safety-close authorization remains separate. Phase 1F adds contracts only and does not activate or replace these owners.
