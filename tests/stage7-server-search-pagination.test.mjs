import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const [attendance, accounts, teachers, reports, payments, documents, documentPage, portal, migration, manifestText] = await Promise.all([
  read('../src/data/queries/attendance.ts'),
  read('../src/data/queries/accounts.ts'),
  read('../src/data/queries/teachers.ts'),
  read('../src/portal-v2/ReportsPage.tsx'),
  read('../src/data/queries/payments.ts'),
  read('../src/data/queries/documents.ts'),
  read('../src/portal-v2/DocumentsPage.tsx'),
  read('../src/RolePortalV5.tsx'),
  read('../supabase/migrations/20260917071352_stage7_server_search_pagination.sql'),
  read('../supabase/production-migration-manifest.json'),
])
const manifest = JSON.parse(manifestText)

function assertServerPage(source, tableOrView) {
  assert.ok(source.includes(`.from('${tableOrView}')`), `expected ${tableOrView}`)
  assert.ok(source.includes("{ count: 'exact' }"), 'expected exact count')
  assert.ok(source.includes('.range(range.from, range.to)'), 'expected range pagination')
  assert.ok(source.includes('sanitizeSearch('), 'expected sanitized server search')
}

test('absensi mencari di server sebelum range pagination', () => {
  assertServerPage(attendance, 'attendance_records_search')
  assert.ok(attendance.includes("supabase.rpc('attendance_summary_for_date'"))
  assert.ok(!attendance.includes('const filtered = useMemo'))
})

test('akun memakai pencarian dan pagination server-side', () => {
  assertServerPage(accounts, 'user_profiles')
  assert.ok(!accounts.includes('usePaginatedItems'))
})

test('Guru memakai view pencarian dan pagination server-side', () => {
  assertServerPage(teachers, 'teacher_profiles_search')
  assert.ok(!teachers.includes('usePaginatedItems'))
})

test('rapor memakai view pencarian dan pagination server-side', () => {
  assertServerPage(reports, 'report_cards_search')
  assert.ok(!reports.includes('usePaginatedItems'))
})

test('pembayaran memakai view pencarian, pagination dan summary server-side', () => {
  assertServerPage(payments, 'student_payments_search')
  assert.ok(payments.includes("supabase.rpc('payment_summary'"))
  assert.ok(!payments.includes('usePaginatedItems'))
})

test('dokumen memakai pencarian dan pagination server-side tanpa merusak lifecycle Storage', () => {
  assertServerPage(documents, 'school_documents')
  assert.ok(documentPage.includes('processDocumentStorageCleanup'))
  assert.ok(documentPage.includes('createSignedUrl'))
  assert.ok(!documents.includes('usePaginatedItems'))
})

test('portal aktif lazy-load modul server-paginated langsung dari sumbernya', () => {
  assert.ok(portal.includes("import('./portal-v2/TeachersPage')"))
  assert.ok(portal.includes("import('./portal-v2/ReportsPage')"))
  assert.ok(portal.includes("import('./portal-v2/PaymentsPage')"))
  assert.ok(portal.includes("import('./portal-v2/DocumentsPage')"))
  assert.ok(!portal.includes("import('./portal-v2/SchoolModules')"))
})

test('migration stage 7 mempertahankan RLS lewat security_invoker dan sinkron dengan produksi', () => {
  assert.ok(migration.includes('with (security_invoker = true)'))
  assert.ok(migration.includes('security invoker'))
  assert.ok(migration.includes('attendance_records_search'))
  assert.ok(migration.includes('report_cards_search'))
  assert.ok(migration.includes('student_payments_search'))
  assert.ok(migration.includes('teacher_profiles_search'))
  assert.ok(manifest.production_migrations.includes('20260917071352_stage7_server_search_pagination.sql'))
  assert.ok(!manifest.production_migrations.includes('20260917071500_stage7_server_search_pagination.sql'))
})
