import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const migration = read('supabase/migrations/20260918041836_stage11_18_final_audit_hardening.sql')
const generatedTypes = read('src/lib/database.types.ts')
const normalizedTypes = read('src/lib/database-normalized.types.ts')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')
const tombstone = read('supabase/functions/delete-attendance-record/index.ts')
const readme = read('README.md')

test('final audit menutup empat foreign-key index advisor findings secara non-destruktif', () => {
  for (const indexName of [
    'academic_years_created_by_idx',
    'payment_transactions_created_by_idx',
    'payment_transactions_voided_by_idx',
    'school_settings_academic_year_id_idx',
  ]) {
    assert.match(migration, new RegExp(`create index if not exists ${indexName}`))
  }
  assert.match(migration, /announcement_reads_no_direct_client_access/)
  assert.match(migration, /school_document_storage_cleanup_no_direct_client_access/)
  assert.match(migration, /using \(false\)/)
  assert.match(migration, /with check \(false\)/)
})

test('generated database types sudah mencerminkan schema production tahap akhir', () => {
  assert.match(generatedTypes, /announcement_reads:/)
  assert.match(generatedTypes, /payment_transactions:/)
  assert.match(generatedTypes, /school_document_storage_cleanup:/)
  assert.match(generatedTypes, /save_school_settings:/)
  assert.match(generatedTypes, /void_payment_transaction:/)
  assert.match(normalizedTypes, /'academic_years'/)
  assert.match(normalizedTypes, /'payment_transactions'/)
})

test('endpoint delete attendance lama hanya tombstone 410 dan tidak dapat menghapus data', () => {
  assert.match(tombstone, /status: 410/)
  assert.match(tombstone, /sudah dipensiunkan/)
  assert.doesNotMatch(tombstone, /createClient|service_role|\.delete\(|from\(['"]attendance_records/)
})

test('scanner tetap LIVE CAMERA ONLY setelah final audit', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.match(scanner, /record-attendance/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
})

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

test('frontend source tidak membawa service-role credential contract', () => {
  for (const path of walk(new URL('../src', import.meta.url).pathname)) {
    if (!/\.(ts|tsx|js|jsx)$/.test(path)) continue
    const source = readFileSync(path, 'utf8')
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE|service_role_key/i, path)
  }
})

test('README sesuai implementasi scanner dan edge-function production', () => {
  assert.match(readme, /BarcodeDetector/)
  assert.match(readme, /process-document-storage-cleanup/)
  assert.match(readme, /delete-attendance-record/)
  assert.match(readme, /410/)
  assert.doesNotMatch(readme, /html5-qrcode/)
})
