import assert from 'node:assert/strict';
import {
  DEFAULT_UNIVERSE_GROUPS,
  getUniverseGroup,
  getDefaultUniverseGroup,
  getSymbolsForUniverse,
  getCryptoSymbolsForUniverse,
  getForexSymbolsForUniverse,
  isForexUniverseEnabled,
  isCryptoExtendedEnabled,
  isForexUniverse,
  validateUniverseGroup,
  getProductionDefaultUniverse,
  shouldScanForex,
  getMaxSymbolsForUniverse,
} from '../../src/lib/symbolUniverse.js';

async function run() {
  // ─── 1. Default universe is crypto_core ──────────────────────────────────
  const defaultGroup = getDefaultUniverseGroup();
  assert.equal(defaultGroup.group_name, 'crypto_core', 'Production default must be crypto_core');
  assert.equal(defaultGroup.is_default, true, 'crypto_core must be the default group');
  assert.equal(defaultGroup.is_enabled, true, 'crypto_core must be enabled by default');

  // ─── 2. crypto_extended is disabled by default ────────────────────────────
  const cryptoExtended = getUniverseGroup('crypto_extended');
  assert.ok(cryptoExtended, 'crypto_extended group must exist');
  assert.equal(cryptoExtended!.is_enabled, false, 'crypto_extended must be disabled by default');
  assert.equal(isCryptoExtendedEnabled('crypto_extended'), true, 'isCryptoExtendedEnabled identifies crypto_extended');
  assert.equal(isCryptoExtendedEnabled('crypto_core'), false, 'crypto_core is not crypto_extended');

  // ─── 3. forex_core and forex_extended are disabled by default ──────────────
  const forexCore = getUniverseGroup('forex_core');
  assert.ok(forexCore, 'forex_core group must exist');
  assert.equal(forexCore!.is_enabled, false, 'forex_core must be disabled by default');
  assert.equal(isForexUniverseEnabled('forex_core'), false, 'forex_core is not enabled');

  const forexExtended = getUniverseGroup('forex_extended');
  assert.ok(forexExtended, 'forex_extended group must exist');
  assert.equal(forexExtended!.is_enabled, false, 'forex_extended must be disabled by default');
  assert.equal(isForexUniverseEnabled('forex_extended'), false, 'forex_extended is not enabled');

  // ─── 4. Production default is crypto_core, not 80 symbols ─────────────────
  const productionDefault = getProductionDefaultUniverse();
  assert.equal(productionDefault, 'crypto_core', 'Production default universe must be crypto_core');
  const defaultSymbols = getSymbolsForUniverse(productionDefault);
  assert.equal(defaultSymbols.length, 5, 'crypto_core must have exactly 5 symbols');
  assert.ok(defaultSymbols.includes('BTCUSDT'), 'crypto_core must include BTCUSDT');
  assert.ok(defaultSymbols.includes('ETHUSDT'), 'crypto_core must include ETHUSDT');
  assert.ok(defaultSymbols.includes('SOLUSDT'), 'crypto_core must include SOLUSDT');

  // ─── 5. Scanner uses enabled universe only ────────────────────────────────
  const cryptoSymbols = getCryptoSymbolsForUniverse('crypto_core');
  assert.equal(cryptoSymbols.length, 5, 'crypto_core returns 5 crypto symbols');
  const forexSymbols = getForexSymbolsForUniverse('crypto_core');
  assert.equal(forexSymbols.length, 0, 'crypto_core returns 0 forex symbols');

  const forexCoreSymbols = getForexSymbolsForUniverse('forex_core');
  assert.equal(forexCoreSymbols.length, 3, 'forex_core returns 3 forex symbols');
  assert.ok(forexCoreSymbols.includes('EURUSD'), 'forex_core must include EURUSD');

  // ─── 6. shouldScanForex respects both universe and flag ───────────────────
  assert.equal(shouldScanForex('crypto_core', true), false, 'crypto_core should not scan forex even with flag');
  assert.equal(shouldScanForex('forex_core', false), false, 'forex_core should not scan forex with flag off');
  assert.equal(shouldScanForex('forex_core', true), false, 'forex_core should not scan forex because universe is disabled');

  // ─── 7. Max symbols for universe ──────────────────────────────────────────
  assert.equal(getMaxSymbolsForUniverse('crypto_core'), 5, 'crypto_core max is 5');
  assert.equal(getMaxSymbolsForUniverse('crypto_extended'), 20, 'crypto_extended max is 20');
  assert.equal(getMaxSymbolsForUniverse('forex_core'), 3, 'forex_core max is 3');

  // ─── 8. isForexUniverse correctly identifies forex groups ──────────────────
  assert.equal(isForexUniverse('forex_core'), true, 'forex_core is a forex universe');
  assert.equal(isForexUniverse('crypto_core'), false, 'crypto_core is not a forex universe');

  // ─── 9. validateUniverseGroup rejects disabled groups ─────────────────────
  const forexValidation = validateUniverseGroup('forex_core');
  assert.equal(forexValidation.valid, false, 'forex_core validation should fail (disabled)');
  assert.ok(forexValidation.error, 'forex_core validation should have error message');

  const cryptoValidation = validateUniverseGroup('crypto_core');
  assert.equal(cryptoValidation.valid, true, 'crypto_core validation should pass (enabled)');

  // ─── 10. Unknown group is rejected ────────────────────────────────────────
  const unknownValidation = validateUniverseGroup('unknown_group');
  assert.equal(unknownValidation.valid, false, 'unknown group validation should fail');

  // ─── 11. All 4 groups exist ────────────────────────────────────────────────
  assert.equal(DEFAULT_UNIVERSE_GROUPS.length, 4, 'Must have exactly 4 universe groups');
  const groupNames = DEFAULT_UNIVERSE_GROUPS.map((g) => g.group_name);
  assert.ok(groupNames.includes('crypto_core'), 'Must include crypto_core');
  assert.ok(groupNames.includes('crypto_extended'), 'Must include crypto_extended');
  assert.ok(groupNames.includes('forex_core'), 'Must include forex_core');
  assert.ok(groupNames.includes('forex_extended'), 'Must include forex_extended');

  console.log('✓ symbolUniverse tests passed (11 assertions)');
}

run().catch((err) => {
  console.error('✗ symbolUniverse tests failed:', err);
  process.exit(1);
});
