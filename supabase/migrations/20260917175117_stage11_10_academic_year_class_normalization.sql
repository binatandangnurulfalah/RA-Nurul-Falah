begin;

-- Stage 11.10: normalize academic years and class references while keeping
-- legacy text columns as compatibility mirrors during the rollout.

create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_years_label_format_check check (label ~ '^[0-9]{4}/[0-9]{4}$'),
  constraint academic_years_year_sequence_check check (
    substring(label from 1 for 4)::integer + 1 = substring(label from 6 for 4)::integer
  ),
  constraint academic_years_date_order_check check (end_date > start_date)
);

create unique index if not exists academic_years_one_current_idx
  on public.academic_years (is_current)
  where is_current = true;

alter table public.academic_years enable row level security;

drop policy if exists "authenticated read academic years" on public.academic_years;
create policy "authenticated read academic years" on public.academic_years
for select to authenticated using (true);

drop policy if exists "admin insert academic years" on public.academic_years;
create policy "admin insert academic years" on public.academic_years
for insert to authenticated
with check ((select private.current_user_role()) = 'admin'::public.app_role);

drop policy if exists "admin update academic years" on public.academic_years;
create policy "admin update academic years" on public.academic_years
for update to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role)
with check ((select private.current_user_role()) = 'admin'::public.app_role);

drop policy if exists "admin delete academic years" on public.academic_years;
create policy "admin delete academic years" on public.academic_years
for delete to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role);

grant select, insert, update, delete on public.academic_years to authenticated;

drop trigger if exists academic_years_touch_updated_at on public.academic_years;
create trigger academic_years_touch_updated_at
before update on public.academic_years
for each row execute function public.touch_updated_at();

-- Seed every valid legacy year before adding required foreign keys.
with legacy_years as (
  select btrim(academic_year) as label from public.students where academic_year is not null
  union
  select btrim(academic_year) from public.school_classes where academic_year is not null
  union
  select btrim(academic_year) from public.school_schedules where academic_year is not null
  union
  select btrim(academic_year) from public.school_settings where academic_year is not null
), valid_years as (
  select label
  from legacy_years
  where label ~ '^[0-9]{4}/[0-9]{4}$'
    and substring(label from 1 for 4)::integer + 1 = substring(label from 6 for 4)::integer
)
insert into public.academic_years (label, start_date, end_date, is_current, is_active, created_by)
select
  label,
  make_date(substring(label from 1 for 4)::integer, 7, 1),
  make_date(substring(label from 6 for 4)::integer, 6, 30),
  false,
  true,
  null
from valid_years
on conflict (label) do nothing;

-- Ensure there is always one normalized current year for legacy databases.
insert into public.academic_years (label, start_date, end_date, is_current, is_active, created_by)
select
  '2026/2027',
  date '2026-07-01',
  date '2027-06-30',
  false,
  true,
  null
where not exists (select 1 from public.academic_years)
on conflict (label) do nothing;

update public.academic_years
set is_current = false
where is_current = true;

update public.academic_years ay
set is_current = true
where ay.label = coalesce(
  (select nullif(btrim(s.academic_year), '') from public.school_settings s where s.id = 1),
  (select label from public.academic_years order by start_date desc limit 1)
);

-- Add normalized references. Legacy text fields are retained as mirrors.
alter table public.school_classes
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete restrict;

alter table public.students
  add column if not exists class_id uuid references public.school_classes(id) on delete set null,
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete restrict;

alter table public.school_schedules
  add column if not exists class_id uuid references public.school_classes(id) on delete cascade,
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete restrict;

alter table public.school_settings
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete restrict;

update public.school_classes c
set academic_year_id = ay.id,
    academic_year = ay.label
from public.academic_years ay
where ay.label = btrim(c.academic_year)
  and c.academic_year_id is null;

alter table public.school_classes drop constraint if exists school_classes_name_key;
alter table public.school_classes drop constraint if exists school_classes_academic_year_name_key;
alter table public.school_classes
  add constraint school_classes_academic_year_name_key unique (academic_year_id, name);

