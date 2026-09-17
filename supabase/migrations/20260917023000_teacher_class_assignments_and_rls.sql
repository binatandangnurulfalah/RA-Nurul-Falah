begin;

create table if not exists public.teacher_class_assignments (
  class_id uuid not null references public.school_classes(id) on delete cascade,
  teacher_profile_id uuid not null references public.teacher_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, teacher_profile_id)
);

create index if not exists teacher_class_assignments_teacher_idx
  on public.teacher_class_assignments(teacher_profile_id, class_id);

alter table public.teacher_class_assignments enable row level security;
grant select, insert, delete on public.teacher_class_assignments to authenticated;

insert into public.teacher_class_assignments(class_id, teacher_profile_id)
select c.id, tp.id
from public.school_classes c
join public.teacher_profiles tp
  on lower(trim(tp.full_name)) = lower(trim(c.teacher_name))
where c.teacher_name is not null and trim(c.teacher_name) <> ''
on conflict do nothing;

drop policy if exists "assignment access" on public.teacher_class_assignments;
create policy "assignment access" on public.teacher_class_assignments
for select to authenticated
using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or exists (
    select 1 from public.teacher_profiles tp
    where tp.id = teacher_class_assignments.teacher_profile_id
      and tp.teacher_user_id = (select auth.uid())
  )
);

drop policy if exists "admin insert assignments" on public.teacher_class_assignments;
create policy "admin insert assignments" on public.teacher_class_assignments
for insert to authenticated
with check ((select private.current_user_role()) = 'admin'::public.app_role);

drop policy if exists "admin delete assignments" on public.teacher_class_assignments;
create policy "admin delete assignments" on public.teacher_class_assignments
for delete to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role);

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
    join public.teacher_class_assignments tca on tca.class_id = c.id
    join public.teacher_profiles tp on tp.id = tca.teacher_profile_id
    where c.name = target_class_name
      and c.is_active = true
      and tp.teacher_user_id = (select auth.uid())
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
    join public.school_classes c on c.name = s.class_name and c.is_active = true
    join public.teacher_class_assignments tca on tca.class_id = c.id
    join public.teacher_profiles tp on tp.id = tca.teacher_profile_id
    where s.id = target_student_id
      and tp.teacher_user_id = (select auth.uid())
  );
$$;

revoke all on function private.teacher_can_access_class(text) from public;
revoke all on function private.teacher_can_access_student(uuid) from public;
grant execute on function private.teacher_can_access_class(text) to authenticated;
grant execute on function private.teacher_can_access_student(uuid) to authenticated;

drop policy if exists "role based class access" on public.school_classes;
create policy "role based class access" on public.school_classes for select to authenticated using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_class(school_classes.name)))
  or exists (
    select 1 from public.students s
    join public.student_guardians sg on sg.student_id = s.id
    where sg.guardian_user_id = (select auth.uid()) and s.class_name = school_classes.name and s.is_active = true
  )
);

drop policy if exists "role based schedule access" on public.school_schedules;
create policy "role based schedule access" on public.school_schedules for select to authenticated using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_class(school_schedules.class_name)))
  or exists (
    select 1 from public.students s
    join public.student_guardians sg on sg.student_id = s.id
    where sg.guardian_user_id = (select auth.uid()) and s.class_name = school_schedules.class_name and s.is_active = true
  )
);

drop policy if exists "staff create schedules" on public.school_schedules;
create policy "staff create schedules" on public.school_schedules for insert to authenticated with check (
  created_by = (select auth.uid()) and (
    (select private.current_user_role()) = 'admin'::public.app_role
    or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_class(school_schedules.class_name)))
  )
);

drop policy if exists "staff update schedules" on public.school_schedules;
create policy "staff update schedules" on public.school_schedules for update to authenticated
using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_class(school_schedules.class_name)))
)
with check (
  (select private.current_user_role()) = 'admin'::public.app_role
  or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_class(school_schedules.class_name)))
);

drop policy if exists "staff delete schedules" on public.school_schedules;
create policy "staff delete schedules" on public.school_schedules for delete to authenticated using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_class(school_schedules.class_name)))
);

drop policy if exists "role based profile access" on public.user_profiles;
create policy "role based profile access" on public.user_profiles for select to authenticated using (
  id = (select auth.uid())
  or (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and role = 'parent'::public.app_role
    and exists (
      select 1 from public.student_guardians sg
      where sg.guardian_user_id = user_profiles.id
        and (select private.teacher_can_access_student(sg.student_id))
    )
  )
);

commit;
