begin;

revoke all privileges on table public.student_payments from anon, authenticated;
grant select on table public.student_payments to authenticated;

revoke all privileges on table public.payment_transactions from anon, authenticated;
grant select on table public.payment_transactions to authenticated;

revoke all privileges on table public.student_payments_search from anon, authenticated;
grant select on table public.student_payments_search to authenticated;

revoke all on function public.payment_summary(uuid) from public, anon;
grant execute on function public.payment_summary(uuid) to authenticated;

commit;
