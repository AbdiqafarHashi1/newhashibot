# V2 Retention Policy

## Objective
Control storage, egress, and compliance risk by retaining detailed data only as long as needed.

## Data Classes
- Runtime state: in memory only, not retained in Supabase.
- Command records: retained for audit and dispute windows, then archived or summarized.
- Execution logs: short retention, with incident-linked logs preserved longer.
- Audit logs: longer retention for administrative and customer-impacting actions.
- Analytics: aggregate long-term, prune raw high-volume data.
- Research artifacts: retain certified strategy evidence and summarize obsolete experiments.

## Required Capability
Every high-volume table or log stream must have an owner, retention window, cleanup mechanism, and recovery rationale before implementation.
