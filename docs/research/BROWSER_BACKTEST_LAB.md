# Admin browser Backtest Lab

Open `/admin/backtest` and choose the browser lab. The server research workspace remains available from the same page, behind the same strict gate. A signed-in identity whose verified profile ID matches and whose `profiles.role` is exactly `admin` is required. Temporary exception while Supabase is paused: the existing Admin workspace entry opens local research and CSV tools without login. This requires no signed-in user and does not grant a Supabase identity or backend role. Online-history selection in this mode stays on the saved ledger without querying validation history. Signed-in non-Admin profiles remain denied even with the workspace flag. Set `TEMPORARY_OFFLINE_BACKTEST_WORKSPACE` to `false` in `src/lib/backtestWorkspaceAccess.ts` when authenticated Admin access resumes. No customer navigation, account settings, orders or risk-policy writes are added.

## Sources

- **Saved ledger:** 1,159 unique closed trades, all 16 reviewed configurations, with original transaction/financing costs already netted into `realized_r`. The deterministic exporter verifies source report hashes. Run `node --import tsx scripts/research/export-browser-ledger.ts` to regenerate from committed reports; it downloads no candles.
- **CSV:** upload up to 10 MB / 20,000 rows. Download Source CSV for a template. Required columns: `strategy_id`, `symbol`, `entry_time`, `exit_time`, `realized_r`. ISO timestamps require a timezone; Unix seconds/milliseconds are also accepted. Optional columns include `id`, `market`, `timeframe`, `side`, `cost_r`, `entry_price`, `initial_stop`, `peak_r`, `peak_r_basis`, `source_sha256`, `entry_volume_ratio`, `entry_feature_at`. Identical duplicates are deduplicated; conflicting IDs are rejected. Spreadsheet formula-like text is neutralized on export.
- **Online Supabase:** explicitly choose online history. A fresh Admin profile check precedes a paginated read of the latest completed `validation_runs` and its closed `validation_outcomes`, under existing Admin-only RLS. This is historical validation evidence, not live provider fills. Network/pause/empty-run failures fall back to the saved source; a confirmed non-Admin role does not. No service key is used in the browser. An already verified Admin can use offline mode; an unauthenticated session must explicitly enter the temporary Admin workspace to use local research while Supabase is paused.

The bundled JSON is historical research data in a browser asset, not confidential customer data. Route and CSV controls are restricted, but static application assets are not encrypted or made private by React guards. Never put customer records, credentials, or private datasets into this bundle. Private datasets require an authenticated server source.

## Replay controls and limits

Personal 5, VIP 8, Prop 8 and All 16 are imported from the existing shared deployment policies. Single-engine and custom selections are available. VIP selection defaults to one new entry per UTC day; Prop selects engines only, **not firm-rule certification**. Gold RSI's product entry-volume filter is enabled for Personal/VIP and can be disabled for unfiltered research. Missing or future volume features cannot qualify a trade.

Standard uses the existing monthly closed-profit House-Money sizing. Other risk presets use their existing profile limits. Custom sizing (0.25%–10%) leaves daily/peak locks and the visible exposure caps in effect. Correlation guard, weekend Crypto sizing, same-symbol lock, maximum open trades and shared USD/factor exposure gates operate at admission. This lab never assigns an execution profile to a real account.

Monthly software fees accrue daily at fee / 30, including idle and halted days. Entries begin inside the selected UTC dates; positions opened before the window are excluded. Positions still open at the end retain unmarked risk and are counted separately. Closed trade PnL compounds from balance at entry. Loss locks observe recorded closes and fees; simultaneous open losses can overshoot their thresholds. There is no floating-equity series.

**Exit estimates:** only 130 saved rows contain reference trailing peak R; there is no complete price path or ordered MFE/MAE. Fixed targets use peak touches minus known source costs when available; otherwise they cap recorded net R without inventing winners. Breakeven uses a saved 1.5R reference touch and known costs, otherwise keeps recorded R. All alternate exits keep original exit timestamps and original reserved stop risk. Touch-before-stop ordering, earlier capacity release and revised financing costs are unknown. These are scenario estimates, not newly backtested exits.

**Margin estimates:** initial stop distance converts risk to notional; margin = notional / leverage. Admission uses a visible 50% balance margin budget. Missing geometry blocks margin-mode admission. A stop loss exceeding isolated initial margin raises a potential liquidation alert. Maintenance margin, exchange liquidation tiers, funding changes, cross-margin offsets and intratrade paths are unavailable; no synthetic liquidation fills are booked. Higher leverage does not multiply risk-sized returns. ETH's saved complementary spot reference does not establish executable leveraged financing.

The equity chart is realized balance after fees, sampled for display; KPIs use every settlement. Returns, worst realized drawdown and win rate apply only to the selected, unequally covered admitted ledgers. Source CSV contains the loaded source; Results CSV contains admitted closed trades and scenario settings/portfolio totals. Changing controls marks results stale and disables Results download until rerun.

## Focused verification

```sh
node --import tsx --test tests/clientBacktestEngine.test.ts
node scripts/research/typecheck-browser-lab.mjs
npx eslint --config scripts/connected-demo/eslint.config.mjs src/lib/clientBacktestEngine.ts src/lib/clientBacktestSources.ts src/components/guards/StrictBacktestAdmin.tsx src/pages/admin/BacktestLab.tsx src/pages/admin/LegacyBacktestLab.tsx src/pages/admin/backtest/BrowserLedgerLab.tsx scripts/research/export-browser-ledger.ts scripts/research/typecheck-browser-lab.mjs tests/clientBacktestEngine.test.ts
```

The typecheck follows imports for type information but reports/fails only on these touched TypeScript files and global diagnostics. Unrelated dependency diagnostics are counted separately. No full-repository tests, migrations, candle acquisition or strategy changes are needed.
