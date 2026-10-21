-- No provider credentials, cron activation or execution changes. Reuse canonical entitlements and fulfillment queue.
create or replace function public.reconcile_release1_vip_memberships() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('release1-vip-membership-sweep',0));
 update phase_h_entitlements set state='EXPIRED',updated_at=clock_timestamp()
 where product_code='VIP_SIGNALS' and state in('ACTIVE','TRIAL','GRACE') and valid_until<=clock_timestamp();
 -- Poll invite acceptance and voluntary departures, including completed jobs. A five-minute bucket bounds retries.
 insert into telegram_fulfillment_requests(customer_id,entitlement_id,access_type,audience,action,idempotency_key,entitlement_version)
 select e.customer_id,e.id,e.product_code,c.audience,
 case when public.has_product_entitlement(e.customer_id,'crypto_signal_room',now()) then 'RESTORE' else 'REMOVE' end,
 'release1:sweep:'||e.id||':'||c.audience||':'||floor(extract(epoch from now())/300)::text,e.updated_at
 from phase_h_entitlements e join telegram_audience_configuration c on c.product_code=e.product_code and c.enabled
 where e.product_code='VIP_SIGNALS' and exists(select 1 from telegram_links l where l.user_id=e.customer_id and l.telegram_user_id is not null)
 and not exists(select 1 from telegram_fulfillment_requests f where f.entitlement_id=e.id and f.audience=c.audience and f.status in('PENDING','CLAIMED','FAILED','READY_FOR_CONFIGURATION'))
 on conflict(idempotency_key) do nothing;
 get diagnostics changed=row_count;return changed;
end$$;
revoke all on function public.reconcile_release1_vip_memberships() from public,anon,authenticated;
grant execute on function public.reconcile_release1_vip_memberships() to service_role;

