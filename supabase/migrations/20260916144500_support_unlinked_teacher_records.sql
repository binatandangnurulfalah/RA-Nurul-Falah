begin;

alter table public.students
  add column if not exists nik text;

create unique index if not exists students_nik_key
  on public.students(nik)
  where nik is not null;

alter table public.teacher_profiles
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists full_name text,
  add column if not exists nik text;

update public.teacher_profiles tp
set full_name = coalesce(tp.full_name, up.display_name, 'Guru')
from public.user_profiles up
where up.id = tp.teacher_user_id
  and tp.full_name is null;

alter table public.teacher_profiles
  drop constraint if exists teacher_profiles_pkey;

alter table public.teacher_profiles
  alter column teacher_user_id drop not null,
  alter column full_name set not null,
  add constraint teacher_profiles_pkey primary key (id);

create unique index if not exists teacher_profiles_teacher_user_id_key
  on public.teacher_profiles(teacher_user_id)
  where teacher_user_id is not null;

create unique index if not exists teacher_profiles_nik_key
  on public.teacher_profiles(nik)
  where nik is not null;

commit;
