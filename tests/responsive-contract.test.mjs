import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const css = await readFile(new URL('../src/mobile-v5.css', import.meta.url), 'utf8')

test('breakpoint smartphone utama tersedia', () => {
  assert.match(css, /@media \(max-width: 760px\)/)
  assert.match(css, /@media \(max-width: 430px\)/)
})

test('target sentuh mobile minimal 44 piksel', () => {
  assert.match(css, /min-width:\s*44px/)
  assert.match(css, /min-height:\s*44px/)
})

test('judul halaman tetap terlihat di smartphone', () => {
  assert.match(css, /\.v2-page-title > div > h2 \{ display: block;/)
  assert.doesNotMatch(css, /\.v2-page-title > div > h2 \{ display: none;/)
})

test('metadata kartu mobile minimal 11 piksel', () => {
  assert.match(css, /\.school-meta,[\s\S]*\.v2-meta \{ font-size: 11px !important;/)
})
