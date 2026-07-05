# HashiBot V2 Glossary

- **Adapter**: Platform-specific execution implementation behind a common interface.
- **Arbitrator**: HashiCore component that chooses which candidate signals may become executable signals.
- **Candle Engine**: Shared service that normalizes and provides candles to all strategies.
- **Capital Manager**: Component that allocates capital under portfolio and customer constraints.
- **Command**: Durable instruction to an execution adapter with an explicit lifecycle.
- **Execution Customer**: Customer whose account can receive execution commands.
- **HashiBridge**: Standalone Windows desktop application that bridges HashiBot to MT5.
- **HashiCore**: Central trading brain for V2.
- **Indicator Engine**: Shared service that computes indicators once for consumers.
- **Protection Engine**: Desired-state engine that verifies and repairs trade protection.
- **Research Lab**: Offline and shadow-mode validation environment for strategies.
- **Runtime Cache**: In-memory source of runtime truth.
- **Signal Customer**: Customer who receives signals but does not delegate execution.
- **Signal Object**: Immutable representation of a trading opportunity.
- **Strategy Candidate**: Pre-signal output from a strategy before arbitration and risk approval.
- **Trade Management Engine**: Component responsible for lifecycle management after entry.