-- Materialize missing class rows from legacy student/schedule text before backfilling class IDs.
with legacy_classes as (
  select btrim(s.class_name) as name, btrim(s.academic_year) as academic_year
  from public.students s
  where nullif(btrim(s.class_name), '') is not null
  union
  select btrim(sc.class_name), btrim(sc.academic_year)
  from public.school_schedules sc
  where nullif(btrim(sc.class_name), '') is not null
)
insert into public.school_classes (name, academic_year_id, academic_year, is_active, created_by)
select lc.name, ay.id, ay.label, true, null
from legacy_classes lc
join public.academic_years ay on ay.label = lc.academic_year
on conflict (academic_year_id, name) do nothing;

update public.students s
set academic_year_id = ay.id,
    academic_year = ay.label
from public.academic_years ay
where ay.label = btrim(s.academic_year)
  and s.academic_year_id is null;

update public.students s
set class_id = c.id,
    class_name = c.name,
    academic_year_id = c.academic_year_id,
    academic_year = c.academic_year
from public.school_classes c
where nullif(btrim(s.class_name), '') is not null
  and c.name = btrim(s.class_name)
  and c.academic_year_id = s.academic_year_id
  and s.class_id is null;

update public.school_schedules sc
set class_id = c.id,
    academic_year_id = c.academic_year_id,
    class_name = c.name,
    academic_year = c.academic_year
from public.school_classes c
join public.academic_years ay on ay.id = c.academic_year_id
where c.name = btrim(sc.class_name)
  and ay.label = btrim(sc.academic_year)
  and sc.class_id is null;

update public.school_settings ss
set academic_year_id = ay.id,
    academic_year = ay.label
from public.academic_years ay
where ay.label = btrim(ss.academic_year)
  and ss.academic_year_id is null;

-- All production rows have a year; enforce it after backfill.
alter table public.school_classes alter column academic_year_id set not null;
alter table public.students alter column academic_year_id set not null;
alter table public.school_schedules alter column class_id set not null;
alter table public.school_schedules alter column academic_year_id set not null;
alter table public.school_settings alter column academic_year_id set not null;

create index if not exists students_class_id_idx on public.students(class_id);
create index if not exists students_academic_year_id_idx on public.students(academic_year_id);
create index if not exists school_classes_academic_year_id_idx on public.school_classes(academic_year_id);
create index if not exists school_schedules_class_id_idx on public.school_schedules(class_id);
create index if not exists school_schedules_academic_year_id_idx on public.school_schedules(academic_year_id);

alter table public.school_schedules
  drop constraint if exists school_schedules_class_name_day_of_week_start_time_academic_key;
alter table public.school_schedules
  drop constraint if exists school_schedules_class_slot_key;
alter table public.school_schedules
  add constraint school_schedules_class_slot_key unique (class_id, day_of_week, start_time);

-- Compatibility mirrors: normalized IDs are authoritative, but legacy text writes
-- continue to resolve safely while older frontend bundles are still cached.
create or replace function public.sync_school_class_academic_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year_id uuid;
  v_label text;
begin
  if tg_op = 'UPDATE'
     and new.academic_year is distinct from old.academic_year
     and new.academic_year_id is not distinct from old.academic_year_id then
    select ay.id, ay.label into v_year_id, v_label
    from public.academic_years ay
    where ay.label = nullif(btrim(new.academic_year), '');
  elsif new.academic_year_id is not null then
    select ay.id, ay.label into v_year_id, v_label
    from public.academic_years ay
    where ay.id = new.academic_year_id;
  else
    select ay.id, ay.label into v_year_id, v_label
    from public.academic_years ay
    where ay.label = nullif(btrim(new.academic_year), '');
  end if;

  if v_year_id is null then
    raise exception 'Tahun ajaran tidak ditemukan.' using errcode = '23503';
  end if;

  new.academic_year_id := v_year_id;
  new.academic_year := v_label;
  return new;
end;
$$;

create or replace function public.sync_student_academic_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year_id uuid;
  v_year_label text;
  v_class_id uuid;
  v_class_name text;
  v_use_legacy boolean := false;
