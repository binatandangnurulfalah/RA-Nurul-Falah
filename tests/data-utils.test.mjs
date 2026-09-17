import assert from 'node:assert/strict'
import test from 'node:test'
import { getPageRange, normalizePage, paginateItems, sanitizeSearch } from '../src/lib/data-utils.js'

test('rentang Supabase tidak tumpang tindih', () => {
  assert.deepEqual(getPageRange(1, 20), { from: 0, to: 19 })
  assert.deepEqual(getPageRange(2, 20), { from: 20, to: 39 })
})

test('halaman selalu berada dalam batas data', () => {
  assert.equal(normalizePage(0, 37, 20), 1)
  assert.equal(normalizePage(9, 37, 20), 2)
  assert.equal(normalizePage(1, 0, 20), 1)
})

test('pagination tidak mengubah urutan dan jumlah sumber', () => {
  const source = Array.from({ length: 37 }, (_, index) => index + 1)
  const result = paginateItems(source, 2, 20)
  assert.equal(result.page, 2)
  assert.equal(result.total, 37)
  assert.deepEqual(result.items, source.slice(20))
})

test('pencarian dibersihkan dari karakter filter PostgREST', () => {
  assert.equal(sanitizeSearch('  Siti_% (A)  '), 'Siti A')
})
