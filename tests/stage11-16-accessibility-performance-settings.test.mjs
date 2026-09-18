import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const shell = read('src/RolePortalV5.tsx')
const portalPages = read('src/portal-v2/PortalPages.tsx')
const designSystem = read('src/design-system.css')
const vite = read('vite.config.ts')
const packageJson = JSON.parse(read('package.json'))
const performanceBudget = read('scripts/verify-performance-build.mjs')
const migration = read('supabase/migrations/20260918034500_stage11_16_settings_hardening.sql')
const normalizedTypes = read('src/lib/database-normalized.types.ts')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('portal menyediakan skip link, main landmark, focus route, dan judul halaman dinamis', () => {
  assert.match(shell, /className="skip-link" href="#main-content"/)
  assert.match(shell, /id="main-content"/)
  assert.match(shell, /tabIndex=\{-1\}/)
  assert.match(shell, /aria-labelledby="portal-page-title"/)
  assert.match(shell, /document\.title/)
  assert.match(shell, /active\.label/)
  assert.match(shell, /contentRef\.current\?\.focus/)
  assert.match(designSystem, /\.skip-link/)
  assert.match(designSystem, /:focus-visible/)
})

test('menu mobile dialog memiliki focus trap, escape close, dan focus restore', () => {
  assert.match(shell, /sheetRef/)
  assert.match(shell, /moreButtonRef/)
  assert.match(shell, /event\.key === 'Escape'/)
  assert.match(shell, /event\.key !== 'Tab'/)
  assert.match(shell, /last\.focus\(\)/)
  assert.match(shell, /first\.focus\(\)/)
  assert.match(shell, /opener\?\.focus\(\)/)
  assert.match(shell, /aria-haspopup="dialog"/)
})

test('feedback dan reduced motion tetap accessible', () => {
  assert.match(portalPages, /role=\{tone === 'error' \? 'alert' : 'status'\}/)
  assert.match(portalPages, /aria-live=\{tone === 'error' \? 'assertive' : 'polite'\}/)
  assert.match(designSystem, /prefers-reduced-motion: reduce/)
  assert.match(designSystem, /animation-duration: \.01ms/)
})

test('Pengaturan Sekolah memakai academic_year_id canonical dan RPC tervalidasi', () => {
  assert.match(portalPages, /academic_year_id: string/)
  assert.match(portalPages, /\.from\('academic_years'\)/)
  assert.match(portalPages, /\.eq\('is_active', true\)/)
  assert.match(portalPages, /supabase\.rpc\('save_school_settings'/)
  assert.match(portalPages, /p_academic_year_id: settings\.academic_year_id/)
  assert.doesNotMatch(portalPages, /academic_year: settings\.academic_year\.trim/)
  assert.match(portalPages, /WIB · Asia\/Jakarta/)
  assert.match(normalizedTypes, /save_school_settings/)
})

test('settings backend menolak direct update client dan tahun ajaran nonaktif', () => {
  assert.match(migration, /security definer/)
  assert.match(migration, /current_user_role\(\)/)
  assert.match(migration, /ay\.is_active = true/)
  assert.match(migration, /timezone = 'Asia\/Jakarta'/)
  assert.match(migration, /revoke update on table public\.school_settings from authenticated, anon/)
  assert.match(migration, /grant execute on function public\.save_school_settings/)
})

test('production build memecah vendor dan menegakkan budget chunk', () => {
  assert.match(vite, /manualChunks: vendorChunk/)
  assert.match(vite, /vendor-supabase/)
  assert.match(vite, /vendor-query/)
  assert.match(vite, /vendor-react/)
  assert.match(vite, /chunkSizeWarningLimit: 420/)
  assert.match(packageJson.scripts.build, /verify-performance-build\.mjs/)
  assert.match(performanceBudget, /maxChunkBytes = 420 \* 1024/)
  assert.match(performanceBudget, /vendorChunks\.length >= 3/)
})

test('scanner tetap LIVE CAMERA ONLY setelah Tahap 11.16', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.match(scanner, /record-attendance/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
})
