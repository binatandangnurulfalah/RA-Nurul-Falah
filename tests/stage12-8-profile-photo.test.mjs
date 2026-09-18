import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const profile = read('src/portal-v2/ProfilePageV3.tsx')
const portal = read('src/RolePortalV5.tsx')
const accounts = read('src/portal-v2/AccountsPage.tsx')
const accountQuery = read('src/data/queries/accounts.ts')
const avatar = read('src/components/ProfileAvatar.tsx')
const migration = read('supabase/migrations/20260918115932_stage12_8_profile_photo_upload.sql')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('profile photo storage is private, size-limited, and scoped to the signed-in user', () => {
  assert.match(migration, /'profile-photos'/)
  assert.match(migration, /false,\s*2097152/)
  assert.match(migration, /image\/jpeg/)
  assert.match(migration, /image\/png/)
  assert.match(migration, /image\/webp/)
  assert.match(migration, /name = \(select auth\.uid\(\)\)::text \|\| '\/avatar'/)
  assert.match(migration, /profile_photos_owner_insert/)
  assert.match(migration, /profile_photos_owner_update/)
  assert.match(migration, /profile_photos_owner_delete/)
  assert.match(migration, /profile_photos_authorized_read/)
})

test('avatar metadata can only point to the canonical owner path', () => {
  assert.match(migration, /add column if not exists avatar_path text/)
  assert.match(migration, /avatar_path = id::text \|\| '\/avatar'/)
  assert.match(migration, /grant update \(avatar_path\)/)
  assert.match(migration, /create or replace function public\.update_my_avatar/)
  assert.match(migration, /security invoker/)
  assert.match(migration, /v_avatar_path <> v_user_id::text \|\| '\/avatar'/)
})

test('every account role gets self-service profile photo controls', () => {
  assert.match(profile, /ProfileAvatar profile=\{profile\}/)
  assert.match(profile, /accept="image\/jpeg,image\/png,image\/webp"/)
  assert.match(profile, /file\.size > 2 \* 1024 \* 1024/)
  assert.match(profile, /\.from\('profile-photos'\)/)
  assert.match(profile, /\.upload\(path, file/)
  assert.match(profile, /update_my_avatar/)
  assert.match(profile, /Ganti Foto/)
  assert.match(profile, /Hapus/)
})

test('profile photo is reused in portal navigation and Admin account list', () => {
  assert.match(portal, /ProfileAvatar profile=\{currentProfile\}/)
  assert.match(accounts, /ProfileAvatar profile=\{account\}/)
  assert.match(accountQuery, /avatar_path/)
  assert.match(avatar, /createSignedUrl\(profile\.avatar_path, 3600\)/)
})

test('scanner remains LIVE CAMERA ONLY', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
})
