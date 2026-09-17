import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const domains = ['teachers', 'attendance', 'accounts', 'payments', 'documents']
const pages = {
  teachers: read('src/portal-v2/TeachersPage.tsx'),
  attendance: read('src/portal-v2/AttendancePages.tsx'),
  accounts: read('src/portal-v2/AccountsPage.tsx'),
  payments: read('src/portal-v2/PaymentsPage.tsx'),
  documents: read('src/portal-v2/DocumentsPage.tsx'),
}
const queries = Object.fromEntries(domains.map((domain) => [domain, read(`src/data/queries/${domain}.ts`)]))
const dataExperience = read('src/portal-v2/DataExperience.tsx')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('core data domains memakai TanStack Query dan URL-backed filter state', () => {
  for (const [domain, source] of Object.entries(pages)) {
    assert.match(source, /useQuery/)
    assert.match(source, /useQueryClient/)
    assert.match(source, /useDataFilters/)
    assert.match(source, /useDebouncedValue/)
    assert.match(source, /invalidateQueries/)
    assert.match(source, /PaginationControls/)
    assert.ok(queries[domain], `${domain} query module missing`)
  }
})

test('server pagination, exact count, dan search sanitization tetap berada di query modules', () => {
  for (const [domain, source] of Object.entries(queries)) {
    assert.match(source, /getPageRange\(/, `${domain} kehilangan server page range`)
    assert.match(source, /count: 'exact'/, `${domain} kehilangan exact count`)
    assert.match(source, /\.range\(range\.from, range\.to\)/, `${domain} kehilangan Supabase range`)
    assert.match(source, /sanitizeSearch\(/, `${domain} kehilangan sanitized search`)
    assert.match(source, /keepPreviousData/, `${domain} belum menjaga continuity antar halaman`)
  }
})

test('backend/security contracts tetap di Supabase dan Edge Functions', () => {
  assert.match(queries.attendance, /attendance_records_search/)
  assert.match(queries.attendance, /attendance_summary_for_date/)
  assert.match(pages.attendance, /manage-attendance-record/)
  assert.match(pages.accounts, /admin-create-user/)
  assert.match(pages.accounts, /admin-manage-user/)
  assert.match(queries.payments, /student_payments_search/)
  assert.match(queries.payments, /payment_summary/)
  assert.match(pages.documents, /createSignedUrl/)
  assert.match(pages.documents, /school_document_storage_cleanup/)
})

test('legacy custom Map query cache sudah dihapus setelah rollout TanStack Query', () => {
  assert.doesNotMatch(dataExperience, /queryCache|cachedQuery|invalidateQueryCache/)
})

test('scanner tetap terisolasi dari query rollout', () => {
  assert.doesNotMatch(scanner, /@tanstack\/react-query|useDataFilters|queryKeys/)
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.doesNotMatch(scanner, /type="file"|\btorch\b|setManual|Masukkan kode QR secara manual/i)
})
