begin;

drop policy if exists "admin manage teacher profiles" on public.teacher_profiles;

create policy "admin insert teacher profiles"
on public.teacher_profiles
for insert
to authenticated
with check ((select private.current_user_role()) = 'admin'::public.app_role);

create policy "admin update teacher profiles"
on public.teacher_profiles
for update
to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role)
with check ((select private.current_user_role()) = 'admin'::public.app_role);

create policy "admin delete teacher profiles"
on public.teacher_profiles
for delete
to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role);

commit;
