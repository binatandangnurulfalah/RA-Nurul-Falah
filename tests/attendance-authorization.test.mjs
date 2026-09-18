import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const manage = read('supabase/functions/manage-attendance-record/index.ts')
const scanner = read('supabase/functions/record-attendance/index.ts')
const authorization = read('supabase/functions/_shared/authorization.ts')

test('Edge Function absensi memakai authorization helper yang sama', () => {
  assert.match(manage, /_shared\/authorization\.ts/)
  assert.match(scanner, /_shared\/authorization\.ts/)
  assert.match(manage, /teacherCanAccessStudent\(context, existing\.student_id\)/)
  assert.match(scanner, /teacherCanAccessStudent\(context, student\.id\)/)
  assert.match(authorization, /teacherCanAccessClass/)
  assert.match(authorization, /teacherCanAccessStudent/)
})

test('checkout memakai conditional update yang memverifikasi row berubah', () => {
  assert.match(scanner, /\.is\('check_out', null\)/)
  assert.match(scanner, /\.select\('id'\)/)
  assert.match(scanner, /\.maybeSingle\(\)/)
  assert.match(scanner, /Absensi baru saja diperbarui dari perangkat lain\. Muat ulang status\./)
})

test('koreksi manual menyimpan actor dan alasan', () => {
  assert.match(manage, /correction_reason/)
  assert.match(manage, /last_corrected_by/)
  assert.match(manage, /last_corrected_at/)
  assert.match(manage, /source: 'manual'/)
})

test('legacy delete attendance hanya tersisa sebagai tombstone 410', () => {
  const legacy = read('supabase/functions/delete-attendance-record/index.ts')
  assert.match(legacy, /status:\s*410/)
  assert.match(legacy, /sudah dipensiunkan/)
  assert.doesNotMatch(legacy, /createClient|service_role|\.delete\(|from\(['"]attendance_records/)
})
