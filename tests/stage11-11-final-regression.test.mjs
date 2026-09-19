import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const migration = read('supabase/migrations/20260917183405_stage11_11_global_audit_events.sql')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')
const attendanceQuery = read('src/data/queries/attendance.ts')
const attendanceManager = read('src/portal-v2/AttendancePages.tsx')
const auditPage = read('src/portal-v2/AuditTrailPage.tsx')
const auditQuery = read('src/data/queries/audit.ts')
const queryKeys = read('src/data/queryKeys.ts')
const createUser = read('supabase/functions/admin-create-user/index.ts')
const manageUser = read('supabase/functions/admin-manage-user/index.ts')
const manageAttendance = read('supabase/functions/manage-attendance-record/index.ts')
const authorization = read('supabase/functions/_shared/authorization.ts')

const auditedTables = [
  'attendance_records', 'students', 'teacher_profiles', 'school_classes',
  'teacher_class_assignments', 'student_guardians', 'report_cards',
  'student_payments', 'school_documents', 'announcements', 'school_settings',
  'academic_years', 'account_management',
]

test('scanner summary tidak lagi bergantung pada 40 row client-side', () => {
  assert.match(scanner, /supabase\.rpc\('attendance_summary_for_date'/)
  assert.doesNotMatch(scanner, /\.limit\(40\)/)
  assert.doesNotMatch(scanner, /todayRows|setRecords|AttendanceRecord\[]/)
  assert.match(scanner, /summary\.total_records/)
  assert.match(scanner, /summary\.checked_out_records/)
  assert.match(scanner, /summary\.late_records/)
})

test('tanggal hari ini untuk attendance dihitung dinamis dalam timezone Jakarta', () => {
  assert.match(scanner, /function jakartaDate\(\)/)
  assert.match(attendanceQuery, /function jakartaDate\(\)/)
  assert.match(attendanceQuery, /p_date: jakartaDate\(\)/)
  assert.doesNotMatch(attendanceQuery, /const TODAY/)
})

test('attendance correction tetap melalui Edge Function dengan alasan wajib', () => {
  assert.match(attendanceManager, /manage-attendance-record/)
  assert.match(attendanceManager, /correction_reason/)
  assert.match(manageAttendance, /Alasan penghapusan wajib diisi minimal 3 karakter/)
  assert.match(manageAttendance, /Alasan koreksi wajib diisi minimal 3 karakter/)
  assert.match(manageAttendance, /last_corrected_by/)
  assert.match(manageAttendance, /last_corrected_at/)
})

test('authorization attendance memakai class_id canonical, bukan nama kelas lintas tahun', () => {
  assert.match(authorization, /\.select\('class_id'\)/)
  assert.match(authorization, /teacherCanAccessClass\(context, student\.class_id\)/)
  assert.doesNotMatch(authorization, /\.select\('class_name'\)/)
})

test('audit migration mencakup seluruh domain 11.11 dan identitas record generik', () => {
  for (const table of auditedTables) assert.match(migration, new RegExp(`'${table}'`), `${table} belum diaudit`)
  assert.match(migration, /add column if not exists record_key text/)
  assert.match(migration, /alter column record_id drop not null/)
  assert.match(migration, /teacher_class_assignments[\s\S]*class_id[\s\S]*teacher_profile_id/)
  assert.match(migration, /student_guardians[\s\S]*student_id[\s\S]*guardian_user_id/)
})

test('audit payload menyimpan diff aman dan membuang nilai sensitif', () => {
  assert.match(migration, /changed_fields text\[]/)
  assert.match(migration, /audit_sanitize_payload/)
  for (const secret of ['password', 'access_token', 'refresh_token', 'jwt', 'service_role_key', 'qr_token']) {
    assert.match(migration, new RegExp(`'${secret}'`), `${secret} belum disanitasi`)
  }
  assert.match(migration, /when 'students'[\s\S]*'nik'/)
  assert.match(migration, /when 'school_documents'[\s\S]*'file_url'/)
  assert.match(migration, /when 'report_cards'/)
})

test('account management menulis event eksplisit tanpa recovery link atau email pada payload audit', () => {
  assert.match(migration, /append_account_audit_event/)
  assert.match(createUser, /appendAccountAudit\(context, invited\.user\.id, 'ACCOUNT_CREATED'/)
  assert.match(manageUser, /'ACCOUNT_UPDATED'/)
  assert.match(manageUser, /'ACCOUNT_DELETED'/)
  assert.match(manageUser, /'PASSWORD_RESET_REQUESTED'/)
  assert.match(createUser, /delivery = 'invite_email'/)
  assert.doesNotMatch(createUser, /appendAccountAudit\([^)]*email/s)
  assert.doesNotMatch(manageUser, /appendAccountAudit\([^)]*manualLink/s)
})

test('activity UI memakai TanStack Query, URL filters, server pagination, tanggal dan pelaku', () => {
  assert.match(queryKeys, /audit: scoped\('audit'\)/)
  assert.match(auditPage, /useQuery\(auditPageOptions/)
  assert.match(auditPage, /useDataFilters/)
  assert.match(auditPage, /Cari nama pelaku/)
  assert.match(auditPage, /Filter tanggal aktivitas/)
  assert.match(auditPage, /PaginationControls/)
  assert.match(auditQuery, /count: 'exact'/)
  assert.match(auditQuery, /\.range\(range\.from, range\.to\)/)
  assert.match(auditQuery, /\.ilike\('actor_display_name'/)
  assert.match(auditQuery, /\.gte\('changed_at'/)
  assert.match(auditQuery, /keepPreviousData/)
})

test('scanner tetap LIVE CAMERA ONLY setelah 11.11', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.match(scanner, /record-attendance/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
})
