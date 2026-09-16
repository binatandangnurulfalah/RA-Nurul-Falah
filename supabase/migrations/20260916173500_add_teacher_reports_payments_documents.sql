create table if not exists public.teacher_profiles (
  teacher_user_id uuid primary key references public.user_profiles(id) on delete cascade,
  employee_no text unique,
  nuptk text unique,
  position text,
  employment_status text,
  education text,
  gender text check (gender is null or gender in ('L','P')),
  birth_place text,
  birth_date date,
  joined_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_cards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year text not null,
  semester smallint not null check (semester in (1,2)),
  religion_character text,
  identity_independence text,
  literacy_steam text,
  growth_notes text,
  teacher_note text,
  is_published boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_year, semester)
);

create table if not exists public.student_payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  payment_type text not null,
  period_label text,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  due_date date,
  paid_at timestamptz,
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid','waived')),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Umum',
  document_number text,
  document_date date,
  recipient text,
  description text,
  file_url text,
  audience text not null default 'all' check (audience in ('all','admin','teacher','parent')),
  is_published boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists report_cards_student_idx on public.report_cards(student_id);
create index if not exists report_cards_published_idx on public.report_cards(is_published, academic_year, semester);
create index if not exists student_payments_student_idx on public.student_payments(student_id);
create index if not exists student_payments_status_idx on public.student_payments(status, due_date);
create index if not exists school_documents_audience_idx on public.school_documents(audience, is_published, document_date);

alter table public.teacher_profiles enable row level security;
alter table public.report_cards enable row level security;
alter table public.student_payments enable row level security;
alter table public.school_documents enable row level security;

drop policy if exists "teacher profile access" on public.teacher_profiles;
create policy "teacher profile access" on public.teacher_profiles
for select to authenticated
using ((select private.current_user_role()) = 'admin'::app_role or teacher_user_id = (select auth.uid()));

drop policy if exists "admin manage teacher profiles" on public.teacher_profiles;
create policy "admin manage teacher profiles" on public.teacher_profiles
for all to authenticated
using ((select private.current_user_role()) = 'admin'::app_role)
with check ((select private.current_user_role()) = 'admin'::app_role);

drop policy if exists "role based report access" on public.report_cards;
create policy "role based report access" on public.report_cards
for select to authenticated
using (
  (select private.current_user_role()) in ('admin'::app_role, 'teacher'::app_role)
  or (is_published = true and exists (
    select 1 from public.student_guardians sg
    where sg.student_id = report_cards.student_id and sg.guardian_user_id = (select auth.uid())
  ))
);

drop policy if exists "staff create reports" on public.report_cards;
create policy "staff create reports" on public.report_cards
for insert to authenticated
with check ((select private.current_user_role()) in ('admin'::app_role, 'teacher'::app_role) and created_by = (select auth.uid()));

drop policy if exists "staff update reports" on public.report_cards;
create policy "staff update reports" on public.report_cards
for update to authenticated
using ((select private.current_user_role()) in ('admin'::app_role, 'teacher'::app_role))
with check ((select private.current_user_role()) in ('admin'::app_role, 'teacher'::app_role));

drop policy if exists "admin delete reports" on public.report_cards;
create policy "admin delete reports" on public.report_cards
for delete to authenticated
using ((select private.current_user_role()) = 'admin'::app_role);

drop policy if exists "payment access" on public.student_payments;
create policy "payment access" on public.student_payments
for select to authenticated
using (
  (select private.current_user_role()) = 'admin'::app_role
  or exists (
    select 1 from public.student_guardians sg
    where sg.student_id = student_payments.student_id and sg.guardian_user_id = (select auth.uid())
  )
);

drop policy if exists "admin create payments" on public.student_payments;
create policy "admin create payments" on public.student_payments
for insert to authenticated
with check ((select private.current_user_role()) = 'admin'::app_role and created_by = (select auth.uid()));

drop policy if exists "admin update payments" on public.student_payments;
create policy "admin update payments" on public.student_payments
for update to authenticated
using ((select private.current_user_role()) = 'admin'::app_role)
with check ((select private.current_user_role()) = 'admin'::app_role);

drop policy if exists "admin delete payments" on public.student_payments;
create policy "admin delete payments" on public.student_payments
for delete to authenticated
using ((select private.current_user_role()) = 'admin'::app_role);

drop policy if exists "document access" on public.school_documents;
create policy "document access" on public.school_documents
for select to authenticated
using (
  (select private.current_user_role()) = 'admin'::app_role
  or (is_published = true and (
    ((select private.current_user_role()) = 'teacher'::app_role and audience in ('all','teacher'))
    or ((select private.current_user_role()) = 'parent'::app_role and audience in ('all','parent'))
  ))
);

drop policy if exists "admin create documents" on public.school_documents;
create policy "admin create documents" on public.school_documents
for insert to authenticated
with check ((select private.current_user_role()) = 'admin'::app_role and created_by = (select auth.uid()));

drop policy if exists "admin update documents" on public.school_documents;
create policy "admin update documents" on public.school_documents
for update to authenticated
using ((select private.current_user_role()) = 'admin'::app_role)
with check ((select private.current_user_role()) = 'admin'::app_role);

drop policy if exists "admin delete documents" on public.school_documents;
create policy "admin delete documents" on public.school_documents
for delete to authenticated
using ((select private.current_user_role()) = 'admin'::app_role);

drop trigger if exists teacher_profiles_touch_updated_at on public.teacher_profiles;
create trigger teacher_profiles_touch_updated_at before update on public.teacher_profiles
for each row execute function public.set_updated_at();

drop trigger if exists report_cards_touch_updated_at on public.report_cards;
create trigger report_cards_touch_updated_at before update on public.report_cards
for each row execute function public.set_updated_at();

drop trigger if exists student_payments_touch_updated_at on public.student_payments;
create trigger student_payments_touch_updated_at before update on public.student_payments
for each row execute function public.set_updated_at();

drop trigger if exists school_documents_touch_updated_at on public.school_documents;
create trigger school_documents_touch_updated_at before update on public.school_documents
for each row execute function public.set_updated_at();
