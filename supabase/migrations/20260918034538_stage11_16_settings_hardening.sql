begin;

create or replace function public.save_school_settings(
  p_school_name text,
  p_address text,
  p_phone text,
  p_email text,
  p_late_cutoff time,
  p_academic_year_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school_name text := btrim(coalesce(p_school_name, ''));
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if v_actor is null
     or (select private.current_user_role()) is distinct from 'admin'::public.app_role then
    raise exception 'Hanya Admin yang dapat mengubah pengaturan sekolah.'
      using errcode = '42501';
  end if;

  if char_length(v_school_name) not between 2 and 150 then
    raise exception 'Nama sekolah wajib diisi 2-150 karakter.'
      using errcode = '22023';
  end if;

  if v_address is not null and char_length(v_address) > 1000 then
    raise exception 'Alamat maksimal 1000 karakter.'
      using errcode = '22023';
  end if;

  if v_phone is not null and char_length(v_phone) > 50 then
    raise exception 'Nomor telepon maksimal 50 karakter.'
      using errcode = '22023';
  end if;

  if v_email is not null and (
    char_length(v_email) > 254
    or position('@' in v_email) <= 1
  ) then
    raise exception 'Email sekolah tidak valid.'
      using errcode = '22023';
  end if;

  if p_late_cutoff is null then
    raise exception 'Batas terlambat wajib diisi.'
      using errcode = '22023';
  end if;

  if p_academic_year_id is null or not exists (
    select 1
    from public.academic_years ay
    where ay.id = p_academic_year_id
      and ay.is_active = true
  ) then
    raise exception 'Tahun ajaran harus berasal dari daftar tahun ajaran aktif.'
      using errcode = '23503';
  end if;

  update public.school_settings
  set
    school_name = v_school_name,
    address = v_address,
    phone = v_phone,
    email = v_email,
    timezone = 'Asia/Jakarta',
    late_cutoff = p_late_cutoff,
    academic_year_id = p_academic_year_id,
    updated_by = v_actor
  where id = 1;

  if not found then
    raise exception 'Pengaturan sekolah belum tersedia.'
      using errcode = 'P0002';
  end if;

  return true;
end;
$$;

revoke all on function public.save_school_settings(
  text, text, text, text, time, uuid
) from public, anon;
grant execute on function public.save_school_settings(
  text, text, text, text, time, uuid
) to authenticated;

revoke update on table public.school_settings from authenticated, anon;

commit;
