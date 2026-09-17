import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const [migration, announcements, payments, portal, auditTrail, manifestText] = await Promise.all([
  read('../supabase/migrations/20260917074753_stage8_announcement_payment_audit.sql'),
  read('../src/portal-v2/AnnouncementsPage.tsx'),
  read('../src/portal-v2/PaymentsPage.tsx'),
  read('../src/RolePortalV4.tsx'),
  read('../src/portal-v2/AuditTrailPage.tsx'),
  read('../supabase/production-migration-manifest.json'),
])
const manifest = JSON.parse(manifestText)

test('Guru hanya dapat mengubah dan menghapus pengumuman miliknya sendiri', () => {
  assert.match(migration, /created_by = \(select auth\.uid\(\)\)/)
  assert.match(migration, /staff update permitted announcements/)
  assert.match(migration, /staff delete permitted announcements/)
  assert.match(announcements, /role === 'admin' \|\| \(role === 'teacher' && row\.created_by === currentUserId\)/)
  assert.match(announcements, /Milik saya/)
})

test('Wali hanya membaca pengumuman terbit untuk audience yang diizinkan', () => {
  assert.match(migration, /current_user_role\(\)\) = 'parent'/)
  assert.match(migration, /is_published = true/)
  assert.match(migration, /audience in \('all','parent'\)/)
})

test('database memaksa integritas nominal dan status pembayaran', () => {
  assert.match(migration, /student_payments_paid_not_over_amount/)
  assert.match(migration, /check \(paid_amount <= amount\)/)
  assert.match(migration, /student_payments_status_amount_consistency/)
  assert.match(migration, /status = 'partial' and paid_amount > 0 and paid_amount < amount/)
  assert.match(migration, /status = 'paid' and amount > 0 and paid_amount = amount/)
  assert.match(payments, /paidAmount > amount/)
  assert.match(payments, /paidAmount === amount && amount > 0/)
})

test('audit trail hanya dapat dibaca Admin dan tidak dapat dimutasi frontend', () => {
  assert.match(migration, /create table if not exists public\.audit_events/)
  assert.match(migration, /alter table public\.audit_events enable row level security/)
  assert.match(migration, /admin read audit events/)
  assert.match(migration, /revoke insert, update, delete on public\.audit_events from authenticated, anon/)
  assert.match(migration, /private\.capture_audit_event\(\)/)
  assert.match(migration, /announcements_capture_audit/)
  assert.match(migration, /student_payments_capture_audit/)
})

test('Admin memiliki halaman Riwayat Aktivitas berbasis audit_events_view', () => {
  assert.match(auditTrail, /from\('audit_events_view'\)/)
  assert.match(auditTrail, /Riwayat Aktivitas/)
  assert.match(auditTrail, /append-only/)
  assert.match(portal, /import\('\.\/portal-v2\/AuditTrailPage'\)/)
  assert.match(portal, /id: 'audit'/)
  assert.match(portal, /page === 'audit' && role === 'admin'/)
})

test('portal menggunakan halaman Pengumuman baru yang role-aware', () => {
  assert.match(portal, /import\('\.\/portal-v2\/AnnouncementsPage'\)/)
  assert.match(portal, /AnnouncementsPage role=\{role\} currentUserId=\{profile\.id\}/)
  assert.doesNotMatch(portal, /AnnouncementsPage canManage=/)
})

test('migration Tahap 8 tercatat di manifest produksi', () => {
  assert.ok(manifest.production_migrations.includes('20260917074753_stage8_announcement_payment_audit.sql'))
})
