create table public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  nis text unique, nisn text unique, gender text check (gender in ('L','P')),
  birth_place text, birth_date date, class_name text,
  academic_year text default '2026/2027', is_active boolean not null default true,
  qr_token uuid not null unique default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.student_guardians (
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  relationship text not null default 'Wali', created_at timestamptz not null default now(),
  primary key (student_id, guardian_user_id)
);
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete cascade,
  attendance_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  check_in timestamptz, check_out timestamptz,
  status text not null default 'present' check (status in ('present','late','excused','sick','absent')),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (student_id, attendance_date), check (check_out is null or check_in is not null),
  check (check_out is null or check_out >= check_in)
);
create index students_full_name_idx on public.students (full_name);
create index student_guardians_guardian_idx on public.student_guardians (guardian_user_id);
create index attendance_records_date_idx on public.attendance_records (attendance_date desc);
create index attendance_records_student_date_idx on public.attendance_records (student_id, attendance_date desc);
alter table public.students enable row level security;
alter table public.student_guardians enable row level security;
alter table public.attendance_records enable row level security;
create policy "staff read students" on public.students for select to authenticated using ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role));
create policy "parents read linked students" on public.students for select to authenticated using (exists (select 1 from public.student_guardians sg where sg.student_id=students.id and sg.guardian_user_id=(select auth.uid())));
create policy "staff create students" on public.students for insert to authenticated with check ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role) and created_by=(select auth.uid()));
create policy "staff update students" on public.students for update to authenticated using ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role)) with check ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role));
create policy "staff read guardian links" on public.student_guardians for select to authenticated using ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role));
create policy "parents read own guardian links" on public.student_guardians for select to authenticated using (guardian_user_id=(select auth.uid()));
create policy "staff create guardian links" on public.student_guardians for insert to authenticated with check ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role));
create policy "staff update guardian links" on public.student_guardians for update to authenticated using ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role)) with check ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role));
create policy "staff delete guardian links" on public.student_guardians for delete to authenticated using ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role));
create policy "staff read attendance" on public.attendance_records for select to authenticated using ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role));
create policy "parents read linked attendance" on public.attendance_records for select to authenticated using (exists (select 1 from public.student_guardians sg where sg.student_id=attendance_records.student_id and sg.guardian_user_id=(select auth.uid())));
revoke insert, update, delete on public.attendance_records from authenticated;
grant select on public.students, public.student_guardians, public.attendance_records to authenticated;
grant insert, update on public.students to authenticated;
grant insert, update, delete on public.student_guardians to authenticated;

create index if not exists account_allowlist_created_by_idx on public.account_allowlist(created_by);
create index students_created_by_idx on public.students(created_by);
create index attendance_records_recorded_by_idx on public.attendance_records(recorded_by);
drop policy "staff read students" on public.students;
drop policy "parents read linked students" on public.students;
create policy "role based student access" on public.students for select to authenticated using ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role) or exists (select 1 from public.student_guardians sg where sg.student_id=students.id and sg.guardian_user_id=(select auth.uid())));
drop policy "staff read guardian links" on public.student_guardians;
drop policy "parents read own guardian links" on public.student_guardians;
create policy "role based guardian link access" on public.student_guardians for select to authenticated using ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role) or guardian_user_id=(select auth.uid()));
drop policy "staff read attendance" on public.attendance_records;
drop policy "parents read linked attendance" on public.attendance_records;
create policy "role based attendance access" on public.attendance_records for select to authenticated using ((select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role) or exists (select 1 from public.student_guardians sg where sg.student_id=attendance_records.student_id and sg.guardian_user_id=(select auth.uid())));
drop policy if exists "admins_can_read_all_profiles" on public.user_profiles;
drop policy if exists "users_can_read_own_profile" on public.user_profiles;
create policy "role based profile access" on public.user_profiles for select to authenticated using (id=(select auth.uid()) or (select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role));