CREATE OR REPLACE FUNCTION public.enqueue_canonical_lifecycle_event(p_event_key text,p_event_type text,p_event_version integer,p_signal_id uuid,p_execution_id uuid,p_customer_id uuid,p_account_id uuid,p_occurred_at timestamptz,p_payload jsonb,p_destinations text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE event_id uuid; existing_hash text; expected_hash text:=md5(p_payload::text); destination text;
BEGIN IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 IF p_event_type='EDITORIAL' AND (p_signal_id IS NOT NULL OR p_customer_id IS NOT NULL OR p_payload->'editorial'->>'compliance_state' IS DISTINCT FROM 'APPROVED' OR coalesce(jsonb_array_length(p_payload->'editorial'->'source_ids'),0)=0) THEN RAISE EXCEPTION 'EDITORIAL_EVIDENCE_REQUIRED'; END IF;
 IF p_event_version<1 OR p_event_key='' OR p_event_type='' OR p_destinations IS NULL THEN RAISE EXCEPTION 'INVALID_LIFECYCLE_EVENT'; END IF;
 SELECT id,content_hash INTO event_id,existing_hash FROM public.canonical_lifecycle_events WHERE event_key=p_event_key AND event_version=p_event_version;
 IF event_id IS NOT NULL AND existing_hash<>expected_hash THEN RAISE EXCEPTION 'LIFECYCLE_EVENT_CONTENT_CONFLICT'; END IF;
 IF event_id IS NULL THEN INSERT INTO public.canonical_lifecycle_events(event_key,event_type,event_version,signal_id,execution_id,customer_id,account_id,occurred_at,payload,content_hash) VALUES(p_event_key,p_event_type,p_event_version,p_signal_id,p_execution_id,p_customer_id,p_account_id,p_occurred_at,p_payload,expected_hash) RETURNING id INTO event_id; END IF;
 FOREACH destination IN ARRAY p_destinations LOOP
  IF destination NOT IN ('free','vip','customer','admin','owner') OR (destination='free' AND p_event_type<>'EDITORIAL') THEN RAISE EXCEPTION 'INVALID_LIFECYCLE_DESTINATION'; END IF;
  IF destination='customer' AND (p_customer_id IS NULL OR p_account_id IS NULL) THEN RAISE EXCEPTION 'CUSTOMER_ACCOUNT_SCOPE_REQUIRED'; END IF;
  INSERT INTO public.signal_publication_work(signal_id,entity_type,entity_id,event_type,event_version,destination,customer_id,event_key,status)
  VALUES(p_signal_id,'lifecycle_event',coalesce(p_execution_id,p_signal_id,event_id),p_event_type,p_event_version,destination,CASE WHEN destination='customer' THEN p_customer_id ELSE NULL END,p_event_key||':'||destination,'pending') ON CONFLICT DO NOTHING;
 END LOOP; RETURN event_id; END $$;
REVOKE ALL ON FUNCTION public.enqueue_canonical_lifecycle_event(text,text,integer,uuid,uuid,uuid,uuid,timestamptz,jsonb,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_canonical_lifecycle_event(text,text,integer,uuid,uuid,uuid,uuid,timestamptz,jsonb,text[]) TO service_role;


-- A worker crash after send may mean Telegram accepted the message. Never resend that reserved part automatically.
CREATE OR REPLACE FUNCTION public.reserve_canonical_delivery_part(p_work_id uuid,p_lease_token uuid,p_part integer,p_identity text)
RETURNS public.canonical_telegram_delivery_parts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.canonical_telegram_delivery_parts%ROWTYPE; work public.signal_publication_work%ROWTYPE; previous_message text;
BEGIN IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 SELECT * INTO work FROM public.signal_publication_work WHERE id=p_work_id AND lease_token=p_lease_token AND status='processing' AND lease_expires_at>now(); IF work.id IS NULL THEN RAISE EXCEPTION 'PUBLICATION_LEASE_LOST'; END IF;
 IF EXISTS(SELECT 1 FROM public.signal_publication_work newer JOIN public.canonical_telegram_delivery_parts part ON part.publication_work_id=newer.id AND part.message_part=p_part AND part.state='DELIVERED' WHERE newer.entity_type=work.entity_type AND newer.entity_id=work.entity_id AND newer.destination=work.destination AND newer.event_version>work.event_version) THEN RAISE EXCEPTION 'STALE_LIFECYCLE_VERSION'; END IF;
 SELECT part.telegram_message_id INTO previous_message FROM public.signal_publication_work older JOIN public.canonical_telegram_delivery_parts part ON part.publication_work_id=older.id AND part.message_part=p_part AND part.state='DELIVERED' WHERE older.entity_type=work.entity_type AND older.entity_id=work.entity_id AND older.destination=work.destination AND older.event_version<work.event_version ORDER BY older.event_version DESC LIMIT 1;
 INSERT INTO public.canonical_telegram_delivery_parts(publication_work_id,message_identity,message_part,state,attempt_count,operation,edited_from_message_id) VALUES(p_work_id,p_identity,p_part,'RESERVED',1,CASE WHEN previous_message IS NULL THEN 'SEND' ELSE 'EDIT' END,previous_message)
 ON CONFLICT(message_identity) DO UPDATE SET state=CASE WHEN canonical_telegram_delivery_parts.state='RESERVED' THEN 'UNCERTAIN' ELSE canonical_telegram_delivery_parts.state END,attempt_count=CASE WHEN canonical_telegram_delivery_parts.state IN ('RETRY','RESERVED') THEN canonical_telegram_delivery_parts.attempt_count+1 ELSE canonical_telegram_delivery_parts.attempt_count END,updated_at=now() RETURNING * INTO result; RETURN result; END $$;


create or replace function public.install_hashibot_release_schedules(p_actor uuid,p_project_url text,p_jobs jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j jsonb;secret_id uuid;job_id bigint;statement text;result jsonb:='[]';begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 if p_project_url<>'https://uqiwbzfcntlcyyewawfc.supabase.co' or jsonb_typeof(p_jobs)<>'array' or jsonb_array_length(p_jobs)>16 then raise exception 'RELEASE_PROJECT_OR_JOB_SCOPE_INVALID';end if;
 update cron.job set active=false where jobname like 'hashibot_%';
 for j in select value from jsonb_array_elements(p_jobs) loop
  if j->>'endpoint' not in('scheduled-market-scanner','evaluate-signal-outcomes','binance-testnet-monitor','bybit-testnet-monitor','account-signal-authorization','phase-n-command-worker','canonical-reporting-worker','commerce-reconcile','telegram-membership','phase-o-worker','intelligence-engine') or j->>'name'!~'^hashibot_[a-z0-9_]+$' or j->>'schedule' not in('* * * * *','*/5 * * * *') or j->>'header' not in('x-scanner-cron-secret','x-hashibot-cron-token','x-hashibot-internal-secret','Authorization','x-phase-o-worker-secret') or length(coalesce(j->>'token',''))<16 then raise exception 'RELEASE_JOB_CONFIGURATION_INVALID';end if;
  select id into secret_id from vault.secrets where name='release_'||(j->>'name');
  if secret_id is null then secret_id:=vault.create_secret(j->>'token','release_'||(j->>'name'),'HashiBot scheduled worker authorization');else perform vault.update_secret(secret_id,j->>'token');end if;
  statement:=format('select net.http_post(url := %L,headers := jsonb_build_object(''Content-Type'',''application/json'',%L,(select decrypted_secret from vault.decrypted_secrets where id=%L::uuid)),body := %L::jsonb,timeout_milliseconds := 90000);',p_project_url||'/functions/v1/'||(j->>'endpoint'),j->>'header',secret_id::text,coalesce(j->'body','{}'::jsonb)::text);
  select cron.schedule(j->>'name',j->>'schedule',statement) into job_id;perform cron.alter_job(job_id,active:=false);
  result:=result||jsonb_build_array(jsonb_build_object('name',j->>'name','job_id',job_id,'active',false));
 end loop;
 insert into phase_h_audit_events(customer_id,actor_id,event_type,safe_metadata) values(p_actor,p_actor,'RELEASE_SCHEDULES_INSTALLED_PAUSED',jsonb_build_object('jobs',result));return result;
end$$;
revoke all on function public.install_hashibot_release_schedules(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.install_hashibot_release_schedules(uuid,text,jsonb) to service_role;

create or replace function public.control_hashibot_release_schedule(p_actor uuid,p_name text default null,p_enabled boolean default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare names text[]:=ARRAY['hashibot_scheduled_market_scanner_5m','hashibot_outcomes_5m','hashibot_binance_monitor_1m','hashibot_bybit_monitor_1m','hashibot_account_authorization_1m','hashibot_account_commands_1m','hashibot_reporting_1m','hashibot_commerce_recovery_5m','hashibot_telegram_membership_1m','hashibot_agents_5m','hashibot_intelligence_5m'];job_id bigint;result jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 if p_enabled is not null then
  if p_name is null or not(p_name=any(names)) then raise exception 'KNOWN_RELEASE_SCHEDULE_REQUIRED';end if;
  select jobid into job_id from cron.job where jobname=p_name;if job_id is null then raise exception 'INSTALL_RELEASE_SCHEDULES_FIRST';end if;
  perform cron.alter_job(job_id,active:=p_enabled);
  insert into phase_h_audit_events(customer_id,actor_id,event_type,safe_metadata) values(p_actor,p_actor,'RELEASE_SCHEDULE_CONTROLLED',jsonb_build_object('name',p_name,'active',p_enabled));
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('name',n,'job_id',j.jobid,'active',coalesce(j.active,false),'installed',j.jobid is not null,'schedule',j.schedule) order by n),'[]'::jsonb) into result from unnest(names) n left join cron.job j on j.jobname=n;
 return result;
end$$;
revoke all on function public.control_hashibot_release_schedule(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.control_hashibot_release_schedule(uuid,text,boolean) to service_role;

create or replace function public.consume_telegram_link_token(p_token_hash text,p_telegram_user_id bigint,p_username text,p_display_name text) returns jsonb language plpgsql security definer set search_path=public as $$
declare t telegram_onboarding_tokens; lid uuid; prior_identity bigint; prior_access text; begin
 if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into t from telegram_onboarding_tokens where token_hash=p_token_hash for update;
 if t.id is null or t.used_at is not null or t.replaced_at is not null then raise exception 'TOKEN_INVALID_OR_REPLAYED'; end if;
 if t.expires_at<=now() then raise exception 'TOKEN_EXPIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('telegram:'||p_telegram_user_id::text,0));
 if exists(select 1 from telegram_links where telegram_user_id=p_telegram_user_id and user_id<>t.user_id) then raise exception 'TELEGRAM_IDENTITY_ALREADY_BOUND'; end if;
 select id,telegram_user_id,access_state into lid,prior_identity,prior_access from telegram_links where user_id=t.user_id order by updated_at desc limit 1 for update;
 if prior_identity is not null and prior_identity<>p_telegram_user_id and (prior_access in('healthy','invite_sent') or exists(select 1 from telegram_memberships where telegram_link_id=lid and state not in('REMOVED','SUSPENDED'))) then raise exception 'REMOVE_PREVIOUS_TELEGRAM_ACCESS_BEFORE_RELINK';end if;
 if lid is null then insert into telegram_links(user_id,telegram_user_id,telegram_username,telegram_display_name,status,product_slug,access_state,updated_at) values(t.user_id,p_telegram_user_id,left(coalesce(p_username,''),64),left(coalesce(p_display_name,''),128),'connected','PHASE_J','linked',now()) returning id into lid;
 else update telegram_links set telegram_user_id=p_telegram_user_id,telegram_username=left(coalesce(p_username,''),64),telegram_display_name=left(coalesce(p_display_name,''),128),status='connected',product_slug='PHASE_J',access_state='linked',updated_at=now() where id=lid; end if;
 update telegram_onboarding_tokens set used_at=now() where id=t.id;
 insert into telegram_fulfillment_requests(customer_id,entitlement_id,access_type,audience,action,idempotency_key,entitlement_version)
 select e.customer_id,e.id,e.product_code,case e.product_code when 'FREE_SIGNALS' then 'FREE' when 'VIP_SIGNALS' then 'VIP' when 'FOUNDING_AUTO_EXECUTION' then 'EXECUTION' end,'ADD','phase-j:link:'||lid||':'||e.id,e.updated_at
 from phase_h_entitlements e where e.customer_id=t.user_id and e.state in('ACTIVE','TRIAL','GRACE') and e.product_code in('FREE_SIGNALS','VIP_SIGNALS','FOUNDING_AUTO_EXECUTION') on conflict(idempotency_key) do nothing;
 insert into commerce_audit_events(customer_id,event_type,safe_metadata) values(t.user_id,'TELEGRAM_IDENTITY_LINKED',jsonb_build_object('link_id',lid));
 return jsonb_build_object('customer_id',t.user_id,'link_id',lid);
end $$;
revoke all on function public.consume_telegram_link_token(text,bigint,text,text) from public; grant execute on function public.consume_telegram_link_token(text,bigint,text,text) to service_role;

-- Compatibility reads project the canonical Phase-I authority. Old manual receipts cannot grant Release 1 VIP.
create or replace function public.has_product_entitlement(p_user_id uuid,p_product_slug text,p_at timestamptz default now())
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not(coalesce(auth.uid()=p_user_id,false) or auth.role()='service_role' or public.is_admin()) then return false;end if;
 if p_product_slug='crypto_signal_room' then
  return exists(select 1 from phase_h_entitlements e join commerce_payment_attempts p on p.id=e.source_payment_id and p.customer_id=e.customer_id
   where e.customer_id=p_user_id and e.product_code='VIP_SIGNALS' and e.state in('ACTIVE','GRACE') and e.valid_from<=p_at and e.valid_until>p_at and p.state='SUCCEEDED' and coalesce((p.safe_evidence->>'sandbox')::boolean,true)=false);
 end if;
 return exists(select 1 from customer_subscriptions where user_id=p_user_id and product_slug=p_product_slug and access_status='active' and payment_status='paid' and revoked_at is null and coalesce(starts_at,created_at)<=p_at and (expires_at is null or expires_at>p_at));
end$$;
revoke all on function public.has_product_entitlement(uuid,text,timestamptz) from public,anon;
grant execute on function public.has_product_entitlement(uuid,text,timestamptz) to authenticated,service_role;

create or replace function public.my_vip_commerce_status() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare e phase_h_entitlements;p commerce_payment_attempts;begin
 if auth.uid() is null then return jsonb_build_object('state','NOT_FOUND');end if;
 if has_product_entitlement(auth.uid(),'crypto_signal_room',now()) then
  select * into e from phase_h_entitlements where customer_id=auth.uid() and product_code='VIP_SIGNALS' and state in('ACTIVE','GRACE') and valid_until>now() order by valid_until desc limit 1;
  select * into p from commerce_payment_attempts where id=e.source_payment_id;
  return jsonb_build_object('state','ACTIVE','expires_at',e.valid_until,'provider',p.provider);
 end if;
 if exists(select 1 from commerce_checkout_sessions where customer_id=auth.uid() and product_code='VIP_SIGNALS' and status in('CREATED','PROVIDER_PENDING','ACTION_REQUIRED','REVIEW_REQUIRED') and expires_at>now()) then return jsonb_build_object('state','VERIFYING');end if;
 return jsonb_build_object('state','NOT_FOUND');
end$$;
revoke all on function public.my_vip_commerce_status() from public,anon;
grant execute on function public.my_vip_commerce_status() to authenticated;

create or replace function public.my_vip_telegram_status() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare l telegram_links;begin
 if auth.uid() is null then return jsonb_build_object('state','UNAUTHENTICATED');end if;
 if not has_product_entitlement(auth.uid(),'crypto_signal_room',now()) then return jsonb_build_object('state','INACTIVE');end if;
 select * into l from telegram_links where user_id=auth.uid() order by updated_at desc limit 1;
 if l.id is null or l.telegram_user_id is null then return jsonb_build_object('state','NOT_LINKED');end if;
 return jsonb_build_object('state',case when exists(select 1 from telegram_memberships where customer_id=auth.uid() and state='ACTIVE' and audience in('VIP','VIP_FOREX_GOLD','VIP_CRYPTO')) then 'HEALTHY' when exists(select 1 from telegram_memberships where customer_id=auth.uid() and state='FAILED') then 'LINKING_FAILED' else 'LINKING' end,'telegram_user_id',l.telegram_user_id,'username',l.telegram_username);
end$$;
revoke all on function public.my_vip_telegram_status() from public,anon;
grant execute on function public.my_vip_telegram_status() to authenticated;

-- A verified provider cancellation toggle may be cleared before period end. Keep one commerce authority.
create or replace function public.process_canonical_commerce_event(p_provider text,p_event_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 approved_price commerce_product_prices; ev commerce_payment_events; n jsonb; co commerce_checkout_sessions; pay commerce_payment_attempts; sub commerce_subscriptions; ent phase_h_entitlements; res founding_slot_reservations;
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
 if coalesce((n->'safeEvidence'->>'sandbox')::boolean,true) or not(coalesce((n->'safeEvidence'->>'source_lookup_confirmed')::boolean,false) or coalesce((n->'safeEvidence'->>'status_query_confirmed')::boolean,false)) then
  update commerce_payment_events set processing_state='REVIEW_REQUIRED',review_reason='LIVE_SOURCE_VERIFICATION_REQUIRED' where id=ev.id;return jsonb_build_object('state','REVIEW_REQUIRED');
 end if;
 update commerce_payment_events set processing_state='PROCESSING' ,processing_attempts=processing_attempts+1 where id=ev.id;
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
 select * into sub from commerce_subscriptions where customer_id=co.customer_id and product_code=co.product_code and provider=p_provider and execution_account_id is not distinct from co.execution_account_id and status not in('EXPIRED','CANCELLED','REFUNDED') order by current_period_end desc nulls last limit 1 for update;
 select * into ent from phase_h_entitlements where customer_id=co.customer_id and product_code=co.product_code and execution_account_id is not distinct from co.execution_account_id order by created_at desc limit 1 for update;
 -- A refund of an older payment is historical evidence, not authority to revoke a later paid renewal.
 if event_status in('REFUNDED','PARTIALLY_REFUNDED','DISPUTED','CHARGEBACK','REVERSED') and ent.id is not null and ent.source_payment_id is distinct from pay.id then
  insert into commerce_refund_disputes(payment_id,provider,provider_reference,amount_minor,currency,case_type,state,evidence_at,entitlement_action,admin_review_required)
  values(pay.id,p_provider,p_event_id,co.amount_minor,co.currency,coalesce(case_kind,'REFUND'),event_status,event_time,'HISTORICAL_ONLY',true) on conflict(provider,provider_reference) do nothing;
  update commerce_payment_events set processing_state='PROCESSED',processed_at=now() where id=ev.id;return jsonb_build_object('state','HISTORICAL_PAYMENT_CHANGE_RECORDED','payment_id',pay.id);
 end if;
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
  if p_provider='MPESA' then select * into approved_price from commerce_product_prices where product_code=co.product_code and provider='MPESA' and currency=co.currency and version=co.price_version and amount_minor=co.amount_minor;if approved_price.product_code is null or co.product_code<>'VIP_SIGNALS' or co.currency<>'KES' or approved_price.fixed_period_days not in(7,30) or co.amount_minor<=0 or co.amount_minor%100<>0 then raise exception 'MPESA_PRODUCT_NOT_APPROVED';end if;period_end:=greatest(coalesce(sub.current_period_end,event_time),event_time)+make_interval(days=>approved_price.fixed_period_days);
  else begin period_end:=(n->>'periodEnd')::timestamptz;exception when others then period_end:=null;end;if period_end is null or period_end<=event_time then update commerce_payment_events set processing_state='REVIEW_REQUIRED',review_reason='VERIFIED_PERIOD_REQUIRED' where id=ev.id;update commerce_payment_attempts set state='REVIEW_REQUIRED' where id=pay.id;insert into commerce_manual_reviews(customer_id,checkout_session_id,payment_id,reason_code) values(co.customer_id,co.id,pay.id,'VERIFIED_PERIOD_REQUIRED');return jsonb_build_object('state','REVIEW_REQUIRED');end if;period_end:=greatest(coalesce(sub.current_period_end,event_time),period_end);end if;
  prior_state:=coalesce(sub.status,'PENDING');
  if sub.id is null then insert into commerce_subscriptions(customer_id,product_code,provider,execution_account_id,external_reference,status,current_period_start,current_period_end,amount_minor,currency,price_version,renewal_count,last_verified_payment_id,next_expected_payment,entitlement_state) values(co.customer_id,co.product_code,p_provider,co.execution_account_id,n->>'providerSubscriptionId','ACTIVE',event_time,period_end,co.amount_minor,co.currency,co.price_version,0,pay.id,period_end,'ACTIVE') returning * into sub;
  else update commerce_subscriptions set external_reference=coalesce(n->>'providerSubscriptionId',external_reference),status='ACTIVE',current_period_start=coalesce(current_period_start,event_time),current_period_end=period_end,grace_end=null,renewal_count=renewal_count+1,last_verified_payment_id=pay.id,next_expected_payment=period_end,entitlement_state='ACTIVE' where id=sub.id returning * into sub;end if;
  if co.product_code='FOUNDING_AUTO_EXECUTION' then update founding_slot_reservations set state='ACTIVE',activated_at=coalesce(activated_at,event_time),expires_at=null,execution_account_id=co.execution_account_id where id=res.id;end if;
  if ent.id is null then insert into phase_h_entitlements(customer_id,product_code,state,source,external_reference,valid_from,valid_until,account_limit,feature_permissions,source_subscription_id,source_payment_id,execution_account_id,founding_reservation_id,granted_at,grant_reason,commercial_version) values(co.customer_id,co.product_code,'ACTIVE','VERIFIED_'||p_provider,n->>'providerPaymentId',event_time,period_end,case when co.product_code='FOUNDING_AUTO_EXECUTION' then 1 else 0 end,case when co.product_code='VIP_SIGNALS' then '{"vip_signals":true}'::jsonb else '{"execution":true}'::jsonb end,sub.id,pay.id,co.execution_account_id,co.founding_reservation_id,event_time,'VERIFIED_PAYMENT','phase-i/1') returning * into ent;
  else update phase_h_entitlements set state='ACTIVE',source='VERIFIED_'||p_provider,external_reference=n->>'providerPaymentId',valid_from=coalesce(valid_from,event_time),valid_until=greatest(coalesce(valid_until,event_time),period_end),source_subscription_id=sub.id,source_payment_id=pay.id,execution_account_id=coalesce(execution_account_id,co.execution_account_id),founding_reservation_id=coalesce(founding_reservation_id,co.founding_reservation_id),granted_at=coalesce(granted_at,event_time),revoked_at=null,revoke_reason=null where id=ent.id returning * into ent;end if;
  if co.product_code='FOUNDING_AUTO_EXECUTION' then insert into execution_entitlement_bindings(customer_id,entitlement_id,execution_account_id,founding_reservation_id,state,activated_at) values(co.customer_id,ent.id,co.execution_account_id,co.founding_reservation_id,'ACTIVE',event_time) on conflict(execution_account_id) do update set state='ACTIVE',activated_at=coalesce(execution_entitlement_bindings.activated_at,event_time),revoked_at=null where execution_entitlement_bindings.customer_id=co.customer_id and execution_entitlement_bindings.entitlement_id=ent.id;update founding_slot_reservations set entitlement_id=ent.id where id=co.founding_reservation_id;end if;
  tg_action:=case when prior_state in('EXPIRED','SUSPENDED','REFUNDED','DISPUTED') then 'RESTORE' else 'ADD' end;if prior_state='ACTIVE' then tg_action:=null;end if;
  if tg_action is not null then insert into telegram_fulfillment_requests(customer_id,entitlement_id,access_type,audience,action,idempotency_key) values(co.customer_id,ent.id,co.product_code,case when co.product_code='VIP_SIGNALS' then 'VIP' else 'EXECUTION_CUSTOMER' end,tg_action,ent.id::text||':'||tg_action||':'||sub.current_period_start::text) on conflict(idempotency_key) do nothing;end if;
  update commerce_payment_attempts set access_applied_at=coalesce(access_applied_at,now()) where id=pay.id;update commerce_checkout_sessions set status='COMPLETED',completed_at=coalesce(completed_at,event_time) where id=co.id;action:='PAYMENT_ACCESS_ACTIVATED';
 elsif event_status='CANCEL_AT_PERIOD_END' then update commerce_subscriptions set status=case when coalesce((n->>'cancelAtPeriodEnd')::boolean,false) then 'CANCEL_AT_PERIOD_END' else 'ACTIVE' end,cancel_at_period_end=coalesce((n->>'cancelAtPeriodEnd')::boolean,false) where id=sub.id;action:='CANCELLATION_UPDATED';
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

