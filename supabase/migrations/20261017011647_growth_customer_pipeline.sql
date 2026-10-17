-- Acquisition records are private operator data, separate from verified commerce totals.
create table public.growth_prospects(
 id uuid primary key default gen_random_uuid(),display_name text not null check(length(display_name) between 1 and 120),
 contact_type text not null check(contact_type in('EMAIL','TELEGRAM','WHATSAPP')),contact_value text not null check(length(contact_value) between 3 and 254),
 source_code text not null default 'manual' check(length(source_code) between 1 and 80),campaign_id uuid references public.phase_o_campaigns(id),
 customer_id uuid references auth.users(id),stage text not null default 'NEW' check(stage in('NEW','CONTACTED','INTERESTED','CHECKOUT_SENT','LOST','DO_NOT_CONTACT')),
 consent text not null default 'UNKNOWN' check(consent in('UNKNOWN','OPTED_IN','OPTED_OUT')),next_follow_up timestamptz,
 notes text not null default '' check(length(notes)<=2000),revision integer not null default 1,created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(consent<>'OPTED_OUT' or stage='DO_NOT_CONTACT')
);
create unique index growth_contact_identity on public.growth_prospects(contact_type,lower(contact_value));
create index growth_follow_up_due on public.growth_prospects(stage,next_follow_up);
create table public.growth_prospect_activities(
 id uuid primary key default gen_random_uuid(),prospect_id uuid not null references public.growth_prospects(id),actor_id uuid not null references auth.users(id),
 event_type text not null check(event_type in('CREATED','UPDATED','NOTE','CONTACT_REPORTED','REPLY_REPORTED','OPTED_OUT')),
 note text not null check(length(note)<=2000),source text not null default 'OPERATOR_REPORTED',created_at timestamptz not null default now()
);
alter table public.growth_prospects enable row level security;
alter table public.growth_prospect_activities enable row level security;
revoke all on public.growth_prospects,public.growth_prospect_activities from public,anon,authenticated;
grant select,insert,update on public.growth_prospects to service_role;
grant select,insert on public.growth_prospect_activities to service_role;
create function public.manage_growth_pipeline(p_actor uuid,p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare lead growth_prospects;result jsonb;kind text;contact text;stage_value text;consent_value text;begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from profiles where id=p_actor and role='admin') then raise exception 'ADMIN_SERVICE_REQUIRED';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>20000 then raise exception 'INVALID_PIPELINE_INPUT';end if;
 if p_action='LIST' then
  select jsonb_build_object('prospects',coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb),'campaigns',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'canonical_url',c.canonical_url)),'[]'::jsonb) from phase_o_campaigns c where c.status in('DRAFT','ACTIVE'))) into result from(
   select p.*,coalesce(p.customer_id,matched.id) as matched_customer_id,exists(select 1 from phase_h_entitlements e join commerce_payment_attempts pay on pay.id=e.source_payment_id and pay.customer_id=e.customer_id and pay.state='SUCCEEDED' where e.customer_id=coalesce(p.customer_id,matched.id) and e.state='ACTIVE' and e.product_code in('VIP_SIGNALS','FOUNDING_AUTO_EXECUTION') and e.valid_until>now()) as verified_paid,
   (select count(*) from growth_prospect_activities x where x.prospect_id=p.id) as activity_count
   from growth_prospects p left join lateral(select u.id from auth.users u where p.contact_type='EMAIL' and u.email_confirmed_at is not null and lower(u.email)=p.contact_value limit 1) matched on true where (nullif(p_input->>'stage','') is null or p.stage=p_input->>'stage')
   and (nullif(p_input->>'after','') is null or p.id>(p_input->>'after')::uuid)
   and (coalesce((p_input->>'due_only')::boolean,false)=false or (p.next_follow_up<=now() and p.stage not in('LOST','DO_NOT_CONTACT')))
   order by p.id limit 50
  ) rows;return result;
 end if;
 if p_action='DRAFT_CONTEXT' then
  select * into lead from growth_prospects where id=(p_input->>'id')::uuid;
  if not found or lead.consent<>'OPTED_IN' or lead.stage='DO_NOT_CONTACT' then raise exception 'CONTACT_PERMISSION_REQUIRED';end if;
  return jsonb_build_object('prospect',to_jsonb(lead));
 end if;
 if p_action='ACTIVITIES' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from(select * from growth_prospect_activities where prospect_id=(p_input->>'id')::uuid order by created_at desc limit 50) x;return jsonb_build_object('activities',result);
 end if;
 if p_action='SAVE' then
  if exists(select 1 from jsonb_object_keys(p_input) k where k not in('id','revision','display_name','contact_type','contact_value','source_code','campaign_id','customer_id','stage','consent','next_follow_up','notes')) then raise exception 'PIPELINE_FIELD_NOT_ALLOWED';end if;
  kind:=p_input->>'contact_type';contact:=trim(p_input->>'contact_value');
  if kind='EMAIL' then contact:=lower(contact);if contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'VALID_EMAIL_REQUIRED';end if;
  elsif kind='TELEGRAM' then contact:=lower(ltrim(contact,'@'));if contact !~ '^[a-z0-9_]{5,32}$' then raise exception 'VALID_TELEGRAM_HANDLE_REQUIRED';end if;
  elsif kind='WHATSAPP' then if contact !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'INTERNATIONAL_PHONE_REQUIRED';end if;
  else raise exception 'CONTACT_TYPE_REQUIRED';end if;
  stage_value:=coalesce(p_input->>'stage','NEW');consent_value:=coalesce(p_input->>'consent','UNKNOWN');if stage_value='DO_NOT_CONTACT' then consent_value:='OPTED_OUT';end if;if consent_value='OPTED_OUT' then stage_value:='DO_NOT_CONTACT';end if;
  if nullif(p_input->>'id','') is null then
   insert into growth_prospects(display_name,contact_type,contact_value,source_code,campaign_id,customer_id,stage,consent,next_follow_up,notes,created_by)
   values(trim(p_input->>'display_name'),kind,contact,coalesce(nullif(p_input->>'source_code',''),'manual'),nullif(p_input->>'campaign_id','')::uuid,nullif(p_input->>'customer_id','')::uuid,stage_value,consent_value,nullif(p_input->>'next_follow_up','')::timestamptz,coalesce(p_input->>'notes',''),p_actor) returning * into lead;
   insert into growth_prospect_activities(prospect_id,actor_id,event_type,note) values(lead.id,p_actor,'CREATED','Prospect recorded');
  else
   select * into lead from growth_prospects where id=(p_input->>'id')::uuid for update;
   if not found or lead.revision is distinct from (p_input->>'revision')::integer then raise exception 'PROSPECT_CHANGED_RELOAD';end if;
   if lead.consent='OPTED_OUT' and (consent_value<>'OPTED_OUT' or contact is distinct from lead.contact_value or kind is distinct from lead.contact_type) then raise exception 'OPT_OUT_CANNOT_BE_OVERRIDDEN';end if;
   update growth_prospects set display_name=trim(p_input->>'display_name'),contact_type=kind,contact_value=contact,source_code=coalesce(nullif(p_input->>'source_code',''),'manual'),campaign_id=nullif(p_input->>'campaign_id','')::uuid,customer_id=nullif(p_input->>'customer_id','')::uuid,stage=stage_value,consent=consent_value,next_follow_up=nullif(p_input->>'next_follow_up','')::timestamptz,notes=coalesce(p_input->>'notes',''),revision=revision+1,updated_at=now() where id=lead.id returning * into lead;
   insert into growth_prospect_activities(prospect_id,actor_id,event_type,note) values(lead.id,p_actor,case when consent_value='OPTED_OUT' then 'OPTED_OUT' else 'UPDATED' end,'Prospect details updated');
  end if;return jsonb_build_object('id',lead.id,'revision',lead.revision);
 end if;
 if p_action='NOTE' then
  select * into lead from growth_prospects where id=(p_input->>'id')::uuid for update;if not found then raise exception 'PROSPECT_NOT_FOUND';end if;
  kind:=coalesce(p_input->>'kind','NOTE');if kind not in('NOTE','CONTACT_REPORTED','REPLY_REPORTED','OPTED_OUT') then raise exception 'ACTIVITY_KIND_NOT_ALLOWED';end if;
  if (lead.consent='OPTED_OUT' or lead.stage='DO_NOT_CONTACT') and kind in('CONTACT_REPORTED','REPLY_REPORTED') then raise exception 'CONTACT_SUPPRESSED';end if;
  if kind='OPTED_OUT' then update growth_prospects set consent='OPTED_OUT',stage='DO_NOT_CONTACT',next_follow_up=null,revision=revision+1,updated_at=now() where id=lead.id;end if;
  if length(trim(coalesce(p_input->>'note',''))) not between 1 and 2000 then raise exception 'ACTIVITY_NOTE_REQUIRED';end if;
  insert into growth_prospect_activities(prospect_id,actor_id,event_type,note) values(lead.id,p_actor,kind,trim(p_input->>'note'));return jsonb_build_object('state','RECORDED');
 end if;raise exception 'PIPELINE_ACTION_NOT_ALLOWED';
end$$;
revoke all on function public.manage_growth_pipeline(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_growth_pipeline(uuid,text,jsonb) to service_role;
