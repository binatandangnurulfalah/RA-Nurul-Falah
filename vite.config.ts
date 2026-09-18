import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const BASE = '/RA-Nurul-Falah/'
const BUILD_VERSION = process.env.GITHUB_SHA?.slice(0, 12) || `local-${Date.now().toString(36)}`

function serviceWorkerSource(version: string, precacheUrls: string[]) {
  return `const VERSION = ${JSON.stringify(version)}
const CACHE_PREFIX = 'ra-nurul-falah-'
const PRECACHE = CACHE_PREFIX + 'precache-' + VERSION
const RUNTIME = CACHE_PREFIX + 'runtime-' + VERSION
const BASE = ${JSON.stringify(BASE)}
const APP_SHELL = BASE + 'index.html'
const PRECACHE_URLS = ${JSON.stringify(precacheUrls)}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== PRECACHE && key !== RUNTIME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(RUNTIME)
    await cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request, fallbackToShell = false) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(RUNTIME)
      await cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) return cached
    if (fallbackToShell) {
      const shell = await caches.match(APP_SHELL)
      if (shell) return shell
    }
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return
  if (url.pathname.endsWith('/sw.js')) return

  const isNavigation = request.mode === 'navigate'
  if (isNavigation) {
    event.respondWith(networkFirst(request, true))
    return
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (
    url.pathname.endsWith('/site.webmanifest') ||
    url.pathname.endsWith('/logo-ra-nurul-falah.png') ||
    url.pathname.endsWith('/logo-ra-nurul-falah.svg')
  ) {
    event.respondWith(networkFirst(request))
  }
})
`
}

function pwaBuildPlugin(): Plugin {
  return {
    name: 'ra-nurul-falah-pwa-build',
    apply: 'build',
    generateBundle(_options, bundle) {
      const bundleUrls = Object.values(bundle)
        .map((output) => `${BASE}${output.fileName}`)
        .filter((url) => !url.endsWith('/sw.js'))

      const precacheUrls = Array.from(new Set([
        ...bundleUrls,
        `${BASE}site.webmanifest`,
        `${BASE}logo-ra-nurul-falah.png`,
        `${BASE}logo-ra-nurul-falah.svg`,
      ])).sort()

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource(BUILD_VERSION, precacheUrls),
      })
    },
  }
}

export default defineConfig({
  base: BASE,
  plugins: [react(), pwaBuildPlugin()],
})
