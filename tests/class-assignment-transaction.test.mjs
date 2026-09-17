import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const classes = await readFile(new URL('../src/portal-v2/ClassesPage.tsx', import.meta.url), 'utf8')
const portal = await readFile(new URL('../src/RolePortalV4.tsx', import.meta.url), 'utf8')
const migration = await readFile(new URL('../supabase/migrations/20260917053404_save_class_with_assignments_transaction.sql', import.meta.url), 'utf8')

test('halaman Kelas aktif memakai RPC transaksi tunggal', () => {
  assert.match(portal, /import\('\.\/portal-v2\/ClassesPage'\)/)
  assert.match(classes, /\.rpc\('save_class_with_assignments'/)
  assert.doesNotMatch(classes, /from\('students'\)\.update/)
  assert.doesNotMatch(classes, /from\('school_schedules'\)\.update/)
  assert.doesNotMatch(classes, /from\('teacher_class_assignments'\)\.delete/)
})

test('RPC kelas tetap mengikuti RLS dan hanya mengizinkan Admin', () => {
  assert.match(migration, /security invoker/i)
  assert.match(migration, /private\.current_user_role\(\).*admin/s)
  assert.match(migration, /revoke all on function public\.save_class_with_assignments[\s\S]*from public, anon/i)
  assert.match(migration, /grant execute on function public\.save_class_with_assignments[\s\S]*to authenticated/i)
})

test('kelas dan assignment disimpan dalam transaksi database yang sama', () => {
  assert.match(migration, /insert into public\.school_classes/)
  assert.match(migration, /update public\.school_classes/)
  assert.match(migration, /delete from public\.teacher_class_assignments/)
  assert.match(migration, /insert into public\.teacher_class_assignments/)
  assert.match(migration, /string_agg\(tp\.full_name/)
})
