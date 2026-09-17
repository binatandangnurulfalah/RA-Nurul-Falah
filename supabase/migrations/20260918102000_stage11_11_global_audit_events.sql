begin;

-- Stage 11.11: make audit_events capable of representing UUID, integer, and
-- composite record identities while retaining record_id for compatibility.
alter table public.audit_events
  add column if not exists record_key text,
  add column if not exists changed_fields text[] not null default '{}'::text[],
  add column if not exists event_name text;

update public.audit_events
set record_key = record_id::text
where record_key is null;

alter table public.audit_events alter column record_id drop not null;
alter table public.audit_events alter column record_key set not null;

alter table public.audit_events drop constraint if exists audit_events_table_name_check;
alter table public.audit_events
  add constraint audit_events_table_name_check check (
    table_name in (
      'academic_years',
      'announcements',
      'attendance_records',
      'school_classes',
      'school_documents',
      'school_settings',
      'student_guardians',
      'student_payments',
      'students',
      'teacher_class_assignments',
      'teacher_profiles',
      'report_cards',
      'account_management'
    )
  ) not valid;
alter table public.audit_events validate constraint audit_events_table_name_check;

alter table public.audit_events drop constraint if exists audit_events_action_check;
alter table public.audit_events
  add constraint audit_events_action_check check (action in ('INSERT','UPDATE','DELETE','EVENT')) not valid;
alter table public.audit_events validate constraint audit_events_action_check;

alter table public.audit_events drop constraint if exists audit_events_payload_check;
alter table public.audit_events
  add constraint audit_events_payload_check check (
    (action = 'INSERT' and old_data is null and new_data is not null)
    or (action = 'UPDATE' and old_data is not null and new_data is not null)
    or (action = 'DELETE' and old_data is not null and new_data is null)
    or (action = 'EVENT' and old_data is null and new_data is not null and event_name is not null)
  ) not valid;
alter table public.audit_events validate constraint audit_events_payload_check;

create index if not exists audit_events_record_key_idx
  on public.audit_events(table_name, record_key, changed_at desc);
create index if not exists audit_events_event_name_idx
  on public.audit_events(event_name, changed_at desc)
  where event_name is not null;

-- Strip secrets, direct identifiers that are not needed for an audit trail,
-- and large/sensitive content. The audit log records that a protected field
-- changed through changed_fields, without retaining the protected value.
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
      v_payload := v_payload - array['file_url','description'];
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

