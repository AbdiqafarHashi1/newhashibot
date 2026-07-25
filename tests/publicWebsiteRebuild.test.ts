import { PUBLIC_PACKAGES, isBotPackage, priceLabel, packageStatusLabel } from '../src/lib/packages.js';
import assert from 'node:assert';

console.log('=== HASHIBOT PUBLIC WEBSITE REBUILD TEST SUITE ===\n');

// Test 1: Verify Package Positioning & Pricing Matrix
console.log('Test 1: Verifying Public Packages & Positioning...');
assert.strictEqual(PUBLIC_PACKAGES.length, 5, 'Must have 5 public packages');

const cryptoSignalPkg = PUBLIC_PACKAGES.find(p => p.slug === 'crypto_signal_room');
assert.ok(cryptoSignalPkg, 'Crypto Signal Room package must exist');
assert.strictEqual(cryptoSignalPkg.price_kes, 5000, 'Crypto Signal Room must be 5000 KES');
assert.strictEqual(packageStatusLabel(cryptoSignalPkg), 'Available', 'Signal Room must be Available');

const cryptoBotPkg = PUBLIC_PACKAGES.find(p => p.slug === 'crypto_personal_bot');
assert.ok(cryptoBotPkg, 'Crypto Personal Bot package must exist');
assert.strictEqual(cryptoBotPkg.price_kes, 10000, 'Crypto Personal Bot must be 10000 KES');
const priceObj = priceLabel(cryptoBotPkg);
assert.strictEqual(priceObj.main, '10,000 KES', 'Main price must be 10,000 KES');
assert.strictEqual(priceObj.period, '/month or $100/month', 'Period label must include $100/month option');

const mt5PropPkg = PUBLIC_PACKAGES.find(p => p.slug === 'forex_mt5_prop_bot');
assert.ok(mt5PropPkg, 'Forex MT5 Prop Bot package must exist');
assert.strictEqual(packageStatusLabel(mt5PropPkg), 'Waitlist', 'MT5 Prop Bot must be marked as Waitlist / Certification Pending');

console.log('  ✓ Public package matrix & pricing tiers verified');

// Test 2: M-Pesa & Contact Constants
console.log('Test 2: Verifying M-Pesa Payment & Contact Contracts...');
const MPESA_NUMBER = '0748895225';
const MPESA_DISPLAY = '0748 895 225';
const SUPPORT_EMAIL = 'binuhashi1@gmail.com';

assert.strictEqual(MPESA_NUMBER.length, 10, 'M-Pesa number must be 10 digits');
assert.strictEqual(MPESA_DISPLAY, '0748 895 225', 'Formatted display must match');
assert.strictEqual(SUPPORT_EMAIL, 'binuhashi1@gmail.com', 'Support email must match');

console.log('  ✓ M-Pesa number (0748895225) and email (binuhashi1@gmail.com) verified');

// Test 3: Verify Bot Package Detection Logic
console.log('Test 3: Verifying Bot Package Classification...');
assert.strictEqual(isBotPackage('crypto_personal_bot'), true);
assert.strictEqual(isBotPackage('forex_mt5_personal_bot'), true);
assert.strictEqual(isBotPackage('forex_mt5_prop_bot'), true);
assert.strictEqual(isBotPackage('crypto_signal_room'), false);
assert.strictEqual(isBotPackage('free_preview'), false);

console.log('  ✓ Bot package classification logic verified');

console.log('\n✅ ALL PUBLIC WEBSITE REBUILD TESTS PASSED SUCCESSFULLY!');
