import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, CameraOff, CheckCircle2, QrCode, RefreshCw, ShieldCheck } from 'lucide-react'
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
type DetectedBarcode = { rawValue: string }
type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

type CameraAttempt = {
  label: string
  constraints: MediaTrackConstraints
  deviceId?: string
}

const JAKARTA = 'Asia/Jakarta'
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA }).format(new Date())
const SCAN_INTERVAL = 280

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
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [manual, setManual] = useState('')
  const [active, setActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [cameraLabel, setCameraLabel] = useState('')
  const [cameraCount, setCameraCount] = useState(0)
  const [decoderAvailable, setDecoderAvailable] = useState(true)
  const [feedback, setFeedback] = useState<Feedback>({ tone: 'info', text: 'Kamera belum diaktifkan.' })

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const devicesRef = useRef<MediaDeviceInfo[]>([])
  const selectedDeviceRef = useRef<string | null>(null)
  const detectorRef = useRef<BarcodeDetectorLike | null>(null)
  const scanTimerRef = useRef<number | null>(null)
  const decodingRef = useRef(false)
  const busyRef = useRef(false)
  const lastScanRef = useRef<{ token: string; at: number } | null>(null)

  const load = async () => {
    const { data } = await supabase
      .from('attendance_records')
      .select('id,attendance_date,check_in,check_out,status')
      .order('created_at', { ascending: false })
      .limit(40)
    setRecords((data as AttendanceRecord[] | null) ?? [])
  }

  useEffect(() => {
    void load()
    return () => stopCamera(true)
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
      setManual('')
      navigator.vibrate?.(120)
      playSuccess()
      lastScanRef.current = { token: cleanToken, at: Date.now() }
      await load()
      return true
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
    setActive(false)
    setStarting(false)
    setCameraLabel('')
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
    const deadline = Date.now() + 5000
    while ((video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 80))
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
    let luminanceTotal = 0
    let darkPixels = 0
    let samples = 0
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      const luminance = (r * 0.2126) + (g * 0.7152) + (b * 0.0722)
      luminanceTotal += luminance
      if (r < 8 && g < 8 && b < 8) darkPixels += 1
      samples += 1
    }
    const average = luminanceTotal / Math.max(1, samples)
    const blackRatio = darkPixels / Math.max(1, samples)
    return average < 4 && blackRatio > 0.97
  }

  const verifyVisibleFrame = async (video: HTMLVideoElement) => {
    await new Promise((resolve) => window.setTimeout(resolve, 550))
    const firstBlack = frameIsBlack(video)
    if (!firstBlack) return true
    await new Promise((resolve) => window.setTimeout(resolve, 650))
    return !frameIsBlack(video)
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
    setCameraLabel(track.label || inputs.find((item) => item.deviceId === settings.deviceId)?.label || fallbackLabel || 'Kamera perangkat')
    setActive(true)

    const decoderReady = prepareDetector()
    if (decoderReady) {
      setFeedback({ tone: 'info', text: 'Kamera belakang aktif. Arahkan QR murid ke kotak pemindai.' })
      scheduleDecode()
    } else {
      setFeedback({ tone: 'error', text: 'Kamera aktif, tetapi browser ini belum mendukung pembacaan QR otomatis. Gunakan Chrome terbaru atau masukkan kode QR secara manual.' })
    }
  }

  const startCamera = async (deviceId?: string) => {
    if (starting) return
    setStarting(true)
    setFeedback({ tone: 'info', text: deviceId ? 'Membuka kamera yang dipilih...' : 'Mencari kamera belakang utama...' })
    stopDecodeLoop()
    releaseStream()

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Browser ini tidak mendukung akses kamera melalui HTTPS.')

      if (deviceId) {
        const stream = await openAttempt({
          label: 'kamera pilihan',
          deviceId,
          constraints: { deviceId: { exact: deviceId } },
        })
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
        } catch (error) {
          lastError = error
        }
      }

      const inputs = await refreshDeviceList()
      const rearCandidates = inputs.filter((item) => !isClearlyFrontCamera(item.label))
      for (const camera of rearCandidates) {
        try {
          setFeedback({ tone: 'info', text: `Mencoba kamera belakang lain${camera.label ? ` · ${camera.label}` : ''}...` })
          const stream = await openAttempt({
            label: camera.label || 'kamera belakang lain',
            deviceId: camera.deviceId,
            constraints: { deviceId: { exact: camera.deviceId } },
          })
          await activateWorkingStream(stream, camera.label)
          return
        } catch (error) {
          lastError = error
        }
      }

      throw lastError instanceof Error ? lastError : new Error('Semua sensor kamera belakang terdeteksi gelap.')
    } catch (error) {
      stopCamera(true)
      const message = error instanceof Error && /gelap/i.test(error.message)
        ? 'Kamera belakang terdeteksi, tetapi semua sensor belakang menghasilkan frame gelap. Coba tombol Ganti Kamera setelah membuka kamera depan, atau tutup aplikasi kamera lain lalu coba kembali.'
        : friendlyCameraError(error)
      setFeedback({ tone: 'error', text: message })
    } finally {
      setStarting(false)
    }
  }

  const switchCamera = async () => {
    const devices = devicesRef.current.length ? devicesRef.current : await refreshDeviceList()
    if (devices.length < 2 || starting) return
    const current = selectedDeviceRef.current
    const currentIndex = Math.max(0, devices.findIndex((item) => item.deviceId === current))
    for (let offset = 1; offset <= devices.length; offset += 1) {
      const next = devices[(currentIndex + offset) % devices.length]
      try {
        await startCamera(next.deviceId)
        return
      } catch { /* startCamera menampilkan error sendiri */ }
    }
  }

  const todayRows = records.filter((row) => row.attendance_date === TODAY)

  return (
    <div className="v2-stack native-scanner-page">
      <PageTitle eyebrow="ABSENSI QR" title="Scan Kehadiran" text="Kamera dibuat langsung oleh browser. Sistem otomatis mencari sensor kamera belakang yang benar-benar menghasilkan gambar." />
      <div className="v2-two-col scanner">
        <section className="v2-panel native-scanner-panel">
          <div className={`native-camera ${active ? 'active' : ''}`}>
            <video ref={videoRef} muted playsInline autoPlay />
            {active && <div className="native-camera-guide" aria-hidden="true"><span /><span /><span /><span /></div>}
            {!active && (
              <div className="native-camera-empty">
                <span><Camera size={58} /></span>
                <h3>Kamera siap digunakan</h3>
                <p>Tekan tombol di bawah. Sistem akan mencari kamera belakang utama dan melewati sensor yang menghasilkan layar hitam.</p>
                <button className="v2-primary" disabled={starting} onClick={() => void startCamera()}>
                  <Camera size={18} /> {starting ? 'Mencari Kamera...' : 'Aktifkan Kamera Belakang'}
                </button>
              </div>
            )}
          </div>

          {active && (
            <div className="native-camera-actions">
              <button className="v2-secondary" onClick={() => stopCamera(false)}><CameraOff size={17} /> Hentikan</button>
              {cameraCount > 1 && <button className="v2-secondary" disabled={starting} onClick={() => void switchCamera()}><RefreshCw size={17} /> Ganti Kamera</button>}
            </div>
          )}
          {active && cameraLabel && <small className="native-camera-name">Kamera aktif: {cameraLabel}</small>}

          <div className={`v2-scan-feedback ${feedback.tone}`}>
            {feedback.tone === 'success' ? <CheckCircle2 /> : feedback.tone === 'error' ? <AlertTriangle /> : <QrCode />}
            <span>{feedback.text}</span>
          </div>

          {!decoderAvailable && active && <p className="native-decoder-note">Preview kamera tetap berfungsi. Pembacaan QR otomatis memerlukan browser Chrome/Android yang mendukung Barcode Detection API.</p>}

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
          <div className="v2-stat-grid one">
            <SummaryStat label="Masuk" value={todayRows.filter((row) => row.check_in).length} />
            <SummaryStat label="Pulang" value={todayRows.filter((row) => row.check_out).length} />
            <SummaryStat label="Terlambat" value={todayRows.filter((row) => row.status === 'late').length} />
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
