import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const designDialog = read('src/components/ui/Dialog.tsx')
const legacyDialog = read('src/portal-v2/AppExperience.tsx')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('design-system dialog does not rerun focus lifecycle when onClose identity changes', () => {
  assert.match(designDialog, /const onCloseRef = useRef\(onClose\)/)
  assert.match(designDialog, /onCloseRef\.current = onClose/)
  assert.match(designDialog, /onCloseRef\.current\(\)/)
  assert.match(designDialog, /\}, \[open\]\)/)
  assert.doesNotMatch(designDialog, /\[open, onClose\]/)
})

test('legacy dialog keeps input focus stable across controlled-input rerenders', () => {
  assert.match(legacyDialog, /const onCloseRef = useRef\(onClose\)/)
  assert.match(legacyDialog, /onCloseRef\.current = onClose/)
  assert.match(legacyDialog, /onCloseRef\.current\(\)/)
  assert.match(legacyDialog, /\}, \[\]\)/)
  assert.doesNotMatch(legacyDialog, /\}, \[onClose\]\)/)
})

test('attendance scanner remains LIVE CAMERA ONLY', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
})
