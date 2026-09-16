import './attendance-success-feedback.css'

type ParsedAttendance = {
  name: string
  action: 'masuk' | 'pulang'
  time: string
  status?: string
}

let installed = false
let audioContext: AudioContext | null = null
let hideTimer: number | null = null
let lastNotification = { text: '', at: 0 }

function getAudioContext() {
  if (audioContext) return audioContext
  const AudioContextClass = window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return null
  audioContext = new AudioContextClass()
  return audioContext
}

async function primeAudio() {
  const context = getAudioContext()
  if (context?.state === 'suspended') {
    try {
      await context.resume()
    } catch {
      // Browser may still require another user interaction.
    }
  }
}

function playSuccessSound() {
  const context = getAudioContext()
  if (!context) return

  const play = async () => {
    if (context.state === 'suspended') {
      try {
        await context.resume()
      } catch {
        return
      }
    }

    const now = context.currentTime
    const master = context.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.11, now + 0.015)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42)
    master.connect(context.destination)

    const first = context.createOscillator()
    first.type = 'sine'
    first.frequency.setValueAtTime(659.25, now)
    first.connect(master)
    first.start(now)
    first.stop(now + 0.16)

    const second = context.createOscillator()
    second.type = 'sine'
    second.frequency.setValueAtTime(987.77, now + 0.13)
    second.connect(master)
    second.start(now + 0.13)
    second.stop(now + 0.42)
  }

  void play()
}

function parseAttendance(text: string): ParsedAttendance | null {
  const legacy = text.match(/^(.+?) berhasil (masuk|pulang) pukul ([0-9.:]+) WIB\.?$/i)
  if (legacy) {
    return {
      name: legacy[1].trim(),
      action: legacy[2].toLowerCase() as ParsedAttendance['action'],
      time: legacy[3],
    }
  }

  const current = text.match(/^(.+?) berhasil (masuk|pulang) · ([0-9.:]+) WIB · (.+)$/i)
  if (!current) return null
  return {
    name: current[1].trim(),
    action: current[2].toLowerCase() as ParsedAttendance['action'],
    time: current[3],
    status: current[4].trim(),
  }
}

function createPopup() {
  const popup = document.createElement('section')
  popup.className = 'attendance-success-popup'
  popup.setAttribute('role', 'status')
  popup.setAttribute('aria-live', 'assertive')
  popup.setAttribute('aria-atomic', 'true')
  popup.innerHTML = `
    <div class="attendance-success-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6 9 17l-5-5"></path>
      </svg>
    </div>
    <div class="attendance-success-copy">
      <span class="attendance-success-kicker">ABSENSI BERHASIL</span>
      <strong class="attendance-success-name"></strong>
      <div class="attendance-success-meta">
        <span class="attendance-success-action"></span>
        <span class="attendance-success-time"></span>
        <span class="attendance-success-status"></span>
      </div>
    </div>
    <div class="attendance-success-progress" aria-hidden="true"><i></i></div>
  `
  document.body.appendChild(popup)
  return popup
}

function showPopup(text: string) {
  const parsed = parseAttendance(text)
  if (!parsed) return

  let popup = document.querySelector<HTMLElement>('.attendance-success-popup')
  if (!popup) popup = createPopup()

  const name = popup.querySelector<HTMLElement>('.attendance-success-name')
  const action = popup.querySelector<HTMLElement>('.attendance-success-action')
  const time = popup.querySelector<HTMLElement>('.attendance-success-time')
  const status = popup.querySelector<HTMLElement>('.attendance-success-status')
  const progress = popup.querySelector<HTMLElement>('.attendance-success-progress i')

  if (name) name.textContent = parsed.name
  if (action) action.textContent = parsed.action === 'masuk' ? 'Masuk' : 'Pulang'
  if (time) time.textContent = `${parsed.time} WIB`
  if (status) {
    status.textContent = parsed.status ?? ''
    status.hidden = !parsed.status
  }

  popup.classList.remove('show')
  if (progress) {
    progress.style.animation = 'none'
    void progress.offsetWidth
    progress.style.animation = ''
  }
  requestAnimationFrame(() => popup?.classList.add('show'))

  if (hideTimer !== null) window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => {
    popup?.classList.remove('show')
  }, 2000)

  // Portal V2 already plays its own success tone. Keep this sound only for the legacy scanner.
  if (!parsed.status) playSuccessSound()
}

function inspectFeedback() {
  const success = document.querySelector<HTMLElement>('.v2-scan-feedback.success, .scan-feedback.success')
  const text = success?.textContent?.trim() ?? ''
  if (!text || !text.includes('berhasil')) return

  const now = Date.now()
  if (lastNotification.text === text && now - lastNotification.at < 2500) return
  lastNotification = { text, at: now }
  showPopup(text)
}

export function installAttendanceSuccessFeedback() {
  if (installed || typeof document === 'undefined') return
  installed = true

  const prime = () => { void primeAudio() }
  window.addEventListener('pointerdown', prime, { once: true, passive: true })
  window.addEventListener('keydown', prime, { once: true })

  const observer = new MutationObserver(inspectFeedback)
  const start = () => {
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    })
    inspectFeedback()
  }

  if (document.body) start()
  else window.addEventListener('DOMContentLoaded', start, { once: true })
}
