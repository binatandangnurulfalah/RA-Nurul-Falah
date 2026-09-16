import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, CheckCircle2, QrCode, RefreshCw, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { PageTitle } from './PortalPages'

type AttendanceRecord = {
  id: string
  attendance_date: string
  check_in: string | null
  check_out: string | null
  status: string
}

type Feedback = { tone: 'info' | 'success' | 'error'; text: string }
type CameraChoice = { id: string; label: string }
type ScannerInstance = { stop: () => Promise<void>; clear: () => void }

const JAKARTA = 'Asia/Jakarta'
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA }).format(new Date())

function cameraScore(label: string) {
  const text = label.toLowerCase()
  let score = 0
  if (/back|rear|environment|belakang|facing back/.test(text)) score += 20
  if (/front|user|depan|facing front/.test(text)) score -= 20
  if (/macro|depth|tele|ultra/.test(text)) score -= 5
  if (/camera\s*0|back\s*camera\s*0/.test(text)) score += 3
  return score
}

function friendlyCameraError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/notallowed|permission|denied/i.test(message)) return 'Izin kamera ditolak. Buka izin Kamera untuk situs ini lalu coba lagi.'
  if (/notfound|device|kamera tidak ditemukan/i.test(message)) return 'Kamera tidak ditemukan pada perangkat ini.'
  if (/notreadable|could not start|track start/i.test(message)) return 'Kamera sedang dipakai aplikasi lain. Tutup kamera/aplikasi lain lalu coba lagi.'
  return message || 'Kamera tidak dapat diaktifkan.'
}

