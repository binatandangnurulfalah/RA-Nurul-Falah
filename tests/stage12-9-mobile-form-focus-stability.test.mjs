import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const designDialog = read('src/components/ui/Dialog.tsx')
const legacyDialog = read('src/portal-v2/AppExperience.tsx')
const dialogFocus = read('src/components/ui/useDialogFocus.ts')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('dialog focus lifecycle is centralized and does not depend on onClose identity', () => {
  assert.match(designDialog, /useDialogFocus/)
  assert.match(legacyDialog, /useDialogFocus/)
  assert.match(dialogFocus, /const onCloseRef = useRef\(onClose\)/)
  assert.match(dialogFocus, /onCloseRef\.current = onClose/)
  assert.match(dialogFocus, /onCloseRef\.current\(\)/)
  assert.doesNotMatch(dialogFocus, /\[.*onClose.*\]/)
})

test('legacy dialog keeps input focus stable across controlled-input rerenders', () => {
  assert.match(legacyDialog, /useDialogFocus\(\{[\s\S]*containerRef: panelRef,[\s\S]*onClose/)
  assert.doesNotMatch(legacyDialog, /addEventListener\('keydown'/)
  assert.doesNotMatch(legacyDialog, /returnFocusRef|onCloseRef/)
})

test('attendance scanner remains LIVE CAMERA ONLY', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
})
