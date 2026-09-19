import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const migration = read('supabase/migrations/20260918192125_stage12_11_parent_family_verification.sql')
const grantHardening = read('supabase/migrations/20260919003833_stage12_11_verification_grant_hardening.sql')
const migrationV2 = read('supabase/migrations/20260919013756_stage12_11_parent_family_verification_v2.sql')
const auditWhitelist = read('supabase/migrations/20260919013843_stage12_11_parent_verification_audit_whitelist.sql')
const parentRlsFix = read('supabase/migrations/20260919020013_stage12_11_parent_details_rls_execute_fix.sql')
const refinedFiles = read('supabase/migrations/20260919023814_refine_parent_child_file_uploads.sql')
const portal = read('src/RolePortalV5.tsx')
const parentPage = read('src/portal-v2/ParentFamilyPage.tsx')
const verificationPage = read('src/portal-v2/ParentVerificationPage.tsx')
const verificationQuery = read('src/data/queries/parentVerification.ts')
const verificationRealtime = read('src/data/useParentVerificationRealtime.ts')
const profilePage = read('src/portal-v2/ProfilePageV3.tsx')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')
const generatedTypes = read('src/lib/database.types.ts')
const parentCss = read('src/parent-verification.css')

test('Tahap 12.11 menyediakan canonical family profile dan immutable-style verification queue', () => {
  assert.match(migration, /create table if not exists public\.parent_family_profiles/)
  assert.match(migration, /create table if not exists public\.parent_verification_requests/)
  assert.match(migration, /request_type in \('family_profile','child_link','child_update'\)/)
  assert.match(migration, /status in \('pending','approved','changes_requested','rejected'\)/)
  assert.match(migration, /supersedes_request_id/)
  assert.match(migration, /parent_verification_one_pending_subject_idx/)
})

test('verification tables expose SELECT-only access to authenticated clients', () => {
  assert.match(grantHardening, /revoke all on table public\.parent_family_profiles from anon, authenticated/)
  assert.match(grantHardening, /revoke all on table public\.parent_verification_requests from anon, authenticated/)
  assert.match(grantHardening, /grant select on table public\.parent_family_profiles to authenticated/)
  assert.match(grantHardening, /grant select on table public\.parent_verification_requests to authenticated/)
  assert.doesNotMatch(grantHardening, /grant (insert|update|delete|truncate|trigger|references)/i)
})

test('Tahap 12.11 v2 melengkapi detail anak, storage privat, unread status, dan audit aman', () => {
  assert.match(migrationV2, /create table if not exists public\.student_parent_details/)
  assert.match(migrationV2, /residential_address text/)
  assert.match(migrationV2, /blood_type text/)
  assert.match(migrationV2, /health_notes text/)
  assert.match(migrationV2, /document_paths jsonb/)
  assert.match(migrationV2, /parent-verification-files/)
  assert.match(migrationV2, /parent_seen_at timestamptz/)
  assert.match(migrationV2, /mark_parent_verification_seen/)
  assert.match(migrationV2, /parent_verification_request_summaries/)
  assert.match(migrationV2, /parent_verification_requests_capture_audit/)
  assert.match(migrationV2, /student_parent_details_capture_audit/)
  assert.match(migrationV2, /'proposed_data','current_data','review_comment'/)
  assert.match(auditWhitelist, /'parent_verification_requests'::text/)
  assert.match(auditWhitelist, /'student_parent_details'::text/)
})

test('RLS detail anak dapat dievaluasi akun authenticated tanpa membuka akses lintas keluarga', () => {
  assert.match(parentRlsFix, /grant execute on function private\.teacher_can_verify_student\(uuid\) to authenticated/)
  assert.match(verificationQuery, /\.in\('id', childIds\)/)
  assert.match(verificationQuery, /\.in\('student_id', childIds\)/)
  assert.match(verificationQuery, /const childIds = \[\.\.\.relationships\.keys\(\)\]/)
})

test('child link hanya menghubungkan Orang Tua ke siswa resmi dan tidak menimpa identitas resmi', () => {
  assert.match(migrationV2, /Linking a parent never overwrites official student identity/)
  assert.match(migrationV2, /insert into public\.student_guardians/)
  assert.match(migrationV2, /perform private\.apply_parent_student_details/)
  assert.match(migrationV2, /elsif v_request\.request_type = 'child_update' then/)
})

test('Orang Tua hanya mengajukan perubahan dan UI v2 mendukung data kesehatan serta berkas privat', () => {
  assert.match(migration, /revoke insert, update, delete on table public\.parent_family_profiles from authenticated/)
  assert.match(migration, /submit_parent_family_verification/)
  assert.match(migrationV2, /submit_parent_child_verification/)
  assert.match(parentPage, /Ajukan Verifikasi/)
  assert.match(parentPage, /Tambahkan Anak/)
  assert.match(parentPage, /Perbaiki & kirim ulang/)
  assert.match(parentPage, /Alamat & kesehatan/)
  assert.match(parentPage, /Golongan darah/)
  assert.match(parentPage, /Catatan kesehatan/)
  assert.match(parentPage, /Kartu Keluarga/)
  assert.match(parentPage, /Akta kelahiran/)
  assert.match(parentPage, /birth_certificate_path/)
  assert.match(parentPage, /family_card_path/)
  assert.doesNotMatch(parentPage, /Dokumen pendukung/)
  assert.doesNotMatch(parentPage, /documentFiles/)
  assert.match(parentPage, /parent-verification-files/)
  assert.match(parentPage, /type="file"/)
  assert.match(parentPage, /markParentVerificationSeen/)
  assert.doesNotMatch(parentPage, /from\('students'\).*insert|from\('students'\).*update/)
})

