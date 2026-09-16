alter table public.school_settings drop constraint if exists school_settings_timezone_check;
alter table public.school_settings add constraint school_settings_timezone_check check (timezone = 'Asia/Jakarta');

create or replace function public.sync_school_class_name()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.name is distinct from new.name then
    update public.students set class_name = new.name where class_name = old.name;
    update public.school_schedules set class_name = new.name where class_name = old.name;
  end if;
  return new;
end;
$$;

drop trigger if exists school_classes_sync_name on public.school_classes;
create trigger school_classes_sync_name
after update of name on public.school_classes
for each row execute function public.sync_school_class_name();

create or replace function public.cleanup_school_class()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$;
begin
  if exists (select 1 from public.students where class_name = old.name) then
    raise exception 'Kelas masih memiliki murid dan tidak dapat dihapus.';
  end if;
  delete from public.school_schedules where class_name = old.name;
  return old;
end;
$$;

drop trigger if exists school_classes_cleanup on public.school_classes;
create trigger school_classes_cleanup
before delete on public.school_classes
for each row execute function public.cleanup_school_class();
