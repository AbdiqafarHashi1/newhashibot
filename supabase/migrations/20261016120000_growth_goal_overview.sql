-- Read-only aggregate: paid customers are distinct people with a current,
-- verified payment entitlement. Channel joins and campaign events are separate.
create or replace function public.phase_o_growth_overview()
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 with paid as (
  select distinct customer_id from phase_h_entitlements
  where product_code in ('VIP_SIGNALS','FOUNDING_AUTO_EXECUTION') and state='ACTIVE'
   and source like 'VERIFIED\_%' escape '\' and source_payment_id is not null
   and revoked_at is null and valid_from<=now() and valid_until>now()
 ), stats as (
  select jsonb_build_object(
   'target',1000,'observed_at',now(),'paid_customers',(select count(*) from paid),
   'free_customers',(select count(distinct customer_id) from phase_h_entitlements where product_code='FREE_SIGNALS' and state='ACTIVE' and revoked_at is null),
   'paid_without_telegram_link',(select count(*) from paid p where not exists(select 1 from telegram_links l where l.user_id=p.customer_id and l.telegram_user_id is not null)),
   'confirmed_vip_members',(select count(distinct m.customer_id) from telegram_memberships m join paid p using(customer_id) where m.audience in('VIP_FOREX_GOLD','VIP_CRYPTO') and m.state='ACTIVE' and m.last_verified_at is not null),
   'pending_fulfillment',(select count(*) from telegram_fulfillment_requests where status in('PENDING','FAILED','READY_FOR_CONFIGURATION')),
   'agent_queue',(select count(*) from phase_o_agent_jobs where status='QUEUED'),
   'awaiting_approval',(select count(*) from phase_o_agent_jobs where status='AWAITING_APPROVAL'),
   'uncertain_deliveries',(select count(*) from phase_o_delivery_parts where state='UNCERTAIN'),
   'active_campaigns',(select count(*) from phase_o_campaigns where status='ACTIVE')
  ) value
 ) select value into result from stats;
 return result;
end $$;
revoke all on function public.phase_o_growth_overview() from public,anon,authenticated;
grant execute on function public.phase_o_growth_overview() to service_role;

-- Approval and delivery enqueue must commit together. Repeated approval requests
-- return the same active approval without resetting an in-flight delivery.
create or replace function public.approve_phase_o_draft_and_queue(
 p_draft_id uuid,p_actor uuid,p_binding_hash text,p_scope text,p_max_uses integer,p_interval integer,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare d phase_o_drafts; j phase_o_agent_jobs; a phase_o_approvals;
begin
 if current_user not in('postgres','service_role','supabase_admin') then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into d from phase_o_drafts where id=p_draft_id;
 if not found then raise exception 'DRAFT_NOT_FOUND';end if;
 select * into j from phase_o_agent_jobs where id=d.job_id for update;
 if not found then raise exception 'JOB_NOT_FOUND';end if;
 if not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED';end if;
 if d.destination_id is null then raise exception 'DELIVERY_DESTINATION_REQUIRED';end if;
 if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '30 days' or p_scope not in('ONE_TIME','STANDING_TEMPLATE') or p_max_uses not between 1 and 30 or p_interval not between 0 and 10080 or length(p_binding_hash)<>64 then raise exception 'INVALID_APPROVAL';end if;
 if exists(select 1 from phase_o_drafts where job_id=d.job_id and version>d.version) then raise exception 'DRAFT_SUPERSEDED';end if;
 select * into a from phase_o_approvals where draft_id=d.id and binding_hash=p_binding_hash and revoked_at is null and expires_at>now() order by approved_at desc limit 1;
 if found and j.status in('QUEUED','CLAIMED','DELIVERING','COMPLETED','UNCERTAIN') then return jsonb_build_object('state','APPROVED','id',a.id,'idempotent',true);end if;
 if j.status<>'AWAITING_APPROVAL' then raise exception 'JOB_STATE_CHANGED_RELOAD_REQUIRED';end if;
 insert into phase_o_approvals(draft_id,draft_version,binding_hash,scope,max_uses,min_interval_minutes,expires_at,approved_by)
 values(d.id,d.version,p_binding_hash,p_scope,case when p_scope='ONE_TIME' then 1 else p_max_uses end,p_interval,p_expires_at,p_actor) returning * into a;
 update phase_o_agent_jobs set status='QUEUED',checkpoint=jsonb_build_object('stage','DELIVERY','draft_id',d.id,'delivery_key',gen_random_uuid()),available_at=now(),updated_at=now() where id=j.id;
 return jsonb_build_object('state','APPROVED','id',a.id,'idempotent',false);
end $$;
revoke all on function public.approve_phase_o_draft_and_queue(uuid,uuid,text,text,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.approve_phase_o_draft_and_queue(uuid,uuid,text,text,integer,integer,timestamptz) to service_role;
