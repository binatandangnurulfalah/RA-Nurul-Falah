begin;

alter table public.user_profiles
  add column if not exists avatar_path text;

alter table public.user_profiles
  drop constraint if exists user_profiles_avatar_path_owned_check;

alter table public.user_profiles
  add constraint user_profiles_avatar_path_owned_check
  check (
    avatar_path is null
    or avatar_path = id::text || '/avatar'
  );

grant update (avatar_path) on public.user_profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  2097152,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_photos_owner_insert" on storage.objects;
create policy "profile_photos_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and name = (select auth.uid())::text || '/avatar'
  and exists (
    select 1
    from public.user_profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active = true
  )
);

drop policy if exists "profile_photos_owner_update" on storage.objects;
create policy "profile_photos_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and name = (select auth.uid())::text || '/avatar'
)
with check (
  bucket_id = 'profile-photos'
  and name = (select auth.uid())::text || '/avatar'
  and exists (
    select 1
    from public.user_profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active = true
  )
);

drop policy if exists "profile_photos_owner_delete" on storage.objects;
create policy "profile_photos_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and name = (select auth.uid())::text || '/avatar'
);

drop policy if exists "profile_photos_authorized_read" on storage.objects;
create policy "profile_photos_authorized_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-photos'
  and (
    name = (select auth.uid())::text || '/avatar'
    or (select private.current_user_role()) = 'admin'::public.app_role
  )
);

create or replace function public.update_my_avatar(p_avatar_path text default null)
returns public.user_profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.user_profiles;
  v_avatar_path text := nullif(btrim(coalesce(p_avatar_path, '')), '');
begin
  if v_user_id is null then
    raise exception 'Pengguna belum login.' using errcode = '42501';
  end if;

  if v_avatar_path is not null
     and v_avatar_path <> v_user_id::text || '/avatar' then
    raise exception 'Path foto profil tidak valid.' using errcode = '22023';
  end if;

  update public.user_profiles
  set avatar_path = v_avatar_path
  where id = v_user_id
    and is_active = true
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'Profil aktif tidak ditemukan.' using errcode = 'P0002';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.update_my_avatar(text) from public, anon;
grant execute on function public.update_my_avatar(text) to authenticated;

comment on column public.user_profiles.avatar_path is
'Private Storage path for the account profile photo. Canonical path: <user_id>/avatar.';

comment on function public.update_my_avatar(text) is
'Updates only the signed-in active user avatar_path. The path must belong to auth.uid().';

commit;
