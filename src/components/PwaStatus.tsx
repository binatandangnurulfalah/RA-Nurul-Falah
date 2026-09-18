import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw, WifiOff, X } from 'lucide-react'
import { Button } from './ui'

type InstallChoice = {
  outcome: 'accepted' | 'dismissed'
  platform: string
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean
}

function isStandaloneDisplay() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as NavigatorWithStandalone).standalone === true
}

export function PwaStatus() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState(false)
  const [standalone, setStandalone] = useState(isStandaloneDisplay)
  const reloadOnControllerChangeRef = useRef(false)

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    const onBeforeInstall = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent
      promptEvent.preventDefault()
      setInstallPrompt(promptEvent)
      setInstallDismissed(false)
    }
    const onInstalled = () => {
      setInstallPrompt(null)
      setInstallDismissed(false)
      setStandalone(true)
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

    let active = true
    let currentRegistration: ServiceWorkerRegistration | null = null
    let updateFoundHandler: (() => void) | null = null

    const onControllerChange = () => {
      if (!reloadOnControllerChangeRef.current) return
      reloadOnControllerChangeRef.current = false
      window.location.reload()
    }

    const register = async () => {
      try {
        const nextRegistration = await navigator.serviceWorker.register(
          `${import.meta.env.BASE_URL}sw.js`,
          {
            scope: import.meta.env.BASE_URL,
            updateViaCache: 'none',
          },
        )
        if (!active) return

        currentRegistration = nextRegistration
        setRegistration(nextRegistration)

        if (nextRegistration.waiting && navigator.serviceWorker.controller) {
          setUpdateAvailable(true)
          setUpdateDismissed(false)
        }

        updateFoundHandler = () => {
          const installing = nextRegistration.installing
          if (!installing) return

          const onStateChange = () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateAvailable(true)
              setUpdateDismissed(false)
            }
          }

          installing.addEventListener('statechange', onStateChange)
        }

        nextRegistration.addEventListener('updatefound', updateFoundHandler)
        if (navigator.onLine) void nextRegistration.update()
      } catch {
        // PWA registration is progressive enhancement. The web app remains usable without it.
      }
    }

    const onLoad = () => { void register() }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    if (document.readyState === 'complete') void register()
    else window.addEventListener('load', onLoad, { once: true })

    return () => {
      active = false
      window.removeEventListener('load', onLoad)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      if (currentRegistration && updateFoundHandler) {
        currentRegistration.removeEventListener('updatefound', updateFoundHandler)
      }
    }
  }, [])

  useEffect(() => {
    if (!registration) return

    const checkForUpdate = () => {
      if (navigator.onLine) void registration.update()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    }

    window.addEventListener('focus', checkForUpdate)
    window.addEventListener('online', checkForUpdate)
    document.addEventListener('visibilitychange', onVisibility)
    const interval = window.setInterval(checkForUpdate, 30 * 60 * 1000)

    return () => {
      window.removeEventListener('focus', checkForUpdate)
      window.removeEventListener('online', checkForUpdate)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(interval)
    }
  }, [registration])

  const applyUpdate = () => {
    if (!registration?.waiting) {
      void registration?.update()
      return
    }
    reloadOnControllerChangeRef.current = true
    setUpdating(true)
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  }

  const installApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  const showInstall = Boolean(installPrompt && online && !standalone && !installDismissed && !updateAvailable)

  if (online && (!updateAvailable || updateDismissed) && !showInstall) return null

  return (
    <div className="pwa-status-stack" aria-live="polite">
      {!online ? (
        <section className="pwa-status-card pwa-status-card--offline" role="status">
          <span className="pwa-status-card__icon"><WifiOff size={19} /></span>
          <div className="pwa-status-card__copy">
            <strong>Anda sedang offline</strong>
            <span>Beberapa data yang sudah terbuka mungkin masih terlihat. Sinkronisasi dan penyimpanan membutuhkan internet.</span>
          </div>
        </section>
      ) : null}

      {updateAvailable && !updateDismissed ? (
        <section className="pwa-status-card" role="status">
          <span className="pwa-status-card__icon"><RefreshCw size={19} /></span>
          <div className="pwa-status-card__copy">
            <strong>Versi baru tersedia</strong>
            <span>Perbarui aplikasi untuk memakai versi terbaru tanpa menunggu tab ditutup.</span>
          </div>
          <div className="pwa-status-card__actions">
            <Button size="sm" onClick={applyUpdate} disabled={updating || !online}>
              {updating ? 'Memperbarui...' : 'Perbarui'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setUpdateDismissed(true)} disabled={updating}>
              Nanti
            </Button>
          </div>
        </section>
      ) : null}

      {showInstall ? (
        <section className="pwa-status-card" role="status">
          <span className="pwa-status-card__icon"><Download size={19} /></span>
          <div className="pwa-status-card__copy">
            <strong>Pasang aplikasi RA Nurul Falah</strong>
            <span>Buka lebih cepat dari layar utama tanpa mengubah akun atau data Anda.</span>
          </div>
          <div className="pwa-status-card__actions">
            <Button size="sm" onClick={() => void installApp()}>Pasang</Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Tutup saran pemasangan aplikasi"
              onClick={() => setInstallDismissed(true)}
            >
              <X size={16} /> Nanti
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
