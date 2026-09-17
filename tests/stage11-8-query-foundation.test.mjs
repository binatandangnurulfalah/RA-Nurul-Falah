import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const packageJson = JSON.parse(read('package.json'))
const main = read('src/main.tsx')
const client = read('src/data/queryClient.ts')
const keys = read('src/data/queryKeys.ts')
const filters = read('src/data/useDataFilters.ts')
const studentsQuery = read('src/data/queries/students.ts')
const studentsPage = read('src/portal-v2/StudentsPageV2.tsx')
const forms = read('src/components/forms/FormField.tsx')
const boundary = read('src/components/AppErrorBoundary.tsx')

test('TanStack Query dipasang deterministik dan disediakan di root', () => {
  assert.equal(packageJson.dependencies['@tanstack/react-query'], '5.102.8')
  assert.match(main, /QueryClientProvider/)
  assert.match(main, /client=\{queryClient\}/)
  assert.match(client, /new QueryClient/)
  assert.match(client, /staleTime: 30_000/)
  assert.match(client, /gcTime: 5 \* 60_000/)
})

test('query key factories konsisten untuk seluruh domain target 11.8', () => {
  for (const domain of ['students', 'attendance', 'teachers', 'accounts', 'payments', 'documents', 'announcements', 'dashboard']) {
    assert.match(keys, new RegExp(`${domain}: scoped\\('${domain}'\\)`))
  }
})

test('pilot murid memakai TanStack Query tanpa memindahkan server-side pagination ke client', () => {
  assert.match(studentsPage, /useQuery\(studentPageOptions/)
  assert.match(studentsPage, /useQuery\(studentLookupsOptions/)
  assert.match(studentsPage, /invalidateQueries\(\{ queryKey: queryKeys\.students\.all \}\)/)
  assert.match(studentsQuery, /supabase\.from\('students'\)/)
  assert.match(studentsQuery, /count: 'exact'/)
  assert.match(studentsQuery, /getPageRange\(params\.page, params\.pageSize\)/)
  assert.match(studentsQuery, /\.range\(range\.from, range\.to\)/)
  assert.match(studentsQuery, /sanitizeSearch\(params\.search\)/)
})

test('filter/search state tersimpan di URL dan pagination direset saat filter berubah', () => {
  assert.match(filters, /useSearchParams/)
  assert.match(filters, /resetPage/)
  assert.match(filters, /next\.delete\('page'\)/)
  assert.match(studentsPage, /useDataFilters\(\{ q: '', class: 'all' \}\)/)
  assert.match(studentsPage, /useDebouncedValue\(search\)/)
})

test('form architecture menyediakan section, helper, inline error, dan double-submit guard', () => {
  assert.match(forms, /FormField/)
  assert.match(forms, /form-field__helper/)
  assert.match(forms, /form-field__error/)
  assert.match(forms, /FormSection/)
  assert.match(studentsPage, /const busyRef = useRef\(false\)/)
  assert.match(studentsPage, /if \(guardianLoading \|\| busyRef\.current\) return/)
  assert.match(studentsPage, /removingRef\.current/)
})

test('root error boundary memberi recovery berbahasa Indonesia', () => {
  assert.match(main, /AppErrorBoundary/)
  assert.match(boundary, /Terjadi kesalahan pada halaman ini\./)
  assert.match(boundary, /Muat Ulang/)
})
