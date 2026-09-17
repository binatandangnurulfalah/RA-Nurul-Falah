import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const studentsPage = await readFile(new URL('../src/portal-v2/StudentsPageV2.tsx', import.meta.url), 'utf8')
const migration = await readFile(new URL('../supabase/migrations/20260917040446_harden_multi_guardian_student_rpc.sql', import.meta.url), 'utf8')
const rolePortal = await readFile(new URL('../src/RolePortalV5.tsx', import.meta.url), 'utf8')

test('form murid mendukung banyak wali dan menyimpan melalui RPC atomik', () => {
  assert.match(studentsPage, /guardians:\s*\[\]\s*as string\[\]/)
  assert.match(studentsPage, /type="checkbox" checked=\{form\.guardians\.includes\(parent\.id\)\}/)
  assert.match(studentsPage, /supabase\.rpc\('save_student_with_guardians'/)
  assert.doesNotMatch(studentsPage, /student_guardians'\)\.delete\(\)/)
})

test('RPC menggunakan invoker RLS dan menyinkronkan seluruh wali dalam satu transaksi', () => {
  assert.match(migration, /security invoker/)
  assert.match(migration, /delete from public\.student_guardians/)
  assert.match(migration, /insert into public\.student_guardians/)
  assert.match(migration, /on conflict \(student_id, guardian_user_id\) do nothing/)
  assert.match(migration, /role = 'parent'::public\.app_role/)
  assert.match(migration, /from public, anon/)
})

test('portal aktif menggunakan StudentsPageV2', () => {
  assert.match(rolePortal, /import\('\.\/portal-v2\/StudentsPageV2'\)/)
})
