import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const documents = await readFile(new URL('../src/portal-v2/DocumentsPage.tsx', import.meta.url), 'utf8')
const cleanupMigration = await readFile(new URL('../supabase/migrations/20260917050213_document_storage_cleanup_queue.sql', import.meta.url), 'utf8')
const hardeningMigration = await readFile(new URL('../supabase/migrations/20260917050525_harden_document_storage_cleanup_trigger.sql', import.meta.url), 'utf8')
const storageArchitectureMigration = await readFile(new URL('../supabase/migrations/20260918021105_stage11_12_storage_document_architecture.sql', import.meta.url), 'utf8')
const portal = await readFile(new URL('../src/RolePortalV5.tsx', import.meta.url), 'utf8')

test('dokumen membedakan Storage path internal dari tautan eksternal', () => {
  assert.match(documents, /isExternalDocumentUrl/)
  assert.match(documents, /existingStoredPath/)
  assert.match(documents, /externalUrl: existingExternalUrl \|\| ''/)
  assert.match(documents, /row\.external_url/)
  assert.match(documents, /row\.storage_path/)
  assert.doesNotMatch(documents, /url: value\?\.file_url \|\| ''/)
})

test('file baru divalidasi dan dibersihkan jika penyimpanan database gagal', () => {
  assert.match(documents, /10 \* 1024 \* 1024/)
  assert.match(documents, /PDF, JPG, PNG, atau DOCX/)
  assert.match(documents, /queueUploadedOrphan\(uploadedPath\)/)
  assert.match(documents, /enqueue_school_document_storage_cleanup/)
  assert.match(documents, /process-document-storage-cleanup/)
})

test('perubahan atau penghapusan dokumen mengantrekan file Storage lama', () => {
  assert.match(cleanupMigration, /school_document_storage_cleanup/)
  assert.match(cleanupMigration, /after update of file_url or delete on public\.school_documents/)
  assert.match(cleanupMigration, /old_path !~\* '\^https\?:\/\/'/)
  assert.match(hardeningMigration, /tg_op = 'DELETE'/)
  assert.match(storageArchitectureMigration, /old\.storage_path is distinct from new\.storage_path/)
  assert.match(storageArchitectureMigration, /claim_school_document_storage_cleanup/)
})

test('portal aktif lazy-load Dokumen dan modul data besar langsung dari implementasi aktifnya', () => {
  assert.match(portal, /import\('\.\/portal-v2\/TeachersPage'\)/)
  assert.match(portal, /import\('\.\/portal-v2\/ReportsPage'\)/)
  assert.match(portal, /import\('\.\/portal-v2\/PaymentsPage'\)/)
  assert.match(portal, /import\('\.\/portal-v2\/DocumentsPage'\)/)
  assert.doesNotMatch(portal, /SchoolModules/)
})
