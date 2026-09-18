import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const migration = read('supabase/migrations/20260918023000_stage11_13_announcement_reads_realtime.sql')
const announcementsPage = read('src/portal-v2/AnnouncementsPage.tsx')
const announcementsQuery = read('src/data/queries/announcements.ts')
const portal = read('src/RolePortalV5.tsx')
const realtime = read('src/data/useAnnouncementRealtime.ts')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('read-state pengumuman tersimpan per user di database dan tidak diekspos langsung ke client', () => {
  assert.match(migration, /create table if not exists public\.announcement_reads/)
  assert.match(migration, /primary key \(announcement_id, user_id\)/)
  assert.match(migration, /on delete cascade/)
  assert.match(migration, /revoke all on table public\.announcement_reads from anon, authenticated/)
  assert.match(migration, /announcement_unread_count/)
  assert.match(migration, /mark_announcements_read/)
})

test('unread kembali aktif bila pengumuman diubah setelah dibaca', () => {
  assert.match(migration, /r\.read_at >= a\.updated_at/)
  assert.match(migration, /do update set read_at = excluded\.read_at/)
  assert.match(announcementsPage, /row\.updated_at/)
  assert.match(announcementsPage, /markAnnouncementsRead/)
})

test('badge unread memakai RPC server-side tanpa localStorage legacy', () => {
  assert.match(portal, /announcementUnreadCountOptions/)
  assert.match(announcementsQuery, /supabase\.rpc\('announcement_unread_count'\)/)
  assert.match(announcementsQuery, /supabase\.rpc\('mark_announcements_read'/)
  assert.doesNotMatch(portal, /ra_read_announcements|ra-announcements-read/)
  assert.doesNotMatch(announcementsPage, /ra_read_announcements|ra-announcements-read/)
})

test('selective realtime hanya menginvalidasi cache announcement dan dashboard', () => {
  assert.match(migration, /alter publication supabase_realtime add table public\.announcements/)
  assert.match(realtime, /table: 'announcements'/)
  assert.match(realtime, /event: '\*'/)
  assert.match(realtime, /queryKeys\.announcements\.all/)
  assert.match(realtime, /queryKeys\.dashboard\.all/)
  assert.match(realtime, /removeChannel/)
  assert.doesNotMatch(realtime, /table: 'announcement_reads'/)
})

test('audience filtering read-state konsisten dengan role', () => {
  assert.match(migration, /p_role = 'admin'/)
  assert.match(migration, /p_role = 'teacher'[\s\S]*p_audience in \('all', 'teacher'\)/)
  assert.match(migration, /p_role = 'parent'[\s\S]*p_audience in \('all', 'parent'\)/)
  assert.match(migration, /Terlalu banyak pengumuman dalam satu permintaan/)
})

test('scanner tetap LIVE CAMERA ONLY setelah Tahap 11.13', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.match(scanner, /record-attendance/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
})
