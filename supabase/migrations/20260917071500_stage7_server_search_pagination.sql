create extension if not exists pg_trgm with schema extensions;

create index if not exists students_full_name_trgm_idx
  on public.students using gin (full_name extensions.gin_trgm_ops);
create index if not exists students_class_name_trgm_idx
  on public.students using gin (class_name extensions.gin_trgm_ops);
create index if not exists students_nis_trgm_idx
  on public.students using gin (nis extensions.gin_trgm_ops);
create index if not exists students_nisn_trgm_idx
  on public.students using gin (nisn extensions.gin_trgm_ops);
create index if not exists students_nik_trgm_idx
  on public.students using gin (nik extensions.gin_trgm_ops);
create index if not exists user_profiles_display_name_trgm_idx
  on public.user_profiles using gin (display_name extensions.gin_trgm_ops);
create index if not exists teacher_profiles_full_name_trgm_idx
  on public.teacher_profiles using gin (full_name extensions.gin_trgm_ops);
create index if not exists teacher_profiles_nik_trgm_idx
  on public.teacher_profiles using gin (nik extensions.gin_trgm_ops);
create index if not exists teacher_profiles_employee_no_trgm_idx
  on public.teacher_profiles using gin (employee_no extensions.gin_trgm_ops);
create index if not exists teacher_profiles_nuptk_trgm_idx
  on public.teacher_profiles using gin (nuptk extensions.gin_trgm_ops);
create index if not exists teacher_profiles_position_trgm_idx
  on public.teacher_profiles using gin (position extensions.gin_trgm_ops);
create index if not exists school_documents_title_trgm_idx
  on public.school_documents using gin (title extensions.gin_trgm_ops);
create index if not exists school_documents_category_trgm_idx
  on public.school_documents using gin (category extensions.gin_trgm_ops);
create index if not exists school_documents_number_trgm_idx
  on public.school_documents using gin (document_number extensions.gin_trgm_ops);
create index if not exists school_documents_recipient_trgm_idx
  on public.school_documents using gin (recipient extensions.gin_trgm_ops);
create index if not exists report_cards_academic_year_trgm_idx
  on public.report_cards using gin (academic_year extensions.gin_trgm_ops);
create index if not exists student_payments_type_trgm_idx
  on public.student_payments using gin (payment_type extensions.gin_trgm_ops);
create index if not exists student_payments_period_trgm_idx
  on public.student_payments using gin (period_label extensions.gin_trgm_ops);

create or replace view public.attendance_records_search
with (security_invoker = true)
as
select
  a.id,
  a.student_id,
  a.attendance_date,
  a.check_in,
  a.check_out,
  a.status,
  a.recorded_by,
  a.created_at,
  a.updated_at,
  s.full_name as student_full_name,
  s.class_name as student_class_name,
  s.nis as student_nis
from public.attendance_records a
join public.students s on s.id = a.student_id;

create or replace view public.report_cards_search
with (security_invoker = true)
as
select
  r.id,
  r.student_id,
  r.academic_year,
  r.semester,
  r.religion_character,
  r.identity_independence,
  r.literacy_steam,
  r.growth_notes,
  r.teacher_note,
  r.is_published,
  r.created_by,
  r.created_at,
  r.updated_at,
  s.full_name as student_full_name,
  s.class_name as student_class_name
from public.report_cards r
join public.students s on s.id = r.student_id;

create or replace view public.student_payments_search
with (security_invoker = true)
as
select
  p.id,
  p.student_id,
  p.payment_type,
  p.period_label,
  p.amount,
  p.paid_amount,
  p.due_date,
  p.paid_at,
  p.status,
  p.notes,
  p.created_by,
  p.created_at,
  p.updated_at,
  s.full_name as student_full_name,
  s.class_name as student_class_name
from public.student_payments p
join public.students s on s.id = p.student_id;

create or replace view public.teacher_profiles_search
with (security_invoker = true)
as
select
  t.id,
  t.teacher_user_id,
  t.full_name,
  t.nik,
  t.employee_no,
  t.nuptk,
  t.position,
  t.employment_status,
  t.education,
  t.gender,
  t.birth_place,
  t.birth_date,
  t.joined_date,
  t.notes,
  t.created_at,
  t.updated_at,
  u.display_name as account_display_name,
  u.phone as account_phone,
  u.is_active as account_is_active
from public.teacher_profiles t
left join public.user_profiles u on u.id = t.teacher_user_id;

grant select on public.attendance_records_search to authenticated;
grant select on public.report_cards_search to authenticated;
grant select on public.student_payments_search to authenticated;
grant select on public.teacher_profiles_search to authenticated;

create or replace function public.attendance_summary_for_date(
  p_date date,
  p_student_id uuid default null
)
returns table (
  total_records bigint,
  checked_out_records bigint,
  late_records bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint as total_records,
    count(*) filter (where a.check_out is not null)::bigint as checked_out_records,
    count(*) filter (where a.status = 'late')::bigint as late_records
  from public.attendance_records a
  where a.attendance_date = p_date
    and (p_student_id is null or a.student_id = p_student_id);
$$;

create or replace function public.payment_summary(
  p_student_id uuid default null
)
returns table (
  total_billed numeric,
  total_paid numeric,
  total_outstanding numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(p.amount), 0)::numeric as total_billed,
    coalesce(sum(least(p.amount, p.paid_amount)), 0)::numeric as total_paid,
    coalesce(sum(case when p.status = 'waived' then 0 else greatest(p.amount - p.paid_amount, 0) end), 0)::numeric as total_outstanding
  from public.student_payments p
  where p_student_id is null or p.student_id = p_student_id;
$$;

grant execute on function public.attendance_summary_for_date(date, uuid) to authenticated;
grant execute on function public.payment_summary(uuid) to authenticated;
