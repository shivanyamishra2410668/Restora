begin;

alter table public.categories add column if not exists short_code char(6);
alter table public.products add column if not exists short_code char(6);
alter table public.products add column if not exists quantity integer;
update public.products set quantity=999 where quantity is null;
alter table public.products alter column quantity set default 0;
alter table public.products alter column quantity set not null;
alter table public.products add constraint products_quantity_nonnegative check (quantity >= 0);

create unique index if not exists categories_restaurant_short_code_uidx on public.categories(restaurant_id,short_code) where short_code is not null;
create unique index if not exists products_restaurant_short_code_uidx on public.products(restaurant_id,short_code) where short_code is not null;

create or replace function public.assign_menu_short_code() returns trigger language plpgsql set search_path=public as $$
declare candidate text;
begin
  if new.short_code is null then
    loop
      candidate := lpad((floor(random()*1000000))::int::text,6,'0');
      if tg_table_name='categories' then
        exit when not exists(select 1 from public.categories where restaurant_id=new.restaurant_id and short_code=candidate);
      else
        exit when not exists(select 1 from public.products where restaurant_id=new.restaurant_id and short_code=candidate);
      end if;
    end loop;
    new.short_code := candidate;
  end if;
  return new;
end $$;
create trigger categories_short_code before insert or update on public.categories for each row execute function public.assign_menu_short_code();
create trigger products_short_code before insert or update on public.products for each row execute function public.assign_menu_short_code();
update public.categories set short_code=null where short_code is null;
update public.products set short_code=null where short_code is null;

create or replace function public.place_order(rid uuid, items jsonb, kind text default 'takeaway', pay_method text default 'cash_at_restaurant') returns uuid language plpgsql security definer set search_path=public as $$
declare oid uuid; item jsonb; p public.products; q int; subtotal numeric(10,2):=0;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if kind not in ('dine_in','takeaway','delivery') then raise exception 'invalid order type'; end if;
  if pay_method not in ('cash_on_delivery','cash_at_restaurant','online') then raise exception 'invalid payment method'; end if;
  if not exists(select 1 from public.restaurants where id=rid and status='active') then raise exception 'restaurant is unavailable'; end if;
  if jsonb_typeof(items)<>'array' or jsonb_array_length(items)=0 then raise exception 'order must contain items'; end if;
  for item in select * from jsonb_array_elements(items) loop
    q:=(item->>'quantity')::int; if q<1 or q>50 then raise exception 'invalid quantity'; end if;
    select * into p from public.products where id=(item->>'product_id')::uuid and restaurant_id=rid and available for update;
    if not found then raise exception 'menu item is unavailable'; end if;
    if p.quantity<q then raise exception 'Only % of % remain',p.quantity,p.name; end if;
    subtotal:=subtotal+p.price*q;
  end loop;
  insert into public.orders(restaurant_id,customer_id,order_type,status,subtotal,total) values(rid,auth.uid(),kind,'pending',subtotal,subtotal) returning id into oid;
  for item in select * from jsonb_array_elements(items) loop
    q:=(item->>'quantity')::int;
    update public.products set quantity=quantity-q,available=(quantity-q)>0 where id=(item->>'product_id')::uuid and restaurant_id=rid and quantity>=q returning * into p;
    if not found then raise exception 'not enough stock for this item'; end if;
    insert into public.order_items(restaurant_id,order_id,product_id,name_snapshot,quantity,unit_price,variant) values(rid,oid,p.id,p.name,q,p.price,nullif(item->>'variant',''));
  end loop;
  insert into public.payments(restaurant_id,order_id,method,status,amount) values(rid,oid,pay_method,'pending',subtotal);
  return oid;
end $$;

create or replace function public.place_table_order(rid uuid,tid uuid,items jsonb,guest_name text default null,notes text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare order_id uuid; item jsonb; product public.products; qty int; subtotal numeric(10,2):=0;
begin
  if not exists(select 1 from public.restaurants r join public.restaurant_tables t on t.restaurant_id=r.id where r.id=rid and r.status='active' and t.id=tid) then raise exception 'table QR is invalid or restaurant is unavailable'; end if;
  if jsonb_typeof(items)<>'array' or jsonb_array_length(items)=0 then raise exception 'order must contain items'; end if;
  if jsonb_array_length(items)>30 then raise exception 'too many items in one order'; end if;
  for item in select * from jsonb_array_elements(items) loop
    qty:=(item->>'quantity')::int; if qty<1 or qty>50 then raise exception 'item quantity must be between 1 and 50'; end if;
    select * into product from public.products where id=(item->>'product_id')::uuid and restaurant_id=rid and available for update;
    if not found then raise exception 'menu item is unavailable'; end if;
    if product.quantity<qty then raise exception 'Only % of % remain',product.quantity,product.name; end if;
    subtotal:=subtotal+product.price*qty;
  end loop;
  insert into public.orders(restaurant_id,customer_id,created_by,table_id,guest_name,order_type,status,subtotal,total,notes) values(rid,auth.uid(),auth.uid(),tid,nullif(trim(guest_name),''),'dine_in','pending',subtotal,subtotal,nullif(trim(notes),'')) returning id into order_id;
  for item in select * from jsonb_array_elements(items) loop
    qty:=(item->>'quantity')::int;
    update public.products set quantity=quantity-qty,available=(quantity-qty)>0 where id=(item->>'product_id')::uuid and restaurant_id=rid and quantity>=qty returning * into product;
    if not found then raise exception 'not enough stock for this item'; end if;
    insert into public.order_items(restaurant_id,order_id,product_id,name_snapshot,quantity,unit_price,variant) values(rid,order_id,product.id,product.name,qty,product.price,null);
  end loop;
  insert into public.payments(restaurant_id,order_id,method,status,amount) values(rid,order_id,'cash_at_restaurant','pending',subtotal);
  return order_id;
end $$;
revoke all on function public.place_table_order(uuid,uuid,jsonb,text,text) from public;
grant execute on function public.place_table_order(uuid,uuid,jsonb,text,text) to anon,authenticated;
commit;
