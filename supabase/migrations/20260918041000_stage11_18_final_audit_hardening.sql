begin;

-- Stage 11.18 final production audit:
-- close remaining safe Performance Advisor FK-index findings.
create index if not exists academic_years_created_by_idx
  on public.academic_years(created_by);

create index if not exists payment_transactions_created_by_idx
  on public.payment_transactions(created_by);

create index if not exists payment_transactions_voided_by_idx
  on public.payment_transactions(voided_by);

create index if not exists school_settings_academic_year_id_idx
  on public.school_settings(academic_year_id);

-- These tables are intentionally RPC/service-role only. Explicit deny policies
-- document the boundary while service_role continues to bypass RLS.
drop policy if exists "announcement_reads_no_direct_client_access" on public.announcement_reads;
create policy "announcement_reads_no_direct_client_access"
on public.announcement_reads
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "school_document_storage_cleanup_no_direct_client_access" on public.school_document_storage_cleanup;
create policy "school_document_storage_cleanup_no_direct_client_access"
on public.school_document_storage_cleanup
for all
to anon, authenticated
using (false)
with check (false);

commit;