begin
  if tg_op = 'INSERT' then
    v_use_legacy := new.class_id is null;
  else
    v_use_legacy := new.class_id is not distinct from old.class_id
      and (
        new.class_name is distinct from old.class_name
        or new.academic_year is distinct from old.academic_year
      );
  end if;

  if v_use_legacy then
    if new.academic_year_id is not null
       and (tg_op = 'INSERT' or new.academic_year is not distinct from old.academic_year) then
      select ay.id, ay.label into v_year_id, v_year_label
      from public.academic_years ay where ay.id = new.academic_year_id;
    else
      select ay.id, ay.label into v_year_id, v_year_label
      from public.academic_years ay
      where ay.label = nullif(btrim(new.academic_year), '');
    end if;

    if v_year_id is null then
      select ay.id, ay.label into v_year_id, v_year_label
      from public.academic_years ay where ay.is_current = true;
    end if;

    if nullif(btrim(coalesce(new.class_name, '')), '') is not null then
      select c.id, c.name into v_class_id, v_class_name
      from public.school_classes c
      where c.academic_year_id = v_year_id
        and c.name = btrim(new.class_name);
      if v_class_id is null then
        raise exception 'Kelas tidak ditemukan pada tahun ajaran yang dipilih.' using errcode = '23503';
      end if;
    end if;
  elsif new.class_id is not null then
    select c.id, c.name, ay.id, ay.label
      into v_class_id, v_class_name, v_year_id, v_year_label
    from public.school_classes c
    join public.academic_years ay on ay.id = c.academic_year_id
    where c.id = new.class_id;
    if v_class_id is null then
      raise exception 'Kelas tidak ditemukan.' using errcode = '23503';
    end if;
  else
    if new.academic_year_id is not null then
      select ay.id, ay.label into v_year_id, v_year_label
      from public.academic_years ay where ay.id = new.academic_year_id;
    else
      select ay.id, ay.label into v_year_id, v_year_label
      from public.academic_years ay
      where ay.label = nullif(btrim(new.academic_year), '');
    end if;
    if v_year_id is null then
      select ay.id, ay.label into v_year_id, v_year_label
      from public.academic_years ay where ay.is_current = true;
    end if;
  end if;

  if v_year_id is null then
    raise exception 'Tahun ajaran aktif tidak ditemukan.' using errcode = '23503';
  end if;

  new.class_id := v_class_id;
  new.class_name := v_class_name;
  new.academic_year_id := v_year_id;
  new.academic_year := v_year_label;
  return new;
end;
$$;

create or replace function public.sync_schedule_academic_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
  v_class_name text;
  v_year_id uuid;
  v_year_label text;
  v_use_legacy boolean := false;
begin
  if tg_op = 'INSERT' then
    v_use_legacy := new.class_id is null;
  else
    v_use_legacy := new.class_id is not distinct from old.class_id
      and (
        new.class_name is distinct from old.class_name
        or new.academic_year is distinct from old.academic_year
      );
  end if;

  if v_use_legacy then
    if new.academic_year_id is not null
       and (tg_op = 'INSERT' or new.academic_year is not distinct from old.academic_year) then
      v_year_id := new.academic_year_id;
    else
      select ay.id into v_year_id
      from public.academic_years ay
      where ay.label = nullif(btrim(new.academic_year), '');
    end if;

    select c.id, c.name, ay.id, ay.label
      into v_class_id, v_class_name, v_year_id, v_year_label
    from public.school_classes c
    join public.academic_years ay on ay.id = c.academic_year_id
    where c.name = btrim(new.class_name)
      and c.academic_year_id = v_year_id;
  else
    select c.id, c.name, ay.id, ay.label
      into v_class_id, v_class_name, v_year_id, v_year_label
    from public.school_classes c
    join public.academic_years ay on ay.id = c.academic_year_id
    where c.id = new.class_id;
  end if;

  if v_class_id is null then
    raise exception 'Kelas jadwal tidak ditemukan.' using errcode = '23503';
  end if;

  new.class_id := v_class_id;
  new.class_name := v_class_name;
  new.academic_year_id := v_year_id;
  new.academic_year := v_year_label;
  return new;
end;
$$;

create or replace function public.sync_school_settings_academic_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year_id uuid;
  v_label text;
begin
  if tg_op = 'UPDATE'
     and new.academic_year is distinct from old.academic_year
     and new.academic_year_id is not distinct from old.academic_year_id then
    select ay.id, ay.label into v_year_id, v_label
    from public.academic_years ay
    where ay.label = nullif(btrim(new.academic_year), '');
  else
    select ay.id, ay.label into v_year_id, v_label
    from public.academic_years ay
    where ay.id = new.academic_year_id;
  end if;

  if v_year_id is null then
    raise exception 'Tahun ajaran sekolah tidak ditemukan.' using errcode = '23503';
  end if;

  new.academic_year_id := v_year_id;
  new.academic_year := v_label;
  return new;
