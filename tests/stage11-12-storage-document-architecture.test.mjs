import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const migration = read('supabase/migrations/20260918021105_stage11_12_storage_document_architecture.sql')
const bucketMigration = read('supabase/migrations/20260917032201_school_documents_storage_bucket.sql')
const documentsPage = read('src/portal-v2/DocumentsPage.tsx')
const documentsQuery = read('src/data/queries/documents.ts')
const cleanupFunction = read('supabase/functions/process-document-storage-cleanup/index.ts')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('bucket dokumen tetap private dengan limit dan MIME whitelist', () => {
  assert.match(bucketMigration, /'school-documents','school-documents',false,10485760/)
  assert.match(bucketMigration, /application\/pdf/)
  assert.match(bucketMigration, /image\/jpeg/)
  assert.match(bucketMigration, /image\/png/)
  assert.match(bucketMigration, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/)
})

test('school_documents memisahkan storage path, external URL, dan metadata file', () => {
  for (const column of ['storage_path', 'external_url', 'original_file_name', 'mime_type', 'file_size_bytes']) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`))
    assert.match(documentsQuery, new RegExp(column))
  }
  assert.match(migration, /school_documents_source_exclusive_check/)
  assert.match(migration, /school_documents_storage_path_check/)
  assert.match(migration, /school_documents_external_url_check/)
  assert.match(migration, /school_documents_file_metadata_check/)
  assert.match(migration, /file_size_bytes between 0 and 10485760/)
})

test('file_url hanya compatibility mirror dan frontend menulis field canonical', () => {
  assert.match(migration, /sync_school_document_source/)
  assert.match(migration, /new\.file_url := coalesce\(new\.external_url, new\.storage_path\)/)
  assert.match(documentsPage, /storage_path: storagePath/)
  assert.match(documentsPage, /external_url: resolvedExternalUrl/)
  assert.match(documentsPage, /original_file_name: originalFileName/)
  assert.match(documentsPage, /mime_type: mimeType/)
  assert.match(documentsPage, /file_size_bytes: fileSizeBytes/)
  assert.doesNotMatch(documentsPage, /file_url: fileReference/)
})

test('cleanup storage hanya diproses backend dan queue tidak diekspos ke client', () => {
  assert.match(migration, /revoke all on table public\.school_document_storage_cleanup from anon, authenticated/)
  assert.match(migration, /claim_school_document_storage_cleanup/)
  assert.match(migration, /grant execute on function public\.claim_school_document_storage_cleanup\(integer\) to service_role/)
  assert.match(migration, /enqueue_school_document_storage_cleanup/)
  assert.match(cleanupFunction, /requireRole\(context, \['admin'\]/)
  assert.match(cleanupFunction, /claim_school_document_storage_cleanup/)
  assert.match(cleanupFunction, /context\.adminClient\.storage/)
  assert.match(cleanupFunction, /\.remove\(\[row\.object_path\]\)/)
  assert.doesNotMatch(documentsPage, /\.from\('school_document_storage_cleanup'\)/)
  assert.doesNotMatch(documentsPage, /storage\.from\(DOCUMENT_BUCKET\)\.remove/)
  assert.match(documentsPage, /process-document-storage-cleanup/)
})

test('client tidak lagi memiliki policy update/delete object dokumen', () => {
  assert.match(migration, /drop policy if exists "school_documents_admin_update"/)
  assert.match(migration, /drop policy if exists "school_documents_admin_delete"/)
  assert.match(migration, /document\.storage_path = storage\.objects\.name/)
})

test('audit dokumen tidak menyimpan path atau nama file privat', () => {
  assert.match(migration, /when 'school_documents'/)
  for (const field of ['file_url', 'storage_path', 'external_url', 'original_file_name', 'description']) {
    assert.match(migration, new RegExp(`'${field}'`))
  }
})

test('orphan upload dapat diantrikan secara durable sebelum cleanup Edge Function', () => {
  assert.match(documentsPage, /enqueue_school_document_storage_cleanup/)
  assert.match(documentsPage, /queueUploadedOrphan/)
  assert.match(documentsPage, /void processDocumentStorageCleanup\(\)/)
  assert.match(migration, /File masih direferensikan dokumen aktif/)
})

test('scanner tetap LIVE CAMERA ONLY setelah Tahap 11.12', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.match(scanner, /record-attendance/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
})
