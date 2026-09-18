begin;

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists announcement_reads_user_idx
  on public.announcement_reads(user_id, announcement_id, read_at);

alter table public.announcement_reads enable row level security;

revoke all on table public.announcement_reads from anon, authenticated;
grant select, insert, update, delete on table public.announcement_reads to service_role;

create or replace function private.announcement_targeted_to_role(
  p_role public.app_role,
  p_audience text,
  p_is_published boolean
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    coalesce(p_is_published, false)
    and (
      p_role = 'admin'::public.app_role
      or (p_role = 'teacher'::public.app_role and p_audience in ('all', 'teacher'))
      or (p_role = 'parent'::public.app_role and p_audience in ('all', 'parent'))
    );
$$;

revoke all on function private.announcement_targeted_to_role(public.app_role, text, boolean)
  from public, anon, authenticated;

create or replace function public.announcement_unread_count()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.app_role := private.current_user_role();
  v_count bigint;
begin
  if v_user_id is null or v_role is null then
    raise exception 'Sesi pengguna tidak valid.' using errcode = '42501';
  end if;

  select count(*)
  into v_count
  from public.announcements a
  where private.announcement_targeted_to_role(v_role, a.audience, a.is_published)
    and not exists (
      select 1
      from public.announcement_reads r
      where r.announcement_id = a.id
        and r.user_id = v_user_id
        and r.read_at >= a.updated_at
    );

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.announcement_unread_count() from public, anon;
grant execute on function public.announcement_unread_count() to authenticated;

create or replace function public.mark_announcements_read(
  p_announcement_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.app_role := private.current_user_role();
  v_marked integer := 0;
  v_count integer := coalesce(cardinality(p_announcement_ids), 0);
begin
  if v_user_id is null or v_role is null then
    raise exception 'Sesi pengguna tidak valid.' using errcode = '42501';
  end if;

  if v_count = 0 then
    return 0;
  end if;

  if v_count > 200 then
    raise exception 'Terlalu banyak pengumuman dalam satu permintaan.' using errcode = '22023';
  end if;

  with requested as (
    select distinct unnest(p_announcement_ids) as announcement_id
  ),
  visible as (
    select a.id
    from public.announcements a
    join requested req on req.announcement_id = a.id
    where private.announcement_targeted_to_role(v_role, a.audience, a.is_published)
  ),
  upserted as (
    insert into public.announcement_reads (announcement_id, user_id, read_at)
    select v.id, v_user_id, now()
    from visible v
    on conflict (announcement_id, user_id)
    do update set read_at = excluded.read_at
    returning 1
  )
  select count(*) into v_marked from upserted;

  return coalesce(v_marked, 0);
end;
$$;

revoke all on function public.mark_announcements_read(uuid[]) from public, anon;
grant execute on function public.mark_announcements_read(uuid[]) to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'announcements'
  ) then
    execute 'alter publication supabase_realtime add table public.announcements';
  end if;
end;
$$;

commit;
