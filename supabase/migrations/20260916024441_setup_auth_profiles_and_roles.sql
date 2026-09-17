create type public.app_role as enum ('admin', 'teacher', 'parent');

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role public.app_role;
begin
  requested_role := case
    when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin'::public.app_role
    when new.raw_app_meta_data ->> 'role' = 'teacher' then 'teacher'::public.app_role
    when new.raw_app_meta_data ->> 'role' = 'parent' then 'parent'::public.app_role
    else 'parent'::public.app_role
  end;

  insert into public.user_profiles (id, role, display_name)
  values (
    new.id,
    requested_role,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.user_profiles
  where id = auth.uid() and is_active = true;
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

create policy "users_can_read_own_profile"
on public.user_profiles
for select
to authenticated
using (id = auth.uid());

create policy "admins_can_read_all_profiles"
on public.user_profiles
for select
to authenticated
using (public.current_user_role() = 'admin'::public.app_role);

revoke insert, update, delete on public.user_profiles from anon, authenticated;
grant select on public.user_profiles to authenticated;