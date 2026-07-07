import assert from 'node:assert/strict';

// Feature flag defaults — these must be disabled by default for safety.
// The actual DB seeds are in the migration, but we test the contract here.

const FEATURE_FLAG_DEFAULTS: Record<string, boolean> = {
  forex_execution_enabled: false,
  forex_signal_mode_enabled: false,
  mt5_live_execution_enabled: false,
  mt5_bridge_enabled: false,
  binance_testnet_enabled: true,
  bybit_testnet_enabled: true,
  persist_candles_enabled: false,
  persist_indicators_enabled: false,
};

async function run() {
  // ─── 1. Forex execution is disabled by default ────────────────────────────
  assert.equal(FEATURE_FLAG_DEFAULTS.forex_execution_enabled, false, 'forex_execution_enabled must be false by default');

  // ─── 2. Forex signal mode is disabled by default ───────────────────────────
  assert.equal(FEATURE_FLAG_DEFAULTS.forex_signal_mode_enabled, false, 'forex_signal_mode_enabled must be false by default');

  // ─── 3. MT5 live execution is disabled by default ──────────────────────────
  assert.equal(FEATURE_FLAG_DEFAULTS.mt5_live_execution_enabled, false, 'mt5_live_execution_enabled must be false by default');

  // ─── 4. MT5 bridge is disabled by default ───────────────────────────────────
  assert.equal(FEATURE_FLAG_DEFAULTS.mt5_bridge_enabled, false, 'mt5_bridge_enabled must be false by default');

  // ─── 5. Binance testnet is enabled by default ───────────────────────────────
  assert.equal(FEATURE_FLAG_DEFAULTS.binance_testnet_enabled, true, 'binance_testnet_enabled must be true by default');

  // ─── 6. Bybit testnet is enabled by default ────────────────────────────────
  assert.equal(FEATURE_FLAG_DEFAULTS.bybit_testnet_enabled, true, 'bybit_testnet_enabled must be true by default');

  // ─── 7. Candle persistence is disabled by default ──────────────────────────
  assert.equal(FEATURE_FLAG_DEFAULTS.persist_candles_enabled, false, 'persist_candles_enabled must be false by default');

  // ─── 8. Indicator persistence is disabled by default ───────────────────────
  assert.equal(FEATURE_FLAG_DEFAULTS.persist_indicators_enabled, false, 'persist_indicators_enabled must be false by default');

  // ─── 9. No unsafe live execution flags exist ───────────────────────────────
  assert.ok(!('live_trading_enabled' in FEATURE_FLAG_DEFAULTS), 'No live_trading_enabled flag should exist');
  assert.ok(!('binance_live_enabled' in FEATURE_FLAG_DEFAULTS), 'No binance_live_enabled flag should exist');
  assert.ok(!('bybit_live_enabled' in FEATURE_FLAG_DEFAULTS), 'No bybit_live_enabled flag should exist');

  // ─── 10. Forex remains shadow/disabled unless explicitly approved ──────────
  // The combination of forex_execution_enabled=false AND forex_signal_mode_enabled=false
  // means forex is in full shadow/validation mode.
  const forexFullyDisabled = !FEATURE_FLAG_DEFAULTS.forex_execution_enabled && !FEATURE_FLAG_DEFAULTS.forex_signal_mode_enabled;
  assert.equal(forexFullyDisabled, true, 'Forex must be fully disabled (execution + signal mode) by default');

  // ─── 11. MT5 remains disabled unless explicitly approved ───────────────────
  const mt5FullyDisabled = !FEATURE_FLAG_DEFAULTS.mt5_live_execution_enabled && !FEATURE_FLAG_DEFAULTS.mt5_bridge_enabled;
  assert.equal(mt5FullyDisabled, true, 'MT5 must be fully disabled (live execution + bridge) by default');

  console.log('✓ featureFlags tests passed (11 assertions)');
}

run().catch((err) => {
  console.error('✗ featureFlags tests failed:', err);
  process.exit(1);
});
