-- Canonical conversion funnel: attribution and owner-safe operational read models.
alter table public.commerce_checkout_sessions
  add column if not exists source text,
  add column if not exists medium text,
  add column if not exists content text;

create or replace function public.founding_inventory_status()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'capacity', 20,
    'occupied', count(*) filter (where state='ACTIVE' or (state='RESERVED' and expires_at>now())),
    'remaining', 20-count(*) filter (where state='ACTIVE' or (state='RESERVED' and expires_at>now())),
    'verified_at', now()
  ) from founding_slot_reservations;
$$;
revoke all on function public.founding_inventory_status() from public;
grant execute on function public.founding_inventory_status() to anon, authenticated;

create or replace view public.commerce_funnel_operations with (security_invoker=true) as
select c.id checkout_id,c.customer_id,c.product_code,c.provider,c.status checkout_state,
 c.source,c.medium,c.campaign,c.content,c.affiliate,c.created_at,
 p.state payment_state,e.state entitlement_state,l.status telegram_link_state,
 m.state telegram_membership_state,m.safe_error telegram_failure_reason
from commerce_checkout_sessions c
left join commerce_payment_attempts p on p.checkout_session_id=c.id
left join phase_h_entitlements e on e.source_payment_id=p.id
left join telegram_links l on l.user_id=c.customer_id
left join telegram_memberships m on m.customer_id=c.customer_id and m.audience=case when c.product_code='VIP_SIGNALS' then 'VIP' else 'EXECUTION' end;
comment on view public.commerce_funnel_operations is 'Invite-sent is not membership confirmed; owner/admin visibility follows source RLS.';
grant select on public.commerce_funnel_operations to authenticated;
