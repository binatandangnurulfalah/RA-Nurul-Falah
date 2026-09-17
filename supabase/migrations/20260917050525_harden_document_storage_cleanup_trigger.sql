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
  old_path := old.file_url;

  if tg_op = 'DELETE' then
    should_queue := true;
  elsif tg_op = 'UPDATE' then
    should_queue := old.file_url is distinct from new.file_url;
  end if;

  if should_queue
     and old_path is not null
     and old_path !~* '^https?://' then
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