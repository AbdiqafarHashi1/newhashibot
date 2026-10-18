-- Phase H completion: forward-only catalog correction and customer/account bindings.
alter table public.founding_slot_reservations drop constraint if exists founding_slot_reservations_slot_number_check;
alter table public.founding_slot_reservations add constraint founding_slot_reservations_slot_number_check check(slot_number between 1 and 20);
alter table public.founding_slot_reservations add column if not exists entitlement_id uuid references public.phase_h_entitlements(id), add column if not exists execution_account_id uuid references public.connected_execution_accounts(id);
create unique index if not exists founding_reservation_one_entitlement on public.founding_slot_reservations(entitlement_id) where entitlement_id is not null and state in('RESERVED','ACTIVE');
create unique index if not exists founding_reservation_one_account on public.founding_slot_reservations(execution_account_id) where execution_account_id is not null and state in('RESERVED','ACTIVE');

insert into public.phase_h_products(code,name,price_cents,currency,billing_interval,capacity,terms_version,features)
values('FOUNDING_AUTO_EXECUTION','HashiBot Auto Execution — Founding 20',10000,'USD','month',20,'2026.09',
 jsonb_build_object('billing_unit','connected_execution_account','providers',jsonb_build_array('MT5','BINANCE','BYBIT'),'modes',jsonb_build_array('PERSONAL','PROP'),'checkout_state','CHECKOUT_NOT_CONFIGURED'))
on conflict(code) do update set name=excluded.name,price_cents=excluded.price_cents,capacity=20,features=excluded.features,checkout_state='CHECKOUT_NOT_CONFIGURED';
update public.phase_h_products set active=false,checkout_state='CHECKOUT_NOT_CONFIGURED',features=features||jsonb_build_object('replaced_by','FOUNDING_AUTO_EXECUTION') where code='FOUNDING_PROP_EXECUTION';

create table if not exists public.execution_entitlement_bindings(
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id), entitlement_id uuid not null references public.phase_h_entitlements(id),
 execution_account_id uuid not null references public.connected_execution_accounts(id), founding_reservation_id uuid references public.founding_slot_reservations(id),
 state text not null default 'PENDING' check(state in('PENDING','ACTIVE','REVOKED','EXPIRED')), bound_at timestamptz not null default now(), activated_at timestamptz, revoked_at timestamptz,
 unique(entitlement_id), unique(execution_account_id), unique(founding_reservation_id)
);
create or replace function public.validate_execution_entitlement_binding() returns trigger language plpgsql set search_path=public as $$
declare eo uuid; ao uuid; ro uuid; es text; src text; begin
 select customer_id,state,source into eo,es,src from phase_h_entitlements where id=new.entitlement_id for update;
 select customer_id into ao from connected_execution_accounts where id=new.execution_account_id;
 if eo is null or ao is null or eo<>new.customer_id or ao<>new.customer_id then raise exception 'ENTITLEMENT_ACCOUNT_OWNERSHIP_MISMATCH'; end if;
 if new.state='ACTIVE' and (es not in('ACTIVE','TRIAL','GRACE') or src='NOT_CONFIGURED') then raise exception 'VERIFIED_ENTITLEMENT_REQUIRED'; end if;
 if new.founding_reservation_id is not null then select customer_id into ro from founding_slot_reservations where id=new.founding_reservation_id; if ro<>new.customer_id then raise exception 'SLOT_OWNERSHIP_MISMATCH'; end if; end if;
 return new; end $$;
create trigger validate_execution_entitlement_binding_trigger before insert or update on public.execution_entitlement_bindings for each row execute function public.validate_execution_entitlement_binding();

