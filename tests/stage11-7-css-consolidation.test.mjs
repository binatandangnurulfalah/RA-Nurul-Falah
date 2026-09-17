import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const dataUi = read('src/data-ui.css')
const mobile = read('src/mobile-v5.css')
const schoolModules = read('src/school-modules.css')
const dataExperience = read('src/portal-v2/DataExperience.tsx')
const payments = read('src/portal-v2/PaymentsPage.tsx')
const paymentsQuery = read('src/data/queries/payments.ts')
const documents = read('src/portal-v2/DocumentsPage.tsx')
const documentsQuery = read('src/data/queries/documents.ts')

test('pagination presentation memiliki satu jalur reusable Data UI', () => {
  assert.match(dataExperience, /import \{ Pagination \} from '\.\.\/components\/data\/Pagination'/)
  assert.match(dataExperience, /return <Pagination /)
  assert.match(dataUi, /\.data-pagination/)
  assert.doesNotMatch(mobile, /\.v5-pagination/)
})

test('legacy payment dan document presentation CSS sudah dibuang setelah rollout reusable UI', () => {
  for (const selector of [
    '.payment-list',
    '.payment-icon',
    '.payment-balance',
    '.money-value',
    '.document-grid',
    '.document-icon',
    '.document-actions',
  ]) {
    assert.equal(schoolModules.includes(selector), false, `${selector} masih tersisa di school-modules.css`)
    assert.equal(mobile.includes(selector), false, `${selector} masih tersisa di mobile-v5.css`)
  }

  for (const component of ['DataTable', 'MobileDataCard', 'SearchFilterBar', 'StatusBadge']) {
    assert.match(payments, new RegExp(component))
    assert.match(documents, new RegExp(component))
  }
})

test('mobile action menu memakai canonical design tokens, bukan alias token yang tidak didefinisikan', () => {
  assert.match(mobile, /var\(--color-border\)/)
  assert.match(mobile, /var\(--color-text\)/)
  assert.doesNotMatch(mobile, /var\(--v2-border\)/)
  assert.doesNotMatch(mobile, /var\(--v2-text\)/)
})

test('CSS consolidation tidak mengubah query, storage, atau pagination contract halaman data', () => {
  assert.match(paymentsQuery, /student_payments_search/)
  assert.match(paymentsQuery, /payment_summary/)
  assert.match(payments, /PaginationControls/)
  assert.match(documents, /school-documents/)
  assert.match(documents, /createSignedUrl/)
  assert.match(documents, /school_document_storage_cleanup/)
  assert.match(documentsQuery, /\.range\(range\.from, range\.to\)/)
  assert.match(documents, /PaginationControls/)
})
