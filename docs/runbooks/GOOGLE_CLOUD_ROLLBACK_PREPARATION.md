# Google Cloud Rollback Preparation

Phase 10 has nothing deployed and therefore no live rollback action. `cloud/scripts/rollback-prepare.sh` only records the current revision and required future checks; it never changes routing or infrastructure.

For future hybrid stages, rollback must: freeze new publications; park rather than discard queued commands; identify in-flight provider mutations; preserve provider-native protection; reconcile provider evidence with Supabase truth; wait for/revoke the Cloud ownership lease safely; restore exactly one Edge owner for the cohort; verify Edge heartbeat; replay only idempotently safe work; and audit correlation/action IDs. Never run Edge and Cloud execution/protection owners concurrently.

Rollback prerequisites include previous image digest, subscription pause procedure, ownership/cohort control, provider and Supabase reconciliation queries, Edge schedule/function verification, named incident commander, customer communication threshold, and proof of a completed sandbox drill. Telegram cannot be the only incident channel.
