import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [scanner, styles, packageText] = await Promise.all([
  readFile(new URL('../src/portal-v2/AttendanceScannerNative.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/scanner-native.css', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
])

test('scanner absensi hanya menerima pemindaian QR dari kamera live', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.match(scanner, /Mulai Scan Live/)

  assert.doesNotMatch(scanner, /type="file"|scanFile|openNativeCapture|handleNativeCapture|accept="image|capture=/)
  assert.doesNotMatch(scanner, /galeri|gallery|unggah foto|upload foto/i)
  assert.doesNotMatch(scanner, /Flashlight|torchSupported|toggleTorch|tryTorchForDarkFrame|\btorch\b/i)
  assert.doesNotMatch(scanner, /setManual|\bmanual\b|Masukkan kode QR secara manual|Tempel kode QR/i)
  assert.equal(JSON.parse(packageText).dependencies['html5-qrcode'], undefined)
})

test('pergantian kamera tetap tersedia dan kamera depan dicerminkan hanya pada preview', () => {
  assert.match(scanner, /const switchCamera = async/)
  assert.match(scanner, /Ganti Kamera/)
  assert.match(scanner, /setFrontCamera\(settings\.facingMode === 'user'/)
  assert.match(scanner, /frontCamera \? 'front-camera'/)
  assert.match(styles, /\.native-camera\.front-camera video \{ transform: scaleX\(-1\); \}/)
  assert.match(scanner, /detector\.detect\(video\)/)
})

test('scanner tetap memproses token melalui edge function record-attendance', () => {
  assert.match(scanner, /invokeObservedFunction\('record-attendance'/)
  const observedServices = readFileSync(new URL('../src/lib/observed-services.ts', import.meta.url), 'utf8')
  assert.match(observedServices, /supabase\.functions\.invoke\(functionName/)
  assert.match(scanner, /busyRef\.current/)
  assert.match(scanner, /lastScanRef\.current/)
})
