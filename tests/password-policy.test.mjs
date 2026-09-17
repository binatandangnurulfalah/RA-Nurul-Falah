import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('frontend dan backend memakai minimum password 6 karakter', () => {
  const frontendValidator = read('src/lib/auth-utils.js')
  const backendValidator = read('supabase/functions/_shared/password-policy.ts')
  const createUser = read('supabase/functions/admin-create-user/index.ts')
  const manageUser = read('supabase/functions/admin-manage-user/index.ts')
  const app = read('src/App.tsx')
  const accounts = read('src/portal-v2/AccountsPage.tsx')

  assert.match(frontendValidator, /password\.length < 6/)
  assert.match(frontendValidator, /Password minimal 6 karakter/)
  assert.doesNotMatch(frontendValidator, /10 karakter/)

  assert.match(backendValidator, /password\.length < 6/)
  assert.match(backendValidator, /Password minimal 6 karakter/)
  assert.doesNotMatch(backendValidator, /10 karakter/)

  assert.match(createUser, /_shared\/password-policy\.ts/)
  assert.match(createUser, /validatePassword\(password\)/)
  assert.match(manageUser, /_shared\/password-policy\.ts/)
  assert.match(manageUser, /validatePassword\(newPassword\)/)

  assert.match(app, /placeholder="Minimal 6 karakter"/)
  assert.match(accounts, /Minimal 6 karakter\./)
  assert.doesNotMatch(accounts, /Minimal 10 karakter/)
})
