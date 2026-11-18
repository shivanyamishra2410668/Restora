-- Keep the platform administrator limited to restaurant application review.
begin;

create or replace function public.has_restaurant_access(
  rid uuid,
  allowed public.member_role[] default null
) returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(
    select 1
    from public.restaurant_memberships m
    join public.restaurants r on r.id=m.restaurant_id
    where m.user_id=auth.uid()
      and m.restaurant_id=rid
      and m.active
      and r.status='active'
      and (allowed is null or m.role=any(allowed))
  )
$$;
revoke all on function public.has_restaurant_access(uuid,public.member_role[]) from public;
grant execute on function public.has_restaurant_access(uuid,public.member_role[]) to anon,authenticated;

drop policy if exists "profiles read self or admin" on public.profiles;
create policy "profiles read self" on public.profiles
  for select to authenticated using(id=auth.uid());

drop policy if exists "admin review application" on public.restaurant_applications;
-- Decisions are made only through review_restaurant_application(), which checks
-- super_admins and performs provisioning in one transaction.

drop policy if exists "members read own memberships" on public.restaurant_memberships;
create policy "members read own memberships" on public.restaurant_memberships
  for select to authenticated using(user_id=auth.uid());

drop policy if exists "subscription admin manage" on public.subscription_plans;
drop policy if exists "subscription admin manage rows" on public.subscriptions;

drop policy if exists "plans public active read" on public.subscription_plans;
create policy "plans public active read" on public.subscription_plans
  for select to anon,authenticated using(active);

drop policy if exists "audit admin read" on public.audit_logs;
create policy "audit owner read" on public.audit_logs
  for select to authenticated
  using(restaurant_id is not null and public.has_restaurant_access(restaurant_id,array['restaurant_owner']::public.member_role[]));

commit;
