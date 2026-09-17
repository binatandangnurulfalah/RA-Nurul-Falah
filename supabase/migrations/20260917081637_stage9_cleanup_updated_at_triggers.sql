-- Canonicalize updated_at maintenance after historical migrations introduced
-- both set_updated_at and touch_updated_at.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
drop trigger if exists user_profiles_touch_updated_at on public.user_profiles;
create trigger user_profiles_touch_updated_at before update on public.user_profiles
for each row execute function public.touch_updated_at();

drop trigger if exists teacher_profiles_touch_updated_at on public.teacher_profiles;
create trigger teacher_profiles_touch_updated_at before update on public.teacher_profiles
for each row execute function public.touch_updated_at();

drop trigger if exists report_cards_touch_updated_at on public.report_cards;
create trigger report_cards_touch_updated_at before update on public.report_cards
for each row execute function public.touch_updated_at();

drop trigger if exists student_payments_touch_updated_at on public.student_payments;
create trigger student_payments_touch_updated_at before update on public.student_payments
for each row execute function public.touch_updated_at();

drop trigger if exists school_documents_touch_updated_at on public.school_documents;
create trigger school_documents_touch_updated_at before update on public.school_documents
for each row execute function public.touch_updated_at();

drop function if exists public.set_updated_at();

