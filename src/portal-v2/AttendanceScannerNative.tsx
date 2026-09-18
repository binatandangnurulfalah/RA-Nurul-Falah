import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, CameraOff, CheckCircle2, QrCode, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button, PageHeader } from '../components/ui'
import { supabase } from '../lib/supabase'

type AttendanceSummary = {
  total_records: number
  checked_out_records: number
  late_records: number
}

type Feedback = { tone: 'info' | 'success' | 'error'; text: string }
type DetectedBarcode = { rawValue: string }
type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike
type CameraAttempt = { label: string; constraints: MediaTrackConstraints; deviceId?: string }

const JAKARTA = 'Asia/Jakarta'
const SCAN_INTERVAL = 280
const EMPTY_SUMMARY: AttendanceSummary = { total_records: 0, checked_out_records: 0, late_records: 0 }

function jakartaDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA }).format(new Date())
}

function friendlyCameraError(error: unknown) {
  const name = error instanceof DOMException ? error.name : ''
  const message = error instanceof Error ? error.message : String(error || '')
  if (name === 'NotAllowedError' || /permission|denied|notallowed/i.test(message)) return 'Izin kamera ditolak. Izinkan Kamera untuk situs RA Nurul Falah lalu coba lagi.'
  if (name === 'NotFoundError' || /notfound|device/i.test(message)) return 'Kamera tidak ditemukan pada perangkat ini.'
  if (name === 'NotReadableError' || /notreadable|could not start|track start/i.test(message)) return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi kamera lain lalu coba lagi.'
  if (name === 'OverconstrainedError') return 'Kamera yang dipilih tidak tersedia. Coba kamera lainnya.'
  return message || 'Kamera tidak dapat diaktifkan.'
}

function rearScore(label: string) {
  const text = label.toLowerCase()
  let score = 0
  if (/back|rear|environment|belakang|facing back/.test(text)) score += 30
  if (/front|user|depan|facing front/.test(text)) score -= 40
  if (/main|wide|camera\s*0|back\s*camera\s*0/.test(text)) score += 6
  if (/macro|depth|aux|tele|ultra/.test(text)) score -= 12
  return score
}

function isClearlyFrontCamera(label: string) {
  return /front|user|depan|facing front/i.test(label)
}

