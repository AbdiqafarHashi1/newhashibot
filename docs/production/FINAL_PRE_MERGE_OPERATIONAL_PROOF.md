# Final pre-merge operational proof

Generated 2026-09-11. Historical performance is evidence, not a guarantee. No strategy rules, qualification thresholds, or Prop rules were changed to improve outcomes.

| Capability | Status | Evidence type | Command/workflow | Source / universe | Period / bars | Evidence |
|---|---|---|---|---|---|---|
| Binance public history | EXTERNAL_VERIFICATION_REQUIRED | REAL_PROVIDER_ATTEMPT | `curl` Binance `/api/v3/klines` | Binance / BTCUSDT 15m | 2025-09-01–02 | HTTP 403 from this environment; no substitute data used. |
| Bybit public history | EXTERNAL_VERIFICATION_REQUIRED | REAL_PROVIDER_ATTEMPT | `curl` Bybit `/v5/market/kline` | Bybit / BTCUSDT 15m | 2025-09-01–02 | HTTP 403 from this environment; no substitute data used. |
| MT5 broker history | EXTERNAL_VERIFICATION_REQUIRED | EXTERNAL_PROVIDER | `FETCH_HISTORY` through MT5 bridge | Certified MT5 account required | Not available | No authenticated terminal/account exists in this environment; integration fails closed. |
| Historical service provenance | CERTIFIED | DETERMINISTIC_INTEGRATION | `npm run test:final-3c` | MT5, Binance, Bybit adapters | 2025-01-01 / 3 bars each | Normalized data hash `fnv1a32:2affcd9e`; second request used cache; provider/account provenance retained. |
| Canonical single backtest | CERTIFIED | DETERMINISTIC_INTEGRATION | `npm run test:prompt1-pipeline` | Binance / BTCUSDT | Fixture window / 140 bars | 2 completed trades; run `pipeline_0b5bec0e`. |
| Canonical portfolio backtest | CERTIFIED | DETERMINISTIC_INTEGRATION | `npm run test:prompt1-pipeline` | Binance BTCUSDT + Bybit ETHUSDT | Fixture window / 280 bars | Shared chronological account, arbitration and capital competition; 3 trades; run `pipeline_37dfa02d`. |
| Full Prop pipeline | CERTIFIED | DETERMINISTIC_INTEGRATION | `npm run test:prompt1-pipeline` | Binance / BTCUSDT | Same fixed fixture | Prop gate evaluated before candidates; daily lock and soft-risk reduction exercised. |
| Rolling Multi-Challenge | CERTIFIED | DETERMINISTIC_INTEGRATION | `npm run test:prompt1-pipeline` | Binance / BTCUSDT | Two independent starts | Fresh account state per start; hashes `pipeline_48f5d802`, `pipeline_c845571c`; deterministic rerun matched. |
| Automatic calibration | CERTIFIED | DETERMINISTIC_INTEGRATION | `npm run test:prompt2-qualification` | crypto.trend-pullback | Fixed holdout fixture | 4 variants, 2 eliminated, 1 robust survivor; campaign `campaign_ad520e10`. Separate strict campaign returned `NO_ROBUST_CONFIGURATION_FOUND`. |
| Qualified/frozen handoff | CERTIFIED | DETERMINISTIC_INTEGRATION | `npm run test:prompt2-qualification`, `npm run test:final-3c` | crypto.trend-pullback@0.1.0-research-frozen | Config `research/random_seeded/v1/1` | Pinned `{pullbackAtr:0.65,stopAtr:1.5}`, qualified set `set_b4bb90b5`; mutation and mismatch tests fail closed. |
| Multi-account execution isolation | CERTIFIED | DETERMINISTIC_INTEGRATION | account-controller, eligibility and provisioning suites | Forex/Crypto Personal/Prop | N/A | Per-customer/account controls, duplicate checks, Prop/risk blocks, and scanner independence exercised. |
| Trade truth, protection and recovery | CERTIFIED | DETERMINISTIC_INTEGRATION | trade-management and runtime-orchestrator suites | MT5/Binance/Bybit contracts | N/A | Submission remains distinct from fill/protection; protection, idempotency, reconciliation and recovery paths passed. |
| Operational UI workflows | CERTIFIED | EXECUTABLE_BUILD_AND_HANDLER_TESTS | production build plus focused workflow suites | Research and Prop workspaces | N/A | Fetch, canonical backtest, Calibrate & Qualify, portfolio, Full Prop, rolling Multi-Challenge, freeze, and certified-account forward start have real handlers. |

## Operator result

- Qualification outcome: one deterministic fixture candidate qualified; a deliberately impossible policy correctly produced `NO_ROBUST_CONFIGURATION_FOUND`.
- Winning evidence is not promoted automatically. Forward start requires an active execution account with capability status `CERTIFIED` and persists `AWAITING_PROVIDER_OBSERVATIONS`, not a fabricated fill.
- Real provider certification remains outstanding solely because this environment received HTTP 403 from both public crypto APIs and has no authenticated MT5 terminal.
