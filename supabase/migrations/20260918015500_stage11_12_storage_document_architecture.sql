begin;

alter table public.school_documents
  add column if not exists storage_path text,
  add column if not exists external_url text,
  add column if not exists original_file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint;

update public.school_documents
set
  external_url = case when file_url ~* '^https?://' then file_url else external_url end,
  storage_path = case when file_url is not null and file_url !~* '^https?://' then file_url else storage_path end,
  original_file_name = case
    when file_url is not null and file_url !~* '^https?://'
      then coalesce(original_file_name, regexp_replace(file_url, '^.*/', ''))
    else original_file_name
  end
where file_url is not null
  and storage_path is null
  and external_url is null;

alter table public.school_documents drop constraint if exists school_documents_source_exclusive_check;
alter table public.school_documents
  add constraint school_documents_source_exclusive_check
  check (not (storage_path is not null and external_url is not null)) not valid;
alter table public.school_documents validate constraint school_documents_source_exclusive_check;

alter table public.school_documents drop constraint if exists school_documents_storage_path_check;
alter table public.school_documents
  add constraint school_documents_storage_path_check
  check (
    storage_path is null
    or (
      char_length(storage_path) between 1 and 1024
      and storage_path !~* '^[a-z][a-z0-9+.-]*://'
      and storage_path !~ '(^|/)\.\.(/|$)'
      and left(storage_path, 1) <> '/'
    )
  ) not valid;
alter table public.school_documents validate constraint school_documents_storage_path_check;

alter table public.school_documents drop constraint if exists school_documents_external_url_check;
alter table public.school_documents
  add constraint school_documents_external_url_check
  check (
    external_url is null
    or (
      char_length(external_url) between 8 and 2048
      and external_url ~* '^https?://'
    )
  ) not valid;
alter table public.school_documents validate constraint school_documents_external_url_check;

alter table public.school_documents drop constraint if exists school_documents_file_metadata_check;
alter table public.school_documents
  add constraint school_documents_file_metadata_check
  check (
    (
      storage_path is null
      and original_file_name is null
      and mime_type is null
      and file_size_bytes is null
    )
    or (
      storage_path is not null
      and (original_file_name is null or char_length(original_file_name) between 1 and 255)
      and (
        mime_type is null
        or mime_type in (
          'application/pdf',
          'image/jpeg',
          'image/png',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
      )
      and (file_size_bytes is null or file_size_bytes between 0 and 10485760)
    )
  ) not valid;
alter table public.school_documents validate constraint school_documents_file_metadata_check;

create index if not exists school_documents_storage_path_idx
  on public.school_documents(storage_path)
  where storage_path is not null;

create or replace function private.sync_school_document_source()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  legacy_changed boolean := false;
  canonical_changed boolean := false;
begin
  if new.storage_path is not null and new.external_url is not null then
    raise exception 'Pilih salah satu sumber dokumen: Storage internal atau tautan eksternal.'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    legacy_changed := new.file_url is distinct from old.file_url;
    canonical_changed := new.storage_path is distinct from old.storage_path
      or new.external_url is distinct from old.external_url;
  end if;

  if tg_op = 'INSERT' then
    if new.storage_path is null and new.external_url is null and new.file_url is not null then
      if new.file_url ~* '^https?://' then
        new.external_url := new.file_url;
        new.storage_path := null;
      else
        new.storage_path := new.file_url;
        new.external_url := null;
        if new.original_file_name is null then
          new.original_file_name := regexp_replace(new.file_url, '^.*/', '');
        end if;
      end if;
    elsif new.storage_path is not null or new.external_url is not null then
      new.file_url := coalesce(new.external_url, new.storage_path);
    end if;
  elsif canonical_changed then
    new.file_url := coalesce(new.external_url, new.storage_path);

    if new.storage_path is null then
      new.original_file_name := null;
      new.mime_type := null;
      new.file_size_bytes := null;
    elsif new.storage_path is distinct from old.storage_path
      and new.original_file_name is not distinct from old.original_file_name
      and new.mime_type is not distinct from old.mime_type
      and new.file_size_bytes is not distinct from old.file_size_bytes then
      new.original_file_name := regexp_replace(new.storage_path, '^.*/', '');
      new.mime_type := null;
      new.file_size_bytes := null;
    end if;
  elsif legacy_changed then
    if new.file_url is null then
      new.storage_path := null;
      new.external_url := null;
      new.original_file_name := null;
      new.mime_type := null;
      new.file_size_bytes := null;
    elsif new.file_url ~* '^https?://' then
      new.external_url := new.file_url;
      new.storage_path := null;
      new.original_file_name := null;
      new.mime_type := null;
      new.file_size_bytes := null;
    else
      new.storage_path := new.file_url;
      new.external_url := null;
      new.original_file_name := regexp_replace(new.file_url, '^.*/', '');
      new.mime_type := null;
      new.file_size_bytes := null;
    end if;
  end if;

  if new.external_url is not null then
    new.storage_path := null;
    new.original_file_name := null;
    new.mime_type := null;
    new.file_size_bytes := null;
    new.file_url := new.external_url;
  elsif new.storage_path is not null then
    new.external_url := null;
    new.file_url := new.storage_path;
  else
    new.file_url := null;
    new.original_file_name := null;
    new.mime_type := null;
    new.file_size_bytes := null;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_school_document_source() from public, anon, authenticated;

drop trigger if exists school_documents_sync_source on public.school_documents;
create trigger school_documents_sync_source
before insert or update of file_url, storage_path, external_url, original_file_name, mime_type, file_size_bytes
on public.school_documents
for each row execute function private.sync_school_document_source();

alter table public.school_document_storage_cleanup
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists locked_until timestamptz;

create index if not exists school_document_storage_cleanup_ready_idx
  on public.school_document_storage_cleanup(next_attempt_at, queued_at)
  where locked_until is null;

drop policy if exists "admin manage document storage cleanup" on public.school_document_storage_cleanup;
revoke all on table public.school_document_storage_cleanup from anon, authenticated;

create or replace function public.queue_school_document_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_path text;
  should_queue boolean := false;
begin
  old_path := coalesce(
    old.storage_path,
    case when old.file_url is not null and old.file_url !~* '^https?://' then old.file_url else null end
  );

  if tg_op = 'DELETE' then
    should_queue := true;
  elsif tg_op = 'UPDATE' then
    should_queue := old.storage_path is distinct from new.storage_path;
  end if;

  if should_queue and old_path is not null then
    insert into public.school_document_storage_cleanup (
      object_path,
      attempts,
      last_error,
      queued_at,
      next_attempt_at,
      locked_until
    )
    values (old_path, 0, null, now(), now(), null)
    on conflict (object_path) do update
      set next_attempt_at = least(public.school_document_storage_cleanup.next_attempt_at, now()),
          locked_until = null;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.queue_school_document_storage_cleanup() from public, anon, authenticated;

create or replace function public.enqueue_school_document_storage_cleanup(
  p_object_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text := btrim(coalesce(p_object_path, ''));
  v_id uuid;
begin
  if auth.uid() is null
     or (select private.current_user_role()) is distinct from 'admin'::public.app_role then
    raise exception 'Hanya Admin yang dapat mengantrekan cleanup dokumen.' using errcode = '42501';
  end if;

  if char_length(v_path) not between 1 and 1024
     or v_path ~* '^[a-z][a-z0-9+.-]*://'
     or v_path ~ '(^|/)\.\.(/|$)'
     or left(v_path, 1) = '/' then
    raise exception 'Path dokumen Storage tidak valid.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.school_documents d
    where d.storage_path = v_path
  ) then
    raise exception 'File masih direferensikan dokumen aktif.' using errcode = '23503';
  end if;

  insert into public.school_document_storage_cleanup (
    object_path,
    attempts,
    last_error,
    queued_at,
    next_attempt_at,
    locked_until
  )
  values (v_path, 0, null, now(), now(), null)
  on conflict (object_path) do update
    set next_attempt_at = least(public.school_document_storage_cleanup.next_attempt_at, now()),
        locked_until = null
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.enqueue_school_document_storage_cleanup(text) from public, anon;
grant execute on function public.enqueue_school_document_storage_cleanup(text) to authenticated;

create or replace function public.claim_school_document_storage_cleanup(
  p_limit integer default 25
)
returns table (
  id uuid,
  object_path text,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select q.id
    from public.school_document_storage_cleanup q
    where q.next_attempt_at <= now()
      and (q.locked_until is null or q.locked_until < now())
    order by q.queued_at asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 50)
  )
  update public.school_document_storage_cleanup q
  set locked_until = now() + interval '5 minutes'
  from picked
  where q.id = picked.id
  returning q.id, q.object_path, q.attempts;
