begin;

-- Persist checkout notes and delivery instructions on the order record.
create or replace function public.place_order(
  rid uuid,
  items jsonb,
  kind text,
  pay_method text,
  order_notes text,
  delivery_address text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  oid uuid;
  item jsonb;
  p public.products;
  q int;
  subtotal numeric(10,2):=0;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if kind not in ('dine_in','takeaway','delivery') then raise exception 'invalid order type'; end if;
  if pay_method not in ('cash_on_delivery','cash_at_restaurant') then raise exception 'invalid payment method'; end if;
  if kind='delivery' and nullif(trim(delivery_address),'') is null then raise exception 'delivery address is required'; end if;
  if not exists(select 1 from public.restaurants where id=rid and status='active') then raise exception 'restaurant is unavailable'; end if;
  if jsonb_typeof(items)<>'array' or jsonb_array_length(items)=0 then raise exception 'order must contain items'; end if;

  for item in select * from jsonb_array_elements(items) loop
    q:=(item->>'quantity')::int;
    if q<1 or q>50 then raise exception 'invalid quantity'; end if;
    select * into p from public.products where id=(item->>'product_id')::uuid and restaurant_id=rid and available for update;
    if not found then raise exception 'menu item is unavailable'; end if;
    if p.quantity<q then raise exception 'Only % of % remain',p.quantity,p.name; end if;
    subtotal:=subtotal+p.price*q;
  end loop;

  insert into public.orders(restaurant_id,customer_id,order_type,status,subtotal,total,notes)
  values(rid,auth.uid(),kind,'pending',subtotal,subtotal,
    nullif(concat_ws(E'\n',
      case when nullif(trim(delivery_address),'') is not null then 'Delivery address: '||trim(delivery_address) end,
      case when nullif(trim(order_notes),'') is not null then 'Kitchen notes: '||trim(order_notes) end
    ),'')) returning id into oid;

  for item in select * from jsonb_array_elements(items) loop
    q:=(item->>'quantity')::int;
    update public.products set quantity=quantity-q,available=(quantity-q)>0 where id=(item->>'product_id')::uuid and restaurant_id=rid and quantity>=q returning * into p;
    if not found then raise exception 'not enough stock for this item'; end if;
    insert into public.order_items(restaurant_id,order_id,product_id,name_snapshot,quantity,unit_price,variant)
    values(rid,oid,p.id,p.name,q,p.price,nullif(item->>'variant',''));
  end loop;

  insert into public.payments(restaurant_id,order_id,method,status,amount)
  values(rid,oid,pay_method,'pending',subtotal);
  return oid;
end;
$$;

revoke all on function public.place_order(uuid,jsonb,text,text,text,text) from public;
grant execute on function public.place_order(uuid,jsonb,text,text,text,text) to authenticated;

commit;
