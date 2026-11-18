begin;

alter table public.orders add column if not exists order_number integer;

-- Give every existing order a unique, random, six-digit public order number.
do $$
declare
  order_row record;
  candidate integer;
  attempt integer;
begin
  for order_row in select id from public.orders where order_number is null order by created_at, id loop
    candidate := null;
    for attempt in 1..1000 loop
      candidate := floor(random() * 900000)::integer + 100000;
      exit when not exists(select 1 from public.orders where order_number = candidate);
    end loop;
    if candidate is null or exists(select 1 from public.orders where order_number = candidate) then
      raise exception 'could not assign a unique six-digit order number';
    end if;
    update public.orders set order_number = candidate where id = order_row.id;
  end loop;
end;
$$;

do $$begin
  if not exists (select 1 from pg_constraint where conname = 'orders_order_number_range_check' and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint orders_order_number_range_check check (order_number between 100000 and 999999);
  end if;
end$$;

alter table public.orders alter column order_number set not null;
create unique index if not exists orders_order_number_unique on public.orders(order_number);

create or replace function public.assign_order_number()
returns trigger
language plpgsql security definer set search_path=public
as $$
declare
  candidate integer;
  attempt integer;
begin
  -- Serialize only this small number-generation section to avoid a rare race
  -- when two orders are inserted at the same moment.
  perform pg_advisory_xact_lock(730421, 1);
  for attempt in 1..1000 loop
    candidate := floor(random() * 900000)::integer + 100000;
    if not exists(select 1 from public.orders where order_number = candidate) then
      new.order_number := candidate;
      return new;
    end if;
  end loop;
  raise exception 'could not assign a unique six-digit order number';
end;
$$;

drop trigger if exists orders_assign_order_number on public.orders;
create trigger orders_assign_order_number
before insert on public.orders
for each row execute function public.assign_order_number();

-- The QR guest status RPC keeps returning the UUID for browser-side tracking,
-- and now also returns the short number shown to the guest.
drop function if exists public.get_table_order_statuses(uuid, uuid, uuid[]);
create function public.get_table_order_statuses(rid uuid, tid uuid, order_ids uuid[])
returns table(order_id uuid, order_number integer, status public.order_status, updated_at timestamptz)
language plpgsql stable security definer set search_path=public
as $$
begin
  if not exists(select 1 from public.restaurants r join public.restaurant_tables t on t.restaurant_id=r.id where r.id=rid and r.status='active' and t.id=tid) then
    raise exception 'table QR is invalid or restaurant is unavailable';
  end if;
  if coalesce(cardinality(order_ids),0)>20 then raise exception 'too many order IDs'; end if;
  return query
    select o.id, o.order_number, o.status, o.updated_at
    from public.orders o
    where o.restaurant_id=rid and o.table_id=tid and o.id=any(coalesce(order_ids,'{}'::uuid[]))
      and o.status not in ('completed','cancelled')
    order by o.created_at;
end;
$$;

revoke all on function public.get_table_order_statuses(uuid, uuid, uuid[]) from public;
grant execute on function public.get_table_order_statuses(uuid, uuid, uuid[]) to anon, authenticated;

commit;
