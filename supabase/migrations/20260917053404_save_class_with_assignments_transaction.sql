create or replace function public.save_class_with_assignments(
  p_class_id uuid,
  p_name text,
  p_academic_year text,
  p_is_active boolean,
  p_teacher_profile_ids uuid[]
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

  if v_academic_year = '' then
    raise exception 'Tahun ajaran wajib diisi.' using errcode = '22023';
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
    insert into public.school_classes (name, teacher_name, academic_year, is_active, created_by)
    values (v_name, v_teacher_name, v_academic_year, coalesce(p_is_active, true), auth.uid())
    returning id into v_class_id;
  else
    update public.school_classes
       set name = v_name,
           teacher_name = v_teacher_name,
           academic_year = v_academic_year,
           is_active = coalesce(p_is_active, true)
     where id = p_class_id
     returning id into v_class_id;

    if v_class_id is null then
      raise exception 'Kelas tidak ditemukan.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.teacher_class_assignments
  where class_id = v_class_id;

  insert into public.teacher_class_assignments (class_id, teacher_profile_id)
  select v_class_id, teacher_id
  from unnest(v_teacher_profile_ids) as teacher_id;

  return v_class_id;
end;
$$;

revoke all on function public.save_class_with_assignments(uuid, text, text, boolean, uuid[]) from public, anon;
grant execute on function public.save_class_with_assignments(uuid, text, text, boolean, uuid[]) to authenticated;
