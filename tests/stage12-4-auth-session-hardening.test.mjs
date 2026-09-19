import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const app = read('src/App.tsx')
const profile = read('src/portal-v2/ProfilePageV3.tsx')
const manageUser = read('supabase/functions/admin-manage-user/index.ts')
const config = read('supabase/config.toml')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')
const createUser = read('supabase/functions/admin-create-user/index.ts')
const supabaseClient = read('src/lib/supabase.ts')
const emailLink = read('src/lib/auth-email-link.ts')
const accounts = read('src/portal-v2/AccountsPage.tsx')

test('forgot-password uses explicit Supabase recovery handling that does not collide with HashRouter', () => {
  assert.match(app, /resetPasswordForEmail/)
  assert.match(app, /readEmailAuthLink/)
  assert.match(app, /supabase\.auth\.setSession/)
  assert.match(app, /clearEmailAuthLink/)
  assert.match(app, /PASSWORD_RECOVERY/)
  assert.doesNotMatch(app, /signInWithOtp/)
  assert.doesNotMatch(app, /verifyOtp\(\{ email, token, type: 'email'/)
  assert.match(app, /Tautan pengaturan password diperlukan/)
  assert.match(app, /PASSWORD_SETUP_SESSION_KEY/)
  assert.match(supabaseClient, /detectSessionInUrl: false/)
  assert.match(emailLink, /type !== 'invite' && type !== 'recovery'/)
  assert.match(emailLink, /access_token/)
  assert.match(emailLink, /refresh_token/)
  assert.match(emailLink, /readEmailAuthLinkError/)
  assert.match(emailLink, /auth_flow/)
})

test('session lifecycle is server-verified and account profile is rechecked', () => {
  assert.match(app, /supabase\.auth\.getUser\(\)/)
  assert.match(app, /PROFILE_RECHECK_MS = 5 \* 60_000/)
  assert.match(app, /visibilitychange/)
  assert.match(app, /event === 'SIGNED_OUT'/)
  assert.match(app, /scope: 'local'/)
  assert.match(app, /IDLE_SESSION_MS = 8 \* 60 \* 60_000/)
  assert.match(app, /Sesi berakhir karena tidak aktif terlalu lama/)
  assert.match(app, /LAST_ACTIVITY_KEY/)
})

test('in-session password change requires the current password and revokes other sessions', () => {
  assert.match(profile, /Password saat ini/)
  assert.match(profile, /currentPassword/)
  assert.ok(profile.includes("supabase.auth.updateUser({ password, current_password: currentPassword })"))
  assert.match(profile, /signOut\(\{ scope: 'others' \}\)/)
  assert.match(profile, /current_password: currentPassword[\s\S]{0,500}Password tidak dapat diperbarui/)
})

test('inactive account state is synchronized to Supabase Auth ban state', () => {
  assert.match(manageUser, /ban_duration: isActive \? 'none' : '876000h'/)
  assert.match(manageUser, /auth_banned: !isActive/)
  assert.match(manageUser, /rollbackAuth/)
})

test('local Auth baseline keeps login enabled while allowlist integration blocks public signup', () => {
  assert.match(config, /\[auth\][\s\S]*enable_signup = true/)
  assert.match(config, /\[auth\.email\][\s\S]*enable_signup = true/)
  assert.match(config, /secure_password_change = true/)
  assert.match(config, /max_frequency = "60s"/)
  assert.match(config, /otp_expiry = 900/)
  assert.match(config, /enable_refresh_token_rotation = true/)
  assert.match(config, /refresh_token_reuse_interval = 10/)
})

test('scanner remains LIVE CAMERA ONLY', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
})


test('akun baru memakai Invite User, bukan email reset password', () => {
  assert.match(createUser, /inviteUserByEmail/)
  assert.match(createUser, /must_set_password: true/)
  assert.match(createUser, /delivery = 'invite_email'/)
  assert.match(createUser, /randomTemporaryPassword/)
  assert.match(createUser, /password: temporaryPassword/)
  assert.doesNotMatch(createUser, /resetPasswordForEmail/)
  assert.match(accounts, /email undangan telah dikirim/)
  assert.match(accounts, /password sementara 8 karakter/)
})

test('template email mengarah ke halaman khusus dan memuat data undangan', () => {
  const inviteTemplate = read('supabase/templates/invite.html')
  const recoveryTemplate = read('supabase/templates/recovery.html')
  assert.match(inviteTemplate, /\{\{ \.Email \}\}/)
  assert.match(inviteTemplate, /\{\{ \.Data\.temporary_password \}\}/)
  assert.match(inviteTemplate, /\{\{ \.ConfirmationURL \}\}/)
  assert.match(recoveryTemplate, /\{\{ \.Email \}\}/)
  assert.match(recoveryTemplate, /\{\{ \.ConfirmationURL \}\}/)
  assert.match(config, /auth\.email\.template\.invite/)
  assert.match(config, /auth\.email\.template\.recovery/)
})

test('halaman password membedakan undangan akun dan recovery', () => {
  assert.match(app, /mode === 'invite' \? 'Buat password akun'/)
  assert.match(app, /Selesaikan undangan akun dengan membuat password Anda sendiri/)
  assert.match(app, /must_set_password: false/)
})
