begin;

create table if not exists public.parent_family_profiles (
  guardian_user_id uuid primary key references public.user_profiles(id) on delete cascade,
  account_display_name text not null,
  primary_phone text,
  family_card_no text,
  family_address text,
  father_name text,
  father_nik text,
  father_birth_place text,
  father_birth_date date,
  father_phone text,
  father_education text,
  father_occupation text,
  mother_name text,
  mother_nik text,
  mother_birth_place text,
  mother_birth_date date,
  mother_phone text,
  mother_education text,
  mother_occupation text,
  guardian_name text,
  guardian_nik text,
  guardian_relationship text,
  guardian_phone text,
  guardian_education text,
  guardian_occupation text,
  emergency_contact_name text,
  emergency_contact_phone text,
  verified_by uuid references public.user_profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parent_family_profiles_display_name_check check (char_length(btrim(account_display_name)) between 2 and 120),
  constraint parent_family_profiles_phone_check check (primary_phone is null or char_length(primary_phone) between 8 and 25),
  constraint parent_family_profiles_card_check check (family_card_no is null or char_length(family_card_no) <= 30),
  constraint parent_family_profiles_address_check check (family_address is null or char_length(family_address) <= 1000)
);

comment on table public.parent_family_profiles is
'Canonical verified family profile for a parent/wali account. Parents cannot write this table directly; approved teacher/admin verification requests apply changes.';

drop trigger if exists parent_family_profiles_touch_updated_at on public.parent_family_profiles;
create trigger parent_family_profiles_touch_updated_at
before update on public.parent_family_profiles
for each row execute function public.touch_updated_at();

alter table public.parent_family_profiles enable row level security;

drop policy if exists "parent family profile read" on public.parent_family_profiles;
create policy "parent family profile read"
on public.parent_family_profiles
for select
to authenticated
using (
  guardian_user_id = (select auth.uid())
  or (select private.current_user_role()) = 'admin'::public.app_role
);

revoke all on table public.parent_family_profiles from anon;
revoke insert, update, delete on table public.parent_family_profiles from authenticated;
grant select on table public.parent_family_profiles to authenticated;

create table if not exists public.parent_verification_requests (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references public.user_profiles(id) on delete cascade,
  parent_display_name text not null,
  request_type text not null check (request_type in ('family_profile','child_link','child_update')),
  subject_key text not null,
  target_student_id uuid references public.students(id) on delete set null,
  proposed_data jsonb not null default '{}'::jsonb,
  current_data jsonb,
  status text not null default 'pending' check (status in ('pending','approved','changes_requested','rejected')),
  supersedes_request_id uuid references public.parent_verification_requests(id) on delete set null,
  reviewed_by uuid references public.user_profiles(id) on delete set null,
  review_comment text,
  matched_student_id uuid references public.students(id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parent_verification_parent_name_check check (char_length(btrim(parent_display_name)) between 2 and 120),
  constraint parent_verification_payload_object_check check (jsonb_typeof(proposed_data) = 'object'),
  constraint parent_verification_comment_check check (review_comment is null or char_length(review_comment) <= 1500)
);

create index if not exists parent_verification_requests_status_idx
  on public.parent_verification_requests(status, submitted_at desc);
create index if not exists parent_verification_requests_parent_idx
  on public.parent_verification_requests(parent_user_id, submitted_at desc);
create unique index if not exists parent_verification_one_pending_subject_idx
  on public.parent_verification_requests(parent_user_id, request_type, subject_key)
  where status = 'pending';

comment on table public.parent_verification_requests is
'Immutable-style parent data submissions. Every resubmission creates a new row linked through supersedes_request_id; teacher/admin review is required before canonical data changes.';

drop trigger if exists parent_verification_requests_touch_updated_at on public.parent_verification_requests;
create trigger parent_verification_requests_touch_updated_at
before update on public.parent_verification_requests
for each row execute function public.touch_updated_at();

alter table public.parent_verification_requests enable row level security;

drop policy if exists "parent verification request read" on public.parent_verification_requests;
create policy "parent verification request read"
on public.parent_verification_requests
for select
to authenticated
using (
  parent_user_id = (select auth.uid())
  or (select private.current_user_role()) in ('teacher'::public.app_role, 'admin'::public.app_role)
);

revoke all on table public.parent_verification_requests from anon;
revoke insert, update, delete on table public.parent_verification_requests from authenticated;
grant select on table public.parent_verification_requests to authenticated;

create or replace function private.guard_parent_profile_verified_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() = old.id
     and (select private.current_user_role()) = 'parent'::public.app_role
     and (
       new.display_name is distinct from old.display_name
       or new.phone is distinct from old.phone
       or new.address is distinct from old.address
     ) then
    raise exception 'Nama, telepon, dan alamat resmi Orang Tua/Wali harus diajukan melalui menu Data Keluarga untuk diverifikasi Guru.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_parent_profile_verified_fields() from public, anon, authenticated;

drop trigger if exists user_profiles_parent_verified_fields_guard on public.user_profiles;
create trigger user_profiles_parent_verified_fields_guard
before update on public.user_profiles
for each row
execute function private.guard_parent_profile_verified_fields();

create or replace function private.teacher_can_verify_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select private.current_user_role()) = 'admin'::public.app_role then true
    when (select private.current_user_role()) = 'teacher'::public.app_role then
      (
        not coalesce((
          select ss.single_teacher_class_mode
          from public.school_settings ss
          where ss.id = 1
        ), false)
        or (select private.teacher_can_access_student(target_student_id))
      )
    else false
  end;
