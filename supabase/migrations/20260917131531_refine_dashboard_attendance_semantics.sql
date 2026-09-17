create or replace function public.dashboard_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_day_of_week integer := extract(isodow from (now() at time zone 'Asia/Jakarta'))::integer;
  v_active_students integer := 0;
  v_recorded_today integer := 0;
  v_attendance_today integer := 0;
  v_late_today integer := 0;
  v_absent_today integer := 0;
  v_active_accounts integer := 0;
  v_draft_reports integer := 0;
  v_open_payments integer := 0;
  v_today_schedule_count integer := 0;
  v_published_announcements integer := 0;
  v_today_schedule jsonb := '[]'::jsonb;
  v_recent_attendance jsonb := '[]'::jsonb;
  v_recent_announcements jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select up.role
    into v_role
  from public.user_profiles up
  where up.id = auth.uid()
    and up.is_active = true;

  if v_role is null then
    raise exception 'Active user profile not found' using errcode = '42501';
  end if;

  select count(*)::integer
    into v_active_students
  from public.students s
  where s.is_active = true;

  select count(*)::integer,
         count(*) filter (where ar.status in ('present', 'late'))::integer,
         count(*) filter (where ar.status = 'late')::integer,
         count(*) filter (where ar.status = 'absent')::integer
    into v_recorded_today, v_attendance_today, v_late_today, v_absent_today
  from public.attendance_records ar
  where ar.attendance_date = v_today;

  select count(*)::integer
    into v_draft_reports
  from public.report_cards rc
  where rc.is_published = false;

  if v_role = 'admin'::public.app_role then
    select count(*)::integer
      into v_active_accounts
    from public.user_profiles up
    where up.is_active = true;
  end if;

  if v_role in ('admin'::public.app_role, 'parent'::public.app_role) then
    select count(*)::integer
      into v_open_payments
    from public.student_payments sp
    where sp.status in ('unpaid', 'partial');
  end if;

  select count(*)::integer
    into v_today_schedule_count
  from public.school_schedules ss
  where ss.is_active = true
    and ss.day_of_week = v_day_of_week;

  select count(*)::integer
    into v_published_announcements
  from public.announcements a
  where a.is_published = true;

  select coalesce(jsonb_agg(to_jsonb(schedule_row) order by schedule_row.start_time), '[]'::jsonb)
    into v_today_schedule
  from (
    select ss.id,
           ss.class_name,
           ss.activity,
           ss.start_time,
           ss.end_time,
           ss.teacher_name
    from public.school_schedules ss
    where ss.is_active = true
      and ss.day_of_week = v_day_of_week
    order by ss.start_time
    limit 4
  ) schedule_row;

  if v_role in ('admin'::public.app_role, 'teacher'::public.app_role) then
    select coalesce(jsonb_agg(to_jsonb(attendance_row) order by attendance_row.event_time desc), '[]'::jsonb)
      into v_recent_attendance
    from (
      select ar.id,
             ar.student_id,
             s.full_name as student_name,
             ar.status,
             ar.check_in,
             ar.check_out,
             coalesce(ar.check_out, ar.check_in, ar.created_at) as event_time
      from public.attendance_records ar
      join public.students s on s.id = ar.student_id
      where ar.attendance_date = v_today
      order by coalesce(ar.check_out, ar.check_in, ar.created_at) desc
      limit 5
    ) attendance_row;
  end if;

  select coalesce(jsonb_agg(to_jsonb(announcement_row) order by announcement_row.created_at desc), '[]'::jsonb)
    into v_recent_announcements
  from (
    select a.id,
           a.title,
           a.created_at
    from public.announcements a
    where a.is_published = true
    order by a.created_at desc
    limit 3
  ) announcement_row;

  return jsonb_build_object(
    'role', v_role::text,
    'generated_at', now(),
    'attendance_date', v_today,
    'active_students', v_active_students,
    'attendance_today', v_attendance_today,
    'recorded_today', v_recorded_today,
    'late_today', v_late_today,
    'absent_today', v_absent_today,
    'unrecorded_today', greatest(v_active_students - v_recorded_today, 0),
    'active_accounts', v_active_accounts,
    'draft_reports', v_draft_reports,
    'open_payments', v_open_payments,
    'today_schedule_count', v_today_schedule_count,
    'published_announcements', v_published_announcements,
    'today_schedule', v_today_schedule,
    'recent_attendance', v_recent_attendance,
    'recent_announcements', v_recent_announcements
  );
end;
$$;

comment on function public.dashboard_summary() is
  'Role-scoped dashboard summary. SECURITY INVOKER preserves RLS. Attendance KPI separates present/late, absent, and unrecorded students.';

revoke all on function public.dashboard_summary() from public;
revoke all on function public.dashboard_summary() from anon;
grant execute on function public.dashboard_summary() to authenticated;
