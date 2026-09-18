import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')
const styles = read('src/scanner-native.css')

test('11.9 memakai design system dan status scanner live yang jelas', () => {
  assert.match(scanner, /import \{ Button, PageHeader \} from '\.\.\/components\/ui'/)
  assert.match(scanner, /<PageHeader/)
  assert.match(scanner, /native-scanner-status/)
  assert.match(scanner, /Scanner live aktif/)
  assert.match(scanner, /native-live-badge/)
  assert.match(scanner, />LIVE</)
})

test('feedback scanner dapat diumumkan screen reader dan tetap ringkas', () => {
  assert.match(scanner, /role=\{feedback\.tone === 'error' \? 'alert' : 'status'\}/)
  assert.match(scanner, /aria-live=\{feedback\.tone === 'error' \? 'assertive' : 'polite'\}/)
  assert.match(scanner, /aria-atomic="true"/)
  assert.match(scanner, /aria-label="Pemindai QR kamera live"/)
  assert.match(scanner, /aria-label="Pratinjau kamera live"/)
})

test('start dan switch kamera memiliki synchronous guard serta fallback kamera lain', () => {
  assert.match(scanner, /const startingRef = useRef\(false\)/)
  assert.match(scanner, /if \(startingRef\.current\) return/)
  assert.match(scanner, /startingRef\.current = true/)
  assert.match(scanner, /startingRef\.current = false/)
  assert.match(scanner, /canTryAlternativeCamera/)
  assert.match(scanner, /Coba Kamera Lain/)
  assert.match(scanner, /devices\.find\(\(item\) => isClearlyFrontCamera\(item\.label\)\)/)
})

test('kegagalan invoke attendance menjadi feedback UI tanpa mengubah edge function contract', () => {
  assert.match(scanner, /invokeObservedFunction\('record-attendance'/)
  const observedServices = readFileSync(new URL('../src/lib/observed-services.ts', import.meta.url), 'utf8')
  assert.match(observedServices, /supabase\.functions\.invoke\(functionName/)
  assert.match(scanner, /catch \{[\s\S]*Absensi gagal disimpan\. Periksa koneksi/)
  assert.match(scanner, /busyRef\.current/)
  assert.match(scanner, /lastScanRef\.current/)
})

test('scanner tetap live camera only setelah hardening 11.9', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.match(scanner, /const switchCamera = async/)
  assert.doesNotMatch(scanner, /type="file"|capture=|scanFile|openNativeCapture|handleNativeCapture/)
  assert.doesNotMatch(scanner, /galeri|gallery|unggah foto|upload foto/i)
  assert.doesNotMatch(scanner, /Flashlight|toggleTorch|tryTorchForDarkFrame|\btorch\b/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
  assert.doesNotMatch(scanner, /@tanstack\/react-query|useDataFilters|queryKeys/)
})

test('responsive scanner mengunci touch target, small widths, mirror preview, dan reduced motion', () => {
  assert.match(styles, /\.native-camera\.front-camera video \{ transform: scaleX\(-1\); \}/)
  assert.match(styles, /min-height: var\(--touch-target\)/)
  assert.match(styles, /@media \(max-width: 430px\)/)
  assert.match(styles, /@media \(max-width: 360px\)/)
  assert.match(styles, /@media \(max-width: 320px\)/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(styles, /\.native-camera-actions \{ grid-template-columns: 1fr; \}/)
})