test('menu Keluarga dipisah menjadi tab Orang Tua, Anak, dan Riwayat yang responsif', () => {
  assert.match(parentPage, /role="tablist"/)
  assert.match(parentPage, />Orang Tua</)
  assert.match(parentPage, />Anak</)
  assert.match(parentPage, />Riwayat</)
  assert.match(parentPage, /activeTab === 'parents'/)
  assert.match(parentPage, /activeTab === 'children'/)
  assert.match(parentPage, /activeTab === 'history'/)
  assert.match(parentPage, /family-tab-count/)
  assert.match(parentPage, /family-tab-alert/)
  assert.match(parentCss, /\.family-tabs \{/)
  assert.match(parentCss, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(parentCss, /@media \(max-width: 430px\)[\s\S]*\.family-tabs button/)
})

test('berkas keluarga dan anak memakai field spesifik, bukan dokumen generik untuk pengajuan baru', () => {
  assert.match(refinedFiles, /add column if not exists family_card_path text/)
  assert.match(refinedFiles, /add column if not exists birth_certificate_path text/)
  assert.match(refinedFiles, /'family_card_path', v_existing\.family_card_path/)
  assert.match(refinedFiles, /'birth_certificate_path', v_details\.birth_certificate_path/)
  assert.match(refinedFiles, /birth_certificate_path = excluded\.birth_certificate_path/)
  assert.match(refinedFiles, /family_card_path = excluded\.family_card_path/)
  assert.match(verificationPage, /Kartu Keluarga/)
  assert.match(verificationPage, /Akta kelahiran/)
})

test('query verification v2 mempertahankan JSON bertingkat dan mengambil detail anak terverifikasi', () => {
  assert.match(verificationQuery, /VerificationPayload = Record<string, Json \| undefined>/)
  assert.match(verificationQuery, /student_parent_details/)
  assert.match(verificationQuery, /parent_seen_at/)
  assert.match(verificationQuery, /parent_verification_request_summaries/)
  assert.match(verificationQuery, /mark_parent_verification_seen/)
  assert.doesNotMatch(verificationQuery, /String\(item\)/)
})

test('Guru memverifikasi detail, dapat minta perbaikan atau tolak, dan child link wajib dicocokkan ke siswa resmi', () => {
  assert.match(migrationV2, /review_parent_verification_request/)
  assert.match(migrationV2, /Pilih siswa resmi RA Nurul Falah yang sesuai/)
  assert.match(migrationV2, /private\.teacher_can_verify_student/)
  assert.match(verificationPage, /Setujui/)
  assert.match(verificationPage, /Minta Perbaikan/)
  assert.match(verificationPage, /Tolak Pengajuan/)
  assert.match(verificationPage, /Cocokkan dengan siswa resmi/)
  assert.match(verificationPage, /Pencocokan hanya menghubungkan akun/)
  assert.match(verificationPage, /createSignedUrl/)
  assert.match(verificationPage, /p_matched_student_id/)
})

test('status verification direfresh realtime dan badge unread ditampilkan pada navigasi Orang Tua', () => {
  assert.match(verificationRealtime, /postgres_changes/)
  assert.match(verificationRealtime, /parent_verification_requests/)
  assert.match(portal, /verificationUnreadCountOptions/)
  assert.match(portal, /verificationCount/)
  assert.match(portal, /item\.id === 'children'/)
})

test('navigasi role menggunakan Data Keluarga untuk parent dan Verifikasi Data untuk teacher/admin', () => {
  assert.match(portal, /id: 'children', label: 'Data Keluarga'/)
  assert.match(portal, /id: 'verification', label: 'Verifikasi Data'/)
  assert.match(portal, /page === 'verification' && role !== 'parent'/)
  assert.match(portal, /page === 'children' && role === 'parent'/)
  assert.match(portal, /ParentFamilyPage/)
  assert.match(portal, /ParentVerificationPage/)
})

test('types produksi sudah mengenal schema verification v2', () => {
  assert.match(generatedTypes, /student_parent_details:/)
  assert.match(generatedTypes, /family_card_path: string \\| null/)
  assert.match(generatedTypes, /birth_certificate_path: string \\| null/)
  assert.match(generatedTypes, /parent_verification_request_summaries:/)
  assert.match(generatedTypes, /parent_seen_at: string \| null/)
  assert.match(generatedTypes, /mark_parent_verification_seen:/)
})

test('profil Orang Tua mengarahkan data resmi ke Data Keluarga', () => {
  assert.match(profilePage, /Identitas, kontak, dan alamat resmi diajukan melalui menu Data Keluarga/)
  assert.match(profilePage, /profile\.role !== 'parent'/)
  assert.match(profilePage, /Nama akun terverifikasi/)
})

test('scanner tetap LIVE CAMERA ONLY selama Tahap 12.11', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
})
