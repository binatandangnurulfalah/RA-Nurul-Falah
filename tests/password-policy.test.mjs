import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('password baru minimal 10 karakter dan admin tidak menentukan password pengguna', () => {
  const frontendValidator = read('src/lib/auth-utils.js')
  const backendValidator = read('supabase/functions/_shared/password-policy.ts')
  const createUser = read('supabase/functions/admin-create-user/index.ts')
  const manageUser = read('supabase/functions/admin-manage-user/index.ts')
  const app = read('src/App.tsx')
  const accounts = read('src/portal-v2/AccountsPage.tsx')

  for (const validator of [frontendValidator, backendValidator]) {
    assert.match(validator, /password\.length < 10/)
    assert.match(validator, /Password minimal 10 karakter/)
    assert.match(validator, /\[A-Z\]/)
    assert.match(validator, /\[a-z\]/)
    assert.match(validator, /\\d/)
    assert.match(validator, /\^A-Za-z0-9/)
  }

  assert.match(createUser, /createTemporaryPassword/)
  assert.match(createUser, /resetPasswordForEmail/)
  assert.doesNotMatch(createUser, /payload\.password/)
  assert.match(manageUser, /send_password_reset/)
  assert.doesNotMatch(manageUser, /new_password/)

  assert.match(app, /Minimal 10 karakter/)
  assert.doesNotMatch(accounts, /Password sementara/)
  assert.doesNotMatch(accounts, /Password baru/)
  assert.match(accounts, /Kirim reset password/)
})
