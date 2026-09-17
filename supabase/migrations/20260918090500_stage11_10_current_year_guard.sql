begin;

alter table public.academic_years
  drop constraint if exists academic_years_current_must_be_active_check;
alter table public.academic_years
  add constraint academic_years_current_must_be_active_check
  check (not is_current or is_active);

create or replace function public.ensure_current_academic_year()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.academic_years ay
    where ay.is_current = true
      and ay.is_active = true
  ) then
    raise exception 'Satu tahun ajaran aktif harus ditetapkan sebagai tahun berjalan.' using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists academic_years_require_current on public.academic_years;
create constraint trigger academic_years_require_current
after insert or update or delete on public.academic_years
deferrable initially deferred
for each row execute function public.ensure_current_academic_year();

revoke all on function public.ensure_current_academic_year() from public, anon, authenticated;

commit;
