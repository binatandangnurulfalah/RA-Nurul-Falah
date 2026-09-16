create or replace function public.update_my_profile(
  p_display_name text,
  p_phone text default null,
  p_address text default null,
  p_bio text default null
)
returns public.user_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.user_profiles;
begin
  if v_user_id is null then
    raise exception 'Pengguna belum login.';
  end if;

  if nullif(btrim(p_display_name), '') is null then
    raise exception 'Nama lengkap wajib diisi.';
  end if;

  update public.user_profiles
  set
    display_name = btrim(p_display_name),
    phone = nullif(btrim(coalesce(p_phone, '')), ''),
    address = nullif(btrim(coalesce(p_address, '')), ''),
    bio = nullif(btrim(coalesce(p_bio, '')), '')
  where id = v_user_id
    and is_active = true
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'Profil aktif tidak ditemukan.';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text) from public;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;

comment on function public.update_my_profile(text, text, text, text)
is 'Memperbarui data profil milik pengguna yang sedang login tanpa mengizinkan perubahan role atau status akun.';
