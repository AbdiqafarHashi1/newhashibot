-- PREPARED ONLY: do not execute without review and explicit authorization.
-- Makes the scanner's signal_id + mode_slug lookup concurrency-safe.
begin;

do $$
begin
  if exists (
    select 1
    from public.paper_execution_intents
    where signal_id is not null
    group by signal_id, mode_slug
    having count(*) > 1
  ) then
    raise exception 'phase3 preflight failed: duplicate paper intents exist for signal_id + mode_slug';
  end if;
end $$;

create unique index if not exists paper_execution_intents_signal_mode_uidx
  on public.paper_execution_intents (signal_id, mode_slug)
  where signal_id is not null;

commit;
