# Demo teardown

Export `PROJECT_ID=hashibot-demo`, `REGION=us-central1`, and `TEARDOWN_APPROVED=true`, then run `cloud/scripts/teardown-shadow.sh`. Review retained Artifact Registry and state objects separately. This command does not call Supabase or alter production schedules.
