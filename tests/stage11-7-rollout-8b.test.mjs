import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const payments = read('src/portal-v2/PaymentsPage.tsx')
const paymentsQuery = read('src/data/queries/payments.ts')
const documents = read('src/portal-v2/DocumentsPage.tsx')
const documentsQuery = read('src/data/queries/documents.ts')

test('payments memakai reusable data UI dan mempertahankan server-side data contract', () => {
  for (const name of ['DataTable', 'MobileDataCard', 'SearchFilterBar', 'StatCard', 'StatusBadge', 'ErrorState', 'EmptyState']) {
    assert.match(payments, new RegExp(name))
  }
  assert.match(payments, /FormDialog/)
  assert.match(payments, /ConfirmDialog/)
  assert.match(paymentsQuery, /student_payments_search/)
  assert.match(paymentsQuery, /payment_summary/)
  assert.match(paymentsQuery, /getPageRange\(page, pageSize\)/)
  assert.match(paymentsQuery, /\.range\(range\.from, range\.to\)/)
  assert.doesNotMatch(payments, /SkeletonRows/)
  assert.doesNotMatch(payments, /PageTitle/)
  assert.doesNotMatch(payments, /function Confirm\(/)
})

test('documents memakai reusable data UI tanpa mengubah private storage lifecycle', () => {
  for (const name of ['DataTable', 'MobileDataCard', 'SearchFilterBar', 'StatusBadge', 'ErrorState', 'EmptyState']) {
    assert.match(documents, new RegExp(name))
  }
  assert.match(documents, /FormDialog/)
  assert.match(documents, /ConfirmDialog/)
  assert.match(documents, /const DOCUMENT_BUCKET = 'school-documents'/)
  assert.match(documents, /createSignedUrl\(storagePath, 300\)/)
  assert.match(documents, /enqueue_school_document_storage_cleanup/)
  assert.match(documents, /processDocumentStorageCleanup/)
  assert.match(documents, /DOCUMENT_MAX_BYTES = 10 \* 1024 \* 1024/)
  assert.match(documentsQuery, /getPageRange\(page, pageSize\)/)
  assert.match(documentsQuery, /\.range\(range\.from, range\.to\)/)
  assert.doesNotMatch(documents, /SkeletonRows/)
  assert.doesNotMatch(documents, /PageTitle/)
  assert.doesNotMatch(documents, /function Confirm\(/)
})

test('payments and documents mutations memiliki synchronous busy guard', () => {
  assert.match(payments, /const removingRef = useRef\(false\)/)
  assert.match(documents, /const removingRef = useRef\(false\)/)
  assert.match(payments, /if \(!deleting \|\| !canManage \|\| removingRef\.current\) return/)
  assert.match(documents, /if \(!deleting \|\| !canManage \|\| removingRef\.current\) return/)
  assert.match(payments, /busyRef\.current = true/)
  assert.match(documents, /busyRef\.current = true/)
  assert.match(payments, /busy=\{removing\}/)
  assert.match(documents, /busy=\{removing\}/)
})

test('stage 11.7.8B tidak menyentuh scanner contract', () => {
  assert.doesNotMatch(payments, /AttendanceScannerNative|BarcodeDetector|getUserMedia/)
  assert.doesNotMatch(documents, /AttendanceScannerNative|BarcodeDetector|getUserMedia/)
})
