import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const assetsDir = join(here, '..', 'dist', 'assets')
const jsFiles = readdirSync(assetsDir).filter((name) => name.endsWith('.js'))

assert.ok(jsFiles.length > 0, 'Bundle JavaScript production tidak ditemukan.')

const sizes = jsFiles
  .map((name) => ({ name, bytes: statSync(join(assetsDir, name)).size }))
  .sort((a, b) => b.bytes - a.bytes)

const maxChunkBytes = 420 * 1024
const oversized = sizes.filter((item) => item.bytes > maxChunkBytes)

assert.equal(
  oversized.length,
  0,
  `Chunk JavaScript melebihi 420 KiB: ${oversized.map((item) => `${item.name} (${Math.round(item.bytes / 1024)} KiB)`).join(', ')}`,
)

const vendorChunks = sizes.filter((item) => item.name.startsWith('vendor-'))
assert.ok(vendorChunks.length >= 3, 'Vendor utama belum dipisahkan menjadi chunk cacheable.')

console.log(
  `Bundle budget verified: ${sizes.length} JS chunks; largest ${sizes[0].name} ${Math.round(sizes[0].bytes / 1024)} KiB.`,
)
