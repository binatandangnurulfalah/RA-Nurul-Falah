create or replace function public.save_student_with_guardians(
  p_student_id uuid,
  p_full_name text,
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

  select count(*)
  into v_requested_guardians
  from (select distinct guardian_id from unnest(v_guardian_ids) as guardian_id) guardian_ids;

  if v_requested_guardians > 10 then
    raise exception 'Maksimal 10 wali dapat dihubungkan ke satu murid.';
  end if;

  if v_requested_guardians > 0 then
    select count(*)
    into v_valid_guardians
    from public.user_profiles profile
    where profile.id = any(v_guardian_ids)
      and profile.role = 'parent'::public.app_role
      and profile.is_active = true;

    if v_valid_guardians <> v_requested_guardians then
      raise exception 'Salah satu akun wali tidak valid atau tidak aktif.';
    end if;
  end if;

  if p_student_id is null then
    insert into public.students (
      full_name,
      nik,
      nis,
      nisn,
      gender,
      birth_place,
      birth_date,
      class_name,
      academic_year,
      is_active,
      created_by
    ) values (
      btrim(p_full_name),
      nullif(btrim(coalesce(p_nik, '')), ''),
      nullif(btrim(coalesce(p_nis, '')), ''),
      nullif(btrim(coalesce(p_nisn, '')), ''),
      p_gender,
      nullif(btrim(coalesce(p_birth_place, '')), ''),
      p_birth_date,
      nullif(btrim(coalesce(p_class_name, '')), ''),
      nullif(btrim(coalesce(p_academic_year, '')), ''),
      coalesce(p_is_active, true),
      auth.uid()
    )
    returning * into v_student;
  else
    update public.students
    set
      full_name = btrim(p_full_name),
      nik = nullif(btrim(coalesce(p_nik, '')), ''),
      nis = nullif(btrim(coalesce(p_nis, '')), ''),
      nisn = nullif(btrim(coalesce(p_nisn, '')), ''),
      gender = p_gender,
      birth_place = nullif(btrim(coalesce(p_birth_place, '')), ''),
      birth_date = p_birth_date,
      class_name = nullif(btrim(coalesce(p_class_name, '')), ''),
      academic_year = nullif(btrim(coalesce(p_academic_year, '')), ''),
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

revoke all on function public.save_student_with_guardians(uuid,text,text,text,text,text,text,date,text,text,boolean,uuid[]) from public, anon;
grant execute on function public.save_student_with_guardians(uuid,text,text,text,text,text,text,date,text,text,boolean,uuid[]) to authenticated;

comment on function public.save_student_with_guardians(uuid,text,text,text,text,text,text,date,text,text,boolean,uuid[]) is
'Saves a student and synchronizes all linked guardians in one transaction using invoker privileges so RLS remains authoritative.';
