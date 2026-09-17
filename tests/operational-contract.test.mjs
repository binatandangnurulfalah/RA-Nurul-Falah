import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const modules = await readFile(new URL('../src/portal-v2/SchoolModules.tsx', import.meta.url), 'utf8')
const migration = await readFile(new URL('../supabase/migrations/20260917032500_school_documents_storage.sql', import.meta.url), 'utf8')
const design = await readFile(new URL('../src/design-system.css', import.meta.url), 'utf8')

test('rapor dan kuitansi menyediakan cetak PDF', () => {
  assert.match(modules, /Cetak \/ Simpan PDF/)
  assert.match(modules, /PaymentReceipt/)
})

test('unggahan dokumen memakai bucket privat dan signed URL', () => {
  assert.match(migration, /'school-documents',[\s\S]*false/)
  assert.match(modules, /createSignedUrl\(row\.file_url, 300\)/)
  assert.match(modules, /\.upload\(filePath, file/)
})

test('design system menetapkan token kontrol dan target sentuh', () => {
  assert.match(design, /--ds-radius-control:/)
  assert.match(design, /--ds-touch:\s*44px/)
  assert.match(design, /:focus-visible/)
})
