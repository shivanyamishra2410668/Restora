begin;

alter table public.orders add column if not exists label text;
do $$begin
  if not exists (select 1 from pg_constraint where conname = 'orders_label_length_check' and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint orders_label_length_check check (label is null or char_length(label) <= 40);
  end if;
end$$;

create or replace function public.set_order_label(p_order_id uuid, p_label text)
returns text
language plpgsql security definer set search_path=public
as $$
declare order_row public.orders; clean_label text;
begin
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not public.has_restaurant_access(order_row.restaurant_id, array['restaurant_owner','manager','kitchen_staff']::public.member_role[]) then
    raise exception 'restaurant admin or kitchen access required';
  end if;
  clean_label := nullif(trim(p_label), '');
  if clean_label is not null and char_length(clean_label) > 40 then
    raise exception 'order labels must be 40 characters or fewer';
  end if;
  update public.orders set label = clean_label where id = p_order_id;
  return clean_label;
end;
$$;

revoke all on function public.set_order_label(uuid, text) from public;
grant execute on function public.set_order_label(uuid, text) to authenticated;

commit;
