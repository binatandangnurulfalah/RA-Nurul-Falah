-- Stage 12.11 v2: complete parent family verification workflow safely.

alter table public.parent_verification_requests
  add column if not exists parent_seen_at timestamptz;

comment on column public.parent_verification_requests.parent_seen_at is
  'When the parent/wali last acknowledged the reviewed status/comment for this request.';

create index if not exists parent_family_profiles_verified_by_idx
  on public.parent_family_profiles(verified_by)
  where verified_by is not null;

create index if not exists parent_verification_requests_target_student_idx
  on public.parent_verification_requests(target_student_id)
  where target_student_id is not null;

create index if not exists parent_verification_requests_matched_student_idx
  on public.parent_verification_requests(matched_student_id)
  where matched_student_id is not null;

create index if not exists parent_verification_requests_reviewed_by_idx
  on public.parent_verification_requests(reviewed_by)
  where reviewed_by is not null;

create index if not exists parent_verification_requests_supersedes_idx
  on public.parent_verification_requests(supersedes_request_id)
  where supersedes_request_id is not null;

create table if not exists public.student_parent_details (
  student_id uuid primary key
    references public.students(id) on delete cascade,
  residential_address text
    check (residential_address is null or char_length(residential_address) <= 1000),
  blood_type text
    check (blood_type is null or blood_type in ('A','B','AB','O')),
  allergies text
    check (allergies is null or char_length(allergies) <= 1000),
  health_notes text
    check (health_notes is null or char_length(health_notes) <= 2000),
  special_needs text
    check (special_needs is null or char_length(special_needs) <= 1000),
  photo_path text
    check (photo_path is null or char_length(photo_path) <= 500),
  birth_certificate_no text
    check (birth_certificate_no is null or char_length(birth_certificate_no) <= 80),
  school_admin_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(school_admin_data) = 'object'),
  document_paths jsonb not null default '[]'::jsonb
    check (jsonb_typeof(document_paths) = 'array'),
  verified_by uuid references public.user_profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.student_parent_details is
  'Canonical parent-supplied student details that become official only after teacher/admin approval.';

alter table public.student_parent_details enable row level security;

drop policy if exists "student parent details read" on public.student_parent_details;
create policy "student parent details read"
on public.student_parent_details
for select
to authenticated
using (
  (select private.current_user_role()) = 'admin'::public.app_role
  or (
    (select private.current_user_role()) = 'teacher'::public.app_role
    and (select private.teacher_can_verify_student(student_parent_details.student_id))
  )
  or exists (
    select 1
    from public.student_guardians sg
    where sg.student_id = student_parent_details.student_id
      and sg.guardian_user_id = (select auth.uid())
  )
);

drop policy if exists "admin create student parent details" on public.student_parent_details;
create policy "admin create student parent details"
on public.student_parent_details
for insert
to authenticated
with check ((select private.current_user_role()) = 'admin'::public.app_role);

drop policy if exists "admin update student parent details" on public.student_parent_details;
create policy "admin update student parent details"
on public.student_parent_details
for update
to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role)
with check ((select private.current_user_role()) = 'admin'::public.app_role);

drop policy if exists "admin delete student parent details" on public.student_parent_details;
create policy "admin delete student parent details"
on public.student_parent_details
for delete
to authenticated
using ((select private.current_user_role()) = 'admin'::public.app_role);

revoke all on public.student_parent_details from anon;
grant select, insert, update, delete on public.student_parent_details to authenticated;

create index if not exists student_parent_details_verified_by_idx
  on public.student_parent_details(verified_by)
  where verified_by is not null;

drop trigger if exists student_parent_details_touch_updated_at on public.student_parent_details;
create trigger student_parent_details_touch_updated_at
before update on public.student_parent_details
for each row execute function public.touch_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'parent-verification-files',
  'parent-verification-files',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "parent verification files authorized read" on storage.objects;
create policy "parent verification files authorized read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'parent-verification-files'
  and (
    (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and exists (
        select 1
        from public.user_profiles up
        where up.id = (select auth.uid())
          and up.is_active = true
          and up.role = 'parent'::public.app_role
      )
    )
    or (select private.current_user_role()) in (
      'teacher'::public.app_role,
      'admin'::public.app_role
    )
  )
);

drop policy if exists "parent verification files owner insert" on storage.objects;
create policy "parent verification files owner insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'parent-verification-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.user_profiles up
    where up.id = (select auth.uid())
      and up.is_active = true
      and up.role = 'parent'::public.app_role
  )
);

