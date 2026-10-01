-- Forward-only public purchase journey: the existing Phase I processor remains the sole grant writer.
update public.commerce_product_prices set billing_interval='30_days', fixed_period_days=30
 where product_code='VIP_SIGNALS' and provider='MPESA' and currency='KES' and amount_minor=350000;
insert into public.commerce_product_prices(product_code,currency,amount_minor,billing_interval,provider,version,active,configured,fixed_period_days)
select 'VIP_SIGNALS','KES',120000,'7_days','MPESA',2,true,false,7
where not exists(select 1 from public.commerce_product_prices where product_code='VIP_SIGNALS' and provider='MPESA' and currency='KES' and fixed_period_days=7);

alter table public.commerce_checkout_sessions add column if not exists source text;
alter table public.commerce_checkout_sessions add column if not exists medium text;
alter table public.commerce_checkout_sessions add column if not exists content text;
alter table public.commerce_checkout_sessions add column if not exists referral text;

-- The atomic processor uses the exact price version's fixed duration, preventing a seven-day payment from granting 30 days.
create or replace function public.commerce_fixed_period_end(p_product text,p_provider text,p_currency text,p_version integer,p_started timestamptz)
returns timestamptz language sql stable security definer set search_path=public as $$
 select case when fixed_period_days is null then null else p_started + make_interval(days=>fixed_period_days) end
 from commerce_product_prices where product_code=p_product and provider=p_provider and currency=p_currency and version=p_version
