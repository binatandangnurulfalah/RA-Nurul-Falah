import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url))

const app = read('src/App.tsx')
const portal = read('src/RolePortalV5.tsx')
const designDialog = read('src/components/ui/Dialog.tsx')
const legacyExperience = read('src/portal-v2/AppExperience.tsx')
const focusHook = read('src/components/ui/useDialogFocus.ts')
const dataExperience = read('src/portal-v2/DataExperience.tsx')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('obsolete wrapper modules and unused stylesheet are removed', () => {
  assert.equal(exists('src/RolePortal.tsx'), false)
  assert.equal(exists('src/portal-v2/SchoolModules.tsx'), false)
  assert.equal(exists('src/dashboard-v11.css'), false)
  assert.equal(exists('src/data/queries/index.ts'), false)
})

test('app and portal import active modules directly', () => {
  assert.match(app, /import\('\.\/RolePortalV5'\)/)
  for (const moduleName of ['TeachersPage', 'ReportsPage', 'PaymentsPage', 'DocumentsPage']) {
    assert.match(portal, new RegExp(`import\\('\\.\\/portal-v2\\/${moduleName}'\\)`))
  }
  assert.doesNotMatch(portal, /SchoolModules/)
})

test('all dialog-like focus traps share one lifecycle implementation', () => {
  assert.match(designDialog, /useDialogFocus/)
  assert.match(legacyExperience, /useDialogFocus/)
  assert.match(portal, /useDialogFocus/)
  assert.match(focusHook, /onCloseRef/)
  assert.match(focusHook, /event\.key === 'Escape'/)
  assert.match(focusHook, /event\.key !== 'Tab'/)
  assert.match(focusHook, /previousActive\?\.focus\(\)/)
  assert.doesNotMatch(legacyExperience, /returnFocusRef|onCloseRef/)
  assert.doesNotMatch(portal, /handleKeydown|moreButtonRef/)
})

test('dead legacy client pagination and duplicate offline banner stay removed', () => {
  assert.doesNotMatch(dataExperience, /usePaginatedItems|paginateItems/)
  assert.doesNotMatch(legacyExperience, /OfflineBanner|WifiOff/)
})

test('attendance scanner remains LIVE CAMERA ONLY during cleanup', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
})
