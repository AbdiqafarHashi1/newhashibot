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
