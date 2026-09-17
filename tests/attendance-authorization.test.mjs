import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const manage = await readFile(new URL('../supabase/functions/manage-attendance-record/index.ts', import.meta.url), 'utf8')
const legacyDelete = await readFile(new URL('../supabase/functions/delete-attendance-record/index.ts', import.meta.url), 'utf8')

test('update absensi memverifikasi akses ke record lama sebelum memindahkan data', () => {
  assert.match(manage, /teacherCanAccessStudent\(existing\.student_id\)/)
  assert.match(manage, /\.eq\('student_id', existingRecord!\.student_id\)/)
})

test('hapus absensi memverifikasi kelas Guru pada endpoint utama dan legacy', () => {
  assert.match(manage, /teacherCanAccessStudent\(existing\.student_id\)/)
  assert.match(legacyDelete, /teacherCanAccessStudent\(record\.student_id\)/)
  assert.match(legacyDelete, /\.eq\("student_id", record\.student_id\)/)
})
