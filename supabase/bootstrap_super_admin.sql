-- Run in the Supabase SQL Editor after this email has registered in Restora
-- This only promotes an existing Auth user for the explicitly requested email.
do $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where lower(email) = lower('2k24.cs1o.2410668@gmail.com')
  limit 1;

  if target_user_id is null then
    raise exception 'No Auth user found for the requested super admin email. Sign up once, then run this script again.';
  end if;

  insert into public.super_admins(user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;
end
$$;
