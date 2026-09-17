drop policy if exists "role based announcement access" on public.announcements;
drop policy if exists "staff create announcements" on public.announcements;
drop policy if exists "staff update announcements" on public.announcements;
drop policy if exists "staff delete announcements" on public.announcements;

create policy "announcement read access" on public.announcements
for select to authenticated
using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and (
      created_by = (select auth.uid())
      or (is_published = true and audience in ('all','teacher'))
    )
  )
  or (
    (select private.current_user_role()) = 'parent'::public.app_role
    and is_published = true
    and audience in ('all','parent')
  )
);

create policy "staff create own announcements" on public.announcements
for insert to authenticated
with check (
  (select private.current_user_role()) in ('admin'::public.app_role,'teacher'::public.app_role)
  and created_by = (select auth.uid())
);

create policy "staff update permitted announcements" on public.announcements
for update to authenticated
using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and created_by = (select auth.uid())
  )
)
with check (
  (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and created_by = (select auth.uid())
  )
);

create policy "staff delete permitted announcements" on public.announcements
for delete to authenticated
using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and created_by = (select auth.uid())
  )
);

alter table public.student_payments
  drop constraint if exists student_payments_paid_not_over_amount,
  drop constraint if exists student_payments_status_amount_consistency;

alter table public.student_payments
  add constraint student_payments_paid_not_over_amount
    check (paid_amount <= amount),
  add constraint student_payments_status_amount_consistency
    check (
      status = 'waived'
      or (status = 'unpaid' and paid_amount = 0)
      or (status = 'partial' and paid_amount > 0 and paid_amount < amount)
      or (status = 'paid' and amount > 0 and paid_amount = amount)
    );

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  table_name text not null check (table_name in ('announcements','student_payments')),
  record_id uuid not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  actor_user_id uuid,
  actor_role public.app_role,
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now(),
  constraint audit_events_payload_check check (
    (action = 'INSERT' and old_data is null and new_data is not null)
    or (action = 'UPDATE' and old_data is not null and new_data is not null)
    or (action = 'DELETE' and old_data is not null and new_data is null)
  )
);

create index if not exists audit_events_changed_at_idx on public.audit_events(changed_at desc);
create index if not exists audit_events_record_idx on public.audit_events(table_name, record_id, changed_at desc);
create index if not exists audit_events_actor_idx on public.audit_events(actor_user_id, changed_at desc);

alter table public.audit_events enable row level security;

drop policy if exists "admin read audit events" on public.audit_events;
create policy "admin read audit events" on public.audit_events
for select to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role);

grant select on public.audit_events to authenticated;
revoke insert, update, delete on public.audit_events from authenticated, anon;

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

  v_actor_role := private.current_user_role();

  insert into public.audit_events(
    table_name,
    record_id,
    action,
    actor_user_id,
    actor_role,
    old_data,
    new_data
  ) values (
    tg_table_name,
    v_record_id,
    tg_op,
    auth.uid(),
    v_actor_role,
    v_old,
    v_new
  );

  return coalesce(new, old);
end;
$$;

revoke all on function private.capture_audit_event() from public;

drop trigger if exists announcements_capture_audit on public.announcements;
create trigger announcements_capture_audit
after insert or update or delete on public.announcements
for each row execute function private.capture_audit_event();

drop trigger if exists student_payments_capture_audit on public.student_payments;
create trigger student_payments_capture_audit
after insert or update or delete on public.student_payments
for each row execute function private.capture_audit_event();

create or replace view public.audit_events_view
with (security_invoker = true)
as
select
  ae.id,
  ae.table_name,
  ae.record_id,
  ae.action,
  ae.actor_user_id,
  ae.actor_role,
  up.display_name as actor_display_name,
  ae.old_data,
  ae.new_data,
  ae.changed_at
from public.audit_events ae
left join public.user_profiles up on up.id = ae.actor_user_id;

grant select on public.audit_events_view to authenticated;