$$;

revoke all on function private.teacher_can_verify_student(uuid) from public, anon, authenticated;

create or replace function public.submit_parent_family_verification(
  p_payload jsonb,
  p_supersedes_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := (select private.current_user_role());
  v_profile public.user_profiles;
  v_existing public.parent_family_profiles;
  v_request_id uuid;
  v_clean jsonb;
  v_current jsonb;
  v_account_name text := nullif(btrim(coalesce(p_payload->>'account_display_name', '')), '');
  v_phone text := nullif(btrim(coalesce(p_payload->>'primary_phone', '')), '');
  v_address text := nullif(btrim(coalesce(p_payload->>'family_address', '')), '');
  v_father text := nullif(btrim(coalesce(p_payload->>'father_name', '')), '');
  v_mother text := nullif(btrim(coalesce(p_payload->>'mother_name', '')), '');
  v_guardian text := nullif(btrim(coalesce(p_payload->>'guardian_name', '')), '');
begin
  if v_actor is null or v_role is distinct from 'parent'::public.app_role then
    raise exception 'Hanya akun Orang Tua/Wali aktif yang dapat mengajukan data keluarga.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'Format data keluarga tidak valid.' using errcode = '22023';
  end if;

  select * into v_profile
  from public.user_profiles
  where id = v_actor and is_active = true;

  if v_profile.id is null then
    raise exception 'Profil Orang Tua/Wali aktif tidak ditemukan.' using errcode = 'P0002';
  end if;

  if v_account_name is null or char_length(v_account_name) > 120 then
    raise exception 'Nama pemilik akun wajib diisi 2-120 karakter.' using errcode = '22023';
  end if;
  if char_length(v_account_name) < 2 then
    raise exception 'Nama pemilik akun wajib diisi 2-120 karakter.' using errcode = '22023';
  end if;

  if v_phone is null or v_phone !~ '^[+0-9][0-9[:space:]-]{7,24}$' then
    raise exception 'Nomor telepon utama belum valid.' using errcode = '22023';
  end if;

  if v_address is null or char_length(v_address) < 5 or char_length(v_address) > 1000 then
    raise exception 'Alamat keluarga wajib diisi 5-1000 karakter.' using errcode = '22023';
  end if;

  if v_father is null and v_mother is null and v_guardian is null then
    raise exception 'Isi minimal salah satu data Ayah, Ibu, atau Wali.' using errcode = '22023';
  end if;

  if char_length(coalesce(p_payload->>'family_card_no','')) > 30 then
    raise exception 'Nomor KK terlalu panjang.' using errcode = '22023';
  end if;

  if p_supersedes_request_id is not null and not exists (
    select 1 from public.parent_verification_requests r
    where r.id = p_supersedes_request_id
      and r.parent_user_id = v_actor
      and r.request_type = 'family_profile'
      and r.status in ('changes_requested','rejected')
  ) then
    raise exception 'Pengajuan sebelumnya tidak valid untuk dikirim ulang.' using errcode = '22023';
  end if;

  select * into v_existing
  from public.parent_family_profiles
  where guardian_user_id = v_actor;

  v_current := jsonb_build_object(
    'account_display_name', v_profile.display_name,
    'primary_phone', coalesce(v_existing.primary_phone, v_profile.phone),
    'family_card_no', v_existing.family_card_no,
    'family_address', coalesce(v_existing.family_address, v_profile.address),
    'father_name', v_existing.father_name,
    'father_nik', v_existing.father_nik,
    'father_birth_place', v_existing.father_birth_place,
    'father_birth_date', v_existing.father_birth_date,
    'father_phone', v_existing.father_phone,
    'father_education', v_existing.father_education,
    'father_occupation', v_existing.father_occupation,
    'mother_name', v_existing.mother_name,
    'mother_nik', v_existing.mother_nik,
    'mother_birth_place', v_existing.mother_birth_place,
    'mother_birth_date', v_existing.mother_birth_date,
    'mother_phone', v_existing.mother_phone,
    'mother_education', v_existing.mother_education,
    'mother_occupation', v_existing.mother_occupation,
    'guardian_name', v_existing.guardian_name,
    'guardian_nik', v_existing.guardian_nik,
    'guardian_relationship', v_existing.guardian_relationship,
    'guardian_phone', v_existing.guardian_phone,
    'guardian_education', v_existing.guardian_education,
    'guardian_occupation', v_existing.guardian_occupation,
    'emergency_contact_name', v_existing.emergency_contact_name,
    'emergency_contact_phone', v_existing.emergency_contact_phone
  );

  v_clean := jsonb_build_object(
    'account_display_name', v_account_name,
    'primary_phone', v_phone,
    'family_card_no', nullif(btrim(coalesce(p_payload->>'family_card_no','')), ''),
    'family_address', v_address,
    'father_name', v_father,
    'father_nik', nullif(btrim(coalesce(p_payload->>'father_nik','')), ''),
    'father_birth_place', nullif(btrim(coalesce(p_payload->>'father_birth_place','')), ''),
    'father_birth_date', nullif(btrim(coalesce(p_payload->>'father_birth_date','')), ''),
    'father_phone', nullif(btrim(coalesce(p_payload->>'father_phone','')), ''),
    'father_education', nullif(btrim(coalesce(p_payload->>'father_education','')), ''),
    'father_occupation', nullif(btrim(coalesce(p_payload->>'father_occupation','')), ''),
    'mother_name', v_mother,
    'mother_nik', nullif(btrim(coalesce(p_payload->>'mother_nik','')), ''),
    'mother_birth_place', nullif(btrim(coalesce(p_payload->>'mother_birth_place','')), ''),
    'mother_birth_date', nullif(btrim(coalesce(p_payload->>'mother_birth_date','')), ''),
    'mother_phone', nullif(btrim(coalesce(p_payload->>'mother_phone','')), ''),
    'mother_education', nullif(btrim(coalesce(p_payload->>'mother_education','')), ''),
    'mother_occupation', nullif(btrim(coalesce(p_payload->>'mother_occupation','')), ''),
    'guardian_name', v_guardian,
    'guardian_nik', nullif(btrim(coalesce(p_payload->>'guardian_nik','')), ''),
    'guardian_relationship', nullif(btrim(coalesce(p_payload->>'guardian_relationship','')), ''),
    'guardian_phone', nullif(btrim(coalesce(p_payload->>'guardian_phone','')), ''),
    'guardian_education', nullif(btrim(coalesce(p_payload->>'guardian_education','')), ''),
    'guardian_occupation', nullif(btrim(coalesce(p_payload->>'guardian_occupation','')), ''),
    'emergency_contact_name', nullif(btrim(coalesce(p_payload->>'emergency_contact_name','')), ''),
    'emergency_contact_phone', nullif(btrim(coalesce(p_payload->>'emergency_contact_phone','')), '')
  );

  insert into public.parent_verification_requests (
    parent_user_id, parent_display_name, request_type, subject_key,
    proposed_data, current_data, supersedes_request_id
  ) values (
    v_actor, coalesce(v_profile.display_name, v_account_name), 'family_profile', 'family',
    v_clean, v_current, p_supersedes_request_id
  )
  returning id into v_request_id;

  return v_request_id;
exception
  when unique_violation then
    raise exception 'Masih ada pengajuan data keluarga yang menunggu verifikasi Guru.'
      using errcode = '23505';
end;
$$;

create or replace function public.submit_parent_child_verification(
  p_target_student_id uuid,
  p_payload jsonb,
  p_supersedes_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := (select private.current_user_role());
  v_profile public.user_profiles;
  v_student public.students;
  v_request_type text;
  v_subject_key text;
  v_request_id uuid;
  v_clean jsonb;
  v_current jsonb;
  v_name text := nullif(btrim(coalesce(p_payload->>'full_name','')), '');
  v_birth_date text := nullif(btrim(coalesce(p_payload->>'birth_date','')), '');
  v_gender text := nullif(btrim(coalesce(p_payload->>'gender','')), '');
  v_relationship text := nullif(btrim(coalesce(p_payload->>'relationship_to_child','')), '');
begin
  if v_actor is null or v_role is distinct from 'parent'::public.app_role then
    raise exception 'Hanya akun Orang Tua/Wali aktif yang dapat mengajukan data anak.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'Format data anak tidak valid.' using errcode = '22023';
  end if;

  select * into v_profile
  from public.user_profiles
  where id = v_actor and is_active = true;

  if v_profile.id is null then
    raise exception 'Profil Orang Tua/Wali aktif tidak ditemukan.' using errcode = 'P0002';
  end if;

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Nama lengkap anak wajib diisi 2-120 karakter.' using errcode = '22023';
  end if;
  if v_birth_date is null then
    raise exception 'Tanggal lahir anak wajib diisi.' using errcode = '22023';
  end if;
  perform v_birth_date::date;

  if v_gender not in ('L','P') then
    raise exception 'Jenis kelamin anak wajib dipilih.' using errcode = '22023';
  end if;

  if v_relationship is null or char_length(v_relationship) > 40 then
    raise exception 'Hubungan dengan anak wajib diisi.' using errcode = '22023';
  end if;

  if p_target_student_id is null then
    v_request_type := 'child_link';
    v_subject_key := lower(regexp_replace(v_name, '[[:space:]]+', ' ', 'g')) || '|' || v_birth_date;
    v_current := null;
  else
    if not exists (
      select 1
      from public.student_guardians sg
      where sg.student_id = p_target_student_id
        and sg.guardian_user_id = v_actor
    ) then
      raise exception 'Anak tersebut belum terhubung dengan akun Anda.' using errcode = '42501';
    end if;

    select * into v_student
    from public.students
    where id = p_target_student_id;

    if v_student.id is null then
      raise exception 'Data anak tidak ditemukan.' using errcode = 'P0002';
    end if;

    v_request_type := 'child_update';
    v_subject_key := p_target_student_id::text;
    v_current := jsonb_build_object(
      'full_name', v_student.full_name,
      'nik', v_student.nik,
      'nisn', v_student.nisn,
      'gender', v_student.gender,
      'birth_place', v_student.birth_place,
      'birth_date', v_student.birth_date,
      'nis', v_student.nis,
      'class_name', v_student.class_name,
      'academic_year', v_student.academic_year,
      'relationship_to_child', (
        select sg.relationship
        from public.student_guardians sg
        where sg.student_id = p_target_student_id
          and sg.guardian_user_id = v_actor
        limit 1
      )
    );
  end if;

  if p_supersedes_request_id is not null and not exists (
    select 1 from public.parent_verification_requests r
    where r.id = p_supersedes_request_id
      and r.parent_user_id = v_actor
      and r.request_type = v_request_type
      and r.status in ('changes_requested','rejected')
  ) then
    raise exception 'Pengajuan sebelumnya tidak valid untuk dikirim ulang.' using errcode = '22023';
  end if;

  v_clean := jsonb_build_object(
    'full_name', v_name,
    'nik', nullif(btrim(coalesce(p_payload->>'nik','')), ''),
    'nisn', nullif(btrim(coalesce(p_payload->>'nisn','')), ''),
    'gender', v_gender,
    'birth_place', nullif(btrim(coalesce(p_payload->>'birth_place','')), ''),
    'birth_date', v_birth_date,
    'relationship_to_child', v_relationship
  );

  insert into public.parent_verification_requests (
    parent_user_id, parent_display_name, request_type, subject_key,
    target_student_id, proposed_data, current_data, supersedes_request_id
  ) values (
    v_actor, coalesce(v_profile.display_name, 'Orang Tua/Wali'), v_request_type, v_subject_key,
    p_target_student_id, v_clean, v_current, p_supersedes_request_id
  )
  returning id into v_request_id;

  return v_request_id;
exception
  when unique_violation then
    raise exception 'Masih ada pengajuan untuk data anak tersebut yang menunggu verifikasi Guru.'
      using errcode = '23505';
end;
$$;

create or replace function public.review_parent_verification_request(
  p_request_id uuid,
  p_action text,
  p_comment text default null,
  p_matched_student_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := (select private.current_user_role());
  v_request public.parent_verification_requests;
  v_action text := lower(btrim(coalesce(p_action,'')));
  v_comment text := nullif(btrim(coalesce(p_comment,'')), '');
  v_student_id uuid;
  v_relationship text;
begin
  if v_actor is null
     or v_role not in ('teacher'::public.app_role, 'admin'::public.app_role) then
    raise exception 'Hanya Guru atau Admin yang dapat memverifikasi pengajuan Orang Tua/Wali.'
      using errcode = '42501';
  end if;

  if v_action not in ('approve','request_changes','reject') then
    raise exception 'Tindakan verifikasi tidak valid.' using errcode = '22023';
  end if;

  if v_action in ('request_changes','reject')
     and (v_comment is null or char_length(v_comment) < 5) then
    raise exception 'Alasan minimal 5 karakter wajib diisi.' using errcode = '22023';
  end if;

  if char_length(coalesce(v_comment,'')) > 1500 then
    raise exception 'Komentar verifikasi maksimal 1500 karakter.' using errcode = '22023';
  end if;

  select * into v_request
  from public.parent_verification_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Pengajuan tidak ditemukan.' using errcode = 'P0002';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Pengajuan ini sudah diproses.' using errcode = '23514';
  end if;

  if v_action = 'approve' then
    if v_request.request_type = 'family_profile' then
      insert into public.parent_family_profiles (
        guardian_user_id,
        account_display_name, primary_phone, family_card_no, family_address,
        father_name, father_nik, father_birth_place, father_birth_date, father_phone, father_education, father_occupation,
        mother_name, mother_nik, mother_birth_place, mother_birth_date, mother_phone, mother_education, mother_occupation,
        guardian_name, guardian_nik, guardian_relationship, guardian_phone, guardian_education, guardian_occupation,
        emergency_contact_name, emergency_contact_phone,
        verified_by, verified_at
      ) values (
        v_request.parent_user_id,
        v_request.proposed_data->>'account_display_name',
        nullif(v_request.proposed_data->>'primary_phone',''),
        nullif(v_request.proposed_data->>'family_card_no',''),
        nullif(v_request.proposed_data->>'family_address',''),
        nullif(v_request.proposed_data->>'father_name',''),
        nullif(v_request.proposed_data->>'father_nik',''),
        nullif(v_request.proposed_data->>'father_birth_place',''),
        nullif(v_request.proposed_data->>'father_birth_date','')::date,
        nullif(v_request.proposed_data->>'father_phone',''),
        nullif(v_request.proposed_data->>'father_education',''),
        nullif(v_request.proposed_data->>'father_occupation',''),
        nullif(v_request.proposed_data->>'mother_name',''),
        nullif(v_request.proposed_data->>'mother_nik',''),
        nullif(v_request.proposed_data->>'mother_birth_place',''),
        nullif(v_request.proposed_data->>'mother_birth_date','')::date,
        nullif(v_request.proposed_data->>'mother_phone',''),
        nullif(v_request.proposed_data->>'mother_education',''),
        nullif(v_request.proposed_data->>'mother_occupation',''),
        nullif(v_request.proposed_data->>'guardian_name',''),
        nullif(v_request.proposed_data->>'guardian_nik',''),
        nullif(v_request.proposed_data->>'guardian_relationship',''),
        nullif(v_request.proposed_data->>'guardian_phone',''),
        nullif(v_request.proposed_data->>'guardian_education',''),
        nullif(v_request.proposed_data->>'guardian_occupation',''),
        nullif(v_request.proposed_data->>'emergency_contact_name',''),
        nullif(v_request.proposed_data->>'emergency_contact_phone',''),
        v_actor, now()
      )
      on conflict (guardian_user_id) do update
      set
        account_display_name = excluded.account_display_name,
        primary_phone = excluded.primary_phone,
        family_card_no = excluded.family_card_no,
        family_address = excluded.family_address,
        father_name = excluded.father_name,
        father_nik = excluded.father_nik,
        father_birth_place = excluded.father_birth_place,
        father_birth_date = excluded.father_birth_date,
        father_phone = excluded.father_phone,
        father_education = excluded.father_education,
        father_occupation = excluded.father_occupation,
        mother_name = excluded.mother_name,
        mother_nik = excluded.mother_nik,
        mother_birth_place = excluded.mother_birth_place,
        mother_birth_date = excluded.mother_birth_date,
        mother_phone = excluded.mother_phone,
        mother_education = excluded.mother_education,
        mother_occupation = excluded.mother_occupation,
        guardian_name = excluded.guardian_name,
        guardian_nik = excluded.guardian_nik,
        guardian_relationship = excluded.guardian_relationship,
        guardian_phone = excluded.guardian_phone,
        guardian_education = excluded.guardian_education,
        guardian_occupation = excluded.guardian_occupation,
        emergency_contact_name = excluded.emergency_contact_name,
        emergency_contact_phone = excluded.emergency_contact_phone,
        verified_by = excluded.verified_by,
        verified_at = excluded.verified_at;

      update public.user_profiles
      set
        display_name = v_request.proposed_data->>'account_display_name',
        phone = nullif(v_request.proposed_data->>'primary_phone',''),
        address = nullif(v_request.proposed_data->>'family_address','')
      where id = v_request.parent_user_id;

    elsif v_request.request_type = 'child_link' then
      if p_matched_student_id is null then
        raise exception 'Pilih siswa resmi RA Nurul Falah yang sesuai sebelum menyetujui pengajuan.'
          using errcode = '22023';
      end if;

      if not (select private.teacher_can_verify_student(p_matched_student_id)) then
        raise exception 'Anda tidak memiliki akses untuk memverifikasi siswa tersebut.'
          using errcode = '42501';
      end if;

      if not exists (
        select 1 from public.students s
        where s.id = p_matched_student_id and s.is_active = true
      ) then
        raise exception 'Siswa resmi yang dipilih tidak ditemukan atau tidak aktif.'
          using errcode = 'P0002';
      end if;

      v_student_id := p_matched_student_id;

      update public.students
      set
        full_name = v_request.proposed_data->>'full_name',
        nik = nullif(v_request.proposed_data->>'nik',''),
        nisn = nullif(v_request.proposed_data->>'nisn',''),
        gender = nullif(v_request.proposed_data->>'gender',''),
        birth_place = nullif(v_request.proposed_data->>'birth_place',''),
        birth_date = nullif(v_request.proposed_data->>'birth_date','')::date
      where id = v_student_id;

      v_relationship := coalesce(nullif(v_request.proposed_data->>'relationship_to_child',''), 'Wali');
      insert into public.student_guardians(student_id, guardian_user_id, relationship)
      values (v_student_id, v_request.parent_user_id, v_relationship)
      on conflict (student_id, guardian_user_id) do update
      set relationship = excluded.relationship;

    elsif v_request.request_type = 'child_update' then
      v_student_id := v_request.target_student_id;

      if v_student_id is null
         or not exists (
           select 1 from public.student_guardians sg
           where sg.student_id = v_student_id
             and sg.guardian_user_id = v_request.parent_user_id
         ) then
        raise exception 'Hubungan Orang Tua/Wali dengan siswa sudah tidak valid.'
          using errcode = '42501';
      end if;

      if not (select private.teacher_can_verify_student(v_student_id)) then
        raise exception 'Anda tidak memiliki akses untuk memverifikasi siswa tersebut.'
          using errcode = '42501';
      end if;

      update public.students
      set
        full_name = v_request.proposed_data->>'full_name',
        nik = nullif(v_request.proposed_data->>'nik',''),
        nisn = nullif(v_request.proposed_data->>'nisn',''),
        gender = nullif(v_request.proposed_data->>'gender',''),
        birth_place = nullif(v_request.proposed_data->>'birth_place',''),
        birth_date = nullif(v_request.proposed_data->>'birth_date','')::date
      where id = v_student_id;

      update public.student_guardians
      set relationship = coalesce(nullif(v_request.proposed_data->>'relationship_to_child',''), relationship)
      where student_id = v_student_id
        and guardian_user_id = v_request.parent_user_id;
    end if;

    update public.parent_verification_requests
    set
      status = 'approved',
      reviewed_by = v_actor,
      review_comment = v_comment,
      matched_student_id = case when v_request.request_type = 'child_link' then v_student_id else matched_student_id end,
      reviewed_at = now()
    where id = v_request.id;

    return jsonb_build_object(
      'request_id', v_request.id,
      'status', 'approved',
      'student_id', v_student_id
    );
  end if;

  update public.parent_verification_requests
  set
    status = case when v_action = 'request_changes' then 'changes_requested' else 'rejected' end,
    reviewed_by = v_actor,
    review_comment = v_comment,
    reviewed_at = now()
  where id = v_request.id;

  return jsonb_build_object(
    'request_id', v_request.id,
    'status', case when v_action = 'request_changes' then 'changes_requested' else 'rejected' end
  );
end;
$$;

revoke all on function public.submit_parent_family_verification(jsonb, uuid) from public, anon;
grant execute on function public.submit_parent_family_verification(jsonb, uuid) to authenticated;

revoke all on function public.submit_parent_child_verification(uuid, jsonb, uuid) from public, anon;
grant execute on function public.submit_parent_child_verification(uuid, jsonb, uuid) to authenticated;

revoke all on function public.review_parent_verification_request(uuid, text, text, uuid) from public, anon;
grant execute on function public.review_parent_verification_request(uuid, text, text, uuid) to authenticated;

comment on function public.submit_parent_family_verification(jsonb, uuid) is
'Parent-only submission of family profile changes. Canonical data remains unchanged until reviewed.';
comment on function public.submit_parent_child_verification(uuid, jsonb, uuid) is
'Parent-only child link/update submission. New child requests never expose the school student directory to parents.';
comment on function public.review_parent_verification_request(uuid, text, text, uuid) is
'Teacher/Admin review workflow. Approval applies verified family/child data atomically; request_changes/reject require a comment.';

commit;
