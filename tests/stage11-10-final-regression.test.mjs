import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const migration = read('supabase/migrations/20260917175117_stage11_10_academic_year_class_normalization.sql')
const currentGuard = read('supabase/migrations/20260917175125_stage11_10_current_year_guard.sql')
const triggerHardening = read('supabase/migrations/20260917175148_stage11_10_trigger_compatibility_hardening.sql')
const classYearGuard = read('supabase/migrations/20260917175154_stage11_10_class_year_change_guard.sql')
const manifest = JSON.parse(read('supabase/production-migration-manifest.json'))
const normalizedTypes = read('src/lib/database-normalized.types.ts')
const supabaseClient = read('src/lib/supabase.ts')
const studentQuery = read('src/data/queries/students.ts')
const studentPage = read('src/portal-v2/StudentsPageV2.tsx')
const classesPage = read('src/portal-v2/ClassesPage.tsx')
const schedulePage = read('src/portal-v2/SchedulePage.tsx')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('11.10 menyediakan canonical academic_years dan foreign key kelas/tahun', () => {
  assert.match(migration, /create table if not exists public\.academic_years/)
  assert.match(migration, /academic_years_one_current_idx/)
  assert.match(migration, /add column if not exists academic_year_id uuid references public\.academic_years/)
  assert.match(migration, /add column if not exists class_id uuid references public\.school_classes/)
  assert.match(migration, /school_classes_academic_year_name_key unique \(academic_year_id, name\)/)
  assert.match(migration, /school_schedules_class_slot_key unique \(class_id, day_of_week, start_time\)/)
})

test('legacy text columns tetap compatibility mirror sementara ID menjadi authoritative', () => {
  assert.match(migration, /sync_school_class_academic_refs/)
  assert.match(migration, /sync_student_academic_refs/)
  assert.match(migration, /sync_schedule_academic_refs/)
  assert.match(migration, /sync_school_settings_academic_refs/)
  assert.match(migration, /sync_school_class_name/)
  assert.match(migration, /sync_academic_year_label/)
  assert.match(triggerHardening, /Avoid consulting OLD on INSERT paths/)
  assert.match(triggerHardening, /revoke all on function public\.sync_student_academic_refs/)
})

test('academic year guard menjamin current selalu aktif dan tidak boleh hilang', () => {
  assert.match(currentGuard, /check \(not is_current or is_active\)/)
  assert.match(currentGuard, /ensure_current_academic_year/)
  assert.match(currentGuard, /deferrable initially deferred/)
  assert.match(migration, /protect_current_academic_year/)
  assert.match(migration, /save_academic_year/)
  assert.match(migration, /update public\.school_settings[\s\S]*academic_year_id = v_id/)
})

test('kelas berisi murid atau jadwal tidak dapat dipindah lintas tahun ajaran', () => {
  assert.match(classYearGuard, /protect_school_class_academic_year_change/)
  assert.match(classYearGuard, /exists \(select 1 from public\.students s where s\.class_id = old\.id\)/)
  assert.match(classYearGuard, /exists \(select 1 from public\.school_schedules sc where sc\.class_id = old\.id\)/)
})

test('authorization akademik menggunakan class_id canonical', () => {
  assert.match(migration, /private\.teacher_can_access_class_id/)
  assert.match(migration, /s\.class_id = school_classes\.id/)
  assert.match(migration, /private\.teacher_can_access_class_id\(school_schedules\.class_id\)/)
  assert.match(migration, /class_id is not null[\s\S]*private\.teacher_can_access_class_id\(class_id\)/)
})

test('RPC kompatibel tetap tersedia sambil resolve ke ID normalized', () => {
  assert.match(migration, /create or replace function public\.save_class_with_assignments/)
  assert.match(migration, /where ay\.label = v_academic_year/)
  assert.match(migration, /academic_year_id = v_academic_year_id/)
  assert.match(migration, /create or replace function public\.save_student_with_guardians/)
  assert.match(migration, /where c\.academic_year_id = v_year_id/)
  assert.match(migration, /class_id = v_class_id/)
})

test('frontend Supabase type overlay mengenal normalized IDs tanpa service-role key', () => {
  assert.match(normalizedTypes, /academic_years: AcademicYearsTable/)
  assert.match(normalizedTypes, /academic_year_id: string; class_id: string \| null/)
  assert.match(normalizedTypes, /academic_year_id: string; class_id: string/)
  assert.match(normalizedTypes, /save_academic_year/)
  assert.match(supabaseClient, /database-normalized\.types/)
  assert.match(supabaseClient, /VITE_SUPABASE_PUBLISHABLE_KEY/)
  assert.doesNotMatch(supabaseClient, /service[_-]?role/i)
})

test('Data Murid memakai class_id untuk filter dan lookup academic year resmi', () => {
  assert.match(studentQuery, /\.eq\('class_id', params\.classFilter\)/)
  assert.match(studentQuery, /from\('academic_years'\)/)
  assert.match(studentQuery, /academic_year_id/)
  assert.match(studentPage, /academicYears/)
  assert.match(studentPage, /class_id/)
  assert.match(studentPage, /selectedClass/)
  assert.doesNotMatch(studentPage, /<FormField label="Tahun ajaran"><input/)
})

test('Kelas menghitung murid dengan class_id dan memilih tahun ajaran canonical', () => {
  assert.match(classesPage, /from\('students'\)\.select\('class_id'\)/)
  assert.match(classesPage, /nextCounts\[row\.class_id\]/)
  assert.match(classesPage, /from\('academic_years'\)/)
  assert.match(classesPage, /academic_year_id/)
  assert.match(classesPage, /save_academic_year/)
  assert.match(classesPage, /Pilih tahun ajaran/)
  assert.doesNotMatch(classesPage, /Tahun ajaran<input required value=\{form\.academic_year\}/)
})

test('Jadwal menyimpan class_id dan academic_year_id dari kelas yang dipilih', () => {
  assert.match(schedulePage, /class_id: selectedClass\.id/)
  assert.match(schedulePage, /academic_year_id: selectedClass\.academic_year_id/)
  assert.match(schedulePage, /academic_year: selectedClass\.academic_year/)
  assert.match(schedulePage, /value=\{form\.class_id\}/)
  assert.match(schedulePage, /readOnly aria-readonly="true"/)
  assert.doesNotMatch(schedulePage, /setForm\(\{ \.\.\.form, academic_year:/)
})

test('production migration manifest mencatat seluruh migration 11.10', () => {
  const serialized = JSON.stringify(manifest)
  for (const version of ['20260917175117', '20260917175125', '20260917175148', '20260917175154']) {
    assert.match(serialized, new RegExp(version), `${version} belum tercatat pada manifest production`)
  }
})

test('scanner tetap LIVE CAMERA ONLY selama normalisasi akademik', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.doesNotMatch(scanner, /type="file"|capture=|openNativeCapture|handleNativeCapture/)
  assert.doesNotMatch(scanner, /galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
})
