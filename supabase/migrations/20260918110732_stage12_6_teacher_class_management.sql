begin;

alter table public.school_settings
  add column if not exists single_teacher_class_mode boolean not null default false;

comment on column public.school_settings.single_teacher_class_mode is
'Jika aktif, setiap kelas hanya memiliki satu Guru dan setiap Guru hanya dapat mewakili satu kelas pada tahun ajaran yang sama.';

create or replace function private.enforce_single_teacher_class_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode boolean := false;
  v_academic_year_id uuid;
begin
  select coalesce(s.single_teacher_class_mode, false)
    into v_mode
  from public.school_settings s
  where s.id = 1;

  if not coalesce(v_mode, false) then
    return new;
  end if;

  select c.academic_year_id
    into v_academic_year_id
  from public.school_classes c
  where c.id = new.class_id;

  if v_academic_year_id is null then
    raise exception 'Kelas penugasan tidak ditemukan.'
      using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.teacher_class_assignments tca
    where tca.class_id = new.class_id
      and tca.teacher_profile_id <> new.teacher_profile_id
  ) then
    raise exception 'Mode 1 Guru = 1 Kelas aktif: satu kelas hanya boleh memiliki satu Guru.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.teacher_class_assignments tca
    join public.school_classes c on c.id = tca.class_id
    where tca.teacher_profile_id = new.teacher_profile_id
      and c.academic_year_id = v_academic_year_id
      and tca.class_id <> new.class_id
  ) then
    raise exception 'Mode 1 Guru = 1 Kelas aktif: Guru tersebut sudah mewakili kelas lain pada tahun ajaran yang sama.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_single_teacher_class_assignment() from public, anon, authenticated;

drop trigger if exists teacher_class_assignments_single_teacher_class_guard
  on public.teacher_class_assignments;

create trigger teacher_class_assignments_single_teacher_class_guard
before insert or update on public.teacher_class_assignments
for each row
execute function private.enforce_single_teacher_class_assignment();

create or replace function public.save_school_settings_with_policy(
  p_school_name text,
  p_address text,
  p_phone text,
  p_email text,
  p_late_cutoff time,
  p_academic_year_id uuid,
  p_single_teacher_class_mode boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_mode boolean := coalesce(p_single_teacher_class_mode, false);
begin
  if v_actor is null
     or (select private.current_user_role()) is distinct from 'admin'::public.app_role then
    raise exception 'Hanya Admin yang dapat mengubah pengaturan sekolah.'
      using errcode = '42501';
  end if;

  if v_mode and exists (
    select 1
    from public.teacher_class_assignments tca
    group by tca.class_id
    having count(*) > 1
  ) then
    raise exception 'Mode 1 Guru = 1 Kelas belum dapat diaktifkan karena ada kelas yang memiliki lebih dari satu Guru.'
      using errcode = '23514';
  end if;

  if v_mode and exists (
    select 1
    from public.teacher_class_assignments tca
    join public.school_classes c on c.id = tca.class_id
    group by tca.teacher_profile_id, c.academic_year_id
    having count(distinct tca.class_id) > 1
  ) then
    raise exception 'Mode 1 Guru = 1 Kelas belum dapat diaktifkan karena ada Guru yang mewakili lebih dari satu kelas pada tahun ajaran yang sama.'
      using errcode = '23514';
  end if;

  perform public.save_school_settings(
    p_school_name,
    p_address,
    p_phone,
    p_email,
    p_late_cutoff,
    p_academic_year_id
  );

  update public.school_settings
  set
    single_teacher_class_mode = v_mode,
    updated_by = v_actor
  where id = 1;

  if not found then
    raise exception 'Pengaturan sekolah belum tersedia.'
      using errcode = 'P0002';
  end if;

  return true;
end;
$$;

revoke all on function public.save_school_settings_with_policy(
  text, text, text, text, time, uuid, boolean
) from public, anon;

grant execute on function public.save_school_settings_with_policy(
  text, text, text, text, time, uuid, boolean
) to authenticated;

comment on function public.save_school_settings_with_policy(
  text, text, text, text, time, uuid, boolean
) is
'Admin-only atomic school settings update with optional one-teacher-one-class policy validation.';

create or replace function public.save_class_with_assignments(
  p_class_id uuid default null::uuid,
  p_name text default ''::text,
  p_academic_year text default ''::text,
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
  v_single_teacher_class_mode boolean := false;
  v_selected_teacher uuid;
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

  select coalesce(s.single_teacher_class_mode, false)
    into v_single_teacher_class_mode
  from public.school_settings s
  where s.id = 1;

  if v_single_teacher_class_mode and v_requested_count > 1 then
    raise exception 'Mode 1 Guru = 1 Kelas aktif: satu kelas hanya boleh memiliki satu Guru.'
      using errcode = '23514';
  end if;

  select count(*)::integer,
         string_agg(tp.full_name, ', ' order by tp.full_name)
    into v_found_count, v_teacher_name
  from public.teacher_profiles tp
  where tp.id = any(v_teacher_profile_ids);

  if v_found_count <> v_requested_count then
    raise exception 'Satu atau lebih data Guru tidak ditemukan.' using errcode = '23503';
  end if;

  if v_single_teacher_class_mode and v_requested_count = 1 then
    v_selected_teacher := v_teacher_profile_ids[1];

    if exists (
      select 1
      from public.teacher_class_assignments tca
      join public.school_classes c on c.id = tca.class_id
      where tca.teacher_profile_id = v_selected_teacher
        and c.academic_year_id = v_academic_year_id
        and (p_class_id is null or tca.class_id <> p_class_id)
    ) then
      raise exception 'Mode 1 Guru = 1 Kelas aktif: Guru tersebut sudah mewakili kelas lain pada tahun ajaran yang sama.'
        using errcode = '23514';
    end if;
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

revoke all on function public.save_class_with_assignments(uuid,text,text,boolean,uuid[]) from public, anon;
grant execute on function public.save_class_with_assignments(uuid,text,text,boolean,uuid[]) to authenticated;

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
begin
  if v_actor is null then
    raise exception 'Pengguna belum login.' using errcode = '42501';
  end if;

  if v_role not in ('admin'::public.app_role, 'teacher'::public.app_role) then
    raise exception 'Akun ini tidak memiliki izin untuk menyimpan data murid.'
      using errcode = '42501';
  end if;

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

  if v_role = 'teacher'::public.app_role then
    if v_class_id is null then
      raise exception 'Guru wajib memilih kelas yang ditugaskan.'
        using errcode = '42501';
    end if;

    if not (select private.teacher_can_access_class_id(v_class_id)) then
      raise exception 'Guru hanya dapat menyimpan murid pada kelas yang ditugaskan.'
        using errcode = '42501';
    end if;

    if p_student_id is not null
       and not (select private.teacher_can_access_student(p_student_id)) then
      raise exception 'Guru hanya dapat mengubah murid pada kelas yang ditugaskan.'
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
'Admin dapat mengelola murid dan wali. Guru dapat tambah/edit murid hanya pada kelas yang ditugaskan; relasi wali tetap Admin-only.';

commit;
