import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const packageJson = JSON.parse(read('package.json'))
const main = read('src/main.tsx')
const queryClient = read('src/data/queryClient.ts')
const queryKeys = read('src/data/queryKeys.ts')
const filters = read('src/data/useDataFilters.ts')
const forms = read('src/components/forms/FormField.tsx')
const boundary = read('src/components/AppErrorBoundary.tsx')
const dataExperience = read('src/portal-v2/DataExperience.tsx')
const supabaseClient = read('src/lib/supabase.ts')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')
const scannerCss = read('src/scanner-native.css')

const paginatedQueries = {
  students: read('src/data/queries/students.ts'),
  teachers: read('src/data/queries/teachers.ts'),
  attendance: read('src/data/queries/attendance.ts'),
  accounts: read('src/data/queries/accounts.ts'),
  payments: read('src/data/queries/payments.ts'),
  documents: read('src/data/queries/documents.ts'),
}

const dataPages = {
  students: read('src/portal-v2/StudentsPageV2.tsx'),
  teachers: read('src/portal-v2/TeachersPage.tsx'),
  attendance: read('src/portal-v2/AttendancePages.tsx'),
  accounts: read('src/portal-v2/AccountsPage.tsx'),
  payments: read('src/portal-v2/PaymentsPage.tsx'),
  documents: read('src/portal-v2/DocumentsPage.tsx'),
}

const dashboardPage = read('src/portal-v2/PortalPages.tsx')
const dashboardQuery = read('src/data/queries/dashboard.ts')
const announcementsPage = read('src/portal-v2/AnnouncementsPage.tsx')
const announcementsQuery = read('src/data/queries/announcements.ts')

test('11.8 foundation tetap terpasang di root dengan konfigurasi cache yang terkendali', () => {
  assert.equal(packageJson.dependencies?.['@tanstack/react-query'], '5.102.8')
  assert.match(main, /QueryClientProvider/)
  assert.match(main, /client=\{queryClient\}/)
  assert.match(main, /AppErrorBoundary/)
  assert.match(queryClient, /new QueryClient/)
  assert.match(queryClient, /staleTime: 30_000/)
  assert.match(queryClient, /gcTime: 5 \* 60_000/)
  assert.match(queryClient, /retry: 1/)
  assert.match(queryClient, /mutations:[\s\S]*retry: 0/)
})

test('query key dan query modules mencakup seluruh domain target 11.8', () => {
  const domains = ['students', 'attendance', 'teachers', 'accounts', 'payments', 'documents', 'announcements', 'dashboard']
  for (const domain of domains) {
    assert.match(queryKeys, new RegExp(`${domain}: scoped\\('${domain}'\\)`), `${domain} kehilangan scoped query key`)
  }
  for (const [name, source] of Object.entries(paginatedQueries)) {
    assert.match(source, /queryOptions|keepPreviousData/, `${name} kehilangan TanStack query contract`)
  }
  assert.match(dashboardQuery, /queryOptions/)
  assert.match(announcementsQuery, /queryOptions/)
})

test('URL-backed filter architecture menjaga page normalization dan reset pagination', () => {
  assert.match(filters, /useSearchParams/)
  assert.match(filters, /Number\.isInteger\(parsed\) && parsed > 0 \? parsed : 1/)
  assert.match(filters, /if \(options\.resetPage\) next\.delete\('page'\)/)
  assert.match(filters, /const setPage = \(nextPage: number\)/)
  assert.match(filters, /Math\.max\(1, nextPage\)/)
  assert.match(filters, /next\.delete\('page'\)/)
  assert.match(dataExperience, /delay = 300/)
})

test('seluruh data page inti memakai TanStack Query, URL filters, debounce, invalidation, dan pagination reusable', () => {
  for (const [name, source] of Object.entries(dataPages)) {
    assert.match(source, /useQuery/, `${name} belum memakai useQuery`)
    assert.match(source, /useQueryClient/, `${name} belum memakai query client`)
    assert.match(source, /useDataFilters/, `${name} belum memakai URL-backed filters`)
    assert.match(source, /useDebouncedValue/, `${name} belum memakai debounce search`)
    assert.match(source, /invalidateQueries/, `${name} belum menginvalidasi cache setelah mutation`)
    assert.match(source, /PaginationControls/, `${name} kehilangan pagination reusable`)
  }
})

