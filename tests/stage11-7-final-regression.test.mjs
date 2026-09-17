import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const pages = {
  students: read('src/portal-v2/StudentsPageV2.tsx'),
  teachers: read('src/portal-v2/TeachersPage.tsx'),
  attendance: read('src/portal-v2/AttendancePages.tsx'),
  accounts: read('src/portal-v2/AccountsPage.tsx'),
  payments: read('src/portal-v2/PaymentsPage.tsx'),
  documents: read('src/portal-v2/DocumentsPage.tsx'),
}
const studentsQuery = read('src/data/queries/students.ts')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')
const scannerCss = read('src/scanner-native.css')
const dataUi = read('src/data-ui.css')
const mobileCss = read('src/mobile-v5.css')
const schoolCss = read('src/school-modules.css')
const packageJson = JSON.parse(read('package.json'))

test('seluruh halaman rollout 11.7 tetap memakai reusable responsive data presentation', () => {
  for (const [name, source] of Object.entries(pages)) {
    for (const primitive of ['DataTable', 'MobileDataCard', 'SearchFilterBar', 'PaginationControls']) {
      assert.match(source, new RegExp(primitive), `${name} belum memakai ${primitive}`)
    }
    assert.doesNotMatch(source, /SkeletonRows/, `${name} masih memakai skeleton legacy`)
    assert.doesNotMatch(source, /PageTitle/, `${name} masih memakai page title legacy`)
  }

  assert.match(dataUi, /\.desktop-data-view/)
  assert.match(dataUi, /\.mobile-data-view/)
  assert.match(dataUi, /@media \(max-width: 760px\)/)
})

test('server-side pagination tetap dipertahankan saat query lifecycle dipindahkan ke TanStack Query', () => {
  const directPages = Object.entries(pages).filter(([name]) => name !== 'students')
  for (const [name, source] of directPages) {
    assert.match(source, /getPageRange\(page, PAGE_SIZE\)/, `${name} tidak memakai page range server`)
    assert.match(source, /\.range\(range\.from, range\.to\)/, `${name} tidak memakai Supabase range`)
    assert.match(source, /count: 'exact'/, `${name} tidak meminta exact count`)
  }
  assert.match(studentsQuery, /getPageRange\(params\.page, params\.pageSize\)/)
  assert.match(studentsQuery, /\.range\(range\.from, range\.to\)/)
  assert.match(studentsQuery, /count: 'exact'/)
})

test('kontrak backend penting tetap berada di server/Supabase', () => {
  assert.match(pages.attendance, /attendance_records_search/)
  assert.match(pages.attendance, /attendance_summary_for_date/)
  assert.match(pages.attendance, /manage-attendance-record/)
  assert.match(pages.accounts, /admin-create-user/)
  assert.match(pages.accounts, /admin-manage-user/)
  assert.match(pages.payments, /student_payments_search/)
  assert.match(pages.payments, /payment_summary/)
  assert.match(pages.documents, /createSignedUrl/)
  assert.match(pages.documents, /school_document_storage_cleanup/)
  assert.match(studentsQuery, /supabase\.from\('students'\)/)
})

test('scanner terkunci LIVE CAMERA ONLY dan tetap mendukung switch/mirror kamera depan', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.match(scanner, /const switchCamera = async/)
  assert.match(scanner, /Ganti Kamera/)
  assert.match(scanner, /frontCamera \? 'front-camera'/)
  assert.match(scannerCss, /\.native-camera\.front-camera video \{ transform: scaleX\(-1\); \}/)

  assert.doesNotMatch(scanner, /type="file"|capture=|openNativeCapture|handleNativeCapture/)
  assert.doesNotMatch(scanner, /galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|\bmanual\b|Masukkan kode QR secara manual|Tempel kode QR/i)
})

test('CSS legacy rollout tidak kembali setelah consolidation 11.7.9', () => {
  for (const selector of ['.payment-list', '.payment-icon', '.payment-balance', '.money-value', '.document-grid', '.document-icon', '.document-actions']) {
    assert.equal(schoolCss.includes(selector), false, `${selector} kembali ke school-modules.css`)
    assert.equal(mobileCss.includes(selector), false, `${selector} kembali ke mobile-v5.css`)
  }
  assert.doesNotMatch(mobileCss, /\.v5-pagination/)
})

test('Tahap 11.8 boleh menambahkan TanStack Query tanpa menyentuh scanner/backend security contract', () => {
  assert.equal(packageJson.dependencies?.['@tanstack/react-query'], '5.102.8')
  assert.match(pages.students, /useQuery/)
  assert.doesNotMatch(scanner, /@tanstack\/react-query/)
})
