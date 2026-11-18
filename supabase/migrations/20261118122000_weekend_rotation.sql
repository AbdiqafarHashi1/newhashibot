create function public.in_crypto_rotation_window(at_time timestamptz) returns boolean language sql immutable set search_path=public as $$
 select extract(isodow from at_time at time zone 'UTC')=5 and extract(hour from at_time at time zone 'UTC')>=20 or extract(isodow from at_time at time zone 'UTC')=6 or extract(isodow from at_time at time zone 'UTC')=7 and extract(hour from at_time at time zone 'UTC')<21
$$;
create function public.observe_mt5_weekend_rotation() returns trigger language plpgsql security invoker set search_path=public as $$
declare a connected_execution_accounts;item jsonb;op text;ticket text;cycle text;begin
 if not in_crypto_rotation_window(clock_timestamp()) or new.terminal_authenticated is distinct from true or new.read_status->>'positions' is distinct from 'true' or new.read_status->>'orders' is distinct from 'true' or new.captured_at>clock_timestamp() or new.captured_at<clock_timestamp()-interval '60 seconds' then return new;end if;
 cycle:=to_char(date_trunc('week',new.captured_at at time zone 'UTC'),'YYYY-MM-DD');
 for a in select x.* from connected_execution_accounts x join mt5_accounts m on m.id::text=x.provider_account_identity and m.user_id=x.customer_id and m.credential_ref=x.credential_ref and m.bridge_id=new.bridge_id where x.customer_id=new.owner_id and x.provider_account_identity=new.account_id::text and x.provider in('MT5_PERSONAL','MT5_PROP') and upper(x.environment)='DEMO' loop
  update mt5_commands set status='rejected',error_code='WEEKEND_FX_METALS_ENTRY_BLOCKED' where account_id=new.account_id and operation='OPEN_POSITION' and status in('received','accepted') and coalesce(payload->>'symbol','')!~'^(BTC|ETH|SOL)USD([._-].*)?$';
  for op in select unnest(array['CANCEL_ORDER','CLOSE_POSITION']) loop
   if op='CLOSE_POSITION' and ((a.provider='MT5_PROP' and a.policy_overrides#>>'{approved_prop_rules,weekend_holding_allowed}'='false' and coalesce(a.policy_overrides#>>'{policy_configuration,fridayClose}','true')='true') is distinct from true) then continue;end if;
   for item in select value from jsonb_array_elements(case when op='CLOSE_POSITION' then new.positions else new.orders end) loop
    ticket:=coalesce(item->>'ticket',item->>'position_id',item->>'order_id');
    if ticket is null or ticket!~'^[0-9]+$' or coalesce(item->>'symbol','')~'^(BTC|ETH|SOL)USD([._-].*)?$' or is_owned_mt5_child(new.account_id,item->>'comment') is distinct from true then continue;end if;
    insert into mt5_commands(account_id,bridge_id,operation,payload,idempotency_key,status,intended_policy,expires_at) values(new.account_id,new.bridge_id,op,jsonb_build_object('ticket',ticket,'weekend_rotation','friday-20-sunday-21/v1'),format('weekend:%s:%s:%s',cycle,op,ticket),'received','{"authority":"WEEKEND_ROTATION"}',clock_timestamp()+interval '2 minutes')
    on conflict(account_id,idempotency_key) do update set status=case when mt5_commands.expires_at<clock_timestamp() then 'received' else mt5_commands.status end,expires_at=case when mt5_commands.expires_at<clock_timestamp() then clock_timestamp()+interval '2 minutes' else mt5_commands.expires_at end;
   end loop;
  end loop;
 end loop;return new;
end $$;
create trigger zz_weekend_rotation after insert on public.mt5_account_snapshots for each row execute function public.observe_mt5_weekend_rotation();
create function public.authorize_weekend_management(p_command uuid,p_owner uuid,p_account uuid,p_bridge text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare c mt5_commands;a connected_execution_accounts;s mt5_account_snapshots;item jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if not in_crypto_rotation_window(clock_timestamp()) then return null;end if;
 select * into c from mt5_commands where id=p_command and account_id=p_account and bridge_id=p_bridge and status='accepted' and expires_at>clock_timestamp() and operation in('CLOSE_POSITION','CANCEL_ORDER') and payload->>'weekend_rotation'='friday-20-sunday-21/v1';if not found then return null;end if;
 select x.* into a from connected_execution_accounts x join mt5_accounts m on m.id=p_account and m.user_id=p_owner and m.bridge_id=p_bridge and m.credential_ref=x.credential_ref where x.customer_id=p_owner and x.provider_account_identity=p_account::text and upper(x.environment)='DEMO';if not found then return null;end if;
 if c.operation='CLOSE_POSITION' and ((a.provider='MT5_PROP' and a.policy_overrides#>>'{approved_prop_rules,weekend_holding_allowed}'='false' and coalesce(a.policy_overrides#>>'{policy_configuration,fridayClose}','true')='true') is distinct from true) then return null;end if;
 select * into s from mt5_account_snapshots where account_id=p_account and owner_id=p_owner and bridge_id=p_bridge and captured_at>clock_timestamp()-interval '60 seconds' and captured_at<=clock_timestamp() and terminal_authenticated=true and read_status->>'positions'='true' and read_status->>'orders'='true' order by captured_at desc limit 1;if not found then return null;end if;
 select i into item from jsonb_array_elements(case when c.operation='CLOSE_POSITION' then s.positions else s.orders end) i where coalesce(i->>'ticket',i->>'position_id',i->>'order_id')=c.payload->>'ticket' and coalesce(i->>'symbol','')!~'^(BTC|ETH|SOL)USD([._-].*)?$' and is_owned_mt5_child(p_account,i->>'comment');if item is null then return null;end if;
 return jsonb_build_object('authority','WEEKEND_ROTATION','command_id',c.id,'account_id',p_account,'owner_id',p_owner,'bridge_id',p_bridge,'operation',c.operation,'ticket',c.payload->>'ticket','weekend_rotation','friday-20-sunday-21/v1','expires_at',c.expires_at);
end $$;
revoke all on function public.authorize_weekend_management(uuid,uuid,uuid,text),public.observe_mt5_weekend_rotation() from public,anon,authenticated;
grant execute on function public.authorize_weekend_management(uuid,uuid,uuid,text) to service_role;
