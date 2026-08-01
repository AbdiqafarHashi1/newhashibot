# Provider Result Unknown

Stop submission retries. Persist the normalized UNKNOWN receipt and correlation/idempotency identities, append `RecoveryRequired` with `blindRetry=false`, query provider state by client order ID, reconcile positions/orders against Supabase Trade Truth, and either attach proven evidence or quarantine for operator action. Never infer absence from timeout and never issue a new order identity.
