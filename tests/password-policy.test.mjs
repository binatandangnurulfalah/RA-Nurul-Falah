import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('frontend dan backend memakai minimum password 8 karakter dengan huruf dan angka', () => {
  const frontendValidator = read('src/lib/auth-utils.js')
  const backendValidator = read('supabase/functions/_shared/password-policy.ts')
  const app = read('src/App.tsx')
  const profile = read('src/portal-v2/ProfilePageV3.tsx')
  const config = read('supabase/config.toml')

  assert.match(frontendValidator, /password\.length < 8/)
  assert.match(frontendValidator, /\[A-Za-z\]/)
  assert.match(frontendValidator, /\\d/)
  assert.match(backendValidator, /password\.length < 8/)
  assert.match(backendValidator, /\[A-Za-z\]/)
  assert.match(backendValidator, /\\d/)
  assert.match(app, /placeholder="Minimal 8 karakter"/)
  assert.match(app, /wajib mengandung huruf serta angka/)
  assert.match(profile, /minLength=\{8\}/)
  assert.match(profile, /wajib mengandung huruf serta angka/)
  assert.match(config, /minimum_password_length = 8/)
  assert.match(config, /password_requirements = "letters_digits"/)
})

test('admin membuat password sementara acak tanpa mengirimkannya ke browser', () => {
  const createUser = read('supabase/functions/admin-create-user/index.ts')
  const manageUser = read('supabase/functions/admin-manage-user/index.ts')
  const accounts = read('src/portal-v2/AccountsPage.tsx')

  assert.doesNotMatch(createUser, /payload\.password/)
  assert.match(createUser, /function randomTemporaryPassword\(\)/)
  assert.match(createUser, /crypto\.getRandomValues/)
  assert.match(createUser, /while \(chars\.length < 8\)/)
  assert.doesNotMatch(createUser, /resetPasswordForEmail/)
  assert.doesNotMatch(createUser, /auth\.admin\.createUser/)
  assert.match(createUser, /auth\.admin\.inviteUserByEmail/)
  assert.match(createUser, /password: temporaryPassword/)
  assert.match(createUser, /must_set_password: true/)
  assert.doesNotMatch(manageUser, /new_password/)
  assert.match(manageUser, /send_password_reset/)
  assert.match(accounts, /password sementara 8 karakter/)
  assert.doesNotMatch(accounts, /new_password/)
})
