create table if not exists public.account_allowlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role public.app_role not null,
  display_name text,
  is_active boolean not null default true,
  used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_allowlist_email_lower_idx
  on public.account_allowlist (lower(email));

alter table public.account_allowlist enable row level security;

drop policy if exists admins_can_read_allowlist on public.account_allowlist;
create policy admins_can_read_allowlist
on public.account_allowlist
for select
to authenticated
using (public.current_user_role() = 'admin'::public.app_role);

drop policy if exists admins_can_insert_allowlist on public.account_allowlist;
create policy admins_can_insert_allowlist
on public.account_allowlist
for insert
to authenticated
with check (public.current_user_role() = 'admin'::public.app_role);

drop policy if exists admins_can_update_allowlist on public.account_allowlist;
create policy admins_can_update_allowlist
on public.account_allowlist
for update
to authenticated
using (public.current_user_role() = 'admin'::public.app_role)
with check (public.current_user_role() = 'admin'::public.app_role);

drop policy if exists admins_can_delete_allowlist on public.account_allowlist;
create policy admins_can_delete_allowlist
on public.account_allowlist
for delete
to authenticated
using (public.current_user_role() = 'admin'::public.app_role);

drop trigger if exists set_account_allowlist_updated_at on public.account_allowlist;
create trigger set_account_allowlist_updated_at
before update on public.account_allowlist
for each row execute function public.set_updated_at();

create or replace function public.guard_new_auth_user()
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

create or replace function public.handle_new_auth_user()
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

drop trigger if exists guard_new_auth_user on auth.users;
create trigger guard_new_auth_user
before insert on auth.users
for each row execute function public.guard_new_auth_user();

drop trigger if exists handle_new_auth_user on auth.users;
create trigger handle_new_auth_user
after insert on auth.users
for each row execute function public.handle_new_auth_user();