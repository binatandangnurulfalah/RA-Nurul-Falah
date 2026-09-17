create or replace function private.bootstrap_create_user_with_hash(
  p_email text,
  p_password_hash text,
  p_display_name text,
  p_role public.app_role
) returns uuid
language plpgsql
security definer
set search_path = auth, public, extensions
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  if exists(select 1 from auth.users where lower(email)=lower(p_email)) then
    select id into v_id from auth.users where lower(email)=lower(p_email) limit 1;
    update public.user_profiles set role=p_role, display_name=p_display_name, is_active=true, updated_at=now() where id=v_id;
    return v_id;
  end if;

  if not exists(select 1 from public.account_allowlist where lower(email)=lower(p_email) and is_active=true and used_at is null) then
    insert into public.account_allowlist(email, role, display_name, is_active)
    values (lower(p_email), p_role, p_display_name, true);
  end if;

  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous,
    confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',lower(p_email),p_password_hash,now(),now(),
    jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
    jsonb_build_object('email_verified',true,'display_name',p_display_name),
    now(),now(),false,false,'','','','','',''
  );

  insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at,email)
  values (
    gen_random_uuid(),v_id::text,v_id,
    jsonb_build_object('sub',v_id::text,'email',lower(p_email),'email_verified',true,'phone_verified',false),
    'email',now(),now(),now(),lower(p_email)
  );

  update public.user_profiles set role=p_role, display_name=p_display_name, is_active=true, updated_at=now() where id=v_id;
  return v_id;
end;
$$;
revoke all on function private.bootstrap_create_user_with_hash(text,text,text,public.app_role) from public, anon, authenticated;