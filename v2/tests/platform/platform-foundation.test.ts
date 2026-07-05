import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20260705120000_platform_foundation.sql', 'utf8');
const fn = readFileSync('supabase/functions/platform-api/index.ts', 'utf8');
const doc = readFileSync('docs/platform/step-15-platform-foundation.md', 'utf8');

for (const table of ['customers','customer_profiles','customer_preferences','customer_accounts','customer_executors','subscriptions','packages','roles','permissions','audit_log','notifications','system_settings','provider_credentials','executor_heartbeats','executor_health','customer_activity','engine_events']) {
  assert.match(sql, new RegExp(`(?:CREATE TABLE IF NOT EXISTS|ALTER TABLE public\\.) public\\.${table}|ALTER TABLE public\\.${table}`), `platform schema covers ${table}`);
}
for (const value of ['owner','admin','customer','service_role','anonymous']) assert.match(sql, new RegExp(`'${value}'`), `role ${value} exists`);
for (const status of ['pending','provisioning','running','paused','recovering','stopped','failed','disabled']) assert.match(sql, new RegExp(`'${status}'`), `executor status ${status} exists`);
for (const provider of ['binance','bybit','mt5','other']) assert.match(sql, new RegExp(`'${provider}'`), `provider ${provider} exists`);
for (const action of ['customer_registration','subscription_activation','manual_mpesa_review','executor_heartbeat','engine_event_ingestion','notification_generation','audit_logging']) assert.match(fn, new RegExp(action), `platform-api supports ${action}`);
assert.match(sql, /review_manual_mpesa_subscription/, 'manual M-Pesa approval RPC exists');
assert.match(sql, /mpesa_transaction_code/, 'manual M-Pesa transaction code is persisted');
assert.match(sql, /payment_screenshot_path/, 'optional payment screenshot reference is persisted');
assert.match(sql, /provider_credentials_operator_only/, 'provider credentials are operator-only');
assert.match(sql, /platform_customer_own_select/, 'customer isolation RLS exists');
assert.doesNotMatch(fn, /submitOrder|placeOrder|createOrder|executeTrade/i, 'platform edge function contains no trading logic');
assert.match(doc, /Audit classification/, 'documentation includes audit classification');
console.log('Platform foundation tests passed');
