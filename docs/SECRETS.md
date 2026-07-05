# V2 Secrets Policy

## Principles
- Secrets are never committed.
- Secrets are scoped by environment.
- Frontend applications receive only public, non-sensitive configuration.
- Execution adapters receive only the credentials required for their assigned customer environment.

## Secret Categories
- Supabase URL and keys.
- Exchange API keys.
- Broker and MT5 credentials.
- Telegram bot tokens.
- HashiBridge device credentials.
- Encryption keys.
- Deployment provider tokens.
- Monitoring and alerting keys.

## Rotation
All secrets must support documented rotation without code changes.

## HashiBridge
HashiBridge must use encrypted local storage, device identity, heartbeat authentication, and replay-resistant command authentication.
