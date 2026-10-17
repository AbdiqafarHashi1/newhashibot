import {readFile} from 'node:fs/promises';
export async function commerceSchema(db){
 await db.exec(`create table phase_h_products(code text primary key);insert into phase_h_products values('VIP_SIGNALS'),('FOUNDING_AUTO_EXECUTION');
 create table additional_account_requests(id uuid primary key);
 create table founding_slot_reservations(id uuid primary key default gen_random_uuid(),customer_id uuid,execution_account_id uuid,entitlement_id uuid,slot_number integer,state text,expires_at timestamptz,activated_at timestamptz,released_at timestamptz);
 create table phase_h_entitlements(id uuid primary key default gen_random_uuid(),customer_id uuid,product_code text,state text,source text,external_reference text,valid_from timestamptz,valid_until timestamptz,account_limit integer,feature_permissions jsonb,created_at timestamptz default now(),updated_at timestamptz default now(),source_subscription_id uuid,source_payment_id uuid,execution_account_id uuid,founding_reservation_id uuid,granted_at timestamptz,revoked_at timestamptz,grant_reason text,revoke_reason text,commercial_version text);
 create table execution_entitlement_bindings(customer_id uuid,entitlement_id uuid,execution_account_id uuid unique,founding_reservation_id uuid,state text,activated_at timestamptz,revoked_at timestamptz);`);
 const original=await readFile('supabase/migrations/20260927120000_phase_i_commerce_payment_truth.sql','utf8');
 for(const name of ['commerce_product_prices','commerce_checkout_sessions','commerce_payment_attempts','commerce_payment_events','commerce_subscriptions','commerce_refund_disputes','telegram_fulfillment_requests','commerce_manual_reviews','commerce_audit_events']){
  const match=original.match(new RegExp('create table public\\.'+name+'\\([\\s\\S]*?\\n?\\);','i'));if(!match)throw Error(name);await db.exec(match[0]);
 }
 await db.exec(`alter table commerce_payment_attempts add provider_event_id text,add access_applied_at timestamptz;alter table commerce_payment_events add normalized_event jsonb,add review_reason text;alter table commerce_payment_events drop constraint commerce_payment_events_processing_state_check;alter table commerce_payment_events add check(processing_state in('RECEIVED','PROCESSING','PROCESSED','REVIEW_REQUIRED','REJECTED','FAILED','DEAD_LETTER'));create unique index fulfillment_idempotency on telegram_fulfillment_requests(idempotency_key);`);
 await db.exec(await readFile('supabase/migrations/20261017012429_canonical_commerce_account_scope.sql','utf8'));
}
