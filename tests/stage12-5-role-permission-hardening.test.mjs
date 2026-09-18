import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const rolePortal = read('src/RolePortalV5.tsx')
const students = read('src/portal-v2/StudentsPageV2.tsx')
const studentQueries = read('src/data/queries/students.ts')
const schedule = read('src/portal-v2/SchedulePage.tsx')
const attendance = read('src/portal-v2/AttendancePages.tsx')
const reports = read('src/portal-v2/ReportsPage.tsx')
const announcements = read('src/portal-v2/AnnouncementsPage.tsx')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')
const migration = read('supabase/migrations/20260918090000_stage12_5_role_permission_hardening.sql')

test('teacher student UI is read-only except QR access', () => {
  assert.match(students, /const canManage = role === 'admin'/)
  assert.match(students, /Tampilkan QR/)
  assert.match(students, /\.\.\.\(canManage \? \[/)
  assert.match(students, /actions=\{canManage \? <Button/)
  assert.match(students, /editing && canManage && <StudentModal/)
  assert.match(students, /Lihat murid pada kelas yang ditugaskan/)
  assert.doesNotMatch(students, /role === 'teacher'[^\n]{0,120}setEditing/)
})

test('teacher does not fetch parent account lookup data for student management', () => {
  assert.match(students, /studentLookupsOptions\(\{ includeParents: canManage \}\)/)
  assert.match(studentQueries, /includeParents = false/)
  assert.match(studentQueries, /includeParents[\s\S]{0,180}user_profiles/)
})

test('official schedule UI is admin-managed and role-aware', () => {
  assert.match(rolePortal, /<SchedulePage role=\{role\} \/>/)
  assert.match(schedule, /const canManage = role === 'admin'/)
  assert.match(schedule, /role === 'teacher' \? 'Lihat jadwal kegiatan belajar untuk kelas yang ditugaskan\.'/)
  assert.match(schedule, /editing && canManage/)
})

test('RLS and student RPC make master-data writes admin-only', () => {
  for (const policy of [
    'admin create students',
    'admin update students',
    'admin create guardian links',
    'admin update guardian links',
    'admin delete guardian links',
    'admin create schedules',
    'admin update schedules',
    'admin delete schedules',
  ]) {
    assert.match(migration, new RegExp(policy))
  }

  for (const retired of [
    'staff create students',
    'staff update students',
    'staff create guardian links',
    'staff update guardian links',
    'staff delete guardian links',
    'staff create schedules',
    'staff update schedules',
    'staff delete schedules',
  ]) {
    assert.match(migration, new RegExp(`drop policy if exists "${retired}"`))
  }

  assert.match(migration, /current_user_role\(\)::text, ''\) <> 'admin'/)
  assert.match(migration, /Hanya Admin yang dapat menyimpan data murid/)
  assert.match(migration, /security invoker/)
})

test('teacher operational permissions intentionally remain for attendance, reports, and own announcements', () => {
  assert.match(rolePortal, /AttendanceDataManager canManage=\{role !== 'parent'\}/)
  assert.match(reports, /const canManage = role !== 'parent'/)
  assert.match(reports, /teacher_can_access|student_id|is_published/i)
  assert.match(announcements, /const canCreate = role === 'admin' \|\| role === 'teacher'/)
  assert.match(announcements, /role === 'admin' \|\| \(role === 'teacher' && row\.created_by === currentUserId\)/)
  assert.match(attendance, /canManage/)
})

test('scanner remains LIVE CAMERA ONLY', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
})
