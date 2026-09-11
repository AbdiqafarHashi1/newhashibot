import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/pages/admin/backtest/PropClearanceLab.tsx', 'utf8');

assert.ok(source.includes('Upload Real CSV(s)'), 'CSV fallback must remain explicitly labelled as real imported data');
assert.ok(source.includes('Only canonical-service or explicit CSV inputs qualify as non-simulated research data.'), 'Prop verdicts must retain canonical/CSV provenance gating');
assert.ok(source.includes('parseBrokerOhlcv'));
assert.ok(source.includes('Insufficient verified history'));
assert.ok(source.includes('Missing history blocks the verdict; it is never filled with synthetic data.'), 'Missing history must block rather than trigger synthetic substitution');
assert.ok(!source.includes('createDefaultMultiAssetFeeds'), 'Prop verdicts must never fill missing history with generated bars');
assert.ok(!source.includes('syncUniverseRealBars'), 'Prop verdicts must not silently replace uploaded broker history with a reference feed');

console.log('prop clearance truth guard tests passed');
