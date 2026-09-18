import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const vite = read('vite.config.ts')
const pwaExperience = read('src/pwa/PwaExperience.tsx')
const registerPwa = read('src/pwa/registerPwa.ts')
const main = read('src/main.tsx')
const app = read('src/App.tsx')
const queryClient = read('src/data/queryClient.ts')
const packageJson = JSON.parse(read('package.json'))
const manifest = JSON.parse(read('public/site.webmanifest'))
const verifyBuild = read('scripts/verify-pwa-build.mjs')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')
const errorBoundary = read('src/components/AppErrorBoundary.tsx')

test('service worker dibuat dari output build dan precache seluruh bundle', () => {
  assert.match(vite, /buildServiceWorker/)
  assert.match(vite, /closeBundle/)
  assert.match(vite, /readdirSync\(assetsPath\)/)
  assert.match(vite, /GITHUB_SHA/)
  assert.match(vite, /cache\.addAll\(PRECACHE_URLS\)/)
  assert.match(vite, /url\.pathname\.includes\('\/assets\/'\)/)
  assert.match(vite, /request\.mode === 'navigate'/)
  assert.equal(existsSync(new URL('../public/sw.js', import.meta.url)), false)
})

test('service worker update menunggu keputusan user dan tidak skip waiting saat install', () => {
  assert.match(vite, /event\.data\?\.type === 'SKIP_WAITING'/)
  assert.match(vite, /event\.data\?\.type === 'GET_VERSION'/)
  assert.match(vite, /postMessage\(\{ buildId: BUILD_ID \}\)/)
  assert.doesNotMatch(vite, /self\.addEventListener\('install'[\s\S]{0,260}self\.skipWaiting\(\)/)
  assert.match(registerPwa, /registration\.waiting/)
  assert.match(registerPwa, /updatefound/)
  assert.match(registerPwa, /controllerchange/)
  assert.match(registerPwa, /postMessage\(\{ type: 'GET_VERSION' \}/)
  assert.match(registerPwa, /postMessage\(\{ type: 'SKIP_WAITING' \}\)/)
  assert.match(registerPwa, /applyWaitingPwaUpdate/)
  assert.match(registerPwa, /updateViaCache: 'none'/)
})

test('update check selektif berjalan saat fokus online visible dan interval wajar', () => {
  assert.match(registerPwa, /registration\.update\(\)/)
  assert.match(registerPwa, /window\.addEventListener\('focus'/)
  assert.match(registerPwa, /window\.addEventListener\('online'/)
  assert.match(registerPwa, /visibilitychange/)
  assert.match(registerPwa, /30 \* 60 \* 1000/)
})

test('offline dan install UX tersedia tanpa menjanjikan mutation queue', () => {
  assert.match(pwaExperience, /Anda sedang offline/)
  assert.match(pwaExperience, /beforeinstallprompt/)
  assert.match(pwaExperience, /appinstalled/)
  assert.match(pwaExperience, /display-mode: standalone/)
  assert.match(pwaExperience, /Pasang aplikasi RA Nurul Falah/)
  assert.match(pwaExperience, /Sinkronisasi dan penyimpanan memerlukan internet/)
  assert.doesNotMatch(pwaExperience, /perubahan tidak diantrikan/)
})

test('main me-mount PWA experience dan registration terisolasi di helper', () => {
  assert.match(main, /PwaExperience/)
  assert.match(main, /registerPwa/)
  assert.match(main, /pwa\.css/)
  assert.doesNotMatch(main, /navigator\.serviceWorker\.register/)
  assert.match(registerPwa, /navigator\.serviceWorker\.register/)
})

test('offline session dipertahankan dan mutation tidak direplay diam-diam', () => {
  assert.match(app, /status: 'unavailable'/)
  assert.match(app, /profileUnavailable/)
  assert.match(app, /Koneksi diperlukan untuk membuka sesi/)
  assert.match(app, /document\.visibilityState !== 'visible' \|\| !navigator\.onLine/)
  assert.match(app, /error && isConnectivityError\(error\)/)
  assert.match(queryClient, /networkMode: 'always'/)
  assert.match(queryClient, /mutations:[\s\S]*retry: 0/)
})


test('stale lazy chunk menawarkan recovery versi terbaru tanpa reload paksa saat render', () => {
  assert.match(errorBoundary, /Failed to fetch dynamically imported module/)
  assert.match(errorBoundary, /Importing a module script failed/)
  assert.match(errorBoundary, /ChunkLoadError/)
  assert.match(errorBoundary, /applyWaitingPwaUpdate/)
  assert.match(errorBoundary, /Muat Versi Terbaru/)
  assert.doesNotMatch(errorBoundary, /componentDidCatch[\s\S]{0,300}window\.location\.reload\(\)/)
})

test('manifest tetap standalone dan memiliki metadata install yang stabil', () => {
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, './')
  assert.equal(manifest.scope, './')
  assert.equal(manifest.id, './')
  assert.equal(manifest.lang, 'id-ID')
  assert.equal(manifest.prefer_related_applications, false)
  assert.ok(manifest.categories.includes('education'))
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0)
})

test('production build wajib memverifikasi service worker dan seluruh hashed assets', () => {
  assert.match(packageJson.scripts.build, /verify-pwa-build\.mjs/)
  assert.match(verifyBuild, /dist\/sw\.js/)
  assert.match(verifyBuild, /assetFiles/)
  assert.match(verifyBuild, /Service worker belum precache assets/)
  assert.match(verifyBuild, /SKIP_WAITING/)
})

test('scanner tetap LIVE CAMERA ONLY setelah Tahap 11.15', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.match(scanner, /record-attendance/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
})
