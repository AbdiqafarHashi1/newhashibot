import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const app = read('src/App.tsx');
const vip = read('src/pages/public/Vip.tsx');
const free = read('src/pages/public/Free.tsx');
const pricing = read('src/pages/public/Pricing.tsx');
const commerce = read('src/lib/commerce.ts');
const mpesa = read('src/lib/mpesa.ts');
const env = read('.env.example');

assert.match(app, /path="\/vip"/); assert.match(app, /path="\/free"/);
assert.match(vip, /getWhopCheckout\('HASHIBOT_VIP_SIGNALS'\)/); assert.doesNotMatch(vip, /to=["'`]\/pricing/);
assert.match(vip, /submitManualMpesaRequest/); assert.match(vip, /referenceRef\.current\?\.focus/);
assert.match(vip, /VITE_MPESA_MERCHANT_NUMBER/); assert.match(vip, /VITE_MPESA_MERCHANT_LABEL/);
assert.match(free, /Permanent free community/i); assert.match(free, /VITE_TELEGRAM_FREE_INVITE_URL/);
for (const product of ['Personal Auto-Bot', 'Prop Pass Master', 'Crypto Prop Pass Master']) assert.match(pricing, new RegExp(product));
for (const product of ['HASHIBOT_VIP_SIGNALS', 'PERSONAL_AUTO', 'FOREX_PROP', 'CRYPTO_PROP']) assert.match(commerce, new RegExp(product));
assert.match(commerce, /configured: false/); assert.match(pricing, /awaiting verification/i);
assert.match(mpesa, /if \(error \|\| !data\?\.public_reference\) throw/); assert.match(mpesa, /PENDING_VERIFICATION/);
assert.doesNotMatch(env, /VITE_WHOP_(API|WEBHOOK)/); assert.match(free, /Free gets selected previews\. VIP gets every qualified setup, every level, every update\./);
assert.match(free, /Join Free Telegram/); assert.match(free, /Unlock Full VIP — \$29\/month/);
assert.match(vip, /<CommerceLayout>/); assert.match(free, /<CommerceLayout>/);
console.log('commerce foundation checks passed');
