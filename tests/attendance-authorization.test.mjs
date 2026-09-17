import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const manage = await readFile(new URL('../supabase/functions/manage-attendance-record/index.ts', import.meta.url), 'utf8')
const scanner = await readFile(new URL('../supabase/functions/record-attendance/index.ts', import.meta.url), 'utf8')
const authorization = await readFile(new URL('../supabase/functions/_shared/authorization.ts', import.meta.url), 'utf8')

test('update dan hapus absensi memakai helper authorization yang sama', () => {
  assert.match(manage, /teacherCanAccessStudent/)
  assert.match(manage, /canAccessStudent\(existing\.student_id\)/)
  assert.match(manage, /correction_reason/)
  assert.match(authorization, /teacherCanAccessStudent/)
  assert.match(authorization, /teacherCanAccessClass/)
})

test('scanner memverifikasi akses guru dan checkout memakai conditional update yang terverifikasi', () => {
  assert.match(scanner, /teacherCanAccessStudent/)
  assert.match(scanner, /\.is\('check_out', null\)/)
  assert.match(scanner, /\.select\('id'\)/)
  assert.match(scanner, /\.maybeSingle\(\)/)
  assert.match(scanner, /Absensi baru saja diperbarui dari perangkat lain\. Muat ulang status\./)
  assert.doesNotMatch(scanner, /recorded_by: user\.id[^]*check_out/)
})
