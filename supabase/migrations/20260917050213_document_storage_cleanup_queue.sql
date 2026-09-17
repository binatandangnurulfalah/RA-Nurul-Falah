create table if not exists public.school_document_storage_cleanup (
  id uuid primary key default gen_random_uuid(),
  object_path text not null unique check (char_length(btrim(object_path)) between 1 and 1024),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  queued_at timestamptz not null default now()
);

alter table public.school_document_storage_cleanup enable row level security;
grant select, insert, update, delete on public.school_document_storage_cleanup to authenticated;

create policy "admin manage document storage cleanup"
on public.school_document_storage_cleanup
for all
to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role)
with check ((select private.current_user_role()) = 'admin'::public.app_role);

create or replace function public.queue_school_document_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_path text;
begin
  old_path := old.file_url;

  if old_path is not null
     and old_path !~* '^https?://'
     and (tg_op = 'DELETE' or old.file_url is distinct from new.file_url) then
    insert into public.school_document_storage_cleanup (object_path)
    values (old_path)
    on conflict (object_path) do nothing;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.queue_school_document_storage_cleanup() from public, anon, authenticated;

drop trigger if exists school_documents_queue_storage_cleanup on public.school_documents;
create trigger school_documents_queue_storage_cleanup
after update of file_url or delete on public.school_documents
for each row execute function public.queue_school_document_storage_cleanup();