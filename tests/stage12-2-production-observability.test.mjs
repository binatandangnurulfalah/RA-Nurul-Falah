import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const observability = read('src/lib/observability.ts')
const services = read('src/lib/observed-services.ts')
const queryClient = read('src/data/queryClient.ts')
const main = read('src/main.tsx')
const errorBoundary = read('src/components/AppErrorBoundary.tsx')
const errorUtils = read('src/lib/error-utils.ts')
const documents = read('src/portal-v2/DocumentsPage.tsx')
const accounts = read('src/portal-v2/AccountsPage.tsx')
const attendance = read('src/portal-v2/AttendancePages.tsx')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')
const edgeObservability = read('supabase/functions/_shared/observability.ts')
const cors = read('supabase/functions/_shared/cors.ts')

const operationalFunctions = [
  'admin-create-user',
  'admin-manage-user',
  'manage-attendance-record',
  'record-attendance',
  'process-document-storage-cleanup',
]

test('client observability is structured and explicitly redacts common sensitive values', () => {
  assert.match(observability, /ra_nf_operational_error/)
  assert.match(observability, /SENSITIVE_KEY/)
  assert.match(observability, /authorization\|cookie\|password\|secret\|token\|email\|phone\|address\|nik\|qr\|link\|url/i)
  assert.match(observability, /Bearer \[redacted\]/)
  assert.match(observability, /\[email\]/)
  assert.match(observability, /\[token\]/)
  assert.doesNotMatch(observability, /localStorage|sessionStorage/)
})

test('React Query and top-level runtime errors feed the shared observer', () => {
  assert.match(queryClient, /new QueryCache/)
  assert.match(queryClient, /new MutationCache/)
  assert.match(queryClient, /reportOperationalError\('query'/)
  assert.match(queryClient, /reportOperationalError\('mutation'/)
  assert.match(main, /installGlobalErrorObservers\(\)/)
  assert.match(observability, /window\.addEventListener\('error'/)
  assert.match(observability, /window\.addEventListener\('unhandledrejection'/)
  assert.match(errorBoundary, /reportOperationalError\('react-boundary'/)
  assert.doesNotMatch(errorBoundary, /console\.error\('Unhandled application error'/)
})

test('technical query details are not surfaced raw to end users', () => {
  assert.match(errorUtils, /Koneksi ke server terputus/)
  assert.match(errorUtils, /Sesi Anda perlu diperbarui/)
  assert.match(errorUtils, /Akun Anda tidak memiliki akses/)
  assert.match(errorUtils, /return fallback/)
  assert.doesNotMatch(errorUtils, /export function userErrorMessage[\\s\\S]*return error\\.message/)
})

test('service wrappers observe Edge, Storage and direct database mutation failures', () => {
  assert.match(services, /invokeObservedFunction/)
  assert.match(services, /reportOperationalError\('edge-function'/)
  assert.match(services, /reportStorageFailure/)
  assert.match(services, /reportDatabaseMutationFailure/)
  assert.match(accounts, /invokeObservedFunction\('admin-create-user'/)
  assert.match(accounts, /invokeObservedFunction\('admin-manage-user'/)
  assert.match(attendance, /invokeObservedFunction\('manage-attendance-record'/)
  assert.match(scanner, /invokeObservedFunction\('record-attendance'/)
  assert.match(documents, /invokeObservedFunction\('process-document-storage-cleanup'/)
  assert.match(documents, /reportStorageFailure\('upload_school_document'/)
  assert.match(documents, /reportStorageFailure\('create_signed_document_url'/)
})

test('Edge observability adds correlation and timing without logging request payloads', () => {
  assert.match(edgeObservability, /X-Request-Id/)
  assert.match(edgeObservability, /Server-Timing/)
  assert.match(edgeObservability, /edge_unhandled_error/)
  assert.match(edgeObservability, /request_id/)
  assert.match(edgeObservability, /Terjadi kesalahan server/)
  assert.doesNotMatch(edgeObservability, /req\.json\(|Authorization|authorization/)
  assert.match(cors, /Access-Control-Expose-Headers.*x-request-id, server-timing/)
})

test('all operational Edge Functions are wrapped by the shared observer', () => {
  for (const name of operationalFunctions) {
    const source = read(`supabase/functions/${name}/index.ts`)
    assert.match(source, /_shared\/observability\.ts/)
    assert.match(source, new RegExp(`observeEdgeFunction\\('${name.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')}'`))
    assert.doesNotMatch(source, /catch \{\s*return jsonResponse\(\{ ok: false, error: 'Terjadi kesalahan server\.'/)
  }
})

test('scanner regression guard remains LIVE CAMERA ONLY', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.match(scanner, /record-attendance/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
})
