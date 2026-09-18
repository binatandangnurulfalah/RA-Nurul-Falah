import { useEffect, useMemo, useState } from 'react'
import { Download, RefreshCw, WifiOff, X } from 'lucide-react'
import { applyPwaUpdate, PWA_UPDATE_EVENT } from './registerPwa'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type UpdateEvent = CustomEvent<{
  registration: ServiceWorkerRegistration
  buildId: string
}>

function inStandaloneMode() {
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone
}

export function PwaExperience() {
  const [online, setOnline] = useState(navigator.onLine)
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState(false)
  const standalone = useMemo(inStandaloneMode, [])

  useEffect(() => {
    const updateOnlineState = () => setOnline(navigator.onLine)
    const handleUpdate = (event: Event) => {
      const detail = (event as UpdateEvent).detail
      if (!detail?.registration) return
      setUpdateRegistration(detail.registration)
      setUpdateDismissed(false)
    }
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
      setInstallDismissed(false)
    }
    const handleInstalled = () => {
      setInstallPrompt(null)
      setInstallDismissed(true)
    }

    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)
    window.addEventListener(PWA_UPDATE_EVENT, handleUpdate)
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL).then((registration) => {
        if (registration?.waiting && navigator.serviceWorker.controller) {
          setUpdateRegistration(registration)
        }
      })
    }

    return () => {
      window.removeEventListener('online', updateOnlineState)
      window.removeEventListener('offline', updateOnlineState)
      window.removeEventListener(PWA_UPDATE_EVENT, handleUpdate)
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const install = async () => {
    if (!installPrompt || !online) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setInstallPrompt(null)
    else setInstallDismissed(true)
  }

  const update = () => {
    if (!updateRegistration || !online) return
    applyPwaUpdate(updateRegistration)
  }

  const showUpdate = Boolean(updateRegistration && !updateDismissed)
  const showInstall = Boolean(installPrompt && !standalone && !installDismissed && !showUpdate)

  if (online && !showUpdate && !showInstall) return null

  return (
    <div className="pwa-experience-stack" aria-live="polite">
      {!online && (
        <section className="pwa-status-card offline" role="status">
          <span className="pwa-status-icon"><WifiOff size={19} /></span>
          <div>
            <strong>Anda sedang offline</strong>
            <p>Sesi login tetap dipertahankan. Data yang sudah tampil mungkin masih dapat dibaca. Sinkronisasi dan penyimpanan memerlukan internet.</p>
          </div>
        </section>
      )}

      {showUpdate && (
        <section className="pwa-status-card update" role="status">
          <span className="pwa-status-icon"><RefreshCw size={19} /></span>
          <div>
            <strong>Versi baru tersedia</strong>
            <p>Perbarui saat online agar aplikasi dan struktur data tetap sinkron.</p>
            <div className="pwa-status-actions">
              <button type="button" className="pwa-primary" disabled={!online} onClick={update}>Perbarui sekarang</button>
              <button type="button" className="pwa-secondary" onClick={() => setUpdateDismissed(true)}>Nanti</button>
            </div>
          </div>
          <button type="button" className="pwa-close" aria-label="Tutup pemberitahuan pembaruan" onClick={() => setUpdateDismissed(true)}><X size={16} /></button>
        </section>
      )}

      {showInstall && (
        <section className="pwa-status-card install" role="status">
          <span className="pwa-status-icon"><Download size={19} /></span>
          <div>
            <strong>Pasang aplikasi RA Nurul Falah</strong>
            <p>Tambahkan ke layar utama untuk akses lebih cepat tanpa mengubah akun atau aturan keamanan data.</p>
            <div className="pwa-status-actions">
              <button type="button" className="pwa-primary" onClick={() => void install()}>Pasang aplikasi</button>
              <button type="button" className="pwa-secondary" onClick={() => setInstallDismissed(true)}>Tidak sekarang</button>
            </div>
          </div>
          <button type="button" className="pwa-close" aria-label="Tutup ajakan instalasi" onClick={() => setInstallDismissed(true)}><X size={16} /></button>
        </section>
      )}
    </div>
  )
}
