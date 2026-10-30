-- Explicit owner-granted time-limited access; never fabricate a provider payment.
create table public.release1_manual_vip_grants(
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id),
 entitlement_id uuid not null unique references public.phase_h_entitlements(id), actor_id uuid not null references auth.users(id),
 reason text not null check(length(reason) between 3 and 300), granted_at timestamptz not null default now(),
 valid_until timestamptz not null, revoked_at timestamptz, check(valid_until>granted_at)
);
alter table public.release1_manual_vip_grants enable row level security;
create policy manual_vip_admin_read on public.release1_manual_vip_grants for select to authenticated using(public.is_admin());
revoke all on public.release1_manual_vip_grants from anon,authenticated;
grant select on public.release1_manual_vip_grants to authenticated;
grant select,insert,update on public.release1_manual_vip_grants to service_role;

create function public.grant_release1_manual_vip(p_actor uuid,p_customer uuid,p_reason text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare e phase_h_entitlements;g release1_manual_vip_grants;begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 if length(trim(coalesce(p_reason,''))) not between 3 and 300 or not exists(select 1 from profiles where id=p_customer) then raise exception 'CUSTOMER_AND_REASON_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('manual-vip:'||p_customer::text,0));
 select * into e from phase_h_entitlements where customer_id=p_customer and product_code='VIP_SIGNALS' and state in('ACTIVE','GRACE') and revoked_at is null and valid_from<=now() and valid_until>now()
 and public.has_product_entitlement(p_customer,'crypto_signal_room',now()) order by valid_until desc limit 1;
 if e.id is not null then return jsonb_build_object('state','EXISTING_ACCESS','entitlement_id',e.id,'valid_until',e.valid_until);end if;
 insert into phase_h_entitlements(customer_id,product_code,state,source,valid_from,valid_until,account_limit,feature_permissions,granted_at,grant_reason)
 values(p_customer,'VIP_SIGNALS','ACTIVE','OWNER_MANUAL_30D',now(),now()+interval '30 days',0,'{"vip_signals":true}',now(),trim(p_reason)) returning * into e;
 insert into release1_manual_vip_grants(customer_id,entitlement_id,actor_id,reason,valid_until) values(p_customer,e.id,p_actor,trim(p_reason),e.valid_until) returning * into g;
 insert into telegram_fulfillment_requests(customer_id,entitlement_id,access_type,audience,action,idempotency_key,entitlement_version)
 select p_customer,e.id,'VIP_SIGNALS',a,'ADD','manual-vip:'||g.id||':'||a,e.updated_at from unnest(array['VIP_CRYPTO','VIP_FOREX_GOLD']) a on conflict(idempotency_key) do nothing;
 insert into commerce_audit_events(actor_id,customer_id,event_type,safe_metadata) values(p_actor,p_customer,'OWNER_MANUAL_VIP_GRANTED',jsonb_build_object('grant_id',g.id,'entitlement_id',e.id,'valid_until',e.valid_until,'reason',trim(p_reason),'verified_payment',false));
 return jsonb_build_object('state','GRANTED','entitlement_id',e.id,'grant_id',g.id,'valid_until',e.valid_until);
end$$;
revoke all on function public.grant_release1_manual_vip(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.grant_release1_manual_vip(uuid,uuid,text) to service_role;

-- Keep the existing provider authority and add only audited, live owner grants.
create or replace function public.has_product_entitlement(p_user_id uuid,p_product_slug text,p_at timestamptz default now())
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$begin
 if not(coalesce(auth.uid()=p_user_id,false) or auth.role()='service_role' or public.is_admin()) then return false;end if;
 if p_product_slug='crypto_signal_room' then
  return exists(select 1 from phase_h_entitlements e left join commerce_payment_attempts p on p.id=e.source_payment_id and p.customer_id=e.customer_id
   where e.customer_id=p_user_id and e.product_code='VIP_SIGNALS' and e.state in('ACTIVE','GRACE') and e.revoked_at is null and e.valid_from<=p_at and e.valid_until>p_at and (
    (p.state='SUCCEEDED' and coalesce((p.safe_evidence->>'sandbox')::boolean,true)=false) or
    (e.source='OWNER_MANUAL_30D' and exists(select 1 from release1_manual_vip_grants g where g.entitlement_id=e.id and g.customer_id=e.customer_id and g.revoked_at is null and g.granted_at<=p_at and g.valid_until>p_at))));
 end if;
 return exists(select 1 from customer_subscriptions where user_id=p_user_id and product_slug=p_product_slug and access_status='active' and payment_status='paid' and revoked_at is null and coalesce(starts_at,created_at)<=p_at and (expires_at is null or expires_at>p_at));
end$$;
revoke all on function public.has_product_entitlement(uuid,text,timestamptz) from public,anon;
grant execute on function public.has_product_entitlement(uuid,text,timestamptz) to authenticated,service_role;

create table public.release1_free_guide_programs(
 destination_id uuid primary key references public.phase_o_destinations(id),campaign_id uuid not null references public.phase_o_campaigns(id),
 language text not null check(language in('en','so')),job_ids uuid[] not null,actor_id uuid not null references auth.users(id),
 enabled boolean not null default true,valid_until timestamptz not null,updated_at timestamptz not null default now()
);
alter table public.release1_free_guide_programs enable row level security;
create policy free_guide_admin_read on public.release1_free_guide_programs for select to authenticated using(public.is_admin());
revoke all on public.release1_free_guide_programs from anon,authenticated;
grant select on public.release1_free_guide_programs to authenticated;
grant select,insert,update on public.release1_free_guide_programs to service_role;
create function public.configure_release1_free_guide(p_actor uuid,p_destination uuid,p_campaign uuid,p_language text,p_templates jsonb,p_enabled boolean) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare old release1_free_guide_programs;j uuid;d uuid;ids uuid[]:='{}';content text;idx integer:=0;expiry timestamptz:=now()+interval '365 days';begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('free-guide:'||p_destination::text,0));
 select * into old from release1_free_guide_programs where destination_id=p_destination for update;
 perform 1 from phase_o_agent_jobs where id=any(old.job_ids) for update;
 if exists(select 1 from phase_o_agent_jobs where id=any(old.job_ids) and status in('CLAIMED','DELIVERING')) then raise exception 'GUIDE_BUSY_RETRY';end if;
 update phase_o_agent_jobs set status='CANCELLED',updated_at=now() where id=any(old.job_ids);
 update phase_o_approvals set revoked_at=now() where draft_id in(select id from phase_o_drafts where job_id=any(old.job_ids)) and revoked_at is null;
 if not p_enabled then update release1_free_guide_programs set enabled=false,updated_at=now() where destination_id=p_destination;return jsonb_build_object('state','PAUSED');end if;
 if p_templates is null or p_language is null or p_language not in('en','so') or jsonb_typeof(p_templates)<>'array' or jsonb_array_length(p_templates)<>6 then raise exception 'SIX_GUIDE_TEMPLATES_REQUIRED';end if;
 if not exists(select 1 from phase_o_destinations where id=p_destination and audience='FREE' and platform='TELEGRAM' and enabled and configuration_state='READY' and permission_verified_at is not null and 'GROWTH_ENGAGEMENT'=any(permitted_roles) and p_language=any(languages) and 'TEXT'=any(allowed_content_types)) then raise exception 'VERIFIED_FREE_DESTINATION_REQUIRED';end if;
 update phase_o_destinations set min_interval_minutes=240 where id=p_destination and min_interval_minutes<240;
 if not exists(select 1 from phase_o_campaigns where id=p_campaign and status='ACTIVE') then raise exception 'ACTIVE_CAMPAIGN_REQUIRED';end if;
 if not exists(select 1 from phase_o_agent_configurations where role='GROWTH_ENGAGEMENT' and enabled and paused_at is null and 'UPGRADE_POST'=any(permitted_tasks) and p_language=any(languages)) then raise exception 'ENABLE_GROWTH_AGENT_FIRST';end if;
 for content in select jsonb_array_elements_text(p_templates) loop
  if length(content) not between 30 and 2000 then raise exception 'GUIDE_TEMPLATE_INVALID';end if;
  j:=gen_random_uuid();d:=gen_random_uuid();ids:=array_append(ids,j);
  insert into phase_o_agent_jobs(id,role,task,language,campaign_id,destination_id,status,requested_by,available_at,checkpoint)
  values(j,'GROWTH_ENGAGEMENT','UPGRADE_POST',p_language,p_campaign,p_destination,'QUEUED',p_actor,now()+make_interval(mins=>idx*240),jsonb_build_object('stage','DELIVERY','draft_id',d,'delivery_key',j));
  insert into phase_o_drafts(id,job_id,version,content,content_hash,destination_id,offer_code) select d,j,1,content,encode(sha256(convert_to(content,'UTF8')),'hex'),p_destination,offer_code from phase_o_campaigns where id=p_campaign;
  insert into phase_o_approvals(draft_id,draft_version,binding_hash,scope,max_uses,expires_at,approved_by,min_interval_minutes)
  select d,1,phase_o_binding_hash(content_hash,1,null,p_destination,offer_code),'STANDING_TEMPLATE',366,expiry,p_actor,1440 from phase_o_drafts where id=d;
  idx:=idx+1;
 end loop;
 insert into release1_free_guide_programs(destination_id,campaign_id,language,job_ids,actor_id,valid_until) values(p_destination,p_campaign,p_language,ids,p_actor,expiry)
 on conflict(destination_id) do update set campaign_id=excluded.campaign_id,language=excluded.language,job_ids=excluded.job_ids,actor_id=excluded.actor_id,enabled=true,valid_until=excluded.valid_until,updated_at=now();
 return jsonb_build_object('state','ENABLED','jobs',6,'interval_hours',4,'valid_until',expiry,'quiet_hours_respected',true);
end$$;
revoke all on function public.configure_release1_free_guide(uuid,uuid,uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.configure_release1_free_guide(uuid,uuid,uuid,text,jsonb,boolean) to service_role;

create or replace function public.my_release1_customer_subscription() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare e phase_h_entitlements; p commerce_payment_attempts; active boolean;begin
 if auth.uid() is null then return null;end if;
 select * into e from phase_h_entitlements where customer_id=auth.uid() and product_code='VIP_SIGNALS' order by valid_until desc nulls last limit 1;
 if e.id is null then return null;end if;
 select * into p from commerce_payment_attempts where id=e.source_payment_id and customer_id=e.customer_id;
 active:=has_product_entitlement(auth.uid(),'crypto_signal_room',now());
 return jsonb_build_object('id',e.id,'user_id',e.customer_id,'package_name','VIP Signals','product_slug','crypto_signal_room','package_id',null,'access_status',case when active then 'active' when e.valid_until<=now() then 'expired' else 'suspended' end,'payment_status',case when e.source='OWNER_MANUAL_30D' then 'manual_access' when active then 'paid' else 'pending' end,'amount_paid',p.amount_minor/100.0,'currency',p.currency,'payment_method',coalesce(p.provider,e.source),'starts_at',e.valid_from,'expires_at',e.valid_until,'created_at',e.created_at,'updated_at',e.updated_at,'verified_commerce',e.source<>'OWNER_MANUAL_30D','manual_access',e.source='OWNER_MANUAL_30D');
end$$;
revoke all on function public.my_release1_customer_subscription() from public,anon;
grant execute on function public.my_release1_customer_subscription() to authenticated;


grant execute on function public.phase_o_binding_hash(text,integer,uuid,uuid,text) to service_role;
