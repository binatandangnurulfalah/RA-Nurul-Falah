import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const compactHeaderPages = [
  'src/portal-v2/AccountsPage.tsx',
  'src/portal-v2/AttendancePages.tsx',
  'src/portal-v2/AttendanceScannerNative.tsx',
  'src/portal-v2/AuditTrailPage.tsx',
  'src/portal-v2/DocumentsPage.tsx',
  'src/portal-v2/ParentFamilyPage.tsx',
  'src/portal-v2/ParentVerificationPage.tsx',
  'src/portal-v2/PaymentsPage.tsx',
  'src/portal-v2/StudentsPageV2.tsx',
  'src/portal-v2/TeachersPage.tsx',
]

test('header halaman operasional tetap ringkas tanpa subtitle intro panjang', () => {
  for (const path of compactHeaderPages) {
    const source = read(path)
    const pageHeaders = source.match(/<PageHeader[\s\S]{0,700}?(?:\/>|>)/g) ?? []
    for (const header of pageHeaders) assert.doesNotMatch(header, /subtitle=/, path)
  }
})

test('kartu penjelasan statis yang redundan di Keluarga dan Scanner sudah dihapus', () => {
  const family = read('src/portal-v2/ParentFamilyPage.tsx')
  const verification = read('src/portal-v2/ParentVerificationPage.tsx')
  const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')
  const familyCss = read('src/parent-verification.css')
  const portalCss = read('src/portal-v2.css')

  assert.doesNotMatch(family, /Data resmi dilindungi proses verifikasi/)
  assert.doesNotMatch(family, /family-verification-note/)
  assert.doesNotMatch(verification, /Guru menjadi pemeriksa data/)
  assert.doesNotMatch(verification, /family-verification-note/)
  assert.doesNotMatch(scanner, /QR hanya diproses oleh Admin atau Guru yang sedang login/)
  assert.doesNotMatch(scanner, /v2-security-note/)
  assert.doesNotMatch(familyCss, /\.family-verification-note/)
  assert.doesNotMatch(portalCss, /\.v2-security-note/)
})
