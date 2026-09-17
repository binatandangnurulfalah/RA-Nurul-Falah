import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('frontend dan backend memakai minimum password 6 karakter', () => {
  const validator = read('src/lib/auth-utils.js')
  const createUser = read('supabase/functions/admin-create-user/index.ts')
  const manageUser = read('supabase/functions/admin-manage-user/index.ts')
  const app = read('src/App.tsx')

  assert.match(validator, /password\.length < 6/)
  assert.match(validator, /Password minimal 6 karakter/)
  assert.doesNotMatch(validator, /password\.length < 10/)

  assert.match(createUser, /password\.length < 6/)
  assert.doesNotMatch(createUser, /Password minimal 8 karakter/)

  assert.match(manageUser, /newPassword\.length < 6/)
  assert.doesNotMatch(manageUser, /minimal 8 karakter/)
  assert.doesNotMatch(manageUser, /berisi huruf dan angka/)

  assert.match(app, /placeholder="Minimal 6 karakter"/)
})
