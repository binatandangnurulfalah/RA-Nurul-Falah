alter function public.update_my_profile(text, text, text, text) security invoker;
revoke execute on function public.update_my_profile(text, text, text, text) from public;
revoke execute on function public.update_my_profile(text, text, text, text) from anon;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;
