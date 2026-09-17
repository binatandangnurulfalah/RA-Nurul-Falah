create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_user_role()
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

grant execute on function private.current_user_role() to authenticated;
revoke all on function private.current_user_role() from public, anon;

create or replace function private.guard_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  approved boolean;
begin
  if new.email is null then
    raise exception 'Account creation requires an approved email address';
  end if;

  select exists (
    select 1
    from public.account_allowlist a
    where lower(a.email) = lower(new.email)
      and a.is_active = true
      and a.used_at is null
  ) into approved;

  if not approved then
    raise exception 'Account is not approved by RA Nurul Falah administrator';
  end if;

  return new;
end;
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  approved public.account_allowlist%rowtype;
begin
  select * into approved
  from public.account_allowlist
  where lower(email) = lower(new.email)
    and is_active = true
    and used_at is null
  for update;

  if approved.id is null then
    raise exception 'Approved account record not found';
  end if;

  insert into public.user_profiles (id, role, display_name, is_active)
  values (new.id, approved.role, approved.display_name, true)
  on conflict (id) do update
  set role = excluded.role,
      display_name = excluded.display_name,
      is_active = true,
      updated_at = now();

  update public.account_allowlist
  set used_at = now(), updated_at = now()
  where id = approved.id;

  return new;
end;
$$;

revoke all on function private.guard_new_auth_user() from public, anon, authenticated;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

drop policy if exists admins_can_read_all_profiles on public.user_profiles;
create policy admins_can_read_all_profiles
on public.user_profiles for select to authenticated
using (private.current_user_role() = 'admin'::public.app_role);

drop policy if exists admins_can_read_allowlist on public.account_allowlist;
create policy admins_can_read_allowlist
on public.account_allowlist for select to authenticated
using (private.current_user_role() = 'admin'::public.app_role);

drop policy if exists admins_can_insert_allowlist on public.account_allowlist;
create policy admins_can_insert_allowlist
on public.account_allowlist for insert to authenticated
with check (private.current_user_role() = 'admin'::public.app_role);

drop policy if exists admins_can_update_allowlist on public.account_allowlist;
create policy admins_can_update_allowlist
on public.account_allowlist for update to authenticated
using (private.current_user_role() = 'admin'::public.app_role)
with check (private.current_user_role() = 'admin'::public.app_role);

drop policy if exists admins_can_delete_allowlist on public.account_allowlist;
create policy admins_can_delete_allowlist
on public.account_allowlist for delete to authenticated
using (private.current_user_role() = 'admin'::public.app_role);

drop trigger if exists guard_new_auth_user on auth.users;
drop trigger if exists handle_new_auth_user on auth.users;
drop trigger if exists on_auth_user_created on auth.users;

create trigger guard_new_auth_user
before insert on auth.users
for each row execute function private.guard_new_auth_user();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

drop function if exists public.guard_new_auth_user();
drop function if exists public.handle_new_auth_user();
drop function if exists public.current_user_role();