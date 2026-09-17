alter table public.attendance_records
  add column if not exists source text,
  add column if not exists check_in_by uuid,
  add column if not exists check_out_by uuid,
  add column if not exists last_corrected_by uuid,
  add column if not exists correction_reason text,
  add column if not exists last_corrected_at timestamptz;

update public.attendance_records
set source = coalesce(source, 'manual'),
    check_in_by = coalesce(check_in_by, case when check_in is not null then recorded_by end),
    check_out_by = coalesce(check_out_by, case when check_out is not null then recorded_by end)
where source is null
   or (check_in is not null and check_in_by is null)
   or (check_out is not null and check_out_by is null);

alter table public.attendance_records
  alter column source set default 'manual',
  alter column source set not null;

alter table public.attendance_records drop constraint if exists attendance_records_source_check;
alter table public.attendance_records
  add constraint attendance_records_source_check check (source in ('qr', 'manual')) not valid;
alter table public.attendance_records validate constraint attendance_records_source_check;

alter table public.attendance_records drop constraint if exists attendance_records_correction_reason_check;
alter table public.attendance_records
  add constraint attendance_records_correction_reason_check
  check (correction_reason is null or char_length(btrim(correction_reason)) between 3 and 500) not valid;
alter table public.attendance_records validate constraint attendance_records_correction_reason_check;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_records_check_in_by_fkey') then
    alter table public.attendance_records
      add constraint attendance_records_check_in_by_fkey foreign key (check_in_by) references auth.users(id) on delete set null not valid;
    alter table public.attendance_records validate constraint attendance_records_check_in_by_fkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'attendance_records_check_out_by_fkey') then
    alter table public.attendance_records
      add constraint attendance_records_check_out_by_fkey foreign key (check_out_by) references auth.users(id) on delete set null not valid;
    alter table public.attendance_records validate constraint attendance_records_check_out_by_fkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'attendance_records_last_corrected_by_fkey') then
    alter table public.attendance_records
      add constraint attendance_records_last_corrected_by_fkey foreign key (last_corrected_by) references auth.users(id) on delete set null not valid;
    alter table public.attendance_records validate constraint attendance_records_last_corrected_by_fkey;
  end if;
end $$;

create index if not exists attendance_records_check_in_by_idx on public.attendance_records(check_in_by);
create index if not exists attendance_records_check_out_by_idx on public.attendance_records(check_out_by);
create index if not exists attendance_records_last_corrected_by_idx on public.attendance_records(last_corrected_by);

alter table public.audit_events drop constraint if exists audit_events_table_name_check;
alter table public.audit_events
  add constraint audit_events_table_name_check
  check (table_name in ('announcements', 'student_payments', 'attendance_records')) not valid;
alter table public.audit_events validate constraint audit_events_table_name_check;

create or replace function private.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_actor_user_id uuid;
  v_actor_text text;
  v_actor_role public.app_role;
begin
  if tg_op = 'INSERT' then
    v_record_id := new.id;
    v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_record_id := new.id;
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
  elsif tg_op = 'DELETE' then
    v_record_id := old.id;
    v_old := to_jsonb(old);
  else
    return null;
  end if;

  if v_old is not null then
    v_old := v_old - array['password','new_password','access_token','refresh_token','jwt','service_role_key','anon_key'];
  end if;
  if v_new is not null then
    v_new := v_new - array['password','new_password','access_token','refresh_token','jwt','service_role_key','anon_key'];
  end if;

  v_actor_text := coalesce(
    v_new->>'last_corrected_by', v_new->>'check_out_by', v_new->>'check_in_by',
    v_new->>'updated_by', v_new->>'created_by', v_new->>'recorded_by',
    v_old->>'last_corrected_by', v_old->>'check_out_by', v_old->>'check_in_by',
    v_old->>'updated_by', v_old->>'created_by', v_old->>'recorded_by'
  );

  if v_actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor_user_id := v_actor_text::uuid;
  else
    v_actor_user_id := auth.uid();
  end if;

  select up.role into v_actor_role
  from public.user_profiles up
  where up.id = v_actor_user_id;

  insert into public.audit_events(
    table_name, record_id, action, actor_user_id, actor_role, old_data, new_data
  ) values (
    tg_table_name, v_record_id, tg_op, v_actor_user_id, v_actor_role, v_old, v_new
  );

  return coalesce(new, old);
end;
$$;

revoke all on function private.capture_audit_event() from public, anon, authenticated;

drop trigger if exists attendance_records_capture_audit on public.attendance_records;
create trigger attendance_records_capture_audit
after insert or update or delete on public.attendance_records
for each row execute function private.capture_audit_event();
