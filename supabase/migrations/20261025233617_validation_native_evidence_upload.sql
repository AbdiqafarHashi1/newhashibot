-- Append-only native evidence. Legacy OHLCV identities and permissions remain valid.
alter table public.validation_dataset_candles add column if not exists native_evidence jsonb not null default '{}'::jsonb;
alter table public.validation_dataset_candles add constraint validation_native_evidence_object check(jsonb_typeof(native_evidence)='object');
alter table public.validation_datasets add column if not exists upload_key text, add column if not exists upload_metadata jsonb;
create unique index validation_upload_identity on public.validation_datasets(created_by,upload_key) where upload_key is not null;

create or replace function public.append_validation_dataset_chunk(p_actor uuid,p_dataset uuid,p_rows jsonb)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.validation_datasets; r record; old public.validation_dataset_candles; total integer;
begin
 select * into d from public.validation_datasets where id=p_dataset for update;
 if not found or d.created_by is distinct from p_actor or d.upload_key is null then raise exception 'DATASET_NOT_OWNED';end if;
 if d.status not in ('DOWNLOADING','READY','PARTIAL') or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'UPLOAD_CHUNK_INVALID';end if;
 for r in select * from jsonb_to_recordset(p_rows) as x(symbol text,market_type text,timeframe text,open_time timestamptz,open numeric,high numeric,low numeric,close numeric,volume numeric,source text,native_evidence jsonb) loop
  if r.symbol is distinct from d.symbol or r.timeframe is distinct from d.timeframe or r.open_time is null or r.open_time<d.first_open_time or r.open_time>d.last_open_time or r.market_type not in ('crypto','forex') or r.market_type is null or r.source is null or r.open is null or r.high is null or r.low is null or r.close is null or r.volume is null or r.low<=0 or r.volume<0 or jsonb_typeof(r.native_evidence) is distinct from 'object' then raise exception 'UPLOAD_CANDLE_INVALID';end if;
  select * into old from public.validation_dataset_candles where dataset_id=p_dataset and open_time=r.open_time;
  if found then
   if row(old.symbol,old.market_type,old.timeframe,old.open,old.high,old.low,old.close,old.volume,old.source,old.native_evidence) is distinct from row(r.symbol,r.market_type,r.timeframe,r.open,r.high,r.low,r.close,r.volume,r.source,r.native_evidence) then raise exception 'DATASET_DUPLICATE_CONTENT_CONFLICT';end if;
  else
   if d.status<>'DOWNLOADING' then raise exception 'DATASET_ALREADY_FINALIZED';end if;
   insert into public.validation_dataset_candles(dataset_id,symbol,market_type,timeframe,open_time,open,high,low,close,volume,source,native_evidence) values(p_dataset,r.symbol,r.market_type,r.timeframe,r.open_time,r.open,r.high,r.low,r.close,r.volume,r.source,r.native_evidence);
  end if;
 end loop;
 select count(*) into total from public.validation_dataset_candles where dataset_id=p_dataset;
 if total>d.row_count or total>250000 then raise exception 'UPLOAD_ROW_BOUND_EXCEEDED';end if;
 return total;
end $$;
create or replace function public.finish_validation_dataset_upload(p_actor uuid,p_dataset uuid,p_status text,p_coverage jsonb)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.validation_datasets;total integer;
begin
 select * into d from public.validation_datasets where id=p_dataset for update;
 if not found or d.created_by is distinct from p_actor or d.upload_key is null then raise exception 'DATASET_NOT_OWNED';end if;
 if p_status not in ('READY','PARTIAL') or p_status is null then raise exception 'UPLOAD_FINAL_STATUS_INVALID';end if;
 select count(*) into total from public.validation_dataset_candles where dataset_id=p_dataset;
 if total is distinct from d.row_count then raise exception 'UPLOAD_INCOMPLETE';end if;
 if d.status in ('READY','PARTIAL') then if d.status<>p_status or d.coverage is distinct from p_coverage then raise exception 'UPLOAD_FINALIZATION_CONFLICT';end if;return d.status;end if;
 if d.status<>'DOWNLOADING' then raise exception 'UPLOAD_NOT_FINALIZABLE';end if;
 update public.validation_datasets set status=p_status,coverage=p_coverage,resume_cursor=d.last_open_time where id=p_dataset;
 return p_status;
end $$;
revoke all on function public.append_validation_dataset_chunk(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.finish_validation_dataset_upload(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.append_validation_dataset_chunk(uuid,uuid,jsonb),public.finish_validation_dataset_upload(uuid,uuid,text,jsonb) to service_role;

create table public.validation_research_models(id uuid primary key default gen_random_uuid(),created_by uuid not null,content_hash text not null,strategy_id text not null,strategy_version text not null,configuration jsonb not null,valid_from timestamptz not null,valid_until timestamptz not null,provenance jsonb not null,publication_eligible boolean not null default false check(publication_eligible=false),created_at timestamptz not null default now(),unique(created_by,content_hash));
alter table public.validation_research_models enable row level security;
create policy research_models_admin_owner_read on public.validation_research_models for select to authenticated using(public.is_admin() and created_by=(select auth.uid()));
revoke all on public.validation_research_models from public,anon,authenticated;
grant select on public.validation_research_models to authenticated;
grant select,insert on public.validation_research_models to service_role;
create trigger validation_research_models_immutable before update or delete on public.validation_research_models for each row execute function public.reject_validation_immutable_update();
-- Counterfactual model replay is useful evidence, but is never a release route.
create function public.reject_research_only_strategy_release() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if coalesce((new.immutable_configuration->>'researchOnly')::boolean,false) then raise exception 'RESEARCH_ONLY_MODEL_CANNOT_BE_RELEASED';end if;
 return new;
end $$;
revoke all on function public.reject_research_only_strategy_release() from public,anon,authenticated;
create trigger measured_release_research_model_guard before insert or update on public.strategy_release_candidates for each row execute function public.reject_research_only_strategy_release();
