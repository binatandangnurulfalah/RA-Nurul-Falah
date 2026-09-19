import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('frontend dan backend memakai minimum password 10 karakter dan strength check', () => {
  const frontendValidator = read('src/lib/auth-utils.js')
  const backendValidator = read('supabase/functions/_shared/password-policy.ts')
  const app = read('src/App.tsx')

  assert.match(frontendValidator, /password\.length < 10/)
  assert.match(frontendValidator, /minimal 3 jenis/)
  assert.match(backendValidator, /password\.length < 10/)
  assert.match(backendValidator, /minimal 3 jenis/)
  assert.match(app, /placeholder="Minimal 10 karakter"/)
})

test('admin tidak lagi menerima atau menetapkan password pengguna', () => {
  const createUser = read('supabase/functions/admin-create-user/index.ts')
  const manageUser = read('supabase/functions/admin-manage-user/index.ts')
  const accounts = read('src/portal-v2/AccountsPage.tsx')

  assert.doesNotMatch(createUser, /payload\.password/)
  assert.doesNotMatch(createUser, /randomBootstrapPassword\(\)/)
  assert.doesNotMatch(createUser, /resetPasswordForEmail/)
  assert.doesNotMatch(createUser, /auth\.admin\.createUser/)
  assert.match(createUser, /auth\.admin\.inviteUserByEmail/)
  assert.match(createUser, /must_set_password: true/)
  assert.doesNotMatch(manageUser, /new_password/)
  assert.match(manageUser, /send_password_reset/)
  assert.doesNotMatch(accounts, /Password sementara/)
  assert.doesNotMatch(accounts, /new_password/)
})
