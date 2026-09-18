begin;

drop policy if exists "role based student access" on public.students;
create policy "role based student access"
on public.students
for select
to authenticated
using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and (
      not coalesce((
        select ss.single_teacher_class_mode
        from public.school_settings ss
        where ss.id = 1
      ), false)
      or (select private.teacher_can_access_student(students.id))
    )
  )
  or exists (
    select 1
    from public.student_guardians sg
    where sg.student_id = students.id
      and sg.guardian_user_id = (select auth.uid())
  )
);

drop policy if exists "role based class access" on public.school_classes;
create policy "role based class access"
on public.school_classes
for select
to authenticated
using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and (
      not coalesce((
        select ss.single_teacher_class_mode
        from public.school_settings ss
        where ss.id = 1
      ), false)
      or (select private.teacher_can_access_class_id(school_classes.id))
    )
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
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := (select private.current_user_role());
  v_student public.students;
  v_guardian_ids uuid[] := coalesce(p_guardian_user_ids, '{}'::uuid[]);
  v_requested_guardians integer := 0;
  v_valid_guardians integer := 0;
  v_year_id uuid;
  v_year_label text;
  v_class_id uuid;
  v_class_name text;
  v_single_teacher_class_mode boolean := false;
begin
  if v_actor is null then
    raise exception 'Pengguna belum login.' using errcode = '42501';
  end if;

  if v_role not in ('admin'::public.app_role, 'teacher'::public.app_role) then
    raise exception 'Akun ini tidak memiliki izin untuk menyimpan data murid.'
      using errcode = '42501';
  end if;

  select coalesce(ss.single_teacher_class_mode, false)
    into v_single_teacher_class_mode
  from public.school_settings ss
  where ss.id = 1;

  if nullif(btrim(p_full_name), '') is null then
    raise exception 'Nama lengkap murid wajib diisi.' using errcode = '22023';
  end if;

  if p_gender is not null and p_gender not in ('L', 'P') then
    raise exception 'Jenis kelamin tidak valid.' using errcode = '22023';
  end if;

  if array_position(v_guardian_ids, null) is not null then
    raise exception 'Data wali tidak valid.' using errcode = '22023';
  end if;

  select count(*) into v_requested_guardians
  from (select distinct guardian_id from unnest(v_guardian_ids) as guardian_id) guardian_ids;

  if v_role = 'teacher'::public.app_role and v_requested_guardians > 0 then
    raise exception 'Hanya Admin yang dapat mengubah hubungan wali murid.'
      using errcode = '42501';
  end if;

  if v_requested_guardians > 10 then
    raise exception 'Maksimal 10 wali dapat dihubungkan ke satu murid.' using errcode = '22023';
  end if;

  if v_role = 'admin'::public.app_role and v_requested_guardians > 0 then
    select count(*) into v_valid_guardians
    from public.user_profiles profile
    where profile.id = any(v_guardian_ids)
      and profile.role = 'parent'::public.app_role
      and profile.is_active = true;

    if v_valid_guardians <> v_requested_guardians then
      raise exception 'Salah satu akun wali tidak valid atau tidak aktif.'
        using errcode = '23503';
    end if;
  end if;

  select ay.id, ay.label into v_year_id, v_year_label
  from public.academic_years ay
  where ay.label = nullif(btrim(coalesce(p_academic_year, '')), '');

  if v_year_id is null then
    select ay.id, ay.label into v_year_id, v_year_label
    from public.academic_years ay
    where ay.is_current = true;
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
      raise exception 'Kelas tidak ditemukan pada tahun ajaran yang dipilih.'
        using errcode = '23503';
    end if;
  end if;

  if v_role = 'teacher'::public.app_role and v_single_teacher_class_mode then
    if v_class_id is null then
      raise exception 'Mode 1 Guru = 1 Kelas aktif. Guru wajib memilih kelas yang ditugaskan.'
        using errcode = '42501';
    end if;

    if not (select private.teacher_can_access_class_id(v_class_id)) then
      raise exception 'Mode 1 Guru = 1 Kelas aktif. Guru hanya dapat menyimpan murid pada kelas yang ditugaskan.'
        using errcode = '42501';
    end if;

    if p_student_id is not null
       and not (select private.teacher_can_access_student(p_student_id)) then
      raise exception 'Mode 1 Guru = 1 Kelas aktif. Guru hanya dapat mengubah murid pada kelas yang ditugaskan.'
        using errcode = '42501';
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
      v_actor
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
      raise exception 'Data murid tidak ditemukan.'
        using errcode = 'P0002';
    end if;
  end if;

  if v_role = 'admin'::public.app_role then
    delete from public.student_guardians
    where student_id = v_student.id
      and not (guardian_user_id = any(v_guardian_ids));

    insert into public.student_guardians (student_id, guardian_user_id, relationship)
    select v_student.id, guardian_id, 'Wali'
    from (select distinct guardian_id from unnest(v_guardian_ids) as guardian_id) guardian_ids
    on conflict (student_id, guardian_user_id) do nothing;
  end if;

  return v_student;
end;
$$;

revoke all on function public.save_student_with_guardians(uuid,text,text,text,text,text,text,date,text,text,boolean,uuid[])
from public, anon;

grant execute on function public.save_student_with_guardians(uuid,text,text,text,text,text,text,date,text,text,boolean,uuid[])
to authenticated;

comment on function public.save_student_with_guardians(uuid,text,text,text,text,text,text,date,text,text,boolean,uuid[]) is
'Admin mengelola murid dan wali. Saat pola 1 Guru = 1 Kelas aktif, Guru dibatasi ke kelas assignment; saat nonaktif, Guru dapat melihat dan menyimpan murid secara global tanpa mengubah relasi wali.';

commit;