create or replace function private.audit_record_key(
  p_table_name text,
  p_payload jsonb
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if nullif(p_payload->>'id', '') is not null then
    return p_payload->>'id';
  end if;

  if p_table_name = 'teacher_class_assignments' then
    return concat_ws(':', p_payload->>'class_id', p_payload->>'teacher_profile_id');
  end if;

  if p_table_name = 'student_guardians' then
    return concat_ws(':', p_payload->>'student_id', p_payload->>'guardian_user_id');
  end if;

  return md5(coalesce(p_payload::text, p_table_name));
end;
$$;

create or replace function private.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw_old jsonb;
  v_raw_new jsonb;
  v_old_safe jsonb;
  v_new_safe jsonb;
  v_old_diff jsonb;
  v_new_diff jsonb;
  v_record_key text;
  v_record_id uuid;
  v_actor_user_id uuid;
  v_actor_text text;
  v_actor_role public.app_role;
  v_changed_fields text[] := '{}'::text[];
begin
  if tg_op = 'INSERT' then
    v_raw_new := to_jsonb(new);
    v_new_safe := private.audit_sanitize_payload(tg_table_name, v_raw_new);
    v_record_key := private.audit_record_key(tg_table_name, v_raw_new);
  elsif tg_op = 'UPDATE' then
    v_raw_old := to_jsonb(old);
    v_raw_new := to_jsonb(new);
    v_record_key := private.audit_record_key(tg_table_name, v_raw_new);

    select coalesce(array_agg(key order by key), '{}'::text[])
      into v_changed_fields
    from (
      select key
      from (
        select jsonb_object_keys(v_raw_old) as key
        union
        select jsonb_object_keys(v_raw_new) as key
      ) keys
      where key not in ('created_at','updated_at')
        and (v_raw_old -> key) is distinct from (v_raw_new -> key)
    ) changed;

    if cardinality(v_changed_fields) = 0 then
      return new;
    end if;

    v_old_safe := private.audit_sanitize_payload(tg_table_name, v_raw_old);
    v_new_safe := private.audit_sanitize_payload(tg_table_name, v_raw_new);

    select coalesce(jsonb_object_agg(field_name, v_old_safe -> field_name), '{}'::jsonb)
      into v_old_diff
    from unnest(v_changed_fields) field_name
    where v_old_safe ? field_name;

    select coalesce(jsonb_object_agg(field_name, v_new_safe -> field_name), '{}'::jsonb)
      into v_new_diff
    from unnest(v_changed_fields) field_name
    where v_new_safe ? field_name;

    v_old_safe := v_old_diff;
    v_new_safe := v_new_diff;
  elsif tg_op = 'DELETE' then
    v_raw_old := to_jsonb(old);
    v_old_safe := private.audit_sanitize_payload(tg_table_name, v_raw_old);
    v_record_key := private.audit_record_key(tg_table_name, v_raw_old);
  else
    return null;
  end if;

  if v_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_record_id := v_record_key::uuid;
  end if;

  v_actor_user_id := auth.uid();
  if v_actor_user_id is null then
    v_actor_text := coalesce(
      v_raw_new->>'last_corrected_by', v_raw_new->>'check_out_by', v_raw_new->>'check_in_by',
      v_raw_new->>'updated_by', v_raw_new->>'created_by', v_raw_new->>'recorded_by',
      v_raw_old->>'last_corrected_by', v_raw_old->>'check_out_by', v_raw_old->>'check_in_by',
      v_raw_old->>'updated_by', v_raw_old->>'created_by', v_raw_old->>'recorded_by'
    );
    if v_actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_actor_user_id := v_actor_text::uuid;
    end if;
  end if;

  select up.role into v_actor_role
  from public.user_profiles up
  where up.id = v_actor_user_id;

  insert into public.audit_events(
    table_name,
    record_id,
    record_key,
    action,
    actor_user_id,
    actor_role,
    old_data,
    new_data,
    changed_fields
  ) values (
    tg_table_name,
    v_record_id,
    v_record_key,
    tg_op,
    v_actor_user_id,
    v_actor_role,
    v_old_safe,
    v_new_safe,
    v_changed_fields
  );

  return coalesce(new, old);
end;
$$;

revoke all on function private.audit_sanitize_payload(text, jsonb) from public, anon, authenticated;
revoke all on function private.audit_record_key(text, jsonb) from public, anon, authenticated;
revoke all on function private.capture_audit_event() from public, anon, authenticated;

-- Recreate existing audit triggers and expand to the full Stage 11.11 domain.
drop trigger if exists academic_years_capture_audit on public.academic_years;
create trigger academic_years_capture_audit after insert or update or delete on public.academic_years
for each row execute function private.capture_audit_event();

drop trigger if exists announcements_capture_audit on public.announcements;
create trigger announcements_capture_audit after insert or update or delete on public.announcements
for each row execute function private.capture_audit_event();

drop trigger if exists attendance_records_capture_audit on public.attendance_records;
create trigger attendance_records_capture_audit after insert or update or delete on public.attendance_records
for each row execute function private.capture_audit_event();

drop trigger if exists school_classes_capture_audit on public.school_classes;
create trigger school_classes_capture_audit after insert or update or delete on public.school_classes
for each row execute function private.capture_audit_event();

drop trigger if exists school_documents_capture_audit on public.school_documents;
create trigger school_documents_capture_audit after insert or update or delete on public.school_documents
for each row execute function private.capture_audit_event();

drop trigger if exists school_settings_capture_audit on public.school_settings;
create trigger school_settings_capture_audit after insert or update or delete on public.school_settings
for each row execute function private.capture_audit_event();

drop trigger if exists student_guardians_capture_audit on public.student_guardians;
create trigger student_guardians_capture_audit after insert or update or delete on public.student_guardians
for each row execute function private.capture_audit_event();

drop trigger if exists student_payments_capture_audit on public.student_payments;
create trigger student_payments_capture_audit after insert or update or delete on public.student_payments
for each row execute function private.capture_audit_event();

drop trigger if exists students_capture_audit on public.students;
create trigger students_capture_audit after insert or update or delete on public.students
for each row execute function private.capture_audit_event();

drop trigger if exists teacher_class_assignments_capture_audit on public.teacher_class_assignments;
create trigger teacher_class_assignments_capture_audit after insert or update or delete on public.teacher_class_assignments
for each row execute function private.capture_audit_event();

drop trigger if exists teacher_profiles_capture_audit on public.teacher_profiles;
create trigger teacher_profiles_capture_audit after insert or update or delete on public.teacher_profiles
for each row execute function private.capture_audit_event();

drop trigger if exists report_cards_capture_audit on public.report_cards;
create trigger report_cards_capture_audit after insert or update or delete on public.report_cards
for each row execute function private.capture_audit_event();

-- Explicit account events are used because Auth admin mutations run through a
-- service-role connection. The caller is still authenticated with the user's JWT.
create or replace function public.append_account_audit_event(
  p_target_user_id uuid,
  p_event_name text,
  p_details jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.app_role;
  v_event_name text := upper(btrim(coalesce(p_event_name, '')));
  v_id bigint;
  v_details jsonb;
begin
  if v_actor is null or (select private.current_user_role()) is distinct from 'admin'::public.app_role then
    raise exception 'Hanya Admin yang dapat mencatat aktivitas akun.' using errcode = '42501';
  end if;

  if v_event_name not in ('ACCOUNT_CREATED','ACCOUNT_UPDATED','ACCOUNT_DELETED','PASSWORD_RESET_REQUESTED') then
    raise exception 'Jenis aktivitas akun tidak valid.' using errcode = '22023';
  end if;

  select up.role into v_actor_role from public.user_profiles up where up.id = v_actor;
  v_details := private.audit_sanitize_payload('account_management', coalesce(p_details, '{}'::jsonb));

  insert into public.audit_events(
    table_name, record_id, record_key, action, event_name,
    actor_user_id, actor_role, old_data, new_data, changed_fields
  ) values (
    'account_management', p_target_user_id, p_target_user_id::text, 'EVENT', v_event_name,
    v_actor, v_actor_role, null, v_details,
    coalesce(array(select jsonb_object_keys(v_details)), '{}'::text[])
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.append_account_audit_event(uuid, text, jsonb) from public, anon;
grant execute on function public.append_account_audit_event(uuid, text, jsonb) to authenticated;

create or replace view public.audit_events_view
with (security_invoker = true)
as
select
  ae.id,
  ae.table_name,
  ae.record_id,
  ae.record_key,
  ae.action,
  ae.event_name,
  ae.actor_user_id,
  ae.actor_role,
  up.display_name as actor_display_name,
  ae.old_data,
  ae.new_data,
  ae.changed_fields,
  ae.changed_at
from public.audit_events ae
left join public.user_profiles up on up.id = ae.actor_user_id;

grant select on public.audit_events_view to authenticated;

commit;