end;
$$;

drop trigger if exists school_classes_sync_academic_refs on public.school_classes;
create trigger school_classes_sync_academic_refs
before insert or update of academic_year_id, academic_year on public.school_classes
for each row execute function public.sync_school_class_academic_refs();

drop trigger if exists students_sync_academic_refs on public.students;
create trigger students_sync_academic_refs
before insert or update of class_id, academic_year_id, class_name, academic_year on public.students
for each row execute function public.sync_student_academic_refs();

drop trigger if exists school_schedules_sync_academic_refs on public.school_schedules;
create trigger school_schedules_sync_academic_refs
before insert or update of class_id, academic_year_id, class_name, academic_year on public.school_schedules
for each row execute function public.sync_schedule_academic_refs();

drop trigger if exists school_settings_sync_academic_refs on public.school_settings;
create trigger school_settings_sync_academic_refs
before insert or update of academic_year_id, academic_year on public.school_settings
for each row execute function public.sync_school_settings_academic_refs();

-- Keep compatibility text mirrors updated when canonical labels/names are renamed.
create or replace function public.sync_school_class_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.name is distinct from new.name then
    update public.students set class_name = new.name where class_id = new.id;
    update public.school_schedules set class_name = new.name where class_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.sync_academic_year_label()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.label is distinct from new.label then
    update public.school_classes set academic_year = new.label where academic_year_id = new.id;
    update public.students set academic_year = new.label where academic_year_id = new.id;
    update public.school_schedules set academic_year = new.label where academic_year_id = new.id;
    update public.school_settings set academic_year = new.label where academic_year_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists academic_years_sync_label on public.academic_years;
create trigger academic_years_sync_label
after update of label on public.academic_years
for each row execute function public.sync_academic_year_label();

create or replace function public.cleanup_school_class()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.students where class_id = old.id) then
    raise exception 'Kelas masih memiliki murid dan tidak dapat dihapus.';
  end if;
  return old;
end;
$$;

-- ID-based authorization becomes canonical. Keep the text helper as a legacy wrapper.
create or replace function private.teacher_can_access_class_id(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.school_classes c
    join public.teacher_class_assignments tca on tca.class_id = c.id
    join public.teacher_profiles tp on tp.id = tca.teacher_profile_id
    where c.id = target_class_id
      and c.is_active = true
      and tp.teacher_user_id = (select auth.uid())
  );
$$;

create or replace function private.teacher_can_access_class(target_class_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.school_classes c
    where c.name = target_class_name
      and (select private.teacher_can_access_class_id(c.id))
  );
$$;

create or replace function private.teacher_can_access_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.students s
    where s.id = target_student_id
      and s.class_id is not null
      and (select private.teacher_can_access_class_id(s.class_id))
  );
$$;

revoke all on function private.teacher_can_access_class_id(uuid) from public;
revoke all on function private.teacher_can_access_class(text) from public;
revoke all on function private.teacher_can_access_student(uuid) from public;
grant execute on function private.teacher_can_access_class_id(uuid) to authenticated;
grant execute on function private.teacher_can_access_class(text) to authenticated;
grant execute on function private.teacher_can_access_student(uuid) to authenticated;

-- Rebind RLS to normalized class IDs.
drop policy if exists "role based class access" on public.school_classes;
create policy "role based class access" on public.school_classes for select to authenticated using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and (select private.teacher_can_access_class_id(school_classes.id))
  )
  or exists (
    select 1
    from public.students s
    join public.student_guardians sg on sg.student_id = s.id
    where sg.guardian_user_id = (select auth.uid())
      and s.class_id = school_classes.id
      and s.is_active = true
  )
);

drop policy if exists "staff create students" on public.students;
create policy "staff create students" on public.students for insert to authenticated with check (
  created_by = (select auth.uid()) and (
    (select private.current_user_role()) = 'admin'::public.app_role
    or (
      (select private.current_user_role()) = 'teacher'::public.app_role
      and class_id is not null
      and (select private.teacher_can_access_class_id(class_id))
    )
  )
);

