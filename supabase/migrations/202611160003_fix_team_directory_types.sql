begin;

-- RETURN QUERY requires each selected expression to match the declared
-- RETURNS TABLE type exactly. auth.users.email is varchar in some Supabase
-- projects, so cast each selected field to the declared result type.
create or replace function public.restaurant_team_directory(rid uuid)
returns table(
  user_id uuid,
  email text,
  full_name text,
  role public.member_role,
  active boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public,auth
as $$
begin
  if not public.has_restaurant_access(rid,array['restaurant_owner','manager']::public.member_role[]) then
    raise exception 'restaurant manager access required';
  end if;

  return query
    select
      m.user_id::uuid,
      u.email::text,
      coalesce(nullif(p.full_name,''),u.raw_user_meta_data->>'full_name','')::text,
      m.role::public.member_role,
      m.active::boolean,
      m.created_at::timestamptz
    from public.restaurant_memberships m
    join auth.users u on u.id=m.user_id
    left join public.profiles p on p.id=m.user_id
    where m.restaurant_id=rid
    order by m.created_at;
end;
$$;

revoke all on function public.restaurant_team_directory(uuid) from public;
grant execute on function public.restaurant_team_directory(uuid) to authenticated;

commit;
