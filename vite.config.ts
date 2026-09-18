import { readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const base = '/RA-Nurul-Falah/'
const buildId = (process.env.GITHUB_SHA || process.env.VITE_BUILD_ID || 'local').slice(0, 40)

function buildServiceWorker(assetFiles: string[]) {
  const precache = [
    `${base}index.html`,
    `${base}site.webmanifest`,
    `${base}logo-ra-nurul-falah.png`,
    `${base}logo-ra-nurul-falah.svg`,
    ...assetFiles.map((asset) => `${base}assets/${asset}`),
  ]

  return `const BUILD_ID = ${JSON.stringify(buildId)}
const BASE = ${JSON.stringify(base)}
const CACHE_PREFIX = 'ra-nurul-falah-precache-'
const CACHE = CACHE_PREFIX + BUILD_ID
const APP_SHELL = BASE + 'index.html'
const PRECACHE_URLS = ${JSON.stringify(precache, null, 2)}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
        .map((key) => caches.delete(key)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
    return
  }

  if (event.data?.type === 'GET_VERSION') {
    event.ports?.[0]?.postMessage({ buildId: BUILD_ID })
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (
    url.pathname === BASE + 'site.webmanifest'
    || url.pathname === BASE + 'logo-ra-nurul-falah.png'
    || url.pathname === BASE + 'logo-ra-nurul-falah.svg'
  ) {
    event.respondWith(networkFirstResource(request))
  }
})

async function networkFirstNavigation(request) {
  try {
    return await fetch(request, { cache: 'no-store' })
  } catch {
    return (await caches.match(APP_SHELL)) || Response.error()
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE)
    await cache.put(request, response.clone())
  }
  return response
}

async function networkFirstResource(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' })
    if (response.ok) {
      const cache = await caches.open(CACHE)
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    return (await caches.match(request)) || Response.error()
  }
}
`
}

export default defineConfig({
  base,
  define: {
    __RA_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    react(),
    {
      name: 'ra-generated-pwa',
      apply: 'build',
      closeBundle() {
        const assetsPath = resolve('dist/assets')
        const assetFiles = readdirSync(assetsPath)
          .filter((name) => !name.endsWith('.map'))
          .sort()

        writeFileSync(resolve('dist/sw.js'), buildServiceWorker(assetFiles))
        writeFileSync(
          resolve('dist/version.json'),
          JSON.stringify({ buildId, generatedAt: new Date().toISOString() }),
        )
      },
    },
  ],
})
