# Production Storage Package

| Bucket | Purpose | Public | Size limit | MIME types | Retention | Cleanup |
|---|---|---:|---:|---|---|---|
| `research-artifacts` | Research Lab exports and reports | No | 25 MB/object | `application/json`, `text/csv`, `application/pdf` | 90 days | Archive monthly, delete expired |
| `audit-archives` | Compressed audit snapshots | No | 100 MB/object | `application/gzip`, `application/zstd`, `application/json` | 7 years | Immutable archive review quarterly |
| `telegram-media-cache` | Temporary Telegram media | No | 10 MB/object | `image/png`, `image/jpeg`, `application/pdf` | 7 days | Daily cleanup |
| `bridge-logs` | Temporary HashiBridge diagnostic bundles | No | 25 MB/object | `application/gzip`, `text/plain`, `application/json` | 14 days | Daily cleanup |

Create buckets before smoke testing. Prefer compressed JSONL archives for audit and bridge logs. Do not store raw candles, tick streams, or duplicated provider payloads unless required for a bounded incident investigation.
