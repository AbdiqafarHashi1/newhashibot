-- Release 1 hubs: VIP Signals goals never include execution products.
create or replace function public.phase_o_growth_overview() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
with paid as(select distinct customer_id from phase_h_entitlements where product_code='VIP_SIGNALS' and state='ACTIVE' and source like 'VERIFIED\_%' escape '\' and source_payment_id is not null and revoked_at is null and valid_from<=now() and valid_until>now()),
free as(select distinct customer_id from phase_h_entitlements where product_code='FREE_SIGNALS' and state='ACTIVE' and revoked_at is null and valid_from<=now() and (valid_until is null or valid_until>now())),
confirmed as(select m.customer_id,count(distinct m.audience) channels from telegram_memberships m join paid p using(customer_id) where m.audience in('VIP_FOREX_GOLD','VIP_CRYPTO') and m.state='ACTIVE' and m.last_verified_at is not null group by m.customer_id),
activity as(select * from phase_o_attribution_events where occurred_at>=now()-interval '30 days')
select jsonb_build_object('target',1000,'free_target',1000,'vip_target',1000,'observed_at',statement_timestamp(),
'paid_customers',(select count(*) from paid),'free_customers',(select count(*) from free),
'confirmed_free_members',(select count(distinct m.customer_id) from telegram_memberships m join free f using(customer_id) where m.audience='FREE' and m.state='ACTIVE' and m.last_verified_at is not null),
'paid_without_telegram_link',(select count(*) from paid p where not exists(select 1 from telegram_links l where l.user_id=p.customer_id and l.telegram_user_id is not null)),
'confirmed_vip_members',(select count(*) from confirmed),'both_vip_channels',(select count(*) from confirmed where channels=2),
'vip_expiring_7d',(select count(distinct e.customer_id) from phase_h_entitlements e join paid p using(customer_id) where e.product_code='VIP_SIGNALS' and e.state='ACTIVE' and e.revoked_at is null and e.valid_until>now() and e.valid_until<=now()+interval '7 days'),
'pending_fulfillment',(select count(*) from telegram_fulfillment_requests where status in('PENDING','FAILED','READY_FOR_CONFIGURATION')),
'agent_queue',(select count(*) from phase_o_agent_jobs where status='QUEUED'),'awaiting_approval',(select count(*) from phase_o_agent_jobs where status='AWAITING_APPROVAL'),
'uncertain_deliveries',(select count(*) from phase_o_delivery_parts where state='UNCERTAIN'),'active_campaigns',(select count(*) from phase_o_campaigns where status='ACTIVE'),
'funnel',jsonb_build_object('landing_visits',(select count(*) from activity where event_type='LANDING_VISIT'),'signups',(select count(distinct customer_id) from activity where event_type='SIGNUP'),'checkouts',(select count(distinct customer_id) from activity where event_type='CHECKOUT_ATTEMPT'),'renewals',(select count(distinct customer_id) from activity where event_type='RENEWED'),'churned',(select count(distinct customer_id) from activity where event_type='CHURNED')));
$$;
revoke all on function public.phase_o_growth_overview() from public,anon,authenticated;
grant execute on function public.phase_o_growth_overview() to service_role;
grant select on public.phase_h_entitlements,public.telegram_links,public.telegram_memberships,public.telegram_fulfillment_requests,public.phase_o_attribution_events,public.phase_o_agent_jobs,public.phase_o_delivery_parts,public.phase_o_campaigns to service_role;

create table public.telegram_hub_audit(id uuid primary key default gen_random_uuid(),actor_id uuid not null references auth.users(id),action text not null,audience text not null,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
alter table public.telegram_hub_audit enable row level security;
revoke all on public.telegram_hub_audit from public,anon,authenticated;
grant select on public.telegram_hub_audit to authenticated;
grant select,insert on public.telegram_hub_audit to service_role;
create policy telegram_hub_admin_read on public.telegram_hub_audit for select to authenticated using(public.is_admin());

-- Service-only CAS mutations after the authenticated HTTP handler verifies administrator identity.
create function public.save_release1_telegram_channel(p_actor uuid,p_audience text,p_chat_id text,p_enabled boolean,p_expected text) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$declare previous text; verified timestamptz;begin
 if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 if p_audience not in('FREE','VIP_CRYPTO','VIP_FOREX_GOLD','ADMIN') or p_chat_id is null or not(p_chat_id~'^(-[0-9]+|@[A-Za-z0-9_]{5,32})$' or (p_audience='ADMIN' and p_chat_id~'^[0-9]+$')) then raise exception 'INVALID_CHANNEL';end if;
 perform pg_advisory_xact_lock(2961030);
 select chat_id,bot_permission_verified_at into previous,verified from telegram_audience_configuration where audience=p_audience for update;
 if previous is distinct from p_expected then raise exception 'CHANNEL_CHANGED_RELOAD_REQUIRED';end if;
 if exists(select 1 from telegram_audience_configuration where audience in('FREE','VIP_CRYPTO','VIP_FOREX_GOLD','ADMIN') and audience<>p_audience and lower(chat_id)=lower(p_chat_id)) then raise exception 'CHANNEL_AUDIENCES_MUST_BE_SEPARATE';end if;
 if p_enabled and (previous is distinct from p_chat_id or verified is null) then raise exception 'VERIFY_CHANNEL_BEFORE_ENABLING';end if;
 if previous is distinct from p_chat_id then
  update phase_o_destinations set configuration_state='UNCONFIGURED',permission_verified_at=null where audience=p_audience and external_identity_ref is null;
  update phase_o_approvals a set revoked_at=now() from phase_o_drafts d join phase_o_destinations dest on dest.id=d.destination_id where a.draft_id=d.id and dest.audience=p_audience and dest.external_identity_ref is null and a.revoked_at is null;
 end if;
 insert into telegram_audience_configuration(audience,product_code,chat_id,enabled,join_mode,bot_permission_verified_at) values(p_audience,case when p_audience='FREE' then 'FREE_SIGNALS' when p_audience like 'VIP_%' then 'VIP_SIGNALS' else null end,p_chat_id,p_enabled,'JOIN_REQUEST',case when previous=p_chat_id then verified else null end)
 on conflict(audience) do update set chat_id=excluded.chat_id,enabled=excluded.enabled,join_mode='JOIN_REQUEST',bot_permission_verified_at=excluded.bot_permission_verified_at,updated_at=now();
 insert into telegram_hub_audit(actor_id,action,audience,details) values(p_actor,'CHANNEL_SAVED',p_audience,jsonb_build_object('enabled',p_enabled));
 return true;end$$;
create function public.verify_release1_telegram_channel(p_actor uuid,p_audience text,p_expected text,p_verified text,p_at timestamptz) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 if p_audience not in('FREE','VIP_CRYPTO','VIP_FOREX_GOLD','ADMIN') or p_verified is null or not(p_verified~'^-[0-9]+$' or(p_audience='ADMIN' and p_verified~'^[0-9]+$')) or p_at is null or abs(extract(epoch from(now()-p_at)))>120 then raise exception 'INVALID_CHANNEL_VERIFICATION';end if;
 perform pg_advisory_xact_lock(2961030);
 if not exists(select 1 from telegram_audience_configuration where audience=p_audience and chat_id=p_expected) then return false;end if;
 if exists(select 1 from telegram_audience_configuration where audience in('FREE','VIP_CRYPTO','VIP_FOREX_GOLD','ADMIN') and audience<>p_audience and chat_id=p_verified) then raise exception 'CHANNEL_AUDIENCES_MUST_BE_SEPARATE';end if;
 update telegram_audience_configuration set chat_id=p_verified,enabled=true,bot_permission_verified_at=p_at,updated_at=now() where audience=p_audience and chat_id=p_expected;if not found then return false;end if;insert into telegram_hub_audit(actor_id,action,audience) values(p_actor,'CHANNEL_VERIFIED_ENABLED',p_audience);return true;end$$;
revoke all on function public.save_release1_telegram_channel(uuid,text,text,boolean,text),public.verify_release1_telegram_channel(uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.save_release1_telegram_channel(uuid,text,text,boolean,text),public.verify_release1_telegram_channel(uuid,text,text,text,timestamptz) to service_role;

grant select,insert,update on public.telegram_audience_configuration to service_role;
grant select on public.profiles to service_role;

-- Admin recovery uses the same 48-hex / SHA-256 token contract as the membership webhook.
create function public.create_release1_telegram_recovery(p_actor uuid,p_customer uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$declare raw text;begin
 if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 if not exists(select 1 from phase_h_entitlements where customer_id=p_customer and product_code in('FREE_SIGNALS','VIP_SIGNALS') and state in('ACTIVE','TRIAL','GRACE') and revoked_at is null and valid_from<=now() and (valid_until is null or valid_until>now())) then raise exception 'CURRENT_FREE_OR_VIP_ENTITLEMENT_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('telegram-recovery:'||p_customer::text,0));
 update telegram_onboarding_tokens set replaced_at=now() where user_id=p_customer and used_at is null and replaced_at is null;
 raw:=replace(gen_random_uuid()::text,'-','')||substr(replace(gen_random_uuid()::text,'-',''),1,16);
 insert into telegram_onboarding_tokens(user_id,product_slug,token_hash,expires_at,purpose) values(p_customer,'PHASE_J',encode(sha256(convert_to(raw,'UTF8')),'hex'),now()+interval '10 minutes','RELINK');
 insert into telegram_hub_audit(actor_id,action,audience,details) values(p_actor,'ONBOARDING_LINK_CREATED','ADMIN',jsonb_build_object('customer_id',p_customer));
 return jsonb_build_object('token',raw,'expires_at',now()+interval '10 minutes');end$$;
revoke all on function public.create_release1_telegram_recovery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_release1_telegram_recovery(uuid,uuid) to service_role;
grant select,insert,update on public.telegram_onboarding_tokens to service_role;

-- Routine policy waits and confirmed retryable sends must remain resumable without exhausting attempts overnight.
create or replace function public.finish_phase_o_agent_job(p_id uuid,p_lease_token uuid,p_status text,p_checkpoint jsonb default '{}',p_safe_error text default null) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$declare j phase_o_agent_jobs;policy_wait boolean;retry boolean;begin
 if p_status not in('DRAFTED','AWAITING_APPROVAL','COMPLETED','FAILED','DEAD_LETTER','UNCERTAIN') then raise exception 'INVALID_JOB_STATUS';end if;
 select * into j from phase_o_agent_jobs where id=p_id and status='CLAIMED' and lease_token=p_lease_token and lease_expires_at>now() for update;
 if not found then return false;end if;
 policy_wait:=p_status='FAILED' and p_safe_error in('DESTINATION_QUIET_HOURS','DESTINATION_RATE_LIMIT','APPROVAL_FREQUENCY_LIMIT');
 retry:=p_status='FAILED' and p_safe_error='RETRY' and j.attempt<j.max_attempts;
 update phase_o_agent_jobs set status=case when policy_wait or retry then 'QUEUED' when p_status='FAILED' and p_safe_error='RETRY' then 'DEAD_LETTER' else p_status end,
 attempt=case when policy_wait then greatest(0,attempt-1) else attempt end,checkpoint=coalesce(p_checkpoint,'{}'),safe_error=left(p_safe_error,240),
 available_at=case when policy_wait then now()+interval '15 minutes' when retry then greatest(now()+make_interval(secs=>least(900,15*j.attempt)),coalesce((select max(part.next_attempt_at) from phase_o_delivery_parts part join phase_o_drafts d on d.id=part.draft_id where d.job_id=j.id and part.state='RETRY'),now())) else available_at end,
 lease_token=null,lease_owner=null,lease_expires_at=null,updated_at=now() where id=j.id;return true;end$$;
revoke all on function public.finish_phase_o_agent_job(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_phase_o_agent_job(uuid,uuid,text,jsonb,text) to service_role;
