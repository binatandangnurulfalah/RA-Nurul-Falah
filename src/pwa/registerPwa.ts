export const PWA_UPDATE_EVENT = 'ra-pwa-update'
const UPDATE_PENDING_KEY = 'ra_pwa_update_pending'
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000

type PwaUpdateDetail = {
  registration: ServiceWorkerRegistration
  buildId: string
}

function notifyUpdate(registration: ServiceWorkerRegistration) {
  window.dispatchEvent(new CustomEvent<PwaUpdateDetail>(PWA_UPDATE_EVENT, {
    detail: { registration, buildId: __RA_BUILD_ID__ },
  }))
}

function checkRegistration(registration: ServiceWorkerRegistration) {
  if (registration.waiting && navigator.serviceWorker.controller) {
    notifyUpdate(registration)
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
        notifyUpdate(registration)
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
    document.addEventListener('visibilitychange', requestUpdate)

    window.addEventListener('pagehide', () => {
      window.clearInterval(interval)
      window.removeEventListener('online', requestUpdate)
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (sessionStorage.getItem(UPDATE_PENDING_KEY) !== '1') return
    sessionStorage.removeItem(UPDATE_PENDING_KEY)
    window.location.reload()
  })
}
