-- Expiry pauses entries without revoking credentials or protective monitoring.
create function public.execution_access_boundary(p_account uuid,p_customer uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a connected_execution_accounts;e phase_h_entitlements;binding text;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into a from connected_execution_accounts where id=p_account and customer_id=p_customer for update;
 if not found then raise exception 'EXECUTION_ACCOUNT_SCOPE_REQUIRED';end if;
 select b.state into binding from execution_entitlement_bindings b where b.execution_account_id=a.id and b.customer_id=a.customer_id;
 select h.* into e from execution_entitlement_bindings b join phase_h_entitlements h on h.id=b.entitlement_id and h.customer_id=b.customer_id and h.execution_account_id=b.execution_account_id where b.execution_account_id=a.id and b.customer_id=a.customer_id;
 if e.id is null or e.valid_until is null then return jsonb_build_object('state','NOT_CONFIGURED');end if;
 if e.valid_until<=clock_timestamp() then
  update connected_execution_accounts set runtime_control='PAUSE_NEW_ENTRIES',execution_enabled=false,monitor_enabled=true,updated_at=clock_timestamp() where id=a.id and customer_id=a.customer_id;
  return jsonb_build_object('state','EXPIRED','entitlement_id',e.id,'expires_at',e.valid_until);
 end if;
 return jsonb_build_object('state',case when binding='ACTIVE' and e.state='ACTIVE' and e.revoked_at is null and e.valid_from<=clock_timestamp() then 'ACTIVE' else 'INACTIVE' end,'entitlement_id',e.id,'expires_at',e.valid_until);
end $$;
revoke all on function public.execution_access_boundary(uuid,uuid) from public,anon,authenticated;
grant execute on function public.execution_access_boundary(uuid,uuid) to service_role;

-- A cryptographic child comment links exposure to this account's certified plan.
create function public.is_owned_mt5_child(p_account uuid,p_comment text) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select p_comment is not null and exists(select 1 from mt5_commands c cross join lateral jsonb_array_elements(case when jsonb_typeof(c.payload->'native_child_orders')='array' then c.payload->'native_child_orders' else '[]'::jsonb end) child where c.account_id=p_account and c.operation='OPEN_POSITION' and c.payload->>'certified'='true' and child->>'client_order_id' is not null and p_comment='hb:'||left(encode(sha256(convert_to(child->>'client_order_id','UTF8')),'hex'),24));
$$;
revoke all on function public.is_owned_mt5_child(uuid,text) from public,anon,authenticated;
grant execute on function public.is_owned_mt5_child(uuid,text) to service_role;

create function public.observe_mt5_execution_expiry() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a connected_execution_accounts;access jsonb;item jsonb;ticket text;chosen_operation text;begin
 if new.terminal_authenticated is distinct from true or new.read_status->>'positions' is distinct from 'true' or new.read_status->>'orders' is distinct from 'true' or new.captured_at>clock_timestamp()+interval '5 seconds' or new.captured_at<clock_timestamp()-interval '60 seconds' then return new;end if;
 for a in select x.* from connected_execution_accounts x join mt5_accounts m on m.id::text=x.provider_account_identity and m.user_id=x.customer_id and m.credential_ref=x.credential_ref and m.bridge_id=new.bridge_id where x.customer_id=new.owner_id and x.provider_account_identity=new.account_id::text and x.provider in('MT5_PERSONAL','MT5_PROP') and upper(x.environment)='DEMO' for update of x loop
  access:=execution_access_boundary(a.id,a.customer_id);if access->>'state'<>'EXPIRED' then continue;end if;
  update mt5_commands set status='rejected',error_code='EXECUTION_ACCESS_EXPIRED' where account_id=new.account_id and operation='OPEN_POSITION' and status in('received','accepted');
  for chosen_operation in select unnest(array['CLOSE_POSITION','CANCEL_ORDER']) loop
   for item in select value from jsonb_array_elements(case when chosen_operation='CLOSE_POSITION' then new.positions else new.orders end) loop
    ticket:=coalesce(item->>'ticket',item->>'position_id',item->>'order_id');
    if ticket is null or ticket !~ '^[0-9]+$' or is_owned_mt5_child(new.account_id,item->>'comment') is distinct from true then continue;end if;
    insert into mt5_commands(account_id,bridge_id,operation,payload,idempotency_key,status,intended_policy,expires_at)
    values(new.account_id,new.bridge_id,chosen_operation,jsonb_build_object('ticket',ticket,'expiry_entitlement_id',access->>'entitlement_id'),format('access-expiry:%s:%s:%s',access->>'entitlement_id',chosen_operation,ticket),'received','{"authority":"EXECUTION_ACCESS_EXPIRED"}',clock_timestamp()+interval '2 minutes')
    on conflict(account_id,idempotency_key) do update set status=case when mt5_commands.expires_at<clock_timestamp() then 'received' else mt5_commands.status end,expires_at=case when mt5_commands.expires_at<clock_timestamp() then clock_timestamp()+case when mt5_commands.attempts>=3 then interval '15 minutes' else interval '2 minutes' end else mt5_commands.expires_at end;
   end loop;
  end loop;
 end loop;return new;
end $$;
revoke all on function public.observe_mt5_execution_expiry() from public,anon,authenticated;
create trigger zz_execution_access_expiry after insert on public.mt5_account_snapshots for each row execute function public.observe_mt5_execution_expiry();

create function public.authorize_expiry_management(p_command uuid,p_owner uuid,p_account uuid,p_bridge text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c mt5_commands;a connected_execution_accounts;s mt5_account_snapshots;access jsonb;ticket text;begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into c from mt5_commands where id=p_command and account_id=p_account and bridge_id=p_bridge and operation in('CLOSE_POSITION','CANCEL_ORDER') and status='accepted' and expires_at>clock_timestamp();if not found then return null;end if;
 select x.* into a from connected_execution_accounts x join mt5_accounts m on m.id=p_account and m.user_id=p_owner and m.bridge_id=p_bridge and m.credential_ref=x.credential_ref where x.customer_id=p_owner and x.provider_account_identity=p_account::text and x.provider in('MT5_PERSONAL','MT5_PROP') and upper(x.environment)='DEMO';if not found then return null;end if;
 access:=execution_access_boundary(a.id,p_owner);if access->>'state'<>'EXPIRED' or access->>'entitlement_id' is distinct from c.payload->>'expiry_entitlement_id' then return null;end if;
 select * into s from mt5_account_snapshots where account_id=p_account and owner_id=p_owner and bridge_id=p_bridge and captured_at>clock_timestamp()-interval '60 seconds' and captured_at<=clock_timestamp()+interval '5 seconds' and terminal_authenticated=true and read_status->>'positions'='true' and read_status->>'orders'='true' order by captured_at desc limit 1;if not found then return null;end if;
 ticket:=c.payload->>'ticket';if not exists(select 1 from jsonb_array_elements(case when c.operation='CLOSE_POSITION' then s.positions else s.orders end) i where coalesce(i->>'ticket',i->>'position_id',i->>'order_id')=ticket and is_owned_mt5_child(p_account,i->>'comment')) then return null;end if;
 return jsonb_build_object('authority','EXECUTION_ACCESS_EXPIRED','command_id',c.id,'account_id',p_account,'owner_id',p_owner,'bridge_id',p_bridge,'operation',c.operation,'ticket',ticket,'entitlement_id',access->>'entitlement_id','expires_at',c.expires_at);
end $$;
revoke all on function public.authorize_expiry_management(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.authorize_expiry_management(uuid,uuid,uuid,text) to service_role;