test('server-side pagination dan sanitasi search tetap berada di query layer', () => {
  for (const [name, source] of Object.entries(paginatedQueries)) {
    assert.match(source, /getPageRange\(/, `${name} kehilangan server page range`)
    assert.match(source, /count: 'exact'/, `${name} kehilangan exact count`)
    assert.match(source, /\.range\(range\.from, range\.to\)/, `${name} kehilangan Supabase range`)
    assert.match(source, /sanitizeSearch\(/, `${name} kehilangan search sanitization`)
    assert.match(source, /keepPreviousData/, `${name} kehilangan continuity antar halaman`)
  }
})

test('dashboard dan pengumuman sudah masuk query architecture tanpa mengubah authorization contract', () => {
  assert.match(dashboardPage, /useQuery\(dashboardSummaryOptions\(role\)\)/)
  assert.match(dashboardPage, /useQuery\(parentTodayAttendanceOptions/)
  assert.match(dashboardQuery, /supabase\.rpc\('dashboard_summary'\)/)
  assert.match(dashboardQuery, /queryKeys\.dashboard\.meta\('summary'/)
  assert.match(dashboardQuery, /\.eq\('student_id', childId\)/)
  assert.match(announcementsPage, /useQuery\(announcementsOptions/)
  assert.match(announcementsQuery, /queryKeys\.announcements\.list\(\{ role, currentUserId \}\)/)
  assert.match(announcementsPage, /queryKeys\.announcements\.all/)
  assert.match(announcementsPage, /queryKeys\.dashboard\.all/)
  assert.match(announcementsPage, /row\.created_by === currentUserId/)
})

test('kontrak backend sensitif tetap di Supabase, RPC, Edge Function, dan private storage flow', () => {
  assert.match(paginatedQueries.attendance, /attendance_records_search/)
  assert.match(paginatedQueries.attendance, /attendance_summary_for_date/)
  assert.match(dataPages.attendance, /manage-attendance-record/)
  assert.match(dataPages.accounts, /admin-create-user/)
  assert.match(dataPages.accounts, /admin-manage-user/)
  assert.match(paginatedQueries.payments, /student_payments_search/)
  assert.match(paginatedQueries.payments, /payment_summary/)
  assert.match(dataPages.documents, /createSignedUrl/)
  assert.match(dataPages.documents, /school_document_storage_cleanup/)
  assert.match(supabaseClient, /VITE_SUPABASE_PUBLISHABLE_KEY/)
  assert.doesNotMatch(supabaseClient, /service[_-]?role/i)
})

test('form/error architecture dan mutation guard tetap tersedia', () => {
  assert.match(forms, /FormField/)
  assert.match(forms, /form-field__helper/)
  assert.match(forms, /form-field__error/)
  assert.match(forms, /FormSection/)
  assert.match(boundary, /Terjadi kesalahan pada halaman ini\./)
  assert.match(boundary, /Muat Ulang/)
  for (const [name, source] of Object.entries(dataPages)) {
    assert.match(source, /useRef\(false\)/, `${name} kehilangan synchronous busy guard`)
  }
  assert.match(announcementsPage, /const busyRef = useRef\(false\)/)
  assert.match(announcementsPage, /const removingRef = useRef\(false\)/)
})

test('legacy custom query cache tidak kembali setelah migrasi 11.8', () => {
  assert.doesNotMatch(dataExperience, /queryCache|cachedQuery|invalidateQueryCache/)
  for (const source of Object.values(dataPages)) {
    assert.doesNotMatch(source, /cachedQuery|invalidateQueryCache/)
  }
})

test('scanner tetap LIVE CAMERA ONLY dan terisolasi dari TanStack Query', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.match(scanner, /const switchCamera = async/)
  assert.match(scanner, /frontCamera \? 'front-camera'/)
  assert.match(scannerCss, /\.native-camera\.front-camera video \{ transform: scaleX\(-1\); \}/)
  assert.doesNotMatch(scanner, /@tanstack\/react-query|useDataFilters|queryKeys/)
  assert.doesNotMatch(scanner, /type="file"|capture=|openNativeCapture|handleNativeCapture/)
  assert.doesNotMatch(scanner, /galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
})
