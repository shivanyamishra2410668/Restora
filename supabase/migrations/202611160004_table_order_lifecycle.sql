begin;

-- Owners/managers may correct a newly placed order before it reaches the kitchen.
create or replace function public.admin_replace_order_items(p_order_id uuid, items jsonb)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  order_row public.orders;
  item jsonb;
  product_row public.products;
  qty integer;
  old_qty integer;
  new_subtotal numeric(10,2):=0;
begin
  select * into order_row from public.orders o where o.id=p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not public.has_restaurant_access(order_row.restaurant_id,array['restaurant_owner','manager']::public.member_role[]) then
    raise exception 'restaurant manager access required';
  end if;
  if order_row.status<>'pending' then raise exception 'only orders awaiting review can be edited'; end if;
  if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items)=0 or jsonb_array_length(items)>30 then
    raise exception 'order must contain between 1 and 30 items';
  end if;
  if exists(
    select 1 from (
      select value->>'product_id' as product_id
      from jsonb_array_elements(items) as incoming(value)
    ) duplicates
    group by product_id having count(*)>1
  ) then raise exception 'each menu item can only appear once'; end if;

  for item in select * from jsonb_array_elements(items) loop
    qty:=(item->>'quantity')::integer;
    if qty<1 or qty>50 then raise exception 'item quantity must be between 1 and 50'; end if;
    select * into product_row from public.products p
    where p.id=(item->>'product_id')::uuid and p.restaurant_id=order_row.restaurant_id
    for update;
    if not found then raise exception 'menu item is unavailable'; end if;
    select coalesce(sum(oi.quantity),0)::integer into old_qty from public.order_items oi
    where oi.order_id=p_order_id and oi.product_id=product_row.id;
    if qty>product_row.quantity+old_qty then raise exception 'not enough stock for %',product_row.name; end if;
    if old_qty=0 and not product_row.available then raise exception 'menu item % is unavailable',product_row.name; end if;
  end loop;

  update public.products p set quantity=p.quantity+oi.quantity,available=true
  from public.order_items oi where oi.order_id=p_order_id and oi.product_id=p.id;
  delete from public.order_items oi where oi.order_id=p_order_id;

  for item in select * from jsonb_array_elements(items) loop
    qty:=(item->>'quantity')::integer;
    update public.products p set quantity=p.quantity-qty,available=(p.quantity-qty)>0
    where p.id=(item->>'product_id')::uuid and p.restaurant_id=order_row.restaurant_id and p.quantity>=qty
    returning * into product_row;
    if not found then raise exception 'not enough stock for %',coalesce(product_row.name,'menu item'); end if;
    insert into public.order_items(restaurant_id,order_id,product_id,name_snapshot,quantity,unit_price,variant)
    values(order_row.restaurant_id,p_order_id,product_row.id,product_row.name,qty,product_row.price,nullif(item->>'variant',''));
    new_subtotal:=new_subtotal+product_row.price*qty;
  end loop;

  update public.orders o set subtotal=new_subtotal,total=new_subtotal+o.tax where o.id=p_order_id;
  update public.payments p set amount=new_subtotal+order_row.tax where p.order_id=p_order_id and p.status='pending';
  return true;
end;
$$;
revoke all on function public.admin_replace_order_items(uuid,jsonb) from public;
grant execute on function public.admin_replace_order_items(uuid,jsonb) to authenticated;

-- Only restaurant owners/managers mark a kitchen-ready order as handed over.
create or replace function public.admin_complete_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare order_row public.orders;
begin
  select * into order_row from public.orders o where o.id=p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not public.has_restaurant_access(order_row.restaurant_id,array['restaurant_owner','manager']::public.member_role[]) then
    raise exception 'restaurant manager access required';
  end if;
  if order_row.status<>'ready' then raise exception 'only kitchen-ready orders can be marked delivered'; end if;
  update public.orders o set status='completed' where o.id=p_order_id;
  return true;
end;
$$;
revoke all on function public.admin_complete_order(uuid) from public;
grant execute on function public.admin_complete_order(uuid) to authenticated;

-- Guests can see status only for order UUIDs already stored by their QR session,
-- and only while those orders remain active at the same restaurant table.
create or replace function public.get_table_order_statuses(rid uuid,tid uuid,order_ids uuid[])
returns table(order_id uuid,status public.order_status,updated_at timestamptz)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not exists(select 1 from public.restaurants r join public.restaurant_tables t on t.restaurant_id=r.id where r.id=rid and r.status='active' and t.id=tid) then
    raise exception 'table QR is invalid or restaurant is unavailable';
  end if;
  if coalesce(cardinality(order_ids),0)>20 then raise exception 'too many order IDs'; end if;
  return query
    select o.id::uuid,o.status::public.order_status,o.updated_at::timestamptz
    from public.orders o
    where o.restaurant_id=rid and o.table_id=tid and o.id=any(coalesce(order_ids,'{}'::uuid[]))
      and o.status not in ('completed','cancelled')
    order by o.created_at;
end;
$$;
revoke all on function public.get_table_order_statuses(uuid,uuid,uuid[]) from public;
grant execute on function public.get_table_order_statuses(uuid,uuid,uuid[]) to anon,authenticated;

commit;
