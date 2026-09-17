alter table public.user_profiles add column if not exists phone text;
alter table public.user_profiles add column if not exists address text;
alter table public.user_profiles add column if not exists bio text;

drop policy if exists "users update own profile" on public.user_profiles;
create policy "users update own profile" on public.user_profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

grant update (display_name, phone, address, bio, updated_at) on public.user_profiles to authenticated;

create table if not exists public.school_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 80),
  teacher_name text,
  academic_year text not null default '2026/2027',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.school_classes enable row level security;
create policy "role based class access" on public.school_classes for select to authenticated using (
  (select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role)
  or exists (
    select 1 from public.students s
    join public.student_guardians sg on sg.student_id=s.id
    where sg.guardian_user_id=(select auth.uid()) and s.class_name=school_classes.name and s.is_active=true
  )
);
create policy "admin create classes" on public.school_classes for insert to authenticated with check (
  (select private.current_user_role())='admin'::public.app_role and created_by=(select auth.uid())
);
create policy "admin update classes" on public.school_classes for update to authenticated using (
  (select private.current_user_role())='admin'::public.app_role
) with check ((select private.current_user_role())='admin'::public.app_role);
create policy "admin delete classes" on public.school_classes for delete to authenticated using (
  (select private.current_user_role())='admin'::public.app_role
);
grant select,insert,update,delete on public.school_classes to authenticated;

insert into public.school_classes(name,teacher_name,academic_year,created_by)
select x.name,x.teacher_name,x.academic_year,auth.uid()
from (
  select distinct on (name) name,teacher_name,academic_year
  from (
    select trim(class_name) as name, null::text as teacher_name, coalesce(academic_year,'2026/2027') as academic_year
    from public.students where class_name is not null and trim(class_name)<>''
    union all
    select trim(class_name),teacher_name,academic_year from public.school_schedules where trim(class_name)<>''
  ) q
  where name is not null and name<>''
  order by name, teacher_name nulls last
) x
on conflict (name) do nothing;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 140),
  body text not null check (char_length(trim(body)) between 3 and 5000),
  audience text not null default 'all' check (audience in ('all','teacher','parent')),
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
create policy "role based announcement access" on public.announcements for select to authenticated using (
  (select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role)
  or (is_published=true and audience in ('all','parent'))
);
create policy "staff create announcements" on public.announcements for insert to authenticated with check (
  (select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role) and created_by=(select auth.uid())
);
create policy "staff update announcements" on public.announcements for update to authenticated using (
  (select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role)
) with check ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role));
create policy "staff delete announcements" on public.announcements for delete to authenticated using (
  (select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role)
);
grant select,insert,update,delete on public.announcements to authenticated;

create table if not exists public.school_settings (
  id smallint primary key default 1 check (id=1),
  school_name text not null default 'RA Nurul Falah',
  address text,
  phone text,
  email text,
  timezone text not null default 'Asia/Jakarta',
  late_cutoff time not null default '07:15',
  academic_year text not null default '2026/2027',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.school_settings enable row level security;
create policy "authenticated read school settings" on public.school_settings for select to authenticated using (true);
create policy "admin update school settings" on public.school_settings for update to authenticated using (
  (select private.current_user_role())='admin'::public.app_role
) with check ((select private.current_user_role())='admin'::public.app_role);
grant select,update on public.school_settings to authenticated;
insert into public.school_settings(id) values (1) on conflict (id) do nothing;

drop policy if exists "admin delete students" on public.students;
create policy "admin delete students" on public.students for delete to authenticated using (
  (select private.current_user_role())='admin'::public.app_role
);
grant delete on public.students to authenticated;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_touch_updated_at on public.user_profiles;
create trigger user_profiles_touch_updated_at before update on public.user_profiles for each row execute function public.touch_updated_at();
drop trigger if exists students_touch_updated_at on public.students;
create trigger students_touch_updated_at before update on public.students for each row execute function public.touch_updated_at();
drop trigger if exists school_schedules_touch_updated_at on public.school_schedules;
create trigger school_schedules_touch_updated_at before update on public.school_schedules for each row execute function public.touch_updated_at();
drop trigger if exists school_classes_touch_updated_at on public.school_classes;
create trigger school_classes_touch_updated_at before update on public.school_classes for each row execute function public.touch_updated_at();
drop trigger if exists announcements_touch_updated_at on public.announcements;
create trigger announcements_touch_updated_at before update on public.announcements for each row execute function public.touch_updated_at();
drop trigger if exists school_settings_touch_updated_at on public.school_settings;
create trigger school_settings_touch_updated_at before update on public.school_settings for each row execute function public.touch_updated_at();