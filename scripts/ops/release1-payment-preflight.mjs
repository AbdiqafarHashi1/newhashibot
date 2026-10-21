#!/usr/bin/env node
/**
 * Release 1 credentials preflight. Reads process.env only; never prints secret values.
 * Run: node scripts/ops/release1-payment-preflight.mjs
 * Optional: RELEASE1_MPESA_MODE=daraja (default: manual)
 * Exit code 1 means required configuration is incomplete.
 */
const has = (key) => typeof process.env[key] === 'string' && process.env[key].trim().length > 0;
const mode = process.env.RELEASE1_MPESA_MODE || 'manual';
const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_CHAT_ID',
  'TELEGRAM_FREE_CHAT_ID',
  'VITE_TELEGRAM_BOT_USERNAME',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_WHOP_PLAN_VIP_SIGNALS',
  'VITE_WHOP_CHECKOUT_VIP_SIGNALS',
  'WHOP_PLAN_VIP_SIGNALS',
  'WHOP_API_KEY',
  'WHOP_WEBHOOK_SECRET',
  'VITE_MPESA_MERCHANT_NUMBER',
  'VITE_MPESA_MERCHANT_LABEL',
];
if (mode === 'daraja') required.push('MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY', 'MPESA_CALLBACK_URL');
else if (mode !== 'manual') {
  console.error('Invalid RELEASE1_MPESA_MODE: expected manual or daraja');
  process.exit(1);
}
const missing = required.filter((key) => !has(key));
const forbidden = Object.keys(process.env).filter((key) => /^VITE_/.test(key) && /(SECRET|PASSKEY|PRIVATE_KEY|SERVICE_ROLE_KEY|API_KEY|CONSUMER_KEY|CONSUMER_SECRET|BOT_TOKEN|WEBHOOK_SECRET)/.test(key) && !/^VITE_SUPABASE_ANON_KEY$/.test(key));
const mismatchedPlan = has('WHOP_PLAN_VIP_SIGNALS') && has('VITE_WHOP_PLAN_VIP_SIGNALS') && process.env.WHOP_PLAN_VIP_SIGNALS !== process.env.VITE_WHOP_PLAN_VIP_SIGNALS;
const sameChannels = has('TELEGRAM_CHAT_ID') && has('TELEGRAM_FREE_CHAT_ID') && process.env.TELEGRAM_CHAT_ID === process.env.TELEGRAM_FREE_CHAT_ID;
console.log('HashiBot Release 1 payment/Telegram configuration preflight');
console.log('M-Pesa mode:', mode);
console.log('Required variables present:', required.length - missing.length, '/', required.length);
for (const key of missing) console.error('MISSING:', key);
for (const key of forbidden) console.error('UNSAFE PUBLIC VARIABLE NAME:', key);
if (mismatchedPlan) console.error('MISMATCH: public and server Whop VIP plan IDs differ');
if (sameChannels) console.error('MISMATCH: VIP and Free Telegram destinations must differ');
if (mode === 'manual') console.log('Manual M-Pesa mode: payment evidence still requires independent admin verification; no automatic Daraja settlement.');
console.log('This preflight checks configuration presence only; it does not verify provider connectivity, webhook signatures, payment settlement or deployed functions.');
if (missing.length || forbidden.length || mismatchedPlan || sameChannels) process.exitCode = 1;
