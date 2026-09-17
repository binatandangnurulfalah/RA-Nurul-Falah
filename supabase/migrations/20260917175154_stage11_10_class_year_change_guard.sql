begin;

create or replace function public.protect_school_class_academic_year_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.academic_year_id is distinct from new.academic_year_id
     and (
       exists (select 1 from public.students s where s.class_id = old.id)
       or exists (select 1 from public.school_schedules sc where sc.class_id = old.id)
     ) then
    raise exception 'Tahun ajaran kelas yang sudah memiliki murid atau jadwal tidak dapat diubah. Buat kelas baru untuk tahun ajaran berikutnya.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists school_classes_protect_academic_year_change on public.school_classes;
create trigger school_classes_protect_academic_year_change
before update of academic_year_id on public.school_classes
for each row execute function public.protect_school_class_academic_year_change();

revoke all on function public.protect_school_class_academic_year_change() from public, anon, authenticated;

commit;
