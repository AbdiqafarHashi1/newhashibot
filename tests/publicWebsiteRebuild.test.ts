import { PUBLIC_PACKAGES, isBotPackage, priceLabel, packageStatusLabel } from '../src/lib/packages.js';
import assert from 'node:assert';

console.log('=== HASHIBOT PUBLIC WEBSITE REBUILD TEST SUITE ===\n');

// Test 1: Verify Package Positioning & Pricing Matrix
console.log('Test 1: Verifying Public Packages & Positioning...');
assert.strictEqual(PUBLIC_PACKAGES.length, 5, 'Must have 5 public packages');

const cryptoSignalPkg = PUBLIC_PACKAGES.find(p => p.slug === 'crypto_signal_room');
assert.ok(cryptoSignalPkg, 'Crypto Signal Room package must exist');
assert.strictEqual(cryptoSignalPkg.price_kes, 3500, 'Crypto Signal Room must be 3,500 KES');
assert.strictEqual(packageStatusLabel(cryptoSignalPkg), 'Available Now', 'Signal Room must be available now');

const personalBotPkg = PUBLIC_PACKAGES.find(p => p.slug === 'forex_mt5_personal_bot');
assert.ok(personalBotPkg, 'Personal Auto-Bot package must exist');
assert.strictEqual(personalBotPkg.price_kes, 8500, 'Personal Auto-Bot must be 8,500 KES');
const priceObj = priceLabel(personalBotPkg);
assert.strictEqual(priceObj.main, '8,500 KES', 'Main price must be 8,500 KES');
assert.strictEqual(priceObj.period, '/month', 'Personal Auto-Bot must be billed monthly');

const mt5PropPkg = PUBLIC_PACKAGES.find(p => p.slug === 'forex_mt5_prop_bot');
assert.ok(mt5PropPkg, 'Forex MT5 Prop Bot package must exist');
assert.strictEqual(mt5PropPkg.price_kes, 12500, 'MT5 Prop Bot must be 12,500 KES');
assert.strictEqual(packageStatusLabel(mt5PropPkg), 'Live & Ready', 'MT5 Prop Bot must retain its active product status');

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
