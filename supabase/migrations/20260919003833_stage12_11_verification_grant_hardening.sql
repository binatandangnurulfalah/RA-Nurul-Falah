begin;

revoke all on table public.parent_family_profiles from anon, authenticated;
revoke all on table public.parent_verification_requests from anon, authenticated;

grant select on table public.parent_family_profiles to authenticated;
grant select on table public.parent_verification_requests to authenticated;

commit;
