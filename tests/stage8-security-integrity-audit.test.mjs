import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const [migration, announcements, payments, auditPage, portal, manifestText] = await Promise.all([
  read('../supabase/migrations/20260917074753_stage8_announcement_payment_audit.sql'),
  read('../src/portal-v2/AnnouncementsPage.tsx'),
  read('../src/portal-v2/PaymentsPage.tsx'),
  read('../src/portal-v2/AuditTrailPage.tsx'),
  read('../src/RolePortalV4.tsx'),
  read('../supabase/production-migration-manifest.json'),
])
const manifest = JSON.parse(manifestText)

test('Guru hanya dapat mengubah dan menghapus pengumuman miliknya sendiri', () => {
  assert.match(migration, /staff update permitted announcements/)
  assert.match(migration, /staff delete permitted announcements/)
  assert.match(migration, /created_by = \(select auth\.uid\(\)\)/)
  assert.match(migration, /current_user_role\(\)\) = 'admin'/)
  assert.match(announcements, /canManageRow/)
  assert.match(announcements, /row\.created_by === currentUserId/)
  assert.match(portal, /AnnouncementsPage role=\{role\} currentUserId=\{profile\.id\}/)
  assert.match(portal, /portal-v2\/AnnouncementsPage/)
})

test('integritas pembayaran dipaksa di database dan dicerminkan frontend', () => {
  assert.match(migration, /student_payments_paid_not_over_amount/)
  assert.match(migration, /check \(paid_amount <= amount\)/)
  assert.match(migration, /status = 'unpaid' and paid_amount = 0/)
  assert.match(migration, /status = 'partial' and paid_amount > 0 and paid_amount < amount/)
  assert.match(migration, /status = 'paid' and amount > 0 and paid_amount = amount/)
  assert.match(payments, /paidAmount > amount/)
  assert.match(payments, /tidak boleh melebihi total tagihan/)
  assert.match(payments, /max=\{form\.amount \|\| undefined\}/)
})

test('audit trail append-only mencatat perubahan pengumuman dan pembayaran', () => {
  assert.match(migration, /create table if not exists public\.audit_events/)
  assert.match(migration, /table_name in \('announcements','student_payments'\)/)
  assert.match(migration, /security definer/)
  assert.match(migration, /announcements_capture_audit/)
  assert.match(migration, /student_payments_capture_audit/)
  assert.match(migration, /revoke insert, update, delete on public\.audit_events from authenticated, anon/)
  assert.match(migration, /admin read audit events/)
  assert.match(migration, /with \(security_invoker = true\)/)
  assert.match(auditPage, /\.from\('audit_events_view'\)/)
  assert.match(portal, /page === 'audit' && role === 'admin'/)
  assert.match(portal, /Riwayat Aktivitas/)
})

test('migration Tahap 8 sinkron dengan manifest produksi', () => {
  assert.ok(manifest.production_migrations.includes('20260917074753_stage8_announcement_payment_audit.sql'))
})
