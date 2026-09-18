import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const config = read('playwright.config.mjs')
const workflow = read('.github/workflows/playwright-e2e.yml')
const e2e = read('tests/e2e/portal.e2e.spec.mjs')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')
const packageJson = JSON.parse(read('package.json'))

test('Playwright menjalankan desktop dan mobile Chromium terhadap production preview build', () => {
  assert.match(config, /chromium-desktop/)
  assert.match(config, /chromium-mobile/)
  assert.match(config, /Desktop Chrome/)
  assert.match(config, /Pixel 7/)
  assert.match(config, /npm run preview/)
  assert.match(config, /serviceWorkers: 'block'/)
})

test('workflow E2E tidak memakai Supabase production atau service-role secret', () => {
  assert.match(workflow, /VITE_SUPABASE_URL: http:\/\/127\.0\.0\.1:54329/)
  assert.match(workflow, /VITE_SUPABASE_PUBLISHABLE_KEY: e2e-local-publishable-key/)
  assert.doesNotMatch(workflow, /SERVICE_ROLE|SUPABASE_SERVICE_ROLE|mtfeuozwxwayzcjltaak\.supabase\.co/)
  assert.match(workflow, /@playwright\/test@1\.55\.0/)
  assert.match(workflow, /playwright install --with-deps chromium/)
  assert.match(workflow, /npm run build/)
  assert.match(workflow, /playwright test --config=playwright\.config\.mjs/)
})

test('Playwright runtime tidak ikut menjadi dependency production aplikasi', () => {
  assert.equal(packageJson.dependencies?.['@playwright/test'], undefined)
  assert.equal(packageJson.devDependencies?.['@playwright/test'], undefined)
  assert.match(workflow, /npm install --no-save --package-lock=false @playwright\/test@1\.55\.0/)
})

test('browser regression mencakup route guard, role menu, focus, responsive overflow, scanner, dan PWA', () => {
  assert.match(e2e, /protected admin route without session returns to login/)
  assert.match(e2e, /focuses main landmark/)
  assert.match(e2e, /restores opener focus/)
  assert.match(e2e, /does not expose finance module to teacher/)
  assert.match(e2e, /scrollWidth - document\.documentElement\.clientWidth/)
  assert.match(e2e, /live-camera only/)
  assert.match(e2e, /input\[type="file"\]/)
  assert.match(e2e, /site\.webmanifest/)
  assert.match(e2e, /event\.data\?\.type === 'SKIP_WAITING'/)
})

test('scanner tetap LIVE CAMERA ONLY setelah Tahap 11.17', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.match(scanner, /record-attendance/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
})
