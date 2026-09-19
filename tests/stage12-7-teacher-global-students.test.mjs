import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const students = read('src/portal-v2/StudentsPageV2.tsx')
const studentQueries = read('src/data/queries/students.ts')
const migration = read('supabase/migrations/20260918112412_stage12_7_teacher_global_students_when_policy_off.sql')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('student lookup loads the teacher-class mode setting', () => {
  assert.match(studentQueries, /school_settings/)
  assert.match(studentQueries, /single_teacher_class_mode/)
  assert.match(studentQueries, /singleTeacherClassMode/)
})

test('teacher student UI switches between global and assigned-class modes', () => {
  assert.match(students, /const singleTeacherClassMode = lookupQuery\.data\?\.singleTeacherClassMode \?\? true/)
  assert.match(students, /const teacherNeedsAssignment = role === 'teacher' && singleTeacherClassMode/)
  assert.match(students, /Mode 1 Guru = 1 Kelas sedang nonaktif/)
  assert.match(students, /role === 'teacher' && singleTeacherClassMode && !selectedClass/)
  assert.match(students, /role === 'teacher' && !singleTeacherClassMode/)
})

test('RLS gives teachers global student and class SELECT when policy is off', () => {
  assert.match(migration, /drop policy if exists "role based student access"/)
  assert.match(migration, /drop policy if exists "role based class access"/)
  assert.match(migration, /not coalesce\(\([\s\S]*single_teacher_class_mode/)
  assert.match(migration, /teacher_can_access_student\(students\.id\)/)
  assert.match(migration, /teacher_can_access_class_id\(school_classes\.id\)/)
})

test('teacher write scope follows the same ON/OFF setting while guardian management stays Admin-only', () => {
  assert.match(migration, /v_single_teacher_class_mode boolean := false/)
  assert.match(migration, /if v_role = 'teacher'::public\.app_role and v_single_teacher_class_mode then/)
  assert.match(migration, /Guru wajib memilih kelas yang ditugaskan/)
  assert.match(migration, /Hanya Admin yang dapat mengubah hubungan wali murid/)
  assert.match(migration, /if v_role = 'admin'::public\.app_role then[\s\S]*delete from public\.student_guardians/)
})

test('scanner remains LIVE CAMERA ONLY', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
})
