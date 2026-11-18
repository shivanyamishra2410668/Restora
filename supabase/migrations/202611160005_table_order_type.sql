begin;

-- Let QR guests choose dine-in or takeaway; the selected type is stored on
-- the order so admins and kitchen staff receive the same instruction.
create or replace function public.place_table_order(
  rid uuid,
  tid uuid,
  items jsonb,
  kind text,
  guest_name text,
  notes text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  order_id uuid;
  item jsonb;
  product public.products;
  qty integer;
  subtotal numeric(10,2):=0;
begin
  if kind not in ('dine_in','takeaway') then raise exception 'choose dine-in or takeaway'; end if;
  if not exists(
    select 1 from public.restaurants r
    join public.restaurant_tables t on t.restaurant_id=r.id
    where r.id=rid and r.status='active' and t.id=tid
  ) then raise exception 'table QR is invalid or restaurant is unavailable'; end if;
  if nullif(trim(guest_name),'') is null then raise exception 'your name is required'; end if;
  if jsonb_typeof(items)<>'array' or jsonb_array_length(items)=0 then raise exception 'order must contain items'; end if;
  if jsonb_array_length(items)>30 then raise exception 'too many items in one order'; end if;

  for item in select * from jsonb_array_elements(items) loop
    qty:=(item->>'quantity')::integer;
    if qty<1 or qty>50 then raise exception 'item quantity must be between 1 and 50'; end if;
    select * into product from public.products p
    where p.id=(item->>'product_id')::uuid and p.restaurant_id=rid and p.available
    for update;
    if not found then raise exception 'menu item is unavailable'; end if;
    if product.quantity<qty then raise exception 'Only % of % remain',product.quantity,product.name; end if;
    subtotal:=subtotal+product.price*qty;
  end loop;

  insert into public.orders(restaurant_id,customer_id,created_by,table_id,guest_name,order_type,status,subtotal,total,notes)
  values(rid,auth.uid(),auth.uid(),tid,nullif(trim(guest_name),''),kind,'pending',subtotal,subtotal,nullif(trim(notes),''))
  returning id into order_id;

  for item in select * from jsonb_array_elements(items) loop
    qty:=(item->>'quantity')::integer;
    update public.products set quantity=quantity-qty,available=(quantity-qty)>0
    where id=(item->>'product_id')::uuid and restaurant_id=rid and quantity>=qty
    returning * into product;
    if not found then raise exception 'not enough stock for this item'; end if;
    insert into public.order_items(restaurant_id,order_id,product_id,name_snapshot,quantity,unit_price,variant)
    values(rid,order_id,product.id,product.name,qty,product.price,null);
  end loop;

  insert into public.payments(restaurant_id,order_id,method,status,amount)
  values(rid,order_id,'cash_at_restaurant','pending',subtotal);
  return order_id;
end;
$$;

revoke all on function public.place_table_order(uuid,uuid,jsonb,text,text,text) from public;
grant execute on function public.place_table_order(uuid,uuid,jsonb,text,text,text) to anon,authenticated;

commit;
