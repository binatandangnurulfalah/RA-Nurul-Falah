import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const dataIndex = read('src/components/data/index.ts')
const formsIndex = read('src/components/forms/index.ts')
const dataUi = read('src/data-ui.css')
const main = read('src/main.tsx')
const dataExperience = read('src/portal-v2/DataExperience.tsx')
const students = read('src/portal-v2/StudentsPageV2.tsx')
const teachers = read('src/portal-v2/TeachersPage.tsx')

const reusableDataComponents = [
  'DataTable',
  'DataListSkeleton',
  'ErrorState',
  'MobileDataCard',
  'Pagination',
  'SearchFilterBar',
  'StatCard',
  'StatusBadge',
]

test('Tahap 11.7 menyediakan reusable data dan form primitives semantik', () => {
  for (const component of reusableDataComponents) {
    assert.match(dataIndex, new RegExp(`export \\{[^}]*${component}`))
  }
  assert.match(formsIndex, /export \{ ConfirmDialog \}/)
  assert.match(formsIndex, /export \{ FormDialog \}/)
  assert.doesNotMatch(dataIndex + formsIndex, /v6|v7|v8/i)
})

test('stylesheet reusable data dimuat dan menyediakan desktop/mobile presentation', () => {
  assert.match(main, /import '\.\/data-ui\.css'/)
  assert.match(dataUi, /\.desktop-data-view/)
  assert.match(dataUi, /\.mobile-data-view/)
  assert.match(dataUi, /@media \(max-width: 760px\)/)
  assert.match(dataUi, /\.data-table/)
  assert.match(dataUi, /\.mobile-data-card/)
  assert.match(dataUi, /\.data-pagination/)
})

test('pilot Data Murid memakai reusable UI tanpa memindahkan authorization ke frontend', () => {
  for (const component of ['PageHeader', 'DataTable', 'MobileDataCard', 'SearchFilterBar', 'StatusBadge', 'ConfirmDialog']) {
    assert.match(students, new RegExp(component))
  }
  assert.match(students, /supabase\.from\('students'\)/)
  assert.match(students, /save_student_with_guardians/)
  assert.match(students, /PaginationControls/)
})

test('pilot Data Guru memakai reusable UI dan tetap server-side pagination', () => {
  for (const component of ['PageHeader', 'StatCard', 'DataTable', 'MobileDataCard', 'SearchFilterBar', 'StatusBadge', 'ConfirmDialog']) {
    assert.match(teachers, new RegExp(component))
  }
  assert.match(teachers, /teacher_profiles_search/)
  assert.match(teachers, /\.range\(range\.from, range\.to\)/)
  assert.match(teachers, /PaginationControls/)
})

test('11.7 tidak mengganti cache layer lama sebelum Tahap 11.8', () => {
  assert.match(dataExperience, /cachedQuery/)
  assert.match(dataExperience, /invalidateQueryCache/)
  assert.doesNotMatch(dataExperience, /@tanstack\/react-query/)
})
