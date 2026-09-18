import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
const swPath = join(dist, 'sw.js')
const manifestPath = join(dist, 'site.webmanifest')
const indexPath = join(dist, 'index.html')
const assetsPath = join(dist, 'assets')

assert.ok(existsSync(swPath), 'dist/sw.js wajib dihasilkan saat build production')
assert.ok(existsSync(manifestPath), 'dist/site.webmanifest wajib tersedia')
assert.ok(existsSync(indexPath), 'dist/index.html wajib tersedia')
assert.ok(existsSync(assetsPath), 'dist/assets wajib tersedia')

const sw = readFileSync(swPath, 'utf8')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const index = readFileSync(indexPath, 'utf8')
const assetFiles = readdirSync(assetsPath).filter((name) => !name.endsWith('.map'))

assert.match(sw, /ra-nurul-falah-precache-/)
assert.match(sw, /APP_SHELL = BASE \+ 'index\.html'/)
assert.match(sw, /cache\.addAll\(PRECACHE_URLS\)/)
assert.match(sw, /event\.data\?\.type === 'SKIP_WAITING'/)
assert.match(sw, /request\.mode === 'navigate'/)
assert.match(sw, /url\.pathname\.includes\('\/assets\/'\)/)
assert.doesNotMatch(sw, /self\.addEventListener\('install'[\s\S]{0,260}self\.skipWaiting\(\)/)

for (const asset of assetFiles) {
  assert.ok(
    sw.includes(`/RA-Nurul-Falah/assets/${asset}`),
    `Service worker belum precache assets/${asset}`,
  )
}

assert.equal(manifest.display, 'standalone')
assert.equal(manifest.start_url, './')
assert.equal(manifest.scope, './')
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0)
assert.match(index, /rel="manifest"/)
assert.match(index, /theme-color/)

console.log(`PWA build verified: ${assetFiles.length} bundled assets precached.`)
