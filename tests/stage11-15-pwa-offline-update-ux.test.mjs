import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const vite = read('vite.config.ts')
const pwaStatus = read('src/components/PwaStatus.tsx')
const main = read('src/main.tsx')
const app = read('src/App.tsx')
const queryClient = read('src/data/queryClient.ts')
const packageJson = JSON.parse(read('package.json'))
const manifest = JSON.parse(read('public/site.webmanifest'))
const verifyBuild = read('scripts/verify-pwa-build.mjs')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('service worker dibuat dari output build dan precache seluruh bundle', () => {
  assert.match(vite, /buildServiceWorker/)
  assert.match(vite, /closeBundle/)
  assert.match(vite, /GITHUB_SHA/)
  assert.match(vite, /cache\.addAll\(PRECACHE_URLS\)/)
  assert.match(vite, /url\.pathname\.includes\('\/assets\/'\)/)
  assert.match(vite, /request\.mode === 'navigate'/)
  assert.match(vite, /writeFileSync\(resolve\('dist\/sw\.js'\)/)
  assert.equal(existsSync(new URL('../public/sw.js', import.meta.url)), false)
})

test('service worker update menunggu keputusan user dan tidak skip waiting saat install', () => {
  assert.match(vite, /event\.data\?\.type === 'SKIP_WAITING'/)
  assert.doesNotMatch(vite, /self\.addEventListener\('install'[\s\S]{0,260}self\.skipWaiting\(\)/)
  assert.match(pwaStatus, /registration\.waiting/)
  assert.match(pwaStatus, /updatefound/)
  assert.match(pwaStatus, /controllerchange/)
  assert.match(pwaStatus, /postMessage\(\{ type: 'SKIP_WAITING' \}\)/)
  assert.match(pwaStatus, /updateViaCache: 'none'/)
})

test('update check selektif berjalan saat fokus online visible dan interval wajar', () => {
  assert.match(pwaStatus, /registration\.update\(\)/)
  assert.match(pwaStatus, /window\.addEventListener\('focus'/)
  assert.match(pwaStatus, /window\.addEventListener\('online'/)
  assert.match(pwaStatus, /visibilitychange/)
  assert.match(pwaStatus, /30 \* 60 \* 1000/)
})

test('offline dan install UX tersedia tanpa mengantre mutation', () => {
  assert.match(pwaStatus, /Anda sedang offline/)
  assert.match(pwaStatus, /beforeinstallprompt/)
  assert.match(pwaStatus, /appinstalled/)
  assert.match(pwaStatus, /display-mode: standalone/)
  assert.match(pwaStatus, /Pasang aplikasi RA Nurul Falah/)
  assert.match(pwaStatus, /Sinkronisasi dan penyimpanan membutuhkan internet/)
  assert.match(queryClient, /networkMode: 'always'/)
  assert.match(queryClient, /mutations:[\s\S]*retry: 0/)
})

test('offline tidak dianggap akun nonaktif dan tidak memaksa sign-out', () => {
  assert.match(app, /status: 'unavailable'/)
  assert.match(app, /profileUnavailable/)
  assert.match(app, /Koneksi diperlukan untuk membuka sesi/)
  assert.match(app, /if \(document\.visibilityState !== 'visible' \|\| !navigator\.onLine\) return/)
  assert.match(app, /error && isConnectivityError\(error\)/)
  assert.match(app, /window\.addEventListener\('online', retryProfileWhenOnline\)/)
})

test('main hanya me-mount satu PWA lifecycle component', () => {
  assert.match(main, /PwaStatus/)
  assert.match(main, /pwa-status\.css/)
  assert.doesNotMatch(main, /navigator\.serviceWorker\.register/)
  assert.doesNotMatch(main, /PwaExperience|registerPwa/)
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
