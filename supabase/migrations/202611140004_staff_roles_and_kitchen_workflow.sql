-- Staff membership management and a guarded kitchen order workflow.
begin;

drop policy if exists "team managers read memberships" on public.restaurant_memberships;
create policy "team managers read memberships" on public.restaurant_memberships
  for select to authenticated
  using(public.has_restaurant_access(restaurant_id,array['restaurant_owner','manager']::public.member_role[]));

create or replace function public.restaurant_team_directory(rid uuid)
returns table(user_id uuid,email text,full_name text,role public.member_role,active boolean,created_at timestamptz)
language plpgsql stable security definer set search_path=public,auth
as $$
begin
  if not public.has_restaurant_access(rid,array['restaurant_owner','manager']::public.member_role[]) then
    raise exception 'restaurant manager access required';
  end if;
  return query
    select m.user_id,u.email,coalesce(nullif(p.full_name,''),u.raw_user_meta_data->>'full_name',''),m.role,m.active,m.created_at
    from public.restaurant_memberships m
    join auth.users u on u.id=m.user_id
    left join public.profiles p on p.id=m.user_id
    where m.restaurant_id=rid
    order by m.created_at;
end;
$$;
revoke all on function public.restaurant_team_directory(uuid) from public;
grant execute on function public.restaurant_team_directory(uuid) to authenticated;

create or replace function public.add_restaurant_staff(rid uuid,staff_email text,staff_role public.member_role)
returns uuid
language plpgsql security definer set search_path=public,auth
as $$
declare target_user_id uuid; normalized_email text;
begin
  if not public.has_restaurant_access(rid,array['restaurant_owner','manager']::public.member_role[]) then
    raise exception 'restaurant manager access required';
  end if;
  if staff_role not in ('manager','kitchen_staff','waiter') then
    raise exception 'choose manager, kitchen staff, or waiter';
  end if;
  if staff_role='manager' and not public.has_restaurant_access(rid,array['restaurant_owner']::public.member_role[]) then
    raise exception 'only the restaurant owner can assign the manager role';
  end if;
  normalized_email:=lower(trim(staff_email));
  if normalized_email='' then raise exception 'staff email is required'; end if;
  select u.id into target_user_id from auth.users u where lower(u.email)=normalized_email limit 1;
  if target_user_id is null then
    raise exception 'no Restora account found for this email; ask the staff member to register first';
  end if;
  if target_user_id=auth.uid() then raise exception 'you cannot change your own restaurant role'; end if;
  if exists(select 1 from public.restaurant_memberships m where m.restaurant_id=rid and m.user_id=target_user_id and m.role='restaurant_owner') then
    raise exception 'the restaurant owner role cannot be changed here';
  end if;
  insert into public.restaurant_memberships(restaurant_id,user_id,role,active)
  values(rid,target_user_id,staff_role,true)
  on conflict(restaurant_id,user_id) do update set role=excluded.role,active=true,updated_at=now();
  return target_user_id;
end;
$$;
revoke all on function public.add_restaurant_staff(uuid,text,public.member_role) from public;
grant execute on function public.add_restaurant_staff(uuid,text,public.member_role) to authenticated;

create or replace function public.forward_order_to_kitchen(order_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare order_row public.orders;
begin
  select * into order_row from public.orders o where o.id=order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not public.has_restaurant_access(order_row.restaurant_id,array['restaurant_owner','manager']::public.member_role[]) then
    raise exception 'restaurant manager access required';
  end if;
  if order_row.status<>'pending' then raise exception 'only pending orders can be sent to the kitchen'; end if;
  update public.orders set status='confirmed' where id=order_id;
  return true;
end;
$$;
revoke all on function public.forward_order_to_kitchen(uuid) from public;
grant execute on function public.forward_order_to_kitchen(uuid) to authenticated;

create or replace function public.update_kitchen_order_status(order_id uuid,next_status public.order_status)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare order_row public.orders;
begin
  select * into order_row from public.orders o where o.id=order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not public.has_restaurant_access(order_row.restaurant_id,array['kitchen_staff']::public.member_role[]) then
    raise exception 'kitchen staff access required';
  end if;
  if not ((order_row.status='confirmed' and next_status='preparing') or (order_row.status='preparing' and next_status='ready')) then
    raise exception 'invalid kitchen status transition';
  end if;
  update public.orders set status=next_status where id=order_id;
  return true;
end;
$$;
revoke all on function public.update_kitchen_order_status(uuid,public.order_status) from public;
grant execute on function public.update_kitchen_order_status(uuid,public.order_status) to authenticated;

-- Kitchen staff advance tickets only through the guarded RPC above.
drop policy if exists "staff update orders" on public.orders;
create policy "restaurant and waiter update orders" on public.orders
  for update to authenticated
  using(public.has_restaurant_access(restaurant_id,array['restaurant_owner','manager','waiter']::public.member_role[]))
  with check(public.has_restaurant_access(restaurant_id,array['restaurant_owner','manager','waiter']::public.member_role[]));

commit;