$$;
revoke all on function public.commerce_fixed_period_end(text,text,text,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.commerce_fixed_period_end(text,text,text,integer,timestamptz) to service_role;

-- Replace the existing atomic writer only to derive the grant duration from its immutable price version.
create or replace function public.process_canonical_commerce_event(p_provider text,p_event_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 ev commerce_payment_events; n jsonb; co commerce_checkout_sessions; pay commerce_payment_attempts; sub commerce_subscriptions; ent phase_h_entitlements; res founding_slot_reservations;
 event_status text; event_time timestamptz; period_end timestamptz; prior_state text; action text; tg_action text; case_kind text; grace_days integer:=3; slot_no integer;
begin
 if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into ev from commerce_payment_events where provider=p_provider and external_event_id=p_event_id for update;
 if ev.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
 if ev.processing_state='PROCESSED' then return jsonb_build_object('state','DUPLICATE_PROCESSED','event_id',p_event_id); end if;
 if not ev.signature_verified or ev.processing_state in('REJECTED','DEAD_LETTER') then raise exception 'UNVERIFIED_OR_INVALID_EVENT'; end if;
 n:=ev.normalized_event;
 if n is null or n->>'schemaVersion'<>'phase-i/1' or n->>'provider'<>p_provider or n->>'providerEventId'<>p_event_id or coalesce((n->>'verified')::boolean,false)=false then
  update commerce_payment_events set processing_state='REVIEW_REQUIRED',review_reason='NORMALIZED_EVIDENCE_INVALID',processing_attempts=processing_attempts+1 where id=ev.id;
  insert into commerce_manual_reviews(reason_code,status) values('NORMALIZED_EVIDENCE_INVALID','OPEN'); return jsonb_build_object('state','REVIEW_REQUIRED');
 end if;
 update commerce_payment_events set processing_state='PROCESSING',processing_attempts=processing_attempts+1 where id=ev.id;
 begin event_time:=(n->>'occurredAt')::timestamptz; exception when others then event_time:=null; end;
 if event_time is null or event_time>now()+interval '5 minutes' then update commerce_payment_events set processing_state='REVIEW_REQUIRED',review_reason='EVENT_TIME_INVALID' where id=ev.id;insert into commerce_manual_reviews(reason_code,status) values('EVENT_TIME_INVALID','OPEN');return jsonb_build_object('state','REVIEW_REQUIRED');end if;
 begin select * into co from commerce_checkout_sessions where id=(n->>'checkoutId')::uuid for update; exception when others then co.id:=null; end;
 if co.id is null then update commerce_payment_events set processing_state='REVIEW_REQUIRED',review_reason='CHECKOUT_NOT_FOUND' where id=ev.id;insert into commerce_manual_reviews(reason_code,status) values('PROVIDER_PAYMENT_WITHOUT_CHECKOUT','OPEN');return jsonb_build_object('state','REVIEW_REQUIRED');end if;
 -- Canonical checkout truth wins over provider/client ambiguity.
 if co.provider<>p_provider or ((n->>'customerReference') is not null and n->>'customerReference'<>co.customer_id::text) or ((n->>'productReference') is not null and n->>'productReference'<>co.product_code)
   or (n->>'amountMinor') is null or (n->>'amountMinor')::bigint<>co.amount_minor or n->>'currency'<>co.currency then
  update commerce_payment_events set processing_state='REVIEW_REQUIRED',review_reason='CANONICAL_EVIDENCE_MISMATCH' where id=ev.id;
  update commerce_checkout_sessions set status='REVIEW_REQUIRED' where id=co.id;
  insert into commerce_manual_reviews(customer_id,checkout_session_id,reason_code,status) values(co.customer_id,co.id,'CANONICAL_EVIDENCE_MISMATCH','OPEN');return jsonb_build_object('state','REVIEW_REQUIRED');
 end if;
 if not exists(select 1 from commerce_product_prices pr where pr.product_code=co.product_code and pr.provider=co.provider and pr.currency=co.currency and pr.version=co.price_version and pr.amount_minor=co.amount_minor) then
  update commerce_payment_events set processing_state='REVIEW_REQUIRED',review_reason='PRICE_VERSION_MISMATCH' where id=ev.id;update commerce_checkout_sessions set status='REVIEW_REQUIRED' where id=co.id;insert into commerce_manual_reviews(customer_id,checkout_session_id,reason_code) values(co.customer_id,co.id,'PRICE_VERSION_MISMATCH');return jsonb_build_object('state','REVIEW_REQUIRED');
 end if;
 if co.execution_account_id is not null and not exists(select 1 from connected_execution_accounts a where a.id=co.execution_account_id and a.customer_id=co.customer_id for update) then raise exception 'ACCOUNT_OWNERSHIP_MISMATCH'; end if;
 event_status:=n->>'paymentStatus'; case_kind:=n->>'caseType';
 -- Stable payment identity prevents a second event from extending the same payment twice.
 if n->>'providerPaymentId' is not null then select * into pay from commerce_payment_attempts where provider=p_provider and external_reference=n->>'providerPaymentId' for update; end if;
 if pay.id is not null and pay.access_applied_at is not null and event_status='SUCCEEDED' then update commerce_payment_events set processing_state='PROCESSED',processed_at=now() where id=ev.id;return jsonb_build_object('state','DUPLICATE_PAYMENT','payment_id',pay.id);end if;
 if pay.id is null then insert into commerce_payment_attempts(checkout_session_id,customer_id,provider,external_reference,amount_minor,currency,provider_state,state,confirmed_at,safe_evidence,idempotency_key,provider_event_id,reconciliation_state)
 values(co.id,co.customer_id,p_provider,n->>'providerPaymentId',co.amount_minor,co.currency,n->>'providerState',case when event_status='SUCCEEDED' then 'SUCCEEDED' when event_status in('REFUNDED','PARTIALLY_REFUNDED','DISPUTED','CHARGEBACK','REVERSED') then event_status when event_status in('FAILED','CANCELLED','EXPIRED') then event_status else 'PENDING' end,case when event_status='SUCCEEDED' then event_time end,coalesce(n->'safeEvidence','{}'),p_provider||':'||p_event_id,p_event_id,case when coalesce((n->>'reconciliationRequired')::boolean,false) then 'REQUIRED' else 'NOT_REQUIRED' end) returning * into pay;
 else update commerce_payment_attempts set provider_state=n->>'providerState',state=case when event_status='SUCCEEDED' then 'SUCCEEDED' when event_status in('REFUNDED','PARTIALLY_REFUNDED','DISPUTED','CHARGEBACK','REVERSED','FAILED','CANCELLED','EXPIRED') then event_status else state end,confirmed_at=case when event_status='SUCCEEDED' then coalesce(confirmed_at,event_time) else confirmed_at end where id=pay.id returning * into pay;end if;
 select * into sub from commerce_subscriptions where customer_id=co.customer_id and product_code=co.product_code and provider=p_provider and status not in('EXPIRED','CANCELLED','REFUNDED') order by current_period_end desc nulls last limit 1 for update;
 select * into ent from phase_h_entitlements where customer_id=co.customer_id and product_code=co.product_code order by created_at desc limit 1 for update;
 -- Founding capacity is preflighted before subscription or entitlement activation. Review commits evidence only.
 if event_status='SUCCEEDED' and co.product_code='FOUNDING_AUTO_EXECUTION' then
  perform pg_advisory_xact_lock(hashtext('FOUNDING_AUTO_EXECUTION'));select * into res from founding_slot_reservations where id=co.founding_reservation_id for update;
  if res.id is null or res.customer_id<>co.customer_id or (res.execution_account_id is not null and res.execution_account_id<>co.execution_account_id) then raise exception 'FOUNDING_RESERVATION_MISMATCH';end if;
  if res.state<>'ACTIVE' and res.expires_at<=event_time and exists(select 1 from founding_slot_reservations x where x.slot_number=res.slot_number and x.id<>res.id and x.state in('RESERVED','ACTIVE')) then
   select gs into slot_no from generate_series(1,20) gs where not exists(select 1 from founding_slot_reservations x where x.slot_number=gs and x.state in('RESERVED','ACTIVE')) order by gs limit 1;
   if slot_no is null then update commerce_payment_events set processing_state='REVIEW_REQUIRED',review_reason='LATE_PAYMENT_CAPACITY_EXHAUSTED' where id=ev.id;update commerce_payment_attempts set state='REVIEW_REQUIRED' where id=pay.id;update commerce_checkout_sessions set status='REVIEW_REQUIRED' where id=co.id;insert into commerce_manual_reviews(customer_id,checkout_session_id,payment_id,reason_code) values(co.customer_id,co.id,pay.id,'LATE_PAYMENT_CAPACITY_EXHAUSTED');return jsonb_build_object('state','REVIEW_REQUIRED');end if;
   update founding_slot_reservations set slot_number=slot_no,state='RESERVED',released_at=null where id=res.id;
  end if;
 end if;
 if event_status<>'SUCCEEDED' and event_status<>'PENDING' and (sub.id is null or ent.id is null) then update commerce_payment_events set processing_state='REVIEW_REQUIRED',review_reason='LIFECYCLE_TARGET_NOT_FOUND' where id=ev.id;insert into commerce_manual_reviews(customer_id,checkout_session_id,payment_id,reason_code) values(co.customer_id,co.id,pay.id,'LIFECYCLE_TARGET_NOT_FOUND');return jsonb_build_object('state','REVIEW_REQUIRED');end if;
 if event_status='SUCCEEDED' then
  if p_provider='MPESA' then if co.product_code<>'VIP_SIGNALS' or co.currency<>'KES' then raise exception 'MPESA_PRODUCT_NOT_APPROVED';end if; select greatest(coalesce(sub.current_period_end,event_time),event_time)+make_interval(days=>fixed_period_days) into period_end from commerce_product_prices where product_code=co.product_code and provider=co.provider and currency=co.currency and version=co.price_version and amount_minor=co.amount_minor and fixed_period_days in(7,30); if period_end is null then raise exception 'MPESA_PRICE_TERM_NOT_APPROVED'; end if;
  else begin period_end:=(n->>'periodEnd')::timestamptz;exception when others then period_end:=null;end;if period_end is null or period_end<=event_time then update commerce_payment_events set processing_state='REVIEW_REQUIRED',review_reason='VERIFIED_PERIOD_REQUIRED' where id=ev.id;update commerce_payment_attempts set state='REVIEW_REQUIRED' where id=pay.id;insert into commerce_manual_reviews(customer_id,checkout_session_id,payment_id,reason_code) values(co.customer_id,co.id,pay.id,'VERIFIED_PERIOD_REQUIRED');return jsonb_build_object('state','REVIEW_REQUIRED');end if;period_end:=greatest(coalesce(sub.current_period_end,event_time),period_end);end if;
  prior_state:=coalesce(sub.status,'PENDING');
  if sub.id is null then insert into commerce_subscriptions(customer_id,product_code,provider,external_reference,status,current_period_start,current_period_end,amount_minor,currency,price_version,renewal_count,last_verified_payment_id,next_expected_payment,entitlement_state) values(co.customer_id,co.product_code,p_provider,n->>'providerSubscriptionId','ACTIVE',event_time,period_end,co.amount_minor,co.currency,co.price_version,0,pay.id,period_end,'ACTIVE') returning * into sub;
  else update commerce_subscriptions set external_reference=coalesce(n->>'providerSubscriptionId',external_reference),status='ACTIVE',current_period_start=coalesce(current_period_start,event_time),current_period_end=period_end,grace_end=null,renewal_count=renewal_count+1,last_verified_payment_id=pay.id,next_expected_payment=period_end,entitlement_state='ACTIVE' where id=sub.id returning * into sub;end if;
  if co.product_code='FOUNDING_AUTO_EXECUTION' then update founding_slot_reservations set state='ACTIVE',activated_at=coalesce(activated_at,event_time),expires_at=null,execution_account_id=co.execution_account_id where id=res.id;end if;
  if ent.id is null then insert into phase_h_entitlements(customer_id,product_code,state,source,external_reference,valid_from,valid_until,account_limit,feature_permissions,source_subscription_id,source_payment_id,execution_account_id,founding_reservation_id,granted_at,grant_reason,commercial_version) values(co.customer_id,co.product_code,'ACTIVE','VERIFIED_'||p_provider,n->>'providerPaymentId',event_time,period_end,case when co.product_code='FOUNDING_AUTO_EXECUTION' then 1 else 0 end,case when co.product_code='VIP_SIGNALS' then '{"vip_signals":true}'::jsonb else '{"execution":true}'::jsonb end,sub.id,pay.id,co.execution_account_id,co.founding_reservation_id,event_time,'VERIFIED_PAYMENT','phase-i/1') returning * into ent;
  else update phase_h_entitlements set state='ACTIVE',source='VERIFIED_'||p_provider,external_reference=n->>'providerPaymentId',valid_from=coalesce(valid_from,event_time),valid_until=greatest(coalesce(valid_until,event_time),period_end),source_subscription_id=sub.id,source_payment_id=pay.id,execution_account_id=coalesce(execution_account_id,co.execution_account_id),founding_reservation_id=coalesce(founding_reservation_id,co.founding_reservation_id),granted_at=coalesce(granted_at,event_time),revoked_at=null,revoke_reason=null where id=ent.id returning * into ent;end if;
  if co.product_code='FOUNDING_AUTO_EXECUTION' then insert into execution_entitlement_bindings(customer_id,entitlement_id,execution_account_id,founding_reservation_id,state,activated_at) values(co.customer_id,ent.id,co.execution_account_id,co.founding_reservation_id,'ACTIVE',event_time) on conflict(execution_account_id) do update set state='ACTIVE',activated_at=coalesce(execution_entitlement_bindings.activated_at,event_time),revoked_at=null where execution_entitlement_bindings.customer_id=co.customer_id and execution_entitlement_bindings.entitlement_id=ent.id;update founding_slot_reservations set entitlement_id=ent.id where id=co.founding_reservation_id;end if;
  tg_action:=case when prior_state in('EXPIRED','SUSPENDED','REFUNDED','DISPUTED') then 'RESTORE' else 'ADD' end;if prior_state='ACTIVE' then tg_action:=null;end if;
  if tg_action is not null then insert into telegram_fulfillment_requests(customer_id,entitlement_id,access_type,audience,action,idempotency_key) values(co.customer_id,ent.id,co.product_code,case when co.product_code='VIP_SIGNALS' then 'VIP' else 'EXECUTION_CUSTOMER' end,tg_action,ent.id::text||':'||tg_action||':'||sub.current_period_start::text) on conflict(idempotency_key) do nothing;end if;
  update commerce_payment_attempts set access_applied_at=coalesce(access_applied_at,now()) where id=pay.id;update commerce_checkout_sessions set status='COMPLETED',completed_at=coalesce(completed_at,event_time) where id=co.id;action:='PAYMENT_ACCESS_ACTIVATED';
 elsif event_status='CANCEL_AT_PERIOD_END' then update commerce_subscriptions set status='CANCEL_AT_PERIOD_END',cancel_at_period_end=true where id=sub.id;action:='CANCELLATION_SCHEDULED';
 elsif event_status='FAILED' then update commerce_subscriptions set status='GRACE',grace_end=least(coalesce(current_period_end,now())+make_interval(days=>grace_days),now()+make_interval(days=>grace_days)),entitlement_state='GRACE' where id=sub.id;update phase_h_entitlements set state='GRACE',valid_until=(select grace_end from commerce_subscriptions where id=sub.id) where id=ent.id;action:='PAYMENT_FAILED_GRACE';
 elsif event_status in('REFUNDED','PARTIALLY_REFUNDED','DISPUTED','CHARGEBACK','REVERSED','EXPIRED','CANCELLED') then
  if event_status='PARTIALLY_REFUNDED' then update commerce_payment_events set processing_state='REVIEW_REQUIRED',review_reason='PARTIAL_REFUND_POLICY_REVIEW' where id=ev.id;insert into commerce_manual_reviews(customer_id,checkout_session_id,payment_id,reason_code) values(co.customer_id,co.id,pay.id,'PARTIAL_REFUND_POLICY_REVIEW');return jsonb_build_object('state','REVIEW_REQUIRED');end if;
  if event_status in('REFUNDED','DISPUTED','CHARGEBACK','REVERSED') then insert into commerce_refund_disputes(payment_id,provider,provider_reference,amount_minor,currency,case_type,state,evidence_at,entitlement_action,admin_review_required) values(pay.id,p_provider,coalesce(n->>'providerEventId',p_event_id),co.amount_minor,co.currency,coalesce(case_kind,event_status),event_status,event_time,'SUSPEND',event_status in('DISPUTED','CHARGEBACK')) on conflict(provider,provider_reference) do nothing;end if;
  update commerce_subscriptions set status=case when event_status='CANCELLED' then 'CANCELLED' when event_status='EXPIRED' then 'EXPIRED' when event_status='REFUNDED' then 'REFUNDED' else 'DISPUTED' end,entitlement_state='SUSPENDED',cancelled_at=case when event_status='CANCELLED' then event_time else cancelled_at end,expired_at=case when event_status='EXPIRED' then event_time else expired_at end where id=sub.id;
  update phase_h_entitlements set state=case when event_status in('EXPIRED','CANCELLED','REFUNDED','REVERSED') then 'EXPIRED' else 'SUSPENDED' end,revoked_at=event_time,revoke_reason=event_status where id=ent.id;update execution_entitlement_bindings set state=case when event_status='EXPIRED' then 'EXPIRED' else 'REVOKED' end,revoked_at=event_time where entitlement_id=ent.id and state='ACTIVE';
  if event_status in('EXPIRED','CANCELLED','REFUNDED','REVERSED') then update founding_slot_reservations set state='RELEASED',released_at=event_time where id=co.founding_reservation_id and state='ACTIVE';end if;
  tg_action:=case when event_status in('EXPIRED','CANCELLED','REFUNDED','REVERSED') then 'REMOVE' else 'SUSPEND' end;insert into telegram_fulfillment_requests(customer_id,entitlement_id,access_type,audience,action,idempotency_key) values(co.customer_id,ent.id,co.product_code,case when co.product_code='VIP_SIGNALS' then 'VIP' else 'EXECUTION_CUSTOMER' end,tg_action,ent.id::text||':'||tg_action||':'||p_event_id) on conflict(idempotency_key) do nothing;action:='ACCESS_'||tg_action;
 else action:='PAYMENT_PENDING';end if;
 insert into commerce_audit_events(customer_id,event_type,checkout_session_id,payment_id,safe_metadata) values(co.customer_id,action,co.id,pay.id,jsonb_build_object('provider',p_provider,'provider_event_id',p_event_id,'product_code',co.product_code,'payment_state',event_status));
 update commerce_payment_events set processing_state='PROCESSED',processed_at=now(),safe_error=null where id=ev.id;return jsonb_build_object('state','PROCESSED','payment_id',pay.id,'subscription_id',sub.id,'entitlement_id',ent.id);
end $$;
revoke all on function public.process_canonical_commerce_event(text,text) from public,anon,authenticated;grant execute on function public.process_canonical_commerce_event(text,text) to service_role;
revoke all on function public.process_canonical_commerce_event(text,text) from public,anon,authenticated;
grant execute on function public.process_canonical_commerce_event(text,text) to service_role;
