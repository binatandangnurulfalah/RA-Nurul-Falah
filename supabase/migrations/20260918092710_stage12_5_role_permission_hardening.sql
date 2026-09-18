-- Stage 12.5: align role permissions across UI, RLS, and RPCs.
-- Master student/guardian data and official schedules are Admin-managed.
-- Teachers retain scoped read access, attendance management, report management,
-- QR scanning, and ownership-based announcement management.

drop policy if exists "staff create students" on public.students;
drop policy if exists "staff update students" on public.students;

create policy "admin create students"
on public.students
for insert
to authenticated
with check (
  (select private.current_user_role()) = 'admin'::public.app_role
  and created_by = (select auth.uid())
);

create policy "admin update students"
on public.students
for update
to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role)
with check ((select private.current_user_role()) = 'admin'::public.app_role);

drop policy if exists "staff create guardian links" on public.student_guardians;
drop policy if exists "staff update guardian links" on public.student_guardians;
drop policy if exists "staff delete guardian links" on public.student_guardians;

create policy "admin create guardian links"
on public.student_guardians
for insert
to authenticated
with check ((select private.current_user_role()) = 'admin'::public.app_role);

create policy "admin update guardian links"
on public.student_guardians
for update
to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role)
with check ((select private.current_user_role()) = 'admin'::public.app_role);

create policy "admin delete guardian links"
on public.student_guardians
for delete
to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role);

drop policy if exists "staff create schedules" on public.school_schedules;
drop policy if exists "staff update schedules" on public.school_schedules;
drop policy if exists "staff delete schedules" on public.school_schedules;

create policy "admin create schedules"
on public.school_schedules
for insert
to authenticated
with check (
  (select private.current_user_role()) = 'admin'::public.app_role
  and created_by = (select auth.uid())
);

create policy "admin update schedules"
on public.school_schedules
for update
to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role)
with check ((select private.current_user_role()) = 'admin'::public.app_role);

create policy "admin delete schedules"
on public.school_schedules
for delete
to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role);

create or replace function public.save_student_with_guardians(
  p_student_id uuid default null::uuid,
  p_full_name text default ''::text,
  p_nik text default null::text,
  p_nis text default null::text,
  p_nisn text default null::text,
  p_gender text default null::text,
  p_birth_place text default null::text,
  p_birth_date date default null::date,
  p_class_name text default null::text,
  p_academic_year text default null::text,
  p_is_active boolean default true,
  p_guardian_user_ids uuid[] default '{}'::uuid[]
)
returns public.students
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
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

  if coalesce(private.current_user_role()::text, '') <> 'admin' then
    raise exception 'Hanya Admin yang dapat menyimpan data murid.';
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
$function$;

revoke all on function public.save_student_with_guardians(uuid,text,text,text,text,text,text,date,text,text,boolean,uuid[]) from public, anon;
grant execute on function public.save_student_with_guardians(uuid,text,text,text,text,text,text,date,text,text,boolean,uuid[]) to authenticated;

comment on function public.save_student_with_guardians(uuid,text,text,text,text,text,text,date,text,text,boolean,uuid[]) is
'Admin-only student and guardian synchronization. Teachers retain scoped read access through RLS.';