export function AttendanceScannerNative() {
  const [summary, setSummary] = useState<AttendanceSummary>(EMPTY_SUMMARY)
  const [active, setActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [cameraLabel, setCameraLabel] = useState('')
  const [cameraCount, setCameraCount] = useState(0)
  const [decoderAvailable, setDecoderAvailable] = useState(true)
  const [frontCamera, setFrontCamera] = useState(false)
  const [canTryAlternativeCamera, setCanTryAlternativeCamera] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [feedback, setFeedback] = useState<Feedback>({ tone: 'info', text: 'Kamera belum diaktifkan.' })

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const devicesRef = useRef<MediaDeviceInfo[]>([])
  const selectedDeviceRef = useRef<string | null>(null)
  const detectorRef = useRef<BarcodeDetectorLike | null>(null)
  const scanTimerRef = useRef<number | null>(null)
  const decodingRef = useRef(false)
  const startingRef = useRef(false)
  const busyRef = useRef(false)
  const lastScanRef = useRef<{ token: string; at: number } | null>(null)

  const load = async () => {
    const { data, error } = await supabase.rpc('attendance_summary_for_date', { p_date: jakartaDate() })
    if (error) {
      setSummaryError('Ringkasan hari ini belum dapat dimuat.')
      return
    }
    setSummaryError('')
    setSummary(((data as AttendanceSummary[] | null)?.[0]) ?? EMPTY_SUMMARY)
  }

  useEffect(() => {
    void load()
    return () => stopCamera(true)
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
    } catch { /* bunyi opsional */ }
  }

  const record = async (token: string) => {
    const cleanToken = token.trim()
    if (!cleanToken || busyRef.current) return false
    busyRef.current = true
    setFeedback({ tone: 'info', text: 'Menyimpan absensi...' })
    try {
      const { data, error } = await supabase.functions.invoke('record-attendance', { body: { token: cleanToken } })
      if (error || !data?.ok) {
        setFeedback({ tone: 'error', text: data?.error || 'QR gagal diproses.' })
        return false
      }
      const statusText = data.status === 'late' ? 'Terlambat' : 'Tepat waktu'
      setFeedback({ tone: 'success', text: `${data.student.full_name} berhasil ${data.action === 'check_in' ? 'masuk' : 'pulang'} · ${data.time} WIB · ${statusText}` })
      navigator.vibrate?.(120)
      playSuccess()
      lastScanRef.current = { token: cleanToken, at: Date.now() }
      await load()
      return true
    } catch {
      setFeedback({ tone: 'error', text: 'Absensi gagal disimpan. Periksa koneksi lalu arahkan QR ke pemindai lagi.' })
      return false
    } finally {
      window.setTimeout(() => { busyRef.current = false }, 1100)
    }
  }

  const stopDecodeLoop = () => {
    if (scanTimerRef.current != null) window.clearTimeout(scanTimerRef.current)
    scanTimerRef.current = null
    decodingRef.current = false
  }

  const releaseStream = () => {
    const stream = streamRef.current
    streamRef.current = null
    stream?.getTracks().forEach((track) => track.stop())
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
  }

  const stopCamera = (quiet = false) => {
    stopDecodeLoop()
    releaseStream()
    startingRef.current = false
    setActive(false)
    setStarting(false)
    setCameraLabel('')
    setFrontCamera(false)
    setCanTryAlternativeCamera(false)
    selectedDeviceRef.current = null
    if (!quiet) setFeedback({ tone: 'info', text: 'Kamera dihentikan.' })
  }

  const prepareDetector = () => {
    const BarcodeDetector = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
    if (!BarcodeDetector) {
      detectorRef.current = null
      setDecoderAvailable(false)
      return false
    }
    detectorRef.current = new BarcodeDetector({ formats: ['qr_code'] })
    setDecoderAvailable(true)
    return true
  }

  const scheduleDecode = () => {
    stopDecodeLoop()
    const tick = async () => {
      const video = videoRef.current
      const detector = detectorRef.current
      if (!streamRef.current || !video || !detector) return
      if (!decodingRef.current && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        decodingRef.current = true
        try {
          const results = await detector.detect(video)
          const value = results[0]?.rawValue?.trim()
          if (value) {
            const last = lastScanRef.current
            if (!last || last.token !== value || Date.now() - last.at > 120000) void record(value)
          }
        } catch { /* frame tanpa QR diabaikan */ }
        decodingRef.current = false
      }
      scanTimerRef.current = window.setTimeout(tick, SCAN_INTERVAL)
    }
    scanTimerRef.current = window.setTimeout(tick, SCAN_INTERVAL)
  }

  const waitForVideo = async (video: HTMLVideoElement) => {
    const deadline = Date.now() + 6000
    while ((video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    }
    if (video.videoWidth === 0 || video.videoHeight === 0) throw new Error('Preview kamera gagal dimuat. Coba pilih kamera lain.')
  }

  const frameIsBlack = (video: HTMLVideoElement) => {
    if (!video.videoWidth || !video.videoHeight) return true
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 72
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let total = 0
    let black = 0
    let samples = 0
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      const lum = (r * 0.2126) + (g * 0.7152) + (b * 0.0722)
      total += lum
      if (r < 7 && g < 7 && b < 7) black += 1
      samples += 1
    }
    return (total / Math.max(1, samples)) < 2.5 && (black / Math.max(1, samples)) > 0.985
  }

  const verifyVisibleFrame = async (video: HTMLVideoElement) => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 700))
      if (!frameIsBlack(video)) return true
    }
    return false
  }

  const attachStream = async (stream: MediaStream) => {
    const video = videoRef.current
    if (!video) throw new Error('Elemen preview kamera tidak tersedia.')
    releaseStream()
    streamRef.current = stream
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.setAttribute('playsinline', 'true')
    video.setAttribute('webkit-playsinline', 'true')
    await video.play()
    await waitForVideo(video)
    return video
  }

  const openAttempt = async (attempt: CameraAttempt) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: attempt.constraints })
    const video = await attachStream(stream)
    const visible = await verifyVisibleFrame(video)
    if (!visible) {
      releaseStream()
      throw new Error(`Preview ${attempt.label} gelap`)
    }
    return stream
  }

  const refreshDeviceList = async () => {
    const inputs = (await navigator.mediaDevices.enumerateDevices())
      .filter((item) => item.kind === 'videoinput')
      .sort((a, b) => rearScore(b.label) - rearScore(a.label))
    devicesRef.current = inputs
    setCameraCount(inputs.length)
    return inputs
  }

  const activateWorkingStream = async (stream: MediaStream, fallbackLabel?: string) => {
    const inputs = await refreshDeviceList()
    const track = stream.getVideoTracks()[0]
    const settings = track.getSettings()
    selectedDeviceRef.current = settings.deviceId || null
    const resolvedLabel = track.label || inputs.find((item) => item.deviceId === settings.deviceId)?.label || fallbackLabel || 'Kamera perangkat'
    setCameraLabel(resolvedLabel)
    setFrontCamera(settings.facingMode === 'user' || isClearlyFrontCamera(resolvedLabel))
    setCanTryAlternativeCamera(false)
    setActive(true)

    const decoderReady = prepareDetector()
    if (decoderReady) {
      setFeedback({ tone: 'info', text: 'Kamera aktif. Arahkan QR murid ke kotak pemindai.' })
      scheduleDecode()
    } else {
      setFeedback({ tone: 'error', text: 'Pemindaian QR live belum didukung browser ini. Gunakan Chrome versi terbaru.' })
    }
  }

  const startCamera = async (deviceId?: string) => {
    if (startingRef.current) return
    startingRef.current = true
    setStarting(true)
    setCanTryAlternativeCamera(false)
    setFeedback({ tone: 'info', text: deviceId ? 'Membuka kamera yang dipilih...' : 'Mencari kamera belakang utama...' })
    stopDecodeLoop()
    releaseStream()

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Browser ini tidak mendukung akses kamera melalui HTTPS.')

      if (deviceId) {
        const stream = await openAttempt({ label: 'kamera pilihan', deviceId, constraints: { deviceId: { exact: deviceId } } })
        await activateWorkingStream(stream)
        return
      }

      const attempts: CameraAttempt[] = [
        { label: 'kamera belakang utama', constraints: { facingMode: { exact: 'environment' } } },
        { label: 'kamera belakang kompatibel', constraints: { facingMode: { ideal: 'environment' } } },
      ]
      let lastError: unknown = null
      for (const attempt of attempts) {
        try {
          const stream = await openAttempt(attempt)
          await activateWorkingStream(stream, attempt.label)
          return
        } catch (error) { lastError = error }
      }

      const inputs = await refreshDeviceList()
      const rearCandidates = inputs.filter((item) => !isClearlyFrontCamera(item.label))
      for (const camera of rearCandidates) {
        try {
          setFeedback({ tone: 'info', text: `Mencoba sensor belakang lain${camera.label ? ` · ${camera.label}` : ''}...` })
          const stream = await openAttempt({ label: camera.label || 'kamera belakang lain', deviceId: camera.deviceId, constraints: { deviceId: { exact: camera.deviceId } } })
          await activateWorkingStream(stream, camera.label)
          return
        } catch (error) { lastError = error }
      }

      throw lastError instanceof Error ? lastError : new Error('Semua sensor kamera belakang menghasilkan frame gelap.')
    } catch (error) {
      const hasAlternative = devicesRef.current.length > 1
      stopCamera(true)
      setCanTryAlternativeCamera(hasAlternative)
      const dark = error instanceof Error && /gelap/i.test(error.message)
      setFeedback({
        tone: 'error',
        text: dark && hasAlternative
          ? 'Kamera belakang tidak tersedia. Coba kamera lain di perangkat ini.'
          : friendlyCameraError(error),
      })
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }

  const switchCamera = async () => {
    if (startingRef.current) return
    const devices = devicesRef.current.length ? devicesRef.current : await refreshDeviceList()
    if (devices.length < 2) {
      setFeedback({ tone: 'error', text: 'Tidak ada kamera lain yang tersedia pada perangkat ini.' })
      return
    }
    const current = selectedDeviceRef.current
    const currentIndex = devices.findIndex((item) => item.deviceId === current)
    const next = currentIndex >= 0
      ? devices[(currentIndex + 1) % devices.length]
      : devices.find((item) => isClearlyFrontCamera(item.label)) ?? devices[1] ?? devices[0]
    await startCamera(next.deviceId)
  }

  const scannerLive = active && decoderAvailable
  const statusTitle = starting ? 'Membuka kamera' : scannerLive ? 'Scanner live aktif' : active ? 'Kamera aktif' : 'Scanner siap'
  const statusDetail = active
    ? `${frontCamera ? 'Kamera depan' : 'Kamera belakang'}${cameraLabel ? ` · ${cameraLabel}` : ''}`
    : 'Kamera hanya aktif saat Anda memulai scan.'

  return (
    <div className="v2-stack native-scanner-page">
      <PageHeader
        eyebrow="ABSENSI QR"
        title="Scan Kehadiran"
        subtitle="Pindai QR murid langsung dari kamera live untuk mencatat waktu masuk atau pulang."
      />

      <div className={`native-scanner-status ${scannerLive ? 'is-live' : ''}`} aria-live="polite">
        <span className="native-status-indicator" aria-hidden="true" />
        <div>
          <strong>{statusTitle}</strong>
          <small title={cameraLabel || undefined}>{statusDetail}</small>
        </div>
        {scannerLive ? <span className="native-live-badge">LIVE</span> : null}
      </div>

      <div className="v2-two-col scanner">
        <section className="v2-panel native-scanner-panel" aria-label="Pemindai QR kamera live">
          <div className={`native-camera ${active ? 'active' : ''} ${frontCamera ? 'front-camera' : ''}`}>
            <video ref={videoRef} muted playsInline autoPlay aria-label="Pratinjau kamera live" />
            {active && (
              <>
                <div className="native-camera-guide" aria-hidden="true"><span /><span /><span /><span /></div>
                <div className="native-camera-hint" aria-hidden="true">Posisikan QR di dalam bingkai</div>
              </>
            )}
            {!active && (
              <div className="native-camera-empty">
                <span><Camera size={54} /></span>
                <h3>Kamera siap digunakan</h3>
                <p>Aktifkan kamera lalu arahkan QR murid ke kotak pemindai. Absensi diproses langsung dari video live.</p>
                <div className="native-start-actions">
                  <Button size="lg" disabled={starting} onClick={() => void startCamera()}>
                    <Camera size={18} /> {starting ? 'Membuka Kamera...' : feedback.tone === 'error' ? 'Coba Lagi' : 'Mulai Scan Live'}
                  </Button>
                  {canTryAlternativeCamera ? (
                    <Button variant="secondary" size="lg" disabled={starting} onClick={() => void switchCamera()}>
                      <RefreshCw size={18} /> Coba Kamera Lain
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {active && (
            <div className="native-camera-actions">
              <Button variant="secondary" onClick={() => stopCamera(false)}><CameraOff size={17} /> Hentikan</Button>
              {cameraCount > 1 ? (
                <Button variant="secondary" disabled={starting} onClick={() => void switchCamera()}><RefreshCw size={17} /> Ganti Kamera</Button>
              ) : null}
            </div>
          )}

          <div
            className={`v2-scan-feedback ${feedback.tone}`}
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
          >
            {feedback.tone === 'success' ? <CheckCircle2 /> : feedback.tone === 'error' ? <AlertTriangle /> : <QrCode />}
            <span>{feedback.text}</span>
          </div>

          {!decoderAvailable && active ? <p className="native-decoder-note">Pemindaian live memerlukan Chrome versi terbaru dengan dukungan BarcodeDetector.</p> : null}
        </section>

        <section className="v2-panel native-scanner-summary" aria-labelledby="scanner-summary-title">
          <div className="native-summary-heading">
            <div>
              <h3 id="scanner-summary-title">Ringkasan Hari Ini</h3>
              <p>Agregasi absensi hari ini sesuai akses akun yang sedang login.</p>
            </div>
          </div>
          {summaryError ? <p className="native-summary-error" role="status">{summaryError}</p> : null}
          <div className="v2-stat-grid one">
            <SummaryStat label="Masuk" value={summary.total_records} />
            <SummaryStat label="Pulang" value={summary.checked_out_records} />
            <SummaryStat label="Terlambat" value={summary.late_records} />
          </div>
          <div className="v2-security-note"><ShieldCheck /><p>QR hanya diproses oleh Admin atau Guru yang sedang login.</p></div>
        </section>
      </div>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return <div className="v2-stat mini"><div><small>{label}</small><strong>{value}</strong></div></div>
}
