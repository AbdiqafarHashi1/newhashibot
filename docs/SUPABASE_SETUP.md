# V2 Supabase Setup Philosophy

This document defines principles only and does not define SQL.

## Role
Supabase is V2 persistence only. It must not be used as live runtime memory.

## Persisted Data Categories
- Immutable signals.
- Trades and executions.
- Customer actions.
- Configuration.
- Audit logs.
- Reports.
- Analytics.
- Strategy certification records.

## Optimization Rules
- Minimize writes by batching non-critical analytics and logs.
- Minimize reads with runtime cache and event-driven propagation.
- Minimize egress by avoiding polling-heavy dashboards.
- Minimize storage with retention policies and aggregated historical reports.

## Project Independence
V2 must connect to a brand-new Supabase project without relying on V1 tables, functions, migrations, storage buckets, or secrets.

## Security Principles
- Row-level isolation for customer-owned records.
- Service-role usage restricted to server-side trusted runtimes.
- Audit every privileged admin action.
- Store no exchange secret in frontend-accessible contexts.
