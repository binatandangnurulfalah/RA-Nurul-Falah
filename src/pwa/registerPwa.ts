export const PWA_UPDATE_EVENT = 'ra-pwa-update'
const UPDATE_PENDING_KEY = 'ra_pwa_update_pending'
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000
const VERSION_TIMEOUT = 1500

type PwaUpdateDetail = {
  registration: ServiceWorkerRegistration
  buildId: string
}

async function workerBuildId(worker: ServiceWorker | null) {
  if (!worker) return null

  return await new Promise<string | null>((resolve) => {
    const channel = new MessageChannel()
    const timeout = window.setTimeout(() => resolve(null), VERSION_TIMEOUT)
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout)
      const buildId = typeof event.data?.buildId === 'string' ? event.data.buildId : null
      resolve(buildId)
    }
    worker.postMessage({ type: 'GET_VERSION' }, [channel.port2])
  })
}

async function notifyUpdate(registration: ServiceWorkerRegistration) {
  const buildId = await workerBuildId(registration.waiting)
  window.dispatchEvent(new CustomEvent<PwaUpdateDetail>(PWA_UPDATE_EVENT, {
    detail: { registration, buildId: buildId || 'unknown' },
  }))
}

function checkRegistration(registration: ServiceWorkerRegistration) {
  if (registration.waiting && navigator.serviceWorker.controller) {
    void notifyUpdate(registration)
  }

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing
    if (!installing) return

    installing.addEventListener('statechange', () => {
      if (
        installing.state === 'installed'
        && navigator.serviceWorker.controller
        && registration.waiting
      ) {
        void notifyUpdate(registration)
      }
    })
  })
}

export async function registerPwa() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return null

  try {
    const registration = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none',
      },
    )

    checkRegistration(registration)

    const requestUpdate = () => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        void registration.update().catch(() => undefined)
      }
    }

    const interval = window.setInterval(requestUpdate, UPDATE_CHECK_INTERVAL)
    window.addEventListener('online', requestUpdate)
    window.addEventListener('focus', requestUpdate)
    document.addEventListener('visibilitychange', requestUpdate)

    window.addEventListener('pagehide', () => {
      window.clearInterval(interval)
      window.removeEventListener('online', requestUpdate)
      window.removeEventListener('focus', requestUpdate)
      document.removeEventListener('visibilitychange', requestUpdate)
    }, { once: true })

    return registration
  } catch {
    return null
  }
}

export function applyPwaUpdate(registration: ServiceWorkerRegistration) {
  if (!registration.waiting) {
    void registration.update().catch(() => undefined)
    return false
  }

  sessionStorage.setItem(UPDATE_PENDING_KEY, '1')
  registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  return true
}

export async function applyWaitingPwaUpdate() {
  if (!('serviceWorker' in navigator)) return false
  const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  if (!registration) return false

  if (!registration.waiting) {
    await registration.update().catch(() => undefined)
  }
  return applyPwaUpdate(registration)
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (sessionStorage.getItem(UPDATE_PENDING_KEY) !== '1') return
    sessionStorage.removeItem(UPDATE_PENDING_KEY)
    window.location.reload()
  })
}
