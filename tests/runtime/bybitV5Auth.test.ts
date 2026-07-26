import assert from 'node:assert/strict';
import { classifyBybitFailure, clockDeltaMs, normalizedQuery, resolveBybitBaseUrl, resolveBybitEnvironment, safeFingerprint, signBybitV5Get } from '../../supabase/functions/_shared/bybit-v5-auth.ts';

const reader = (values: Record<string, string>) => (name: string) => values[name];
assert.equal(resolveBybitEnvironment(reader({ BYBIT_ENVIRONMENT: 'demo' })), 'demo');
assert.equal(resolveBybitBaseUrl('demo', reader({ BYBIT_BASE_URL: 'https://api.bybit.com', BYBIT_TESTNET_BASE_URL: 'https://api-testnet.bybit.com' })), 'https://api-demo.bybit.com', 'demo must ignore live/testnet URL variables');
assert.equal(resolveBybitBaseUrl('demo', reader({ BYBIT_DEMO_BASE_URL: 'https://api-demo.bybit.com/' })), 'https://api-demo.bybit.com');

const query = normalizedQuery({ settleCoin: 'USDT', category: 'linear' });
assert.equal(query, 'category=linear&settleCoin=USDT');
const signed = await signBybitV5Get({ timestamp: '1700000000000', apiKey: 'test-api-key', apiSecret: 'test-api-secret', recvWindow: '5000', query });
assert.equal(signed.plaintext, '1700000000000test-api-key5000category=linear&settleCoin=USDT');
assert.equal(signed.signature, 'eee2317a382dd062bcf394f78247d349fdcbd6eb3fc101b3c33cb7f1d8f8f697');
assert.equal(`${'/v5/position/list'}?${query}`.split('?')[1], query, 'URL query and signed query must be identical');

assert.equal(classifyBybitFailure(401, 10004, 'Error sign!').blocker, 'BYBIT_SIGNATURE_INVALID');
assert.equal(classifyBybitFailure(401, 10002, 'request time exceeds window').blocker, 'BYBIT_TIMESTAMP_OUT_OF_WINDOW');
assert.equal(classifyBybitFailure(403, 10010, 'Unmatched IP').blocker, 'BYBIT_IP_RESTRICTED');
assert.equal(classifyBybitFailure(403, 10005, 'Permission denied').blocker, 'BYBIT_PERMISSION_DENIED');
assert.equal(classifyBybitFailure(401, 10003, 'API key is invalid').blocker, 'BYBIT_ENVIRONMENT_MISMATCH');
assert.equal(classifyBybitFailure(401, undefined, 'Unauthorized').blocker, 'BYBIT_INVALID_API_KEY');
assert.equal(clockDeltaMs(1_000, 7_001), 6_001);

const fingerprint = await safeFingerprint('super-secret-placeholder');
assert.match(fingerprint, /^[0-9a-f]{12}$/);
assert.ok(!fingerprint.includes('secret'));

const source = await import('node:fs').then(({ readFileSync }) => readFileSync('supabase/functions/bybit-demo-execution/index.ts', 'utf8'));
assert.match(source, /selected_secret_name_pair/);
assert.match(source, /BYBIT_DEMO_API_KEY/);
assert.match(source, /retCode/);
assert.match(source, /mutations_attempted: 0/);
assert.doesNotMatch(source, /fetch\([^\n]+method: "(POST|PUT|DELETE)"/);
assert.doesNotMatch(source, /api_key: apiKey|api_secret: apiSecret/);
console.log('Bybit V5 auth diagnostics tests passed');
