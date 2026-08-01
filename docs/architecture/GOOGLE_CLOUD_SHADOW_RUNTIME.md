# Google Cloud shadow runtime

Every handler validates the envelope before business dispatch: schema/event or command ID, correlation, timestamp, `demo`, `shadow`, and `mutation_authorized=false`. Invalid messages are permanent/DLQ failures. Google adapters provide bounded REST retries, explicit acknowledgement, correlation/idempotency attributes, Secret Manager fail-closed resolution, structured stdout, Monitoring writes, deployment metadata, and identity-token internal requests.

Binance testnet and Bybit demo transports expose reads and request rendering. Mutation methods reject locally, emit a critical incident with correlation evidence, and never issue HTTP. MT5 remains contracts-only until a Windows agent exists. Telegram certification output must begin `SHADOW / DEMO CERTIFICATION` and may target only the configured private test chat.