drop policy if exists "staff update students" on public.students;
create policy "staff update students" on public.students for update to authenticated
using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and (select private.teacher_can_access_student(students.id))
  )
)
with check (
  (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and class_id is not null
    and (select private.teacher_can_access_class_id(class_id))
  )
);

drop policy if exists "role based schedule access" on public.school_schedules;
create policy "role based schedule access" on public.school_schedules for select to authenticated using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and (select private.teacher_can_access_class_id(school_schedules.class_id))
  )
  or exists (
    select 1
    from public.students s
    join public.student_guardians sg on sg.student_id = s.id
    where sg.guardian_user_id = (select auth.uid())
      and s.class_id = school_schedules.class_id
      and s.is_active = true
  )
);

drop policy if exists "staff create schedules" on public.school_schedules;
create policy "staff create schedules" on public.school_schedules for insert to authenticated with check (
  created_by = (select auth.uid()) and (
    (select private.current_user_role()) = 'admin'::public.app_role
    or (
      (select private.current_user_role()) = 'teacher'::public.app_role
      and (select private.teacher_can_access_class_id(school_schedules.class_id))
    )
  )
);

drop policy if exists "staff update schedules" on public.school_schedules;
create policy "staff update schedules" on public.school_schedules for update to authenticated
using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and (select private.teacher_can_access_class_id(school_schedules.class_id))
  )
)
with check (
  (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and (select private.teacher_can_access_class_id(school_schedules.class_id))
  )
);

drop policy if exists "staff delete schedules" on public.school_schedules;
create policy "staff delete schedules" on public.school_schedules for delete to authenticated using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and (select private.teacher_can_access_class_id(school_schedules.class_id))
  )
);

