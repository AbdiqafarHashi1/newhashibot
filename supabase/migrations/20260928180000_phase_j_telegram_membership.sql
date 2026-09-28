-- Phase J: Telegram identity and membership are projections of Phase-I entitlement truth.
alter table public.telegram_fulfillment_requests
 add column if not exists available_at timestamptz not null default now(),
 add column if not exists claimed_at timestamptz,
 add column if not exists claim_token uuid,
 add column if not exists last_attempt_at timestamptz,
 add column if not exists completed_at timestamptz,
 add column if not exists provider_classification text,
 add column if not exists evidence jsonb not null default '{}',
 add column if not exists entitlement_version timestamptz,
 add column if not exists max_attempts integer not null default 6;
alter table public.telegram_fulfillment_requests drop constraint if exists telegram_fulfillment_requests_status_check;
alter table public.telegram_fulfillment_requests add constraint telegram_fulfillment_requests_status_check check(status in('PENDING','CLAIMED','ACTION_REQUIRED','COMPLETED','FAILED','DEAD_LETTER','SUPERSEDED','READY_FOR_CONFIGURATION'));
alter table public.telegram_fulfillment_requests add constraint telegram_fulfillment_safe_error_length check(length(safe_error)<=240);
create index if not exists telegram_fulfillment_claim_idx on public.telegram_fulfillment_requests(status,available_at,created_at) where status in('PENDING','CLAIMED','FAILED','READY_FOR_CONFIGURATION');

create table public.telegram_audience_configuration(
 audience text primary key check(audience in('FREE','VIP','EXECUTION','ADMIN','OWNER')),
 product_code text unique references public.phase_h_products(code), chat_id text, audience_kind text not null default 'PRIVATE_CHANNEL' check(audience_kind in('PRIVATE_CHANNEL','PRIVATE_SUPERGROUP')),
 enabled boolean not null default false, bot_permission_verified_at timestamptz, join_mode text not null default 'ONE_TIME_INVITE' check(join_mode in('ONE_TIME_INVITE','JOIN_REQUEST')),
 updated_at timestamptz not null default now()
);
insert into public.telegram_audience_configuration(audience,product_code) values ('FREE','FREE_SIGNALS'),('VIP','VIP_SIGNALS'),('EXECUTION','FOUNDING_AUTO_EXECUTION'),('ADMIN',null),('OWNER',null) on conflict do nothing;
alter table public.telegram_audience_configuration enable row level security;
revoke all on public.telegram_audience_configuration from anon,authenticated;

create table public.telegram_memberships(
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id), telegram_link_id uuid not null references public.telegram_links(id), audience text not null references public.telegram_audience_configuration(audience),
 state text not null check(state in('PENDING','ACTION_REQUIRED','ACTIVE','SUSPENDED','REMOVED','DRIFTED','READY_FOR_CONFIGURATION','FAILED')),
 telegram_status text, invite_expires_at timestamptz, last_verified_at timestamptz, last_provider_classification text, safe_error text check(length(safe_error)<=240), updated_at timestamptz not null default now(), unique(customer_id,audience)
);
alter table public.telegram_memberships enable row level security;
create policy telegram_membership_owner_read on public.telegram_memberships for select to authenticated using(customer_id=auth.uid() or public.is_admin());
revoke all on public.telegram_memberships from anon,authenticated; grant select on public.telegram_memberships to authenticated;

alter table public.telegram_onboarding_tokens add column if not exists purpose text not null default 'LINK', add column if not exists replaced_at timestamptz;
with ranked as (select id,row_number() over(partition by user_id order by created_at desc) n from public.telegram_onboarding_tokens where used_at is null and replaced_at is null) update public.telegram_onboarding_tokens t set replaced_at=now() from ranked r where t.id=r.id and r.n>1;
create unique index if not exists telegram_one_live_link_token on public.telegram_onboarding_tokens(user_id) where used_at is null and replaced_at is null;
revoke insert,update,delete on public.telegram_links from authenticated,anon;

