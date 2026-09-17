import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reports = await readFile(new URL('../src/portal-v2/ReportsPage.tsx', import.meta.url), 'utf8')
const payments = await readFile(new URL('../src/portal-v2/PaymentsPage.tsx', import.meta.url), 'utf8')
const documents = await readFile(new URL('../src/portal-v2/DocumentsPage.tsx', import.meta.url), 'utf8')
const storageBucketMigration = await readFile(new URL('../supabase/migrations/20260917032201_school_documents_storage_bucket.sql', import.meta.url), 'utf8')
const storagePoliciesMigration = await readFile(new URL('../supabase/migrations/20260917032213_school_documents_storage_policies.sql', import.meta.url), 'utf8')
const design = await readFile(new URL('../src/design-system.css', import.meta.url), 'utf8')

test('rapor dan kuitansi menyediakan cetak PDF', () => {
  assert.match(reports, /Cetak \/ Simpan PDF/)
  assert.match(payments, /PaymentReceipt/)
})

test('unggahan dokumen memakai bucket privat dan signed URL', () => {
  assert.match(storageBucketMigration, /'school-documents','school-documents',false/)
  assert.match(storagePoliciesMigration, /school_documents_authorized_read/)
  assert.match(documents, /createSignedUrl\(row\.file_url, 300\)/)
  assert.match(documents, /\.upload\(uploadedPath, file/)
})

test('design system menetapkan token kontrol dan target sentuh', () => {
  assert.match(design, /--ds-radius-control:/)
  assert.match(design, /--ds-touch:\s*44px/)
  assert.match(design, /:focus-visible/)
})
