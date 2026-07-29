import assert from 'node:assert/strict';
const url = process.env.MT5_ONBOARDING_FUNCTION_URL;
const jwt = process.env.MT5_ONBOARDING_TEST_JWT;
if (!url || !jwt) {
  console.log('SKIP live MT5 onboarding integration: set MT5_ONBOARDING_FUNCTION_URL and MT5_ONBOARDING_TEST_JWT');
  process.exit(0);
}
const payload = {
  action: 'connect', broker: 'HashiBot Integration', server: 'Staging-Demo',
  accountNumber: process.env.MT5_ONBOARDING_TEST_ACCOUNT ?? '900000000005',
  password: process.env.MT5_ONBOARDING_TEST_PASSWORD ?? 'investor-test-only',
  nickname: 'Idempotent Demo Investor', currency: 'USD', leverage: 100,
  accountType: 'demo', executionMode: 'demo', ownerKind: 'customer',
  credentialCapability: 'investor', operational: false, monitorEnabled: true,
};
async function onboard() {
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
}
const first = await onboard();
const second = await onboard();
assert.match(first.accountId, /^[0-9a-f-]{36}$/i);
assert.match(first.credentialRef, /^[0-9a-f-]{36}$/i);
assert.equal(second.accountId, first.accountId, 'repeated onboarding returns the one canonical account');
assert.equal(second.credentialRef, first.credentialRef, 'credential reference remains stable and opaque');
assert.equal(first.account.id, first.accountId, 'response was re-read through the safe view');
assert.equal(first.account.execution_enabled, false);
assert.equal(first.account.account_type, 'demo');
assert.equal(first.account.credential_capability, 'investor');
assert.equal('password_ciphertext' in first.account, false);
assert.equal('account_number_ciphertext' in first.account, false);
console.log('Live MT5 Demo Investor onboarding integration passed');