create or replace function public.create_telegram_link_token(p_relink boolean default false) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare raw text; linked bigint; begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 select telegram_user_id into linked from telegram_links where user_id=auth.uid() and telegram_user_id is not null order by updated_at desc limit 1;
 if linked is not null and not p_relink then return jsonb_build_object('state','LINKED'); end if;
 update telegram_onboarding_tokens set replaced_at=now() where user_id=auth.uid() and used_at is null and replaced_at is null;
 raw:=encode(gen_random_bytes(24),'hex');
 insert into telegram_onboarding_tokens(user_id,product_slug,token_hash,expires_at,purpose) values(auth.uid(),'PHASE_J',encode(digest(raw,'sha256'),'hex'),now()+interval '10 minutes',case when p_relink then 'RELINK' else 'LINK' end);
 return jsonb_build_object('state','AWAITING_BOT_START','token',raw,'expires_at',now()+interval '10 minutes');
end $$;
revoke all on function public.create_telegram_link_token(boolean) from public; grant execute on function public.create_telegram_link_token(boolean) to authenticated;

create or replace function public.consume_telegram_link_token(p_token_hash text,p_telegram_user_id bigint,p_username text,p_display_name text) returns jsonb language plpgsql security definer set search_path=public as $$
declare t telegram_onboarding_tokens; lid uuid; begin
 if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into t from telegram_onboarding_tokens where token_hash=p_token_hash for update;
 if t.id is null or t.used_at is not null or t.replaced_at is not null then raise exception 'TOKEN_INVALID_OR_REPLAYED'; end if;
 if t.expires_at<=now() then raise exception 'TOKEN_EXPIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('telegram:'||p_telegram_user_id::text,0));
 if exists(select 1 from telegram_links where telegram_user_id=p_telegram_user_id and user_id<>t.user_id) then raise exception 'TELEGRAM_IDENTITY_ALREADY_BOUND'; end if;
 select id into lid from telegram_links where user_id=t.user_id order by updated_at desc limit 1 for update;
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

create or replace function public.claim_telegram_fulfillment(p_limit integer default 10) returns setof public.telegram_fulfillment_requests language plpgsql security definer set search_path=public as $$
begin
 if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 return query with picked as (select id from telegram_fulfillment_requests where (status in('PENDING','FAILED','READY_FOR_CONFIGURATION') and available_at<=now()) or (status='CLAIMED' and claimed_at<now()-interval '5 minutes') order by created_at for update skip locked limit least(greatest(p_limit,1),50))
 update telegram_fulfillment_requests r set status='CLAIMED',claim_token=gen_random_uuid(),claimed_at=now(),last_attempt_at=now(),attempt_count=attempt_count+1 from picked where r.id=picked.id returning r.*;
end $$;
revoke all on function public.claim_telegram_fulfillment(integer) from public; grant execute on function public.claim_telegram_fulfillment(integer) to service_role;

create or replace view public.telegram_operations_safe with(security_invoker=true) as
select (select count(*) from telegram_fulfillment_requests where status='PENDING') queue_depth,(select count(*) from telegram_fulfillment_requests where status='DEAD_LETTER') dead_letters,(select count(*) from telegram_fulfillment_requests where status in('FAILED','READY_FOR_CONFIGURATION')) failures,(select count(*) from telegram_memberships where state='DRIFTED') membership_drift,(select count(distinct e.customer_id) from phase_h_entitlements e where e.state in('ACTIVE','TRIAL','GRACE') and not exists(select 1 from telegram_links l where l.user_id=e.customer_id and l.telegram_user_id is not null)) unlinked_customers,(select count(*) from telegram_audience_configuration where not enabled or chat_id is null or bot_permission_verified_at is null) configuration_issues;
revoke all on public.telegram_operations_safe from anon,authenticated;
create or replace function public.telegram_operations_status() returns jsonb language sql stable security definer set search_path=public as $$
 select case when public.is_admin() then (select to_jsonb(s) from public.telegram_operations_safe s) else jsonb_build_object('error','ADMIN_REQUIRED') end
$$;
revoke all on function public.telegram_operations_status() from public; grant execute on function public.telegram_operations_status() to authenticated;
