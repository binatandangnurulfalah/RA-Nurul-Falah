import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const app = read('src/App.tsx')
const profile = read('src/portal-v2/ProfilePageV3.tsx')
const manageUser = read('supabase/functions/admin-manage-user/index.ts')
const config = read('supabase/config.toml')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('forgot-password uses Supabase recovery flow, not passwordless sign-in', () => {
  assert.match(app, /resetPasswordForEmail/)
  assert.match(app, /PASSWORD_RECOVERY/)
  assert.doesNotMatch(app, /signInWithOtp/)
  assert.doesNotMatch(app, /verifyOtp\(\{ email, token, type: 'email'/)
  assert.match(app, /Tautan pemulihan diperlukan/)
  assert.match(app, /RECOVERY_SESSION_KEY/)
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

test('local Auth baseline mirrors hardened production expectations', () => {
  assert.match(config, /\[auth\][\s\S]*enable_signup = false/)
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
