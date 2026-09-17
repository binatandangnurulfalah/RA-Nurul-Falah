revoke all privileges on table public.audit_events from anon, authenticated;
grant select on table public.audit_events to authenticated;

revoke all privileges on table public.audit_events_view from anon, authenticated;
grant select on table public.audit_events_view to authenticated;

revoke all privileges on sequence public.audit_events_id_seq from anon, authenticated;
revoke all privileges on function private.capture_audit_event() from anon, authenticated;