-- Existing RPC signatures are retained so deployed/cached clients remain compatible.
create or replace function public.save_class_with_assignments(
  p_class_id uuid default null,
  p_name text default '',
  p_academic_year text default '',
  p_is_active boolean default true,
  p_teacher_profile_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_class_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_academic_year text := btrim(coalesce(p_academic_year, ''));
  v_academic_year_id uuid;
  v_teacher_profile_ids uuid[] := coalesce(p_teacher_profile_ids, '{}'::uuid[]);
  v_teacher_name text;
  v_requested_count integer;
  v_distinct_count integer;
  v_found_count integer;
begin
  if (select private.current_user_role()) is distinct from 'admin'::public.app_role then
    raise exception 'Hanya Admin yang dapat mengelola kelas.' using errcode = '42501';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Nama kelas harus terdiri dari 2-80 karakter.' using errcode = '22023';
  end if;

  select ay.id, ay.label into v_academic_year_id, v_academic_year
  from public.academic_years ay
  where ay.label = v_academic_year;

  if v_academic_year_id is null then
    raise exception 'Tahun ajaran tidak ditemukan.' using errcode = '23503';
  end if;

  if exists (select 1 from unnest(v_teacher_profile_ids) as teacher_id where teacher_id is null) then
    raise exception 'Daftar Guru tidak valid.' using errcode = '22023';
  end if;

  select count(*)::integer, count(distinct teacher_id)::integer
    into v_requested_count, v_distinct_count
  from unnest(v_teacher_profile_ids) as teacher_id;

  if v_requested_count <> v_distinct_count then
    raise exception 'Guru yang sama tidak boleh dipilih lebih dari satu kali.' using errcode = '22023';
  end if;

  select count(*)::integer,
         string_agg(tp.full_name, ', ' order by tp.full_name)
    into v_found_count, v_teacher_name
  from public.teacher_profiles tp
  where tp.id = any(v_teacher_profile_ids);

  if v_found_count <> v_requested_count then
    raise exception 'Satu atau lebih data Guru tidak ditemukan.' using errcode = '23503';
  end if;

  if p_class_id is null then
    insert into public.school_classes (
      name, teacher_name, academic_year_id, academic_year, is_active, created_by
    ) values (
      v_name, v_teacher_name, v_academic_year_id, v_academic_year, coalesce(p_is_active, true), auth.uid()
    ) returning id into v_class_id;
  else
    update public.school_classes
       set name = v_name,
           teacher_name = v_teacher_name,
           academic_year_id = v_academic_year_id,
           academic_year = v_academic_year,
           is_active = coalesce(p_is_active, true)
     where id = p_class_id
     returning id into v_class_id;

    if v_class_id is null then
      raise exception 'Kelas tidak ditemukan.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.teacher_class_assignments where class_id = v_class_id;
  insert into public.teacher_class_assignments (class_id, teacher_profile_id)
  select v_class_id, teacher_id from unnest(v_teacher_profile_ids) as teacher_id;

  return v_class_id;
end;
$$;

create or replace function public.save_student_with_guardians(
  p_student_id uuid default null,
  p_full_name text default '',
  p_nik text default null,
  p_nis text default null,
  p_nisn text default null,
  p_gender text default null,
  p_birth_place text default null,
  p_birth_date date default null,
  p_class_name text default null,
  p_academic_year text default null,
  p_is_active boolean default true,
  p_guardian_user_ids uuid[] default '{}'::uuid[]
)
returns public.students
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
declare
  v_student public.students;
  v_guardian_ids uuid[] := coalesce(p_guardian_user_ids, '{}'::uuid[]);
  v_requested_guardians integer := 0;
  v_valid_guardians integer := 0;
  v_year_id uuid;
  v_year_label text;
  v_class_id uuid;
  v_class_name text;
begin
  if auth.uid() is null then
    raise exception 'Pengguna belum login.';
  end if;

  if coalesce(private.current_user_role()::text, '') not in ('admin', 'teacher') then
    raise exception 'Hanya Admin atau Guru yang dapat menyimpan data murid.';
  end if;

  if nullif(btrim(p_full_name), '') is null then
    raise exception 'Nama lengkap murid wajib diisi.';
  end if;

  if p_gender is not null and p_gender not in ('L', 'P') then
    raise exception 'Jenis kelamin tidak valid.';
  end if;

  if array_position(v_guardian_ids, null) is not null then
    raise exception 'Data wali tidak valid.';
  end if;

  select count(*) into v_requested_guardians
  from (select distinct guardian_id from unnest(v_guardian_ids) as guardian_id) guardian_ids;

  if v_requested_guardians > 10 then
    raise exception 'Maksimal 10 wali dapat dihubungkan ke satu murid.';
  end if;

  if v_requested_guardians > 0 then
    select count(*) into v_valid_guardians
    from public.user_profiles profile
    where profile.id = any(v_guardian_ids)
      and profile.role = 'parent'::public.app_role
      and profile.is_active = true;

    if v_valid_guardians <> v_requested_guardians then
      raise exception 'Salah satu akun wali tidak valid atau tidak aktif.';
    end if;
  end if;

  select ay.id, ay.label into v_year_id, v_year_label
  from public.academic_years ay
  where ay.label = nullif(btrim(coalesce(p_academic_year, '')), '');

  if v_year_id is null then
    select ay.id, ay.label into v_year_id, v_year_label
    from public.academic_years ay where ay.is_current = true;
  end if;

  if v_year_id is null then
    raise exception 'Tahun ajaran tidak ditemukan.' using errcode = '23503';
  end if;

  if nullif(btrim(coalesce(p_class_name, '')), '') is not null then
    select c.id, c.name into v_class_id, v_class_name
    from public.school_classes c
    where c.academic_year_id = v_year_id
      and c.name = btrim(p_class_name);

    if v_class_id is null then
      raise exception 'Kelas tidak ditemukan pada tahun ajaran yang dipilih.' using errcode = '23503';
    end if;
  end if;

  if p_student_id is null then
    insert into public.students (
      full_name, nik, nis, nisn, gender, birth_place, birth_date,
      class_id, class_name, academic_year_id, academic_year, is_active, created_by
    ) values (
      btrim(p_full_name),
      nullif(btrim(coalesce(p_nik, '')), ''),
      nullif(btrim(coalesce(p_nis, '')), ''),
      nullif(btrim(coalesce(p_nisn, '')), ''),
      p_gender,
      nullif(btrim(coalesce(p_birth_place, '')), ''),
      p_birth_date,
      v_class_id,
      v_class_name,
      v_year_id,
      v_year_label,
      coalesce(p_is_active, true),
      auth.uid()
    ) returning * into v_student;
  else
    update public.students
    set full_name = btrim(p_full_name),
        nik = nullif(btrim(coalesce(p_nik, '')), ''),
        nis = nullif(btrim(coalesce(p_nis, '')), ''),
        nisn = nullif(btrim(coalesce(p_nisn, '')), ''),
        gender = p_gender,
        birth_place = nullif(btrim(coalesce(p_birth_place, '')), ''),
        birth_date = p_birth_date,
        class_id = v_class_id,
        class_name = v_class_name,
        academic_year_id = v_year_id,
        academic_year = v_year_label,
        is_active = coalesce(p_is_active, true)
    where id = p_student_id
    returning * into v_student;

    if v_student.id is null then
      raise exception 'Data murid tidak ditemukan atau tidak dapat diakses.';
    end if;
  end if;

  delete from public.student_guardians
  where student_id = v_student.id
    and not (guardian_user_id = any(v_guardian_ids));

  insert into public.student_guardians (student_id, guardian_user_id, relationship)
  select v_student.id, guardian_id, 'Wali'
  from (select distinct guardian_id from unnest(v_guardian_ids) as guardian_id) guardian_ids
  on conflict (student_id, guardian_user_id) do nothing;

  return v_student;
end;
$$;

create or replace function public.save_academic_year(
  p_academic_year_id uuid default null,
  p_label text default '',
  p_is_current boolean default false,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_label text := btrim(coalesce(p_label, ''));
  v_start_year integer;
  v_end_year integer;
begin
  if (select private.current_user_role()) is distinct from 'admin'::public.app_role then
    raise exception 'Hanya Admin yang dapat mengelola tahun ajaran.' using errcode = '42501';
  end if;

  if v_label !~ '^[0-9]{4}/[0-9]{4}$' then
    raise exception 'Format tahun ajaran harus YYYY/YYYY.' using errcode = '22023';
  end if;

  v_start_year := substring(v_label from 1 for 4)::integer;
  v_end_year := substring(v_label from 6 for 4)::integer;
  if v_end_year <> v_start_year + 1 then
    raise exception 'Rentang tahun ajaran harus berurutan.' using errcode = '22023';
  end if;

  if coalesce(p_is_current, false) then
    update public.academic_years set is_current = false where is_current = true;
  end if;

  if p_academic_year_id is null then
    insert into public.academic_years (
      label, start_date, end_date, is_current, is_active, created_by
    ) values (
      v_label,
      make_date(v_start_year, 7, 1),
      make_date(v_end_year, 6, 30),
      coalesce(p_is_current, false),
      coalesce(p_is_active, true),
      auth.uid()
    ) returning id into v_id;
  else
    update public.academic_years
    set label = v_label,
        start_date = make_date(v_start_year, 7, 1),
        end_date = make_date(v_end_year, 6, 30),
        is_current = coalesce(p_is_current, false),
        is_active = coalesce(p_is_active, true)
    where id = p_academic_year_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Tahun ajaran tidak ditemukan.' using errcode = 'P0002';
    end if;
  end if;

  if coalesce(p_is_current, false) then
    update public.school_settings
    set academic_year_id = v_id,
        academic_year = v_label,
        updated_by = auth.uid()
    where id = 1;
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_academic_year(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.save_academic_year(uuid, text, boolean, boolean) to authenticated;

-- Prevent deleting the active/current year even before FK checks are considered.
create or replace function public.protect_current_academic_year()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_current then
    raise exception 'Tahun ajaran aktif tidak dapat dihapus.';
  end if;
  return old;
end;
$$;

drop trigger if exists academic_years_protect_current_delete on public.academic_years;
create trigger academic_years_protect_current_delete
before delete on public.academic_years
for each row execute function public.protect_current_academic_year();

revoke all on function public.sync_school_class_academic_refs() from public, anon, authenticated;
revoke all on function public.sync_student_academic_refs() from public, anon, authenticated;
revoke all on function public.sync_schedule_academic_refs() from public, anon, authenticated;
revoke all on function public.sync_school_settings_academic_refs() from public, anon, authenticated;
revoke all on function public.sync_academic_year_label() from public, anon, authenticated;
revoke all on function public.protect_current_academic_year() from public, anon, authenticated;

commit;
