import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/pages/admin/backtest/PropClearanceLab.tsx', 'utf8');

assert.ok(source.includes('Import Broker / Exchange CSV'));
assert.ok(source.includes('parseBrokerOhlcv'));
assert.ok(source.includes('Insufficient verified history'));
assert.ok(source.includes('No synthetic or provider-substituted bars are used for prop verdicts.'));
assert.ok(!source.includes('createDefaultMultiAssetFeeds'), 'Prop verdicts must never fill missing history with generated bars');
assert.ok(!source.includes('syncUniverseRealBars'), 'Prop verdicts must not silently replace uploaded broker history with a reference feed');

console.log('prop clearance truth guard tests passed');
