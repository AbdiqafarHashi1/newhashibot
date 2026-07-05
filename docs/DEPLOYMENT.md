# V2 Deployment Architecture

## Deployment Goals
- Independent deployability from `/v2`.
- Environment parity across development, staging, and production.
- Repeatable builds.
- Observable runtime health.
- Rollback capability.

## Deployable Units
- Customer web application.
- Admin web application.
- HashiCore services.
- Market intelligence services.
- Execution orchestrator.
- Telegram platform.
- Monitoring services.
- Research Lab workers.
- HashiBridge desktop releases.

## Runtime Requirements
- Long-running services for scanners, trading brain, execution, monitoring, and recovery.
- Background workers for research and reporting.
- Strict environment separation.
- Health checks and heartbeats for every runtime.

## Release Gates
- Type checks.
- Unit tests.
- Contract tests.
- Adapter simulation tests.
- Replay tests for strategies.
- Shadow-mode approval for production strategy changes.
