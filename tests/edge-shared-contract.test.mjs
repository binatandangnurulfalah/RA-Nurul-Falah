import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const auth = read('supabase/functions/_shared/auth.ts')
const authorization = read('supabase/functions/_shared/authorization.ts')
const functions = [
  'admin-create-user',
  'admin-manage-user',
  'manage-attendance-record',
  'record-attendance',
].map((name) => read(`supabase/functions/${name}/index.ts`))

test('Supabase JS Edge Function dipin pada satu versi', () => {
  assert.match(auth, /npm:@supabase\/supabase-js@2\.116\.0/)
  for (const source of functions) {
    assert.doesNotMatch(source, /supabase-js@/)
    assert.match(source, /_shared\/auth\.ts/)
  }
})

test('Edge Function operasional memakai shared response dan CORS', () => {
  for (const source of functions) {
    assert.match(source, /_shared\/cors\.ts/)
    assert.match(source, /_shared\/response\.ts/)
  }
})

test('authorization teacher terpusat dan akun nonaktif ditolak', () => {
  assert.match(authorization, /teacherCanAccessStudent/)
  assert.match(authorization, /teacherCanAccessClass/)
  assert.match(auth, /if \(!profile\.is_active\)/)
})

test('administrator wajib AAL2 sebelum Edge Function operasional dijalankan', () => {
  assert.match(auth, /profile\.role === 'admin'/)
  assert.match(auth, /getAuthenticatorAssuranceLevel\(jwt\)/)
  assert.match(auth, /assurance\.currentLevel !== 'aal2'/)
  assert.match(auth, /MFA_REQUIRED/)
})