end;
$$;

revoke all on function public.claim_school_document_storage_cleanup(integer) from public, anon, authenticated;
grant execute on function public.claim_school_document_storage_cleanup(integer) to service_role;

drop policy if exists "school_documents_admin_update" on storage.objects;
drop policy if exists "school_documents_admin_delete" on storage.objects;

drop policy if exists "school_documents_authorized_read" on storage.objects;
create policy "school_documents_authorized_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'school-documents'
  and exists (
    select 1
    from public.user_profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active = true
      and (
        profile.role::text = 'admin'
        or exists (
          select 1
          from public.school_documents document
          where document.storage_path = storage.objects.name
            and document.is_published = true
            and (
              document.audience = 'all'
              or document.audience = profile.role::text
            )
        )
      )
  )
);

create or replace function private.audit_sanitize_payload(
  p_table_name text,
  p_payload jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb)
    - array[
      'password','new_password','access_token','refresh_token','jwt',
      'service_role_key','anon_key','token','qr_token','created_at','updated_at'
    ];
begin
  case p_table_name
    when 'students' then
      v_payload := v_payload - array['nik','birth_place','birth_date'];
    when 'teacher_profiles' then
      v_payload := v_payload - array['nik','birth_place','birth_date','notes'];
    when 'report_cards' then
      v_payload := v_payload - array[
        'religion_character','identity_independence','literacy_steam',
        'growth_notes','teacher_note'
      ];
    when 'student_payments' then
      v_payload := v_payload - array['notes'];
    when 'school_documents' then
      v_payload := v_payload - array[
        'file_url','storage_path','external_url','original_file_name','description'
      ];
    when 'announcements' then
      v_payload := v_payload - array['body'];
    when 'school_settings' then
      v_payload := v_payload - array['address','email','phone'];
    else
      null;
  end case;
  return v_payload;
end;
$$;

revoke all on function private.audit_sanitize_payload(text, jsonb) from public, anon, authenticated;

commit;
