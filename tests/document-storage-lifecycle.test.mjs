import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const documents = await readFile(new URL('../src/portal-v2/DocumentsPage.tsx', import.meta.url), 'utf8')
const cleanupMigration = await readFile(new URL('../supabase/migrations/20260917050213_document_storage_cleanup_queue.sql', import.meta.url), 'utf8')
const hardeningMigration = await readFile(new URL('../supabase/migrations/20260917050525_harden_document_storage_cleanup_trigger.sql', import.meta.url), 'utf8')
const wrapper = await readFile(new URL('../src/portal-v2/SchoolModules.tsx', import.meta.url), 'utf8')

test('dokumen membedakan Storage path internal dari tautan eksternal', () => {
  assert.match(documents, /isExternalDocumentUrl/)
  assert.match(documents, /existingStoredPath/)
  assert.match(documents, /externalUrl: isExternalDocumentUrl\(value\?\.file_url\)/)
  assert.doesNotMatch(documents, /url: value\?\.file_url \|\| ''/)
})

test('file baru divalidasi dan dibersihkan jika penyimpanan database gagal', () => {
  assert.match(documents, /10 \* 1024 \* 1024/)
  assert.match(documents, /PDF, JPG, PNG, atau DOCX/)
  assert.match(documents, /removeUploadedFileOrQueue\(uploadedPath\)/)
  assert.match(documents, /school_document_storage_cleanup/)
})

test('perubahan atau penghapusan dokumen mengantrekan file Storage lama', () => {
  assert.match(cleanupMigration, /school_document_storage_cleanup/)
  assert.match(cleanupMigration, /after update of file_url or delete on public\.school_documents/)
  assert.match(cleanupMigration, /old_path !~\* '\^https\?:\/\/'/)
  assert.match(hardeningMigration, /tg_op = 'DELETE'/)
  assert.match(hardeningMigration, /old\.file_url is distinct from new\.file_url/)
})

test('portal aktif mengekspor Dokumen dan modul data besar dari implementasi aktifnya', () => {
  assert.match(wrapper, /TeachersPage.*\.\/TeachersPage/)
  assert.match(wrapper, /ReportsPage.*\.\/ReportsPage/)
  assert.match(wrapper, /PaymentsPage.*\.\/PaymentsPage/)
  assert.match(wrapper, /DocumentsPage.*\.\/DocumentsPage/)
  assert.doesNotMatch(wrapper, /SchoolModulesLegacy/)
})
