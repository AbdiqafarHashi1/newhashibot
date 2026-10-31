import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getEntitlementsForPackage, isBotPackage, signalModeIncluded } from '../../src/lib/packages';
import { getCustomerAccessState } from '../../src/lib/customerAccess';

// 1. Audit Migration File
const securitySql = readFileSync('supabase/migrations/20260725120000_customer_security_and_runtime_hardening.sql', 'utf8');

// Ensure get_customer_entitlements strictly locks user_id for non-admins
assert.ok(securitySql.includes('v_target_user_id'), 'Migration must declare v_target_user_id');
assert.ok(securitySql.includes('auth.role() = \'service_role\' OR public.is_admin()'), 'Migration must check for admin/service_role authorization');
assert.ok(securitySql.includes('v_target_user_id := auth.uid();'), 'Non-admin callers must be locked to their own auth.uid()');

// Ensure RLS Policies exist on critical tables
const expectedTablesWithRls = [
  'customer_subscriptions',
  'access_requests',
  'connected_execution_accounts',
  'execution_orders',
  'trade_management_truth',
  'execution_event_logs'
];

for (const table of expectedTablesWithRls) {
  assert.ok(securitySql.includes(table), `Security migration must cover table: ${table}`);
}

// 2. Test Entitlements Mapping
const cryptoBotEntitlements = getEntitlementsForPackage('crypto_personal_bot', true);
assert.equal(cryptoBotEntitlements.signalAccess, false);
assert.equal(cryptoBotEntitlements.cryptoExecution, true);
assert.equal(cryptoBotEntitlements.mt5Personal, false);
assert.equal(cryptoBotEntitlements.mt5Prop, false);
assert.equal(cryptoBotEntitlements.canConfigureBot, true);

const mt5PersonalEntitlements = getEntitlementsForPackage('forex_mt5_personal_bot', true);
assert.equal(mt5PersonalEntitlements.signalAccess, false);
assert.equal(mt5PersonalEntitlements.cryptoExecution, false);
assert.equal(mt5PersonalEntitlements.mt5Personal, true);
assert.equal(mt5PersonalEntitlements.mt5Prop, false);
assert.equal(mt5PersonalEntitlements.canConfigureBot, true);

const mt5PropEntitlements = getEntitlementsForPackage('forex_mt5_prop_bot', true);
assert.equal(mt5PropEntitlements.signalAccess, false);
assert.equal(mt5PropEntitlements.cryptoExecution, false);
assert.equal(mt5PropEntitlements.mt5Personal, false);
assert.equal(mt5PropEntitlements.mt5Prop, true);
assert.equal(mt5PropEntitlements.canConfigureBot, true);

const inactiveEntitlements = getEntitlementsForPackage('crypto_personal_bot', false);
assert.equal(inactiveEntitlements.signalAccess, false);
assert.equal(inactiveEntitlements.cryptoExecution, false);
assert.equal(inactiveEntitlements.canConfigureBot, false);

// 3. Test Access State Lifecycle
const activeSub = {
  id: 'sub-1',
  user_id: 'user-a',
  package_name: 'VIP Signals',product_slug:'crypto_signal_room',
  verified_commerce: true,
  access_status: 'active',
  payment_status: 'paid',
  expires_at: new Date(Date.now() + 86400000).toISOString(),
} as any;

assert.equal(getCustomerAccessState(activeSub, null), 'active');
assert.equal(getCustomerAccessState({...activeSub,payment_status:'manual_access',verified_commerce:false,manual_access:true},null),'active');
assert.equal(getCustomerAccessState({...activeSub,payment_status:'manual_access',verified_commerce:false,manual_access:false},null),'pending');
assert.equal(getCustomerAccessState({...activeSub,payment_status:'manual_access',verified_commerce:false,manual_access:true,expires_at:new Date(Date.now()-1).toISOString()},null),'expired');
assert.equal(getCustomerAccessState({...activeSub,verified_commerce:false},null),'pending');
assert.equal(getCustomerAccessState(null,{status:'approved'} as any),'pending');
assert.equal(getCustomerAccessState({...activeSub,expires_at:'invalid'},null),'pending');

const expiredSub = {
  ...activeSub,
  access_status: 'expired',
  expires_at: new Date(Date.now() - 86400000).toISOString(),
};
assert.equal(getCustomerAccessState(expiredSub, null), 'expired');

const pendingPaymentReq = {
  id: 'req-1',
  user_id: 'user-a',
  status: 'pending_payment',
} as any;
assert.equal(getCustomerAccessState(null, pendingPaymentReq), 'pending_payment');

const rejectedReq = {
  id: 'req-2',
  user_id: 'user-a',
  status: 'rejected',
} as any;
assert.equal(getCustomerAccessState(null, rejectedReq), 'rejected');

// 4. Test Bot Package Classifications
assert.equal(isBotPackage('crypto_personal_bot'), true);
assert.equal(isBotPackage('forex_mt5_personal_bot'), true);
assert.equal(isBotPackage('forex_mt5_prop_bot'), true);
assert.equal(isBotPackage('crypto_signal_room'), false);
assert.equal(isBotPackage('free_preview'), false);

assert.equal(signalModeIncluded('crypto_signal_room'), true);
assert.equal(signalModeIncluded('crypto_personal_bot'), false);
assert.equal(signalModeIncluded('free_preview'), false);

console.log('✅ Customer security, entitlement, and access state tests PASSED.');
