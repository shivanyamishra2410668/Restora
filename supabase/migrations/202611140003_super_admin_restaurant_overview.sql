-- Give the explicitly provisioned platform admin a read-only overview of every
-- restaurant and its operational totals. The browser never receives table-wide
-- access to customer or payment records.
begin;

drop function if exists public.platform_restaurant_overview();
create function public.platform_restaurant_overview()
returns table (
  id uuid,
  name text,
  status text,
  email text,
  phone text,
  address text,
  cuisine_type text,
  description text,
  logo_url text,
  cover_url text,
  opening_hours jsonb,
  created_at timestamptz,
  owner_name text,
  owner_email text,
  application_status text,
  product_count bigint,
  order_count bigint,
  reservation_count bigint,
  inventory_count bigint,
  table_count bigint,
  member_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'super admin required';
  end if;

  return query
    select r.id, r.name, r.status::text, r.email, r.phone, r.address,
      r.cuisine_type, r.description, r.logo_url, r.cover_url, r.opening_hours,
      r.created_at, a.owner_name, a.email, a.status::text,
      (select count(*) from public.products p where p.restaurant_id = r.id),
      (select count(*) from public.orders o where o.restaurant_id = r.id),
      (select count(*) from public.reservations b where b.restaurant_id = r.id),
      (select count(*) from public.inventory_items i where i.restaurant_id = r.id),
      (select count(*) from public.restaurant_tables t where t.restaurant_id = r.id),
      (select count(*) from public.restaurant_memberships m where m.restaurant_id = r.id and m.active)
    from public.restaurants r
    left join public.restaurant_applications a on a.restaurant_id = r.id
    order by r.created_at desc;
end;
$$;

revoke all on function public.platform_restaurant_overview() from public;
grant execute on function public.platform_restaurant_overview() to authenticated;

commit;