create table if not exists public.assisted_setup_requests(
 id uuid primary key default gen_random_uuid(),customer_id uuid not null references auth.users(id),execution_account_id uuid references public.connected_execution_accounts(id),provider text check(provider in('MT5','BINANCE','BYBIT')),
 setup_stage text not null,issue_category text not null check(issue_category in('INSTALLATION','VPS','PAIRING','PROVIDER_FORM','ADDITIONAL_ACCOUNT','TROUBLESHOOTING')),
 customer_message text not null check(length(customer_message)<=2000),preferred_contact_time text,support_state text not null default 'OPEN' check(support_state in('OPEN','ASSIGNED','WAITING_CUSTOMER','RESOLVED','CLOSED')),
 assigned_admin uuid references auth.users(id),authorized_support_access boolean not null default false,created_at timestamptz not null default now(),resolved_at timestamptz
);
create table if not exists public.additional_account_requests(id uuid primary key default gen_random_uuid(),customer_id uuid not null references auth.users(id),provider text not null check(provider in('MT5','BINANCE','BYBIT')),state text not null default 'AWAITING_ENTITLEMENT' check(state in('AWAITING_ENTITLEMENT','AWAITING_SLOT','READY_FOR_SETUP','CANCELLED')),created_at timestamptz not null default now());
create table if not exists public.campaign_attributions(id uuid primary key default gen_random_uuid(),campaign_id text,source text,medium text,content text,affiliate_code text,landing_route text not null,clicked_at timestamptz not null default now(),anonymous_reference text,customer_id uuid references auth.users(id),selected_package text,conversion_stage text not null default 'LANDING',created_at timestamptz not null default now());
create table if not exists public.phase_h_configuration(key text primary key,value jsonb not null,public_read boolean not null default false,updated_at timestamptz not null default now());
insert into public.phase_h_configuration(key,value,public_read) values
 ('canonical_share_routes','["/free","/vip","/pricing","/execution","/execution/mt5","/execution/crypto","/execution/prop"]',true),
 ('public_sales_contact','{"state":"NOT_CONFIGURED"}',true),('assisted_setup_contact','{"state":"NOT_CONFIGURED"}',false),
 ('vps_options','{"state":"READY_FOR_CONFIGURATION","minimum":{"os":"Supported Windows","memory_gb":4,"stable_internet":true}}',true)
on conflict(key) do update set value=excluded.value,public_read=excluded.public_read,updated_at=now();

alter table public.execution_entitlement_bindings enable row level security; alter table public.assisted_setup_requests enable row level security; alter table public.additional_account_requests enable row level security; alter table public.campaign_attributions enable row level security; alter table public.phase_h_configuration enable row level security;
create policy execution_entitlement_owner_read on public.execution_entitlement_bindings for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy assisted_setup_owner_read on public.assisted_setup_requests for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy additional_account_owner_read on public.additional_account_requests for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy campaign_owner_read on public.campaign_attributions for select to authenticated using(customer_id=auth.uid() or public.is_admin());
create policy phase_h_public_configuration_read on public.phase_h_configuration for select to anon,authenticated using(public_read or public.is_admin());
revoke all on public.execution_entitlement_bindings,public.assisted_setup_requests,public.additional_account_requests,public.campaign_attributions from anon,authenticated;
grant select on public.execution_entitlement_bindings,public.assisted_setup_requests,public.additional_account_requests,public.campaign_attributions to authenticated; grant select on public.phase_h_configuration to anon,authenticated;

create or replace view public.execution_accounts_safe with(security_invoker=true) as
select id,customer_id,display_label,account_id,provider_account_identity,adapter_identity,provider,environment,ownership_classification,enabled,is_operational,monitor_enabled,execution_enabled,risk_profile_id,provider_health,last_synchronized_at,credentials_verified_at,last_error,account_mode,immutable_identity,policy_profile_id,policy_version,policy_preset,policy_overrides,runtime_control,created_at,updated_at,phase_h_asset_class,phase_h_readiness,phase_h_readiness_reasons,phase_h_certification_status
from public.connected_execution_accounts;
grant select on public.execution_accounts_safe to authenticated;

create or replace function public.release_expired_founding_reservations() returns integer language plpgsql security definer set search_path=public as $$declare n integer; begin update founding_slot_reservations set state='EXPIRED' where state='RESERVED' and expires_at<now();get diagnostics n=row_count;return n;end$$;
revoke all on function public.release_expired_founding_reservations() from public; grant execute on function public.release_expired_founding_reservations() to service_role;
