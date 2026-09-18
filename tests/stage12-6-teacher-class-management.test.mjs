import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const students = read('src/portal-v2/StudentsPageV2.tsx')
const classes = read('src/portal-v2/ClassesPage.tsx')
const settings = read('src/portal-v2/PortalPages.tsx')
const normalizedTypes = read('src/lib/database-normalized.types.ts')
const migration = read('supabase/migrations/20260918105200_stage12_6_teacher_class_management.sql')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('Admin settings exposes one-teacher-one-class policy toggle', () => {
  assert.match(settings, /single_teacher_class_mode: boolean/)
  assert.match(settings, /save_school_settings_with_policy/)
  assert.match(settings, /p_single_teacher_class_mode: settings\.single_teacher_class_mode/)
  assert.match(settings, /Aktifkan pola 1 Guru = 1 Kelas/)
  assert.match(settings, /Pola Guru & Kelas/)
  assert.match(normalizedTypes, /save_school_settings_with_policy/)
})

test('database enforces one teacher per class and one class per teacher per academic year when enabled', () => {
  assert.match(migration, /single_teacher_class_mode boolean not null default false/)
  assert.match(migration, /teacher_class_assignments_single_teacher_class_guard/)
  assert.match(migration, /satu kelas hanya boleh memiliki satu Guru/)
  assert.match(migration, /Guru tersebut sudah mewakili kelas lain pada tahun ajaran yang sama/)
  assert.match(migration, /count\(distinct tca\.class_id\) > 1/)
  assert.match(migration, /create or replace function public\.save_class_with_assignments/)
})

test('class UI switches to a single teacher selector while the policy is active', () => {
  assert.match(classes, /singleTeacherClassMode/)
  assert.match(classes, /select\('single_teacher_class_mode'\)/)
  assert.match(classes, /Mode 1 Guru = 1 Kelas aktif/)
  assert.match(classes, /teacher_profile_ids: event\.target\.value \? \[event\.target\.value\] : \[\]/)
})

test('teacher can add and edit students only through assigned-class guarded RPC', () => {
  assert.match(students, /const canEditStudents = role === 'admin' \|\| role === 'teacher'/)
  assert.match(students, /Guru dapat mengelola data murid pada kelas yang ditugaskan/)
  assert.match(students, /p_guardian_user_ids: canManageGuardians \? form\.guardians : \[\]/)
  assert.match(migration, /security definer/)
  assert.match(migration, /v_role not in \('admin'::public\.app_role, 'teacher'::public\.app_role\)/)
  assert.match(migration, /private\.teacher_can_access_class_id\(v_class_id\)/)
  assert.match(migration, /private\.teacher_can_access_student\(p_student_id\)/)
  assert.match(migration, /Hanya Admin yang dapat mengubah hubungan wali murid/)
})

test('teacher never receives parent-account lookup and student deletion remains Admin-only', () => {
  assert.match(students, /studentLookupsOptions\(\{ includeParents: canManage \}\)/)
  assert.match(students, /if \(!deleting \|\| role !== 'admin'/)
  assert.match(students, /\.\.\.\(canManage \? \[[\s\S]*Hapus murid/)
})

test('scanner remains LIVE CAMERA ONLY', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
})
