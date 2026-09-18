import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const cleanup = read('supabase/migrations/20260918053616_stage12_3_redundant_index_cleanup.sql')
const normalizedRefs = read('supabase/migrations/20260917175117_stage11_10_academic_year_class_normalization.sql')
const searchIndexes = read('supabase/migrations/20260917071352_stage7_server_search_pagination.sql')
const students = read('src/data/queries/students.ts')
const teachers = read('src/data/queries/teachers.ts')
const documents = read('src/data/queries/documents.ts')
const payments = read('src/data/queries/payments.ts')

test('12.3 only removes the two structurally redundant zero-scan indexes', () => {
  const drops = [...cleanup.matchAll(/drop index if exists public\.([a-z0-9_]+);/g)].map((match) => match[1]).sort()
  assert.deepEqual(drops, [
    'school_classes_academic_year_id_idx',
    'school_schedules_class_id_idx',
  ])
})

test('covering unique indexes remain after redundant single-column indexes are removed', () => {
  assert.match(normalizedRefs, /unique \(academic_year_id, name\)/)
  assert.match(normalizedRefs, /unique \(class_id, day_of_week, start_time\)/)
  const dropTargets = [...cleanup.matchAll(/drop index if exists public\.([a-z0-9_]+);/g)].map((match) => match[1])
  assert.ok(!dropTargets.includes('school_classes_academic_year_name_key'))
  assert.ok(!dropTargets.includes('school_schedules_class_slot_key'))
})

test('actively used report-card student index is deliberately preserved', () => {
  assert.doesNotMatch(cleanup, /report_cards_student_idx/)
})

test('search indexes are retained because current product queries use substring search', () => {
  assert.match(students, /full_name\.ilike/)
  assert.match(students, /nik\.ilike/)
  assert.match(students, /nis\.ilike/)
  assert.match(students, /nisn\.ilike/)
  assert.match(teachers, /full_name\.ilike/)
  assert.match(teachers, /employee_no\.ilike/)
  assert.match(documents, /title\.ilike/)
  assert.match(documents, /document_number\.ilike/)
  assert.match(payments, /payment_type\.ilike/)
  assert.match(payments, /period_label\.ilike/)

  for (const index of [
    'students_full_name_trgm_idx',
    'students_nik_trgm_idx',
    'students_nis_trgm_idx',
    'students_nisn_trgm_idx',
    'teacher_profiles_full_name_trgm_idx',
    'teacher_profiles_employee_no_trgm_idx',
    'school_documents_title_trgm_idx',
    'school_documents_number_trgm_idx',
    'student_payments_type_trgm_idx',
    'student_payments_period_trgm_idx',
  ]) {
    assert.match(searchIndexes, new RegExp(index))
    assert.doesNotMatch(cleanup, new RegExp(index))
  }
})

test('12.3 does not perform broad unused-index deletion', () => {
  const sql = cleanup
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
  assert.doesNotMatch(sql, /pg_stat_user_indexes/)
  assert.doesNotMatch(sql, /drop index[\s\S]*(trgm|created_by|recorded_by|updated_by)/i)
})
