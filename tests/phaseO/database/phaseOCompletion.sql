\set ON_ERROR_STOP on
begin;
do $$begin
 if to_regprocedure('public.reserve_phase_o_delivery_part(uuid,integer,text,integer)') is null then raise exception 'reserve RPC missing';end if;
 if to_regprocedure('public.finish_phase_o_delivery_part(uuid,uuid,text,text,text,timestamp with time zone)') is null then raise exception 'finish RPC missing';end if;
 if not exists(select 1 from pg_policies where tablename='phase_o_approval_uses' and roles @> array['authenticated']::name[])then raise exception 'approval use RLS policy missing';end if;
 if not exists(select 1 from pg_trigger where tgname='trg_phase_o_vip_audiences' and tgenabled='O')then raise exception 'VIP audience trigger missing';end if;
 if not exists(select 1 from pg_trigger where tgname='trg_phase_o_attr_membership' and tgenabled='O')then raise exception 'membership attribution trigger missing';end if;
 if has_function_privilege('anon','public.reserve_phase_o_delivery_part(uuid,integer,text,integer)','execute')then raise exception 'anon may reserve delivery';end if;
 if has_function_privilege('authenticated','public.reserve_phase_o_delivery_part(uuid,integer,text,integer)','execute')then raise exception 'authenticated may reserve delivery';end if;
end$$;
rollback;
