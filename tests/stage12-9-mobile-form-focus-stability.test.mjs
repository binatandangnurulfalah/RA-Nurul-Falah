import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const designDialog = read('src/components/ui/Dialog.tsx')
const legacyDialog = read('src/portal-v2/AppExperience.tsx')
const dialogFocus = read('src/components/ui/useDialogFocus.ts')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')
const formField = read('src/components/forms/FormField.tsx')
const dataUi = read('src/data-ui.css')
const designSystem = read('src/design-system.css')

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
  assert.doesNotMatch(legacyDialog, /returnFocusRef|onCloseRef/)
})

test('attendance scanner remains LIVE CAMERA ONLY', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
})


test('shared form system replaces browser-default fieldsets with responsive form cards', () => {
  assert.match(formField, /form-section__header/)
  assert.match(formField, /form-field__control/)
  assert.match(dataUi, /\.form-section \{/)
  assert.match(dataUi, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(dataUi, /\.form-field__control > :where\(input, select, textarea\)/)
  assert.match(dataUi, /@media \(max-width: 760px\)[\s\S]*\.form-section__grid \{[\s\S]*grid-template-columns: 1fr/)
})

test('shared design-system dialog becomes a mobile bottom sheet with sticky actions', () => {
  assert.match(designSystem, /Shared responsive dialog polish/)
  assert.match(designSystem, /\.ds-dialog-backdrop \{[\s\S]*align-items: end/)
  assert.match(designSystem, /border-radius: 24px 24px 0 0/)
  assert.match(designSystem, /\.ds-dialog__actions \{[\s\S]*position: sticky/)
})
