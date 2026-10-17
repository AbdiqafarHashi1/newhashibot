-- Only Edge service authority can access decrypted provider settings. Browsers receive redacted status.
create table public.commerce_provider_configuration(
 provider text primary key check(provider in('WHOP','MPESA')),secret_id uuid not null,
 revision integer not null default 1,verified_products text[] not null default '{}',verified_revision integer,verified_at timestamptz,enabled boolean not null default false,
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
alter table public.commerce_provider_configuration enable row level security;
revoke all on public.commerce_provider_configuration from public,anon,authenticated;
grant all on public.commerce_provider_configuration to service_role;
create function public.load_commerce_provider_configuration(p_provider text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c commerce_provider_configuration;value jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into c from commerce_provider_configuration where provider=p_provider;if not found then return null;end if;
 select decrypted_secret::jsonb into value from vault.decrypted_secrets where id=c.secret_id;
 if value is null then raise exception 'PROVIDER_SECRET_UNAVAILABLE';end if;return value;
end$$;
create function public.save_commerce_provider_configuration(p_actor uuid,p_provider text,p_values jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c commerce_provider_configuration;merged jsonb:='{}';entry record;allowed text[];secret uuid;begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_SERVICE_REQUIRED';end if;
 if p_provider not in('WHOP','MPESA') or jsonb_typeof(p_values)<>'object' or octet_length(p_values::text)>20000 then raise exception 'PROVIDER_CONFIGURATION_INVALID';end if;
 allowed:=case when p_provider='WHOP' then array['WHOP_API_KEY','WHOP_COMPANY_ID','WHOP_WEBHOOK_SECRET','WHOP_VIP_PLAN_ID','WHOP_EXECUTION_PLAN_ID','WHOP_ENVIRONMENT'] else array['DARAJA_CONSUMER_KEY','DARAJA_CONSUMER_SECRET','DARAJA_SHORT_CODE','DARAJA_PASSKEY','DARAJA_CALLBACK_URL','DARAJA_ENVIRONMENT','DARAJA_TRANSACTION_TYPE','DARAJA_PARTY_B'] end;
 perform pg_advisory_xact_lock(hashtext('COMMERCE_CONFIG:'||p_provider));
 select * into c from commerce_provider_configuration where provider=p_provider for update;
 if found then merged:=load_commerce_provider_configuration(p_provider);end if;
 for entry in select * from jsonb_each(p_values) loop
  if not(entry.key=any(allowed)) or jsonb_typeof(entry.value)<>'string' or length(entry.value#>>'{}')>4096 then raise exception 'PROVIDER_FIELD_NOT_ALLOWED';end if;
  if nullif(trim(entry.value#>>'{}'),'') is not null then merged:=merged||jsonb_build_object(entry.key,trim(entry.value#>>'{}'));end if;
 end loop;
 if coalesce(merged->>case when p_provider='WHOP' then 'WHOP_ENVIRONMENT' else 'DARAJA_ENVIRONMENT' end,'sandbox') not in('sandbox','production') then raise exception 'PROVIDER_ENVIRONMENT_INVALID';end if;
 if c.provider is null then secret:=vault.create_secret(merged::text,'hashibot_commerce_'||lower(p_provider),'HashiBot server-only commerce configuration');
  insert into commerce_provider_configuration(provider,secret_id,updated_by) values(p_provider,secret,p_actor) returning * into c;
 else perform vault.update_secret(c.secret_id,merged::text);update commerce_provider_configuration set revision=revision+1,verified_revision=null,verified_products='{}',verified_at=null,enabled=false,updated_by=p_actor,updated_at=now() where provider=p_provider returning * into c;end if;
 update commerce_product_prices set configured=false where provider=p_provider;
 return jsonb_build_object('provider',c.provider,'revision',c.revision,'enabled',false);
end$$;
create function public.control_commerce_provider_configuration(p_actor uuid,p_provider text,p_revision integer,p_action text,p_products text[] default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare c commerce_provider_configuration;begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_SERVICE_REQUIRED';end if;
 select * into c from commerce_provider_configuration where provider=p_provider for update;
 if not found or c.revision<>p_revision then raise exception 'PROVIDER_CONFIGURATION_CHANGED';end if;
 if p_action='VERIFIED' then
  if cardinality(p_products)=0 or not(p_products<@array['VIP_SIGNALS','FOUNDING_AUTO_EXECUTION']) then raise exception 'VERIFIED_PRODUCTS_REQUIRED';end if;
  update commerce_provider_configuration set verified_revision=revision,verified_products=p_products,verified_at=now() where provider=p_provider;
 elsif p_action='ENABLE' then
  if c.verified_revision is distinct from c.revision then raise exception 'CURRENT_PROVIDER_VERIFICATION_REQUIRED';end if;
  update commerce_provider_configuration set enabled=true where provider=p_provider;
  update commerce_product_prices set configured=(active and product_code=any(c.verified_products)) where provider=p_provider;
 elsif p_action='DISABLE' then update commerce_provider_configuration set enabled=false where provider=p_provider;update commerce_product_prices set configured=false where provider=p_provider;
 else raise exception 'PROVIDER_ACTION_NOT_ALLOWED';end if;
 return jsonb_build_object('provider',p_provider,'action',p_action,'revision',c.revision);
end$$;
revoke all on function public.load_commerce_provider_configuration(text),public.save_commerce_provider_configuration(uuid,text,jsonb),public.control_commerce_provider_configuration(uuid,text,integer,text,text[]) from public,anon,authenticated;
grant execute on function public.load_commerce_provider_configuration(text),public.save_commerce_provider_configuration(uuid,text,jsonb),public.control_commerce_provider_configuration(uuid,text,integer,text,text[]) to service_role;

create table public.commerce_reconciliation_cursors(scope text primary key,cursor jsonb not null default '{}',updated_at timestamptz not null default now());
alter table public.commerce_reconciliation_cursors enable row level security;
revoke all on public.commerce_reconciliation_cursors from public,anon,authenticated;
grant select,insert,update on public.commerce_reconciliation_cursors to service_role;

alter table public.commerce_payment_events add column if not exists next_reconcile_at timestamptz not null default now();
create index commerce_payment_event_recovery_due on public.commerce_payment_events(processing_state,next_reconcile_at);

alter table public.commerce_payment_attempts add column if not exists next_status_query_at timestamptz not null default now();
create index commerce_mpesa_status_query_due on public.commerce_payment_attempts(provider,state,next_status_query_at) where state='PENDING';

-- A private callback token is saved before STK submission. It recovers lost acknowledgements without repeating a charge.
create unique index commerce_mpesa_private_callback on public.commerce_payment_attempts((safe_evidence->>'callback_token_hash')) where provider='MPESA' and safe_evidence->>'callback_token_hash' is not null;
create function public.bind_mpesa_submission_callback(p_checkout uuid,p_token_hash text,p_request text,p_merchant text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c record;a record;begin
 if nullif(btrim(p_request),'') is null or nullif(btrim(p_merchant),'') is null then raise exception 'NATIVE_REQUEST_IDENTIFIERS_REQUIRED';end if;
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if p_token_hash is null or p_request is null or p_merchant is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_request !~ '^[A-Za-z0-9_.-]{1,150}$' or p_merchant !~ '^[A-Za-z0-9_.-]{1,150}$' then raise exception 'CALLBACK_BINDING_INVALID';end if;
 select * into c from commerce_checkout_sessions where id=p_checkout and provider='MPESA' for update;if not found then raise exception 'SERVER_CHECKOUT_REQUIRED';end if;
 select * into a from commerce_payment_attempts where checkout_session_id=c.id and customer_id=c.customer_id and provider='MPESA' and safe_evidence->>'callback_token_hash'=p_token_hash for update;
 if not found or (a.provider_state not in('SUBMISSION_IN_PROGRESS','SUBMISSION_UNCERTAIN','STK_SENT','CALLBACK_RECOVERED') and a.external_reference is distinct from p_request) then raise exception 'PRIVATE_CALLBACK_BINDING_REQUIRED';end if;
 if (a.external_reference is not null and a.external_reference<>p_request) or(c.external_reference is not null and c.external_reference<>p_request) or(a.safe_evidence->>'merchant_request_id' is not null and a.safe_evidence->>'merchant_request_id'<>p_merchant) then raise exception 'CALLBACK_REQUEST_CONFLICT';end if;
 update commerce_payment_attempts set external_reference=p_request,state=case when state in('CREATED','PENDING','REVIEW_REQUIRED') then 'PENDING' else state end,provider_state=case when access_applied_at is null then 'CALLBACK_RECOVERED' else provider_state end,safe_evidence=safe_evidence||jsonb_build_object('merchant_request_id',p_merchant,'checkout_request_id',p_request),next_status_query_at=now() where id=a.id;
 update commerce_checkout_sessions set external_reference=p_request where id=c.id;
 return jsonb_build_object('state','BOUND_SOURCE_QUERY_REQUIRED','checkout_id',c.id);
end$$;
revoke all on function public.bind_mpesa_submission_callback(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.bind_mpesa_submission_callback(uuid,text,text,text) to service_role;

-- An acknowledgement arriving after a callback must never downgrade a completed payment.
create function public.acknowledge_mpesa_submission(p_checkout uuid,p_attempt uuid,p_request text,p_merchant text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c record;a record;begin
 if nullif(btrim(p_request),'') is null or nullif(btrim(p_merchant),'') is null then raise exception 'NATIVE_REQUEST_IDENTIFIERS_REQUIRED';end if;
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into c from commerce_checkout_sessions where id=p_checkout and provider='MPESA' for update;if not found then raise exception 'SERVER_CHECKOUT_REQUIRED';end if;
 select * into a from commerce_payment_attempts where id=p_attempt and checkout_session_id=c.id and customer_id=c.customer_id and provider='MPESA' for update;if not found then raise exception 'SERVER_ATTEMPT_REQUIRED';end if;
 if (a.external_reference is not null and a.external_reference<>p_request) or(c.external_reference is not null and c.external_reference<>p_request) or(a.safe_evidence->>'merchant_request_id' is not null and a.safe_evidence->>'merchant_request_id'<>p_merchant) then raise exception 'ACKNOWLEDGEMENT_REQUEST_CONFLICT';end if;
 if c.status='COMPLETED' or a.access_applied_at is not null or a.state in('SUCCEEDED','REFUNDED','PARTIALLY_REFUNDED','DISPUTED','CHARGEBACK','REVERSED','FAILED','CANCELLED','EXPIRED') then return jsonb_build_object('state','PAYMENT_ALREADY_RECORDED');end if;
 update commerce_payment_attempts set state='PENDING',provider_state='STK_SENT',external_reference=p_request,safe_evidence=safe_evidence||jsonb_build_object('merchant_request_id',p_merchant,'checkout_request_id',p_request),next_status_query_at=now() where id=a.id;
 update commerce_checkout_sessions set external_reference=p_request,status=case when status in('PROVIDER_PENDING','REVIEW_REQUIRED') then 'ACTION_REQUIRED' else status end where id=c.id;
 return jsonb_build_object('state','ACTION_REQUIRED');
end$$;
revoke all on function public.acknowledge_mpesa_submission(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.acknowledge_mpesa_submission(uuid,uuid,text,text) to service_role;

-- Install the original backend's bounded payment-recovery pass when the owner enables checkout.
-- Tokens are read at execution time, never embedded in cron.job.command or sent to the browser.
create function public.configure_commerce_recovery_clock(p_project_url text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare job_id bigint;statement text;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if p_project_url is null or p_project_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/?$' then raise exception 'PROJECT_BACKEND_ORIGIN_REQUIRED';end if;
 if to_regnamespace('cron') is null or to_regnamespace('net') is null then raise exception 'COMMERCE_RECOVERY_EXTENSIONS_REQUIRED';end if;
 if not exists(select 1 from scanner_config where id=1 and nullif(cron_pg_token,'') is not null) then raise exception 'COMMERCE_RECOVERY_TOKEN_REQUIRED';end if;
 statement:=format($job$select net.http_post(url := %L,headers := jsonb_build_object('Content-Type','application/json','x-hashibot-cron-token',(select cron_pg_token from public.scanner_config where id=1)),body := '{}'::jsonb,timeout_milliseconds := 90000);$job$,rtrim(p_project_url,'/')||'/functions/v1/commerce-reconcile');
 select cron.schedule('hashibot_commerce_recovery_5m','*/5 * * * *',statement) into job_id;
 return jsonb_build_object('state','SCHEDULED','interval_minutes',5,'job_id',job_id);
end$$;
revoke all on function public.configure_commerce_recovery_clock(text) from public,anon,authenticated;
grant execute on function public.configure_commerce_recovery_clock(text) to service_role;
