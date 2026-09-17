-- Guru hanya dapat mengakses murid pada kelas yang nama wali/gurunya cocok
-- dengan profil Guru yang telah dihubungkan ke akun login.
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
    join public.teacher_profiles tp on lower(trim(tp.full_name)) = lower(trim(c.teacher_name))
    where s.id = target_student_id
      and tp.teacher_user_id = (select auth.uid())
  );
$$;
revoke all on function private.teacher_can_access_student(uuid) from public, anon;
grant execute on function private.teacher_can_access_student(uuid) to authenticated, service_role;

create or replace function private.teacher_can_access_class(target_class_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.school_classes c
    join public.teacher_profiles tp on lower(trim(tp.full_name)) = lower(trim(c.teacher_name))
    where c.name = target_class_name and c.is_active = true and tp.teacher_user_id = (select auth.uid())
  );
$$;
revoke all on function private.teacher_can_access_class(text) from public, anon;
grant execute on function private.teacher_can_access_class(text) to authenticated, service_role;

drop policy if exists "role based student access" on public.students;
create policy "role based student access" on public.students for select to authenticated using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_student(students.id)))
  or exists (select 1 from public.student_guardians sg where sg.student_id=students.id and sg.guardian_user_id=(select auth.uid()))
);

drop policy if exists "staff create students" on public.students;
create policy "staff create students" on public.students for insert to authenticated with check (
  created_by=(select auth.uid()) and (
    (select private.current_user_role()) = 'admin'::public.app_role
    or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_class(students.class_name)))
  )
);

drop policy if exists "staff update students" on public.students;
create policy "staff update students" on public.students for update to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_student(students.id))))
with check ((select private.current_user_role()) = 'admin'::public.app_role or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_student(students.id))));

drop policy if exists "role based guardian link access" on public.student_guardians;
create policy "role based guardian link access" on public.student_guardians for select to authenticated using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or guardian_user_id=(select auth.uid())
  or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_student(student_guardians.student_id)))
);
drop policy if exists "staff create guardian links" on public.student_guardians;
create policy "staff create guardian links" on public.student_guardians for insert to authenticated with check (
  (select private.current_user_role()) = 'admin'::public.app_role
  or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_student(student_guardians.student_id)))
);
drop policy if exists "staff update guardian links" on public.student_guardians;
create policy "staff update guardian links" on public.student_guardians for update to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_student(student_guardians.student_id))))
with check ((select private.current_user_role()) = 'admin'::public.app_role or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_student(student_guardians.student_id))));
drop policy if exists "staff delete guardian links" on public.student_guardians;
create policy "staff delete guardian links" on public.student_guardians for delete to authenticated using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_student(student_guardians.student_id)))
);

drop policy if exists "role based attendance access" on public.attendance_records;
create policy "role based attendance access" on public.attendance_records for select to authenticated using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_student(attendance_records.student_id)))
  or exists (select 1 from public.student_guardians sg where sg.student_id=attendance_records.student_id and sg.guardian_user_id=(select auth.uid()))
);

drop policy if exists "role based report access" on public.report_cards;
create policy "role based report access" on public.report_cards for select to authenticated using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_student(report_cards.student_id)))
  or (is_published=true and exists (select 1 from public.student_guardians sg where sg.student_id=report_cards.student_id and sg.guardian_user_id=(select auth.uid())))
);
drop policy if exists "staff create reports" on public.report_cards;
create policy "staff create reports" on public.report_cards for insert to authenticated with check (
  created_by=(select auth.uid()) and ((select private.current_user_role()) = 'admin'::public.app_role or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_student(report_cards.student_id))))
);
drop policy if exists "staff update reports" on public.report_cards;
create policy "staff update reports" on public.report_cards for update to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_student(report_cards.student_id))))
with check ((select private.current_user_role()) = 'admin'::public.app_role or ((select private.current_user_role()) = 'teacher'::public.app_role and (select private.teacher_can_access_student(report_cards.student_id))));