export function AttendanceScannerFixed() {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [manual, setManual] = useState('')
  const [scanning, setScanning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [cameraCount, setCameraCount] = useState(0)
  const [cameraLabel, setCameraLabel] = useState('')
  const [feedback, setFeedback] = useState<Feedback>({ tone: 'info', text: 'Kamera belum diaktifkan.' })
  const scanner = useRef<ScannerInstance | null>(null)
  const cameras = useRef<CameraChoice[]>([])
  const cameraIndex = useRef(0)
  const busy = useRef(false)
  const lastScan = useRef<{ token: string; at: number } | null>(null)

  const load = async () => {
    const { data } = await supabase
      .from('attendance_records')
      .select('id,attendance_date,check_in,check_out,status')
      .order('created_at', { ascending: false })
      .limit(40)
    setRecords((data as AttendanceRecord[] | null) ?? [])
  }

  const stopReader = async (quiet = false) => {
    const current = scanner.current
    scanner.current = null
    if (current) {
      try { await current.stop() } catch { /* scanner mungkin belum sepenuhnya aktif */ }
      try { current.clear() } catch { /* aman diabaikan */ }
    }
    const host = document.getElementById('v2-scanner-reader')
    if (host) host.innerHTML = ''
    setScanning(false)
    if (!quiet) setFeedback({ tone: 'info', text: 'Kamera dihentikan.' })
  }

  useEffect(() => {
    void load()
    return () => { void stopReader(true) }
    // cleanup hanya saat halaman dilepas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const playSuccess = () => {
    try {
      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioContextCtor()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.06, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
      osc.start()
      osc.stop(ctx.currentTime + 0.18)
    } catch { /* audio opsional */ }
  }

  const record = async (token: string) => {
    const cleanToken = token.trim()
    if (!cleanToken) return false
    setFeedback({ tone: 'info', text: 'Menyimpan absensi...' })
    const { data, error } = await supabase.functions.invoke('record-attendance', { body: { token: cleanToken } })
    if (error || !data?.ok) {
      setFeedback({ tone: 'error', text: data?.error || 'QR gagal diproses.' })
      return false
    }
    const statusText = data.status === 'late' ? 'Terlambat' : 'Tepat waktu'
    setFeedback({ tone: 'success', text: `${data.student.full_name} berhasil ${data.action === 'check_in' ? 'masuk' : 'pulang'} · ${data.time} WIB · ${statusText}` })
    setManual('')
    navigator.vibrate?.(120)
    playSuccess()
    await load()
    return true
  }

  const stabilizeVideo = async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 180))
    const video = document.querySelector<HTMLVideoElement>('#v2-scanner-reader video')
    if (!video) return
    video.setAttribute('playsinline', 'true')
    video.setAttribute('webkit-playsinline', 'true')
    video.muted = true
    video.autoplay = true
    video.style.display = 'block'
    video.style.visibility = 'visible'
    video.style.opacity = '1'
    try { await video.play() } catch { /* html5-qrcode tetap menangani playback */ }
  }

  const start = async (preferredIndex?: number) => {
    if (starting) return
    setStarting(true)
    setFeedback({ tone: 'info', text: 'Menyiapkan kamera belakang...' })
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Kamera memerlukan koneksi HTTPS dan browser yang mendukung akses kamera.')
      }

      await stopReader(true)
      const { Html5Qrcode } = await import('html5-qrcode')
      const detected = await Html5Qrcode.getCameras()
      if (!detected.length) throw new Error('Kamera tidak ditemukan.')

      const ordered = detected
        .map((item) => ({ id: item.id, label: item.label || 'Kamera' }))
        .sort((a, b) => cameraScore(b.label) - cameraScore(a.label))
      cameras.current = ordered
      setCameraCount(ordered.length)

      const index = preferredIndex == null ? 0 : Math.max(0, Math.min(preferredIndex, ordered.length - 1))
      cameraIndex.current = index
      const selected = ordered[index]
      setCameraLabel(selected.label)

      const host = document.getElementById('v2-scanner-reader')
      if (host) host.innerHTML = ''

      const reader = new Html5Qrcode('v2-scanner-reader')
      scanner.current = reader
      setScanning(true)

      await reader.start(
        selected.id,
        { fps: 12, qrbox: { width: 245, height: 245 } },
        async (text) => {
          const now = Date.now()
          if (busy.current) return
          if (lastScan.current?.token === text && now - lastScan.current.at < 120000) return
          busy.current = true
          const ok = await record(text)
          if (ok) lastScan.current = { token: text, at: Date.now() }
          window.setTimeout(() => { busy.current = false }, 1200)
        },
        () => undefined,
      )

      await stabilizeVideo()
      setFeedback({ tone: 'info', text: 'Kamera aktif. Arahkan QR murid ke kotak pemindai.' })
    } catch (error) {
      await stopReader(true)
      setFeedback({ tone: 'error', text: friendlyCameraError(error) })
    } finally {
      setStarting(false)
    }
  }

  const switchCamera = async () => {
    if (cameras.current.length < 2 || starting) return
    const next = (cameraIndex.current + 1) % cameras.current.length
    await start(next)
  }

  const todayRows = records.filter((row) => row.attendance_date === TODAY)

  return (
    <div className="v2-stack scanner-fixed-page">
      <PageTitle eyebrow="ABSENSI QR" title="Scan Kehadiran" text="Pindai QR murid secara berurutan. Kamera tetap aktif setelah absensi berhasil." />
      <div className="v2-two-col scanner">
        <section className="v2-panel scanner-main-panel">
          <div className={`v2-scanner-box scanner-fixed-box ${scanning ? 'active' : ''}`}>
            <div id="v2-scanner-reader" />
            {!scanning && (
              <div className="scanner-empty-state">
                <span><QrCode size={62} /></span>
                <h3>Siap memindai QR</h3>
                <p>Aktifkan kamera belakang lalu arahkan QR murid ke tengah bingkai.</p>
                <button className="v2-primary" disabled={starting} onClick={() => void start()}>
                  <Camera size={18} /> {starting ? 'Menyiapkan Kamera...' : 'Aktifkan Kamera'}
                </button>
              </div>
            )}
          </div>

          {scanning && (
            <div className="scanner-camera-actions">
              <button className="v2-secondary" disabled={starting} onClick={() => void stopReader(false)}>Hentikan Kamera</button>
              {cameraCount > 1 && <button className="v2-secondary" disabled={starting} onClick={() => void switchCamera()}><RefreshCw size={17} /> Ganti Kamera</button>}
            </div>
          )}
          {scanning && cameraLabel && <small className="scanner-camera-name">Kamera: {cameraLabel}</small>}

          <div className={`v2-scan-feedback ${feedback.tone}`}>
            {feedback.tone === 'success' ? <CheckCircle2 /> : feedback.tone === 'error' ? <AlertTriangle /> : <QrCode />}
            <span>{feedback.text}</span>
          </div>

          <details className="v2-manual">
            <summary>Masukkan kode QR secara manual</summary>
            <form onSubmit={(event) => { event.preventDefault(); void record(manual) }}>
              <input required value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Tempel kode QR" />
              <button className="v2-primary">Proses</button>
            </form>
          </details>
        </section>

        <section className="v2-panel">
          <h3>Ringkasan Hari Ini</h3>
          <div className="v2-stat-grid one scanner-summary">
            <SummaryStat label="Masuk" value={todayRows.filter((row) => row.check_in).length} />
            <SummaryStat label="Pulang" value={todayRows.filter((row) => row.check_out).length} />
            <SummaryStat label="Terlambat" value={todayRows.filter((row) => row.status === 'late').length} />
          </div>
          <div className="v2-security-note"><ShieldCheck /><p>QR menggunakan token acak dan hanya dapat diproses oleh Admin atau Guru yang login.</p></div>
        </section>
      </div>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return <div className="v2-stat mini"><div><small>{label}</small><strong>{value}</strong></div></div>
}
