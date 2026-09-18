const BUILD_ID = '__RA_BUILD_ID__'
const CACHE_PREFIX = 'ra-nurul-falah'
const STATIC_CACHE = `${CACHE_PREFIX}-static-${BUILD_ID}`
const NAV_CACHE = `${CACHE_PREFIX}-nav-${BUILD_ID}`
const BASE = '/RA-Nurul-Falah/'
const CORE = [
  BASE,
  `${BASE}site.webmanifest`,
  `${BASE}logo-ra-nurul-falah.png`,
  `${BASE}logo-ra-nurul-falah.svg`,
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(CORE)),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => key.startsWith(`${CACHE_PREFIX}-`) && key !== STATIC_CACHE && key !== NAV_CACHE)
        .map((key) => caches.delete(key)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
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

  const isHashedAsset = url.pathname.startsWith(`${BASE}assets/`)
  const isCoreAsset = CORE.some((entry) => {
    const coreUrl = new URL(entry, self.location.origin)
    return coreUrl.pathname === url.pathname
  })

  if (isHashedAsset || isCoreAsset) {
    event.respondWith(cacheFirstStatic(request))
  }
})

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' })
    if (response.ok) {
      const cache = await caches.open(NAV_CACHE)
      await cache.put(BASE, response.clone())
    }
    return response
  } catch {
    return (await caches.match(BASE)) || Response.error()
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE)
    await cache.put(request, response.clone())
  }
  return response
}
