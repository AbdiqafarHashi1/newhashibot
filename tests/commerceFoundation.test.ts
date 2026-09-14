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
assert.match(vip, /signals only/i); assert.doesNotMatch(vip, /credential setup here/i);
assert.match(free, /Permanent free community/i); assert.match(free, /VITE_TELEGRAM_FREE_INVITE_URL/);
for (const product of ['Personal Auto-Bot', 'Prop Pass Master', 'Crypto Prop Pass Master']) assert.match(pricing, new RegExp(product));
for (const product of ['HASHIBOT_VIP_SIGNALS', 'PERSONAL_AUTO', 'FOREX_PROP', 'CRYPTO_PROP']) assert.match(commerce, new RegExp(product));
assert.match(commerce, /configured: false/); assert.match(pricing, /awaiting verification/i);
assert.match(mpesa, /if \(error \|\| !data\?\.public_reference\) throw/); assert.match(mpesa, /PENDING_VERIFICATION/);
assert.doesNotMatch(env, /VITE_WHOP_(API|WEBHOOK)/); assert.match(free, /existing FREE Telegram publishing channel/);
assert.match(vip, /<PublicLayout>/); assert.match(free, /<PublicLayout>/);
console.log('commerce foundation checks passed');
