import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const tokens = read('src/styles/tokens.css')
const design = read('src/design-system.css')
const main = read('src/main.tsx')
const uiIndex = read('src/components/ui/index.ts')
const dialog = read('src/components/ui/Dialog.tsx')

test('design tokens memakai palette Tahap 11 sebagai source of truth', () => {
  const required = [
    '#256B52', '#1F5A46', '#EAF5F0', '#F6F8F7', '#FFFFFF', '#F9FBFA',
    '#1C2B25', '#66756E', '#89958F', '#E2E9E5', '#D2DDD7', '#2F7A58',
    '#3D72B4', '#B77B18', '#B7473D', '#775DA6',
  ]
  for (const color of required) assert.match(tokens, new RegExp(color, 'i'))
  assert.match(tokens, /--radius-card:\s*16px/)
  assert.match(tokens, /--radius-control:\s*10px/)
  assert.match(tokens, /--touch-target:\s*44px/)
})

test('tokens dimuat sebelum stylesheet legacy', () => {
  assert.ok(main.indexOf("./styles/tokens.css") < main.indexOf("./styles.css"))
  assert.match(tokens, /--v2-green:\s*var\(--color-primary\)/)
})

test('primitive UI reusable tersedia dan memakai class design system', () => {
  for (const component of ['Badge', 'Button', 'Dialog', 'EmptyState', 'PageHeader', 'Skeleton']) {
    assert.match(uiIndex, new RegExp(`export \\{ ${component} \\}`))
  }
  assert.match(design, /\.ds-button--primary/)
  assert.match(design, /\.ds-badge--success/)
  assert.match(design, /\.ds-empty-state/)
  assert.match(design, /\.ds-dialog/)
})

test('Dialog foundation memiliki escape, focus loop, aria-modal, dan return focus', () => {
  assert.match(dialog, /event\.key === 'Escape'/)
  assert.match(dialog, /event\.key !== 'Tab'/)
  assert.match(dialog, /aria-modal="true"/)
  assert.match(dialog, /previousActive\?\.focus\(\)/)
})

test('reduced motion dan focus-visible dipertahankan', () => {
  assert.match(design, /prefers-reduced-motion/)
  assert.match(design, /:focus-visible/)
})
