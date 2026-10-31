import { PUBLIC_PACKAGES, isBotPackage, priceLabel, packageStatusLabel } from '../src/lib/packages.js';
import assert from 'node:assert';
import {readFileSync} from 'node:fs';

console.log('=== HASHIBOT PUBLIC WEBSITE REBUILD TEST SUITE ===\n');

// Test 1: Verify Package Positioning & Pricing Matrix
console.log('Test 1: Verifying Public Packages & Positioning...');
assert.strictEqual(PUBLIC_PACKAGES.length, 5, 'Must have 5 public packages');

const cryptoSignalPkg = PUBLIC_PACKAGES.find(p => p.slug === 'crypto_signal_room');
assert.ok(cryptoSignalPkg, 'Crypto Signal Room package must exist');
assert.strictEqual(cryptoSignalPkg.price_kes, 3500, 'Crypto Signal Room must be 3,500 KES');
assert.strictEqual(packageStatusLabel(cryptoSignalPkg), 'Launch verification', 'Signal Room must disclose launch verification');

const personalBotPkg = PUBLIC_PACKAGES.find(p => p.slug === 'forex_mt5_personal_bot');
assert.ok(personalBotPkg, 'Personal Auto-Bot package must exist');
assert.strictEqual(personalBotPkg.price_kes, 8500, 'Personal Auto-Bot must be 8,500 KES');
const priceObj = priceLabel(personalBotPkg);
assert.strictEqual(priceObj.main, '$100 USD', 'Execution remains a separate per-account future product');
assert.strictEqual(priceObj.period, '/month', 'Personal Auto-Bot must be billed monthly');

const mt5PropPkg = PUBLIC_PACKAGES.find(p => p.slug === 'forex_mt5_prop_bot');
assert.ok(mt5PropPkg, 'Forex MT5 Prop Bot package must exist');
assert.strictEqual(mt5PropPkg.price_kes, 12500, 'MT5 Prop Bot must be 12,500 KES');
assert.strictEqual(packageStatusLabel(mt5PropPkg), 'Release 2 preview', 'Execution must not be advertised as live');

console.log('  ✓ Public package matrix & pricing tiers verified');

// Test 2: M-Pesa & Contact Constants
console.log('Test 2: Verifying M-Pesa Payment & Contact Contracts...');
const vip=readFileSync('src/pages/public/Vip.tsx','utf8'),faq=readFileSync('src/pages/public/FAQ.tsx','utf8'),contact=readFileSync('src/pages/public/Contact.tsx','utf8');
assert.match(vip,/termDays=\{30\}/);assert.doesNotMatch(vip,/termDays=\{7\}/);assert.match(vip,/certified strategy/);assert.match(vip,/WhopCheckout/);
assert.doesNotMatch(faq+contact,/0748895225|0712482447|0712 482 447/,'Customer payments must use configured provider checkout');
console.log('  ✓ Official provider checkout and launch disclosures verified');

// Test 3: Verify Bot Package Detection Logic
console.log('Test 3: Verifying Bot Package Classification...');
assert.strictEqual(isBotPackage('crypto_personal_bot'), true);
assert.strictEqual(isBotPackage('forex_mt5_personal_bot'), true);
assert.strictEqual(isBotPackage('forex_mt5_prop_bot'), true);
assert.strictEqual(isBotPackage('crypto_signal_room'), false);
assert.strictEqual(isBotPackage('free_preview'), false);

console.log('  ✓ Bot package classification logic verified');

console.log('\n✅ ALL PUBLIC WEBSITE REBUILD TESTS PASSED SUCCESSFULLY!');
