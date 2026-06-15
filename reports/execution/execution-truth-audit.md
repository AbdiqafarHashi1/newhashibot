# Execution Truth Audit

Execution state is now presented as separate control-room states: entry engine, monitor engine, recovery engine, kill switch, and emergency stop. Kill switch blocks new entries only; emergency stop blocks entries, monitoring, and recovery. Monitor truth classification uses CRITICAL/WARNING/HEALTHY/STALE and never reports HEALTHY when missing SL, orphan positions, protection failures, or account fetch failures are present.
