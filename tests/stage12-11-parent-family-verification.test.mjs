import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const migration = read('supabase/migrations/20260919100000_stage12_11_parent_family_verification.sql')
const portal = read('src/RolePortalV5.tsx')
const parentPage = read('src/portal-v2/ParentFamilyPage.tsx')
const verificationPage = read('src/portal-v2/ParentVerificationPage.tsx')
const profilePage = read('src/portal-v2/ProfilePageV3.tsx')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('Tahap 12.11 menyediakan canonical family profile dan immutable-style verification queue', () => {
  assert.match(migration, /create table if not exists public\.parent_family_profiles/)
  assert.match(migration, /create table if not exists public\.parent_verification_requests/)
  assert.match(migration, /request_type in \('family_profile','child_link','child_update'\)/)
  assert.match(migration, /status in \('pending','approved','changes_requested','rejected'\)/)
  assert.match(migration, /supersedes_request_id/)
  assert.match(migration, /parent_verification_one_pending_subject_idx/)
})

test('Orang Tua hanya mengajukan perubahan dan tidak menulis canonical data langsung', () => {
  assert.match(migration, /revoke insert, update, delete on table public\.parent_family_profiles from authenticated/)
  assert.match(migration, /revoke insert, update, delete on table public\.parent_verification_requests from authenticated/)
  assert.match(migration, /submit_parent_family_verification/)
  assert.match(migration, /submit_parent_child_verification/)
  assert.match(migration, /guard_parent_profile_verified_fields/)
  assert.match(parentPage, /Ajukan Verifikasi/)
  assert.match(parentPage, /Tambahkan Anak/)
  assert.match(parentPage, /Perbaiki & kirim ulang/)
  assert.doesNotMatch(parentPage, /from\('students'\).*insert|from\('students'\).*update/)
})

test('Guru memverifikasi detail, dapat minta perbaikan/tolak, dan child link wajib dicocokkan ke siswa resmi', () => {
  assert.match(migration, /review_parent_verification_request/)
  assert.match(migration, /Pilih siswa resmi RA Nurul Falah yang sesuai/)
  assert.match(migration, /private\.teacher_can_verify_student/)
  assert.match(verificationPage, /Setujui/)
  assert.match(verificationPage, /Minta Perbaikan/)
  assert.match(verificationPage, /Tolak/)
  assert.match(verificationPage, /Cocokkan dengan siswa resmi/)
  assert.match(verificationPage, /p_matched_student_id/)
})

test('navigasi role menggunakan Data Keluarga untuk parent dan Verifikasi Data untuk teacher/admin', () => {
  assert.match(portal, /id: 'children', label: 'Data Keluarga'/)
  assert.match(portal, /id: 'verification', label: 'Verifikasi Data'/)
  assert.match(portal, /page === 'verification' && role !== 'parent'/)
  assert.match(portal, /page === 'children' && role === 'parent'/)
  assert.match(portal, /ParentFamilyPage/)
  assert.match(portal, /ParentVerificationPage/)
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
