# HashiBot V2 Step 15 — Platform Foundation

## Audit classification

| Subsystem | Classification | Reason |
|---|---|---|
| Supabase migrations | Reuse & Improve | Existing migrations already provide profiles, packages, customer subscriptions, audit logs, and engine truth tables. Step 15 adds normalized platform ownership tables without altering frozen engine tables. |
| Auth and profiles | Reuse & Improve | Existing `profiles` remains the auth anchor; platform role metadata is added for owner/admin/customer/service semantics. |
| Roles and permissions | Replace Completely | Prior role checks were string-based admin checks. Step 15 adds normalized roles, permissions, and role-permission mappings. |
| RLS | Reuse & Improve | Existing customer/admin isolation patterns are retained and extended to the new platform tables. |
| Package/subscription concepts | Reuse & Improve | Existing `packages` are extended with package control columns; new `subscriptions` owns manual M-Pesa review and future gateway references. |
| Executor concepts | Reuse & Improve | Engine execution tables stay frozen; customer executor ownership, heartbeat, and health are added outside the engine. |
| Provider credentials | Replace Completely | Credentials are represented only by backend vault/encrypted references and are never exposed through customer-facing tables. |
| Audit log | Reuse & Improve | Existing audit patterns are retained; `audit_log` captures customer, admin, subscription, executor, provider, security, and engine-event actions. |
| Edge functions/API | Reuse & Improve | Existing function style is reused. New `platform-api` routes typed platform actions and contains no trading logic. |

## Security model

The platform separates customer ownership from the trading engine. Customers can read their own customer, profile, preference, subscription, account, executor, notification, activity, and engine-event rows. Operators can administer platform rows. Provider credentials are operator-only backend references.

## Lifecycle

1. A user registers as a pending customer.
2. A subscription is created with manual M-Pesa evidence.
3. Admin reviews the payment and activates, rejects, or requests clarification.
4. Active execution customers receive provider-neutral accounts and isolated executors.
5. Executors report heartbeat/health and engine events without exposing engine internals.

## API boundary

`platform-api` supports customer registration, manual M-Pesa review, subscription activation, executor heartbeat, engine event ingestion, notification generation, and audit logging. It never submits trades, changes strategies, or reads provider secrets.
