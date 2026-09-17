import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [scanner, styles, packageText] = await Promise.all([
  readFile(new URL('../src/portal-v2/AttendanceScannerNative.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/scanner-native.css', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
])

test('scanner absensi hanya menerima pemindaian QR live', () => {
  assert.doesNotMatch(scanner, /type="file"|scanFile|Kamera HP|openNativeCapture|handleNativeCapture/)
  assert.doesNotMatch(scanner, /Flashlight|torchSupported|toggleTorch|tryTorchForDarkFrame/)
  assert.match(scanner, /Mulai Scan Live/)
  assert.equal(JSON.parse(packageText).dependencies['html5-qrcode'], undefined)
})

test('preview kamera depan dicerminkan tanpa mengubah frame detektor', () => {
  assert.match(scanner, /setFrontCamera\(settings\.facingMode === 'user'/)
  assert.match(scanner, /frontCamera \? 'front-camera'/)
  assert.match(styles, /\.native-camera\.front-camera video \{ transform: scaleX\(-1\); \}/)
  assert.match(scanner, /detector\.detect\(video\)/)
})