drop policy if exists "parent verification files owner update" on storage.objects;
create policy "parent verification files owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'parent-verification-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'parent-verification-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.user_profiles up
    where up.id = (select auth.uid())
      and up.is_active = true
      and up.role = 'parent'::public.app_role
  )
);

drop policy if exists "parent verification files owner delete" on storage.objects;
create policy "parent verification files owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'parent-verification-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.user_profiles up
    where up.id = (select auth.uid())
      and up.is_active = true
      and up.role = 'parent'::public.app_role
  )
);

create or replace function private.apply_parent_student_details(
  p_student_id uuid,
  p_payload jsonb,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.student_parent_details (
    student_id,
    residential_address,
    blood_type,
    allergies,
    health_notes,
    special_needs,
    photo_path,
    birth_certificate_no,
    school_admin_data,
    document_paths,
    verified_by,
    verified_at
  ) values (
    p_student_id,
    nullif(btrim(coalesce(p_payload->>'residential_address','')), ''),
    nullif(btrim(coalesce(p_payload->>'blood_type','')), ''),
    nullif(btrim(coalesce(p_payload->>'allergies','')), ''),
    nullif(btrim(coalesce(p_payload->>'health_notes','')), ''),
    nullif(btrim(coalesce(p_payload->>'special_needs','')), ''),
    nullif(btrim(coalesce(p_payload->>'photo_path','')), ''),
    nullif(btrim(coalesce(p_payload->>'birth_certificate_no','')), ''),
    case
      when jsonb_typeof(coalesce(p_payload->'school_admin_data','{}'::jsonb)) = 'object'
        then coalesce(p_payload->'school_admin_data','{}'::jsonb)
      else '{}'::jsonb
    end,
    case
      when jsonb_typeof(coalesce(p_payload->'document_paths','[]'::jsonb)) = 'array'
        then coalesce(p_payload->'document_paths','[]'::jsonb)
      else '[]'::jsonb
    end,
    p_actor,
    now()
  )
  on conflict (student_id) do update
  set residential_address = excluded.residential_address,
      blood_type = excluded.blood_type,
      allergies = excluded.allergies,
      health_notes = excluded.health_notes,
      special_needs = excluded.special_needs,
      photo_path = excluded.photo_path,
      birth_certificate_no = excluded.birth_certificate_no,
      school_admin_data = excluded.school_admin_data,
      document_paths = excluded.document_paths,
      verified_by = excluded.verified_by,
      verified_at = excluded.verified_at;
end;
$function$;

revoke all on function private.apply_parent_student_details(uuid, jsonb, uuid) from public, anon, authenticated;

create or replace function public.submit_parent_child_verification(
  p_target_student_id uuid,
  p_payload jsonb,
  p_supersedes_request_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := (select private.current_user_role());
  v_profile public.user_profiles;
  v_student public.students;
  v_details public.student_parent_details;
  v_request_type text;
  v_subject_key text;
  v_request_id uuid;
  v_clean jsonb;
  v_current jsonb;
  v_name text := nullif(btrim(coalesce(p_payload->>'full_name','')), '');
  v_birth_date text := nullif(btrim(coalesce(p_payload->>'birth_date','')), '');
  v_gender text := nullif(btrim(coalesce(p_payload->>'gender','')), '');
  v_relationship text := nullif(btrim(coalesce(p_payload->>'relationship_to_child','')), '');
  v_nik text := nullif(btrim(coalesce(p_payload->>'nik','')), '');
  v_nisn text := nullif(btrim(coalesce(p_payload->>'nisn','')), '');
  v_address text := nullif(btrim(coalesce(p_payload->>'residential_address','')), '');
  v_blood_type text := nullif(upper(btrim(coalesce(p_payload->>'blood_type',''))), '');
  v_allergies text := nullif(btrim(coalesce(p_payload->>'allergies','')), '');
  v_health_notes text := nullif(btrim(coalesce(p_payload->>'health_notes','')), '');
  v_special_needs text := nullif(btrim(coalesce(p_payload->>'special_needs','')), '');
  v_photo_path text := nullif(btrim(coalesce(p_payload->>'photo_path','')), '');
  v_birth_certificate_no text := nullif(btrim(coalesce(p_payload->>'birth_certificate_no','')), '');
  v_school_admin_data jsonb := coalesce(p_payload->'school_admin_data','{}'::jsonb);
  v_document_paths jsonb := coalesce(p_payload->'document_paths','[]'::jsonb);
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

  if v_nik is not null and (char_length(v_nik) > 32 or v_nik !~ '^[0-9]+$') then
    raise exception 'NIK anak hanya boleh berisi angka dan maksimal 32 digit.' using errcode = '22023';
  end if;

  if v_nisn is not null and (char_length(v_nisn) > 32 or v_nisn !~ '^[0-9]+$') then
    raise exception 'NISN anak hanya boleh berisi angka dan maksimal 32 digit.' using errcode = '22023';
  end if;

  if v_address is not null and char_length(v_address) > 1000 then
    raise exception 'Alamat anak maksimal 1000 karakter.' using errcode = '22023';
  end if;

  if v_blood_type is not null and v_blood_type not in ('A','B','AB','O') then
    raise exception 'Golongan darah tidak valid.' using errcode = '22023';
  end if;

  if v_allergies is not null and char_length(v_allergies) > 1000 then
    raise exception 'Informasi alergi maksimal 1000 karakter.' using errcode = '22023';
  end if;

  if v_health_notes is not null and char_length(v_health_notes) > 2000 then
    raise exception 'Catatan kesehatan maksimal 2000 karakter.' using errcode = '22023';
  end if;

  if v_special_needs is not null and char_length(v_special_needs) > 1000 then
    raise exception 'Catatan kebutuhan khusus maksimal 1000 karakter.' using errcode = '22023';
  end if;

  if v_birth_certificate_no is not null and char_length(v_birth_certificate_no) > 80 then
    raise exception 'Nomor akta kelahiran maksimal 80 karakter.' using errcode = '22023';
  end if;

  if v_photo_path is not null and (
    char_length(v_photo_path) > 500
    or v_photo_path not like v_actor::text || '/%'
  ) then
    raise exception 'Lokasi foto anak tidak valid.' using errcode = '22023';
  end if;

  if jsonb_typeof(v_school_admin_data) is distinct from 'object' then
    raise exception 'Data administrasi sekolah harus berupa objek.' using errcode = '22023';
  end if;

  if pg_column_size(v_school_admin_data) > 32768 then
    raise exception 'Data administrasi sekolah terlalu besar.' using errcode = '22023';
  end if;

  if jsonb_typeof(v_document_paths) is distinct from 'array' then
    raise exception 'Daftar dokumen harus berupa array.' using errcode = '22023';
  end if;

  if jsonb_array_length(v_document_paths) > 10 then
    raise exception 'Maksimal 10 dokumen pendukung per anak.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_document_paths) item
    where jsonb_typeof(item) <> 'string'
       or trim(both '"' from item::text) not like v_actor::text || '/%'
       or char_length(trim(both '"' from item::text)) > 500
  ) then
    raise exception 'Lokasi dokumen pendukung tidak valid.' using errcode = '22023';
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

    select * into v_details
    from public.student_parent_details
    where student_id = p_target_student_id;

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
      ),
      'residential_address', v_details.residential_address,
      'blood_type', v_details.blood_type,
      'allergies', v_details.allergies,
      'health_notes', v_details.health_notes,
      'special_needs', v_details.special_needs,
      'photo_path', v_details.photo_path,
      'birth_certificate_no', v_details.birth_certificate_no,
      'school_admin_data', coalesce(v_details.school_admin_data, '{}'::jsonb),
      'document_paths', coalesce(v_details.document_paths, '[]'::jsonb)
    );
  end if;

  if p_supersedes_request_id is not null and not exists (
    select 1 from public.parent_verification_requests r
    where r.id = p_supersedes_request_id
      and r.parent_user_id = v_actor
      and r.request_type = v_request_type
      and r.subject_key = v_subject_key
      and r.status in ('changes_requested','rejected')
  ) then
    raise exception 'Pengajuan sebelumnya tidak valid untuk dikirim ulang.' using errcode = '22023';
  end if;

  v_clean := jsonb_build_object(
    'full_name', v_name,
    'nik', v_nik,
    'nisn', v_nisn,
    'gender', v_gender,
    'birth_place', nullif(btrim(coalesce(p_payload->>'birth_place','')), ''),
    'birth_date', v_birth_date,
    'relationship_to_child', v_relationship,
    'residential_address', v_address,
    'blood_type', v_blood_type,
    'allergies', v_allergies,
    'health_notes', v_health_notes,
    'special_needs', v_special_needs,
    'photo_path', v_photo_path,
    'birth_certificate_no', v_birth_certificate_no,
    'school_admin_data', v_school_admin_data,
    'document_paths', v_document_paths
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
$function$;

revoke all on function public.submit_parent_child_verification(uuid, jsonb, uuid) from public, anon;
grant execute on function public.submit_parent_child_verification(uuid, jsonb, uuid) to authenticated;

create or replace function public.review_parent_verification_request(
  p_request_id uuid,
  p_action text,
  p_comment text default null::text,
  p_matched_student_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
      set account_display_name = excluded.account_display_name,
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
      set display_name = v_request.proposed_data->>'account_display_name',
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
      v_relationship := coalesce(nullif(v_request.proposed_data->>'relationship_to_child',''), 'Wali');

      insert into public.student_guardians(student_id, guardian_user_id, relationship)
      values (v_student_id, v_request.parent_user_id, v_relationship)
      on conflict (student_id, guardian_user_id) do update
      set relationship = excluded.relationship;

      -- Linking a parent never overwrites official student identity.
      perform private.apply_parent_student_details(v_student_id, v_request.proposed_data, v_actor);

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
      set full_name = v_request.proposed_data->>'full_name',
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

      perform private.apply_parent_student_details(v_student_id, v_request.proposed_data, v_actor);
    else
      raise exception 'Jenis pengajuan tidak dikenali.' using errcode = '22023';
    end if;

    update public.parent_verification_requests
    set status = 'approved',
        reviewed_by = v_actor,
        review_comment = v_comment,
        matched_student_id = case
          when v_request.request_type = 'child_link' then v_student_id
          else matched_student_id
        end,
        reviewed_at = now(),
        parent_seen_at = null
    where id = v_request.id;

    return jsonb_build_object(
      'request_id', v_request.id,
      'status', 'approved',
      'student_id', v_student_id
    );
  end if;

  update public.parent_verification_requests
  set status = case when v_action = 'request_changes' then 'changes_requested' else 'rejected' end,
      reviewed_by = v_actor,
      review_comment = v_comment,
      reviewed_at = now(),
      parent_seen_at = null
  where id = v_request.id;

  return jsonb_build_object(
    'request_id', v_request.id,
    'status', case when v_action = 'request_changes' then 'changes_requested' else 'rejected' end
  );
end;
$function$;

revoke all on function public.review_parent_verification_request(uuid, text, text, uuid) from public, anon;
grant execute on function public.review_parent_verification_request(uuid, text, text, uuid) to authenticated;

create or replace function public.mark_parent_verification_seen(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or (select private.current_user_role()) is distinct from 'parent'::public.app_role then
    raise exception 'Hanya Orang Tua/Wali yang dapat menandai status pengajuan.'
      using errcode = '42501';
  end if;

  update public.parent_verification_requests
  set parent_seen_at = now()
  where id = p_request_id
    and parent_user_id = v_actor;

  if not found then
    raise exception 'Pengajuan tidak ditemukan.' using errcode = 'P0002';
  end if;

  return true;
end;
$function$;

revoke all on function public.mark_parent_verification_seen(uuid) from public, anon;
grant execute on function public.mark_parent_verification_seen(uuid) to authenticated;

create or replace view public.parent_verification_request_summaries
with (security_invoker = true)
as
select
  r.id,
  r.parent_user_id,
  r.parent_display_name,
  r.request_type,
  r.subject_key,
  r.target_student_id,
  r.matched_student_id,
  case
    when r.request_type = 'family_profile' then r.parent_display_name
    else coalesce(r.proposed_data->>'full_name', 'Data anak')
  end as subject_name,
  case
    when r.request_type = 'family_profile' and r.current_data is null then 'Profil keluarga baru'
    when r.request_type = 'family_profile' then 'Perubahan profil keluarga'
    when r.request_type = 'child_link' then 'Penambahan anak'
    when r.request_type = 'child_update' then 'Perubahan data anak'
    else 'Pengajuan data'
  end as request_label,
  r.status,
  case r.status
    when 'pending' then 'Menunggu Verifikasi'
    when 'approved' then 'Disetujui'
    when 'changes_requested' then 'Perlu Perbaikan'
    when 'rejected' then 'Ditolak'
    else r.status
  end as status_label,
  array(
    select key
    from jsonb_object_keys(r.proposed_data) key
    where (coalesce(r.current_data, '{}'::jsonb)->key)
          is distinct from (r.proposed_data->key)
    order by key
  ) as changed_fields,
  r.submitted_at,
  r.reviewed_at,
  r.reviewed_by,
  r.parent_seen_at,
  (
    r.reviewed_at is not null
    and (r.parent_seen_at is null or r.parent_seen_at < r.reviewed_at)
  ) as is_unread
from public.parent_verification_requests r;

revoke all on public.parent_verification_request_summaries from anon;
grant select on public.parent_verification_request_summaries to authenticated;

create or replace function private.audit_record_key(p_table_name text, p_payload jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
begin
  if nullif(p_payload->>'id', '') is not null then
    return p_payload->>'id';
  end if;

  if p_table_name = 'teacher_class_assignments' then
    return concat_ws(':', p_payload->>'class_id', p_payload->>'teacher_profile_id');
  end if;

  if p_table_name = 'student_guardians' then
    return concat_ws(':', p_payload->>'student_id', p_payload->>'guardian_user_id');
  end if;

  if p_table_name = 'parent_family_profiles' then
    return p_payload->>'guardian_user_id';
  end if;

  if p_table_name = 'student_parent_details' then
    return p_payload->>'student_id';
  end if;

  return md5(coalesce(p_payload::text, p_table_name));
end;
$function$;

create or replace function private.audit_sanitize_payload(p_table_name text, p_payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb)
    - array[
      'password','new_password','access_token','refresh_token','jwt',
      'service_role_key','anon_key','token','qr_token','created_at','updated_at'
    ];
begin
  case p_table_name
    when 'students' then
      v_payload := v_payload - array['nik','birth_place','birth_date'];
    when 'teacher_profiles' then
      v_payload := v_payload - array['nik','birth_place','birth_date','notes'];
    when 'report_cards' then
      v_payload := v_payload - array[
        'religion_character','identity_independence','literacy_steam',
        'growth_notes','teacher_note'
      ];
    when 'student_payments' then
      v_payload := v_payload - array['notes'];
    when 'payment_transactions' then
      v_payload := v_payload - array['notes','reference_no'];
    when 'school_documents' then
      v_payload := v_payload - array[
        'file_url','storage_path','external_url','original_file_name','description'
      ];
    when 'announcements' then
      v_payload := v_payload - array['body'];
    when 'school_settings' then
      v_payload := v_payload - array['address','email','phone'];
    when 'parent_family_profiles' then
      v_payload := v_payload - array[
        'account_display_name','primary_phone','family_card_no','family_address',
        'father_name','father_nik','father_birth_place','father_birth_date','father_phone','father_education','father_occupation',
        'mother_name','mother_nik','mother_birth_place','mother_birth_date','mother_phone','mother_education','mother_occupation',
        'guardian_name','guardian_nik','guardian_relationship','guardian_phone','guardian_education','guardian_occupation',
        'emergency_contact_name','emergency_contact_phone'
      ];
    when 'parent_verification_requests' then
      v_payload := v_payload - array[
        'parent_display_name','proposed_data','current_data','review_comment'
      ];
    when 'student_parent_details' then
      v_payload := v_payload - array[
        'residential_address','blood_type','allergies','health_notes','special_needs',
        'photo_path','birth_certificate_no','school_admin_data','document_paths'
      ];
    else
      null;
  end case;
  return v_payload;
end;
$function$;

drop trigger if exists parent_family_profiles_capture_audit on public.parent_family_profiles;
create trigger parent_family_profiles_capture_audit
after insert or update or delete on public.parent_family_profiles
for each row execute function private.capture_audit_event();

drop trigger if exists parent_verification_requests_capture_audit on public.parent_verification_requests;
create trigger parent_verification_requests_capture_audit
after insert or update or delete on public.parent_verification_requests
for each row execute function private.capture_audit_event();

drop trigger if exists student_parent_details_capture_audit on public.student_parent_details;
create trigger student_parent_details_capture_audit
after insert or update or delete on public.student_parent_details
for each row execute function private.capture_audit_event();

do $block$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication p
    join pg_catalog.pg_publication_rel pr on pr.prpubid = p.oid
    join pg_catalog.pg_class c on c.oid = pr.prrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'parent_verification_requests'
  ) then
    alter publication supabase_realtime add table public.parent_verification_requests;
  end if;
end;
$block$;
