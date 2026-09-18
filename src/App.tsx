import { lazy, Suspense, type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { type AppRole, supabase, type UserProfile } from './lib/supabase'
import { validatePassword } from './lib/auth-utils.js'

const RolePortal = lazy(() => import('./RolePortal'))

const ROLE_PATHS: Record<AppRole, string> = {
  admin: '/admin',
  teacher: '/guru',
  parent: '/orang-tua',
}

const RECOVERY_SESSION_KEY = 'ra_password_recovery_ready'
const PROFILE_RECHECK_MS = 5 * 60_000
const IDLE_SESSION_MS = 8 * 60 * 60_000
const LAST_ACTIVITY_KEY = 'ra_last_activity_at'
const AUTH_NOTICE_KEY = 'ra_auth_notice'

const PREVIEW_NAMES: Record<AppRole, string> = {
  admin: 'Administrator RA Nurul Falah',
  teacher: 'Siti Aminah, S.Pd.',
  parent: 'Bapak Ahmad',
}

function isAppRole(value: string | null): value is AppRole {
  return value === 'admin' || value === 'teacher' || value === 'parent'
}

function rolePath(role: AppRole) {
  return ROLE_PATHS[role]
}

function authRedirectUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

function clearRecoverySession() {
  sessionStorage.removeItem(RECOVERY_SESSION_KEY)
}

function markRecoverySession() {
  sessionStorage.setItem(RECOVERY_SESSION_KEY, '1')
}

type ActiveProfileResult =
  | { status: 'active'; profile: UserProfile }
  | { status: 'inactive' }
  | { status: 'unavailable' }

function isConnectivityError(error: unknown) {
  if (!navigator.onLine) return true
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '')
  return /fetch failed|failed to fetch|network|load failed|timeout|connection/i.test(message)
}

async function fetchActiveProfile(userId: string): Promise<ActiveProfileResult> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) return { status: 'unavailable' }
  if (!data?.is_active) return { status: 'inactive' }
  return { status: 'active', profile: data as UserProfile }
}

function App() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileUnavailable, setProfileUnavailable] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(() => sessionStorage.getItem(RECOVERY_SESSION_KEY) === '1')
  const isLocalPreview = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
  const previewRoleParam = isLocalPreview ? new URLSearchParams(window.location.search).get('previewRole') : null
  const previewRole = isAppRole(previewRoleParam) ? previewRoleParam : null

  useEffect(() => {
    let mounted = true

    const clearLocalSession = async (notice?: string) => {
      if (notice) sessionStorage.setItem(AUTH_NOTICE_KEY, notice)
      await supabase.auth.signOut({ scope: 'local' })
      if (!mounted) return
      clearRecoverySession()
      localStorage.removeItem(LAST_ACTIVITY_KEY)
      setRecoveryReady(false)
      setProfile(null)
      setProfileUnavailable(false)
      setLoading(false)
    }

    const loadProfile = async () => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()
      if (!mounted) return

      if (sessionError || !session?.user) {
        if (sessionError && isConnectivityError(sessionError)) {
          setProfileUnavailable(true)
          setLoading(false)
          return
        }
        await clearLocalSession()
        return
      }

      const { data: verified, error: verifyError } = await supabase.auth.getUser()
      if (!mounted) return
      if (verifyError || !verified.user) {
        if (verifyError && isConnectivityError(verifyError)) {
          setProfileUnavailable(true)
          setLoading(false)
          return
        }
        await clearLocalSession('Sesi login telah berakhir. Silakan masuk kembali.')
        return
      }

      const profileResult = await fetchActiveProfile(verified.user.id)
      if (!mounted) return

      if (profileResult.status === 'unavailable') {
        setProfileUnavailable(true)
        setLoading(false)
        return
      }

      setProfileUnavailable(false)
      if (profileResult.status === 'inactive') {
        await supabase.auth.signOut()
        if (mounted) {
          clearRecoverySession()
          setRecoveryReady(false)
          setProfile(null)
        }
      } else {
        if (!localStorage.getItem(LAST_ACTIVITY_KEY)) localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()))
        setProfile(profileResult.profile)
      }
      setLoading(false)
    }

    const noteActivity = () => {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()))
    }
    const checkIdleSession = async () => {
      const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || Date.now())
      if (!Number.isFinite(lastActivity) || Date.now() - lastActivity < IDLE_SESSION_MS) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await clearLocalSession('Sesi berakhir karena tidak aktif terlalu lama. Silakan masuk kembali.')
    }

    void loadProfile()

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        markRecoverySession()
        setRecoveryReady(true)
        setProfile(null)
        setLoading(false)
        navigate('/password-baru', { replace: true })
        return
      }
      if (event === 'SIGNED_OUT') {
        clearRecoverySession()
        setRecoveryReady(false)
        setProfile(null)
        setProfileUnavailable(false)
        setLoading(false)
        return
      }
      window.setTimeout(() => { if (mounted) void loadProfile() }, 0)
    })

    const verifyVisibleSession = () => {
      if (document.visibilityState !== 'visible') return
      void checkIdleSession()
      if (navigator.onLine) void loadProfile()
    }
    const retryProfileWhenOnline = () => {
      if (!mounted) return
      void loadProfile()
    }
    const profileRecheck = window.setInterval(() => {
      if (!mounted || document.visibilityState !== 'visible' || !navigator.onLine) return
      void loadProfile()
    }, PROFILE_RECHECK_MS)
    const idleRecheck = window.setInterval(() => {
      if (!mounted) return
      void checkIdleSession()
    }, 60_000)

    for (const eventName of ['pointerdown', 'keydown', 'touchstart'] as const) {
      window.addEventListener(eventName, noteActivity, { passive: true })
    }
    document.addEventListener('visibilitychange', verifyVisibleSession)
    window.addEventListener('online', retryProfileWhenOnline)

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
      window.clearInterval(profileRecheck)
      window.clearInterval(idleRecheck)
      for (const eventName of ['pointerdown', 'keydown', 'touchstart'] as const) {
        window.removeEventListener(eventName, noteActivity)
      }
      document.removeEventListener('visibilitychange', verifyVisibleSession)
      window.removeEventListener('online', retryProfileWhenOnline)
    }
  }, [navigate])

  if (previewRole) {
    return (
      <Suspense fallback={<CenteredMessage text="Memuat portal..." />}>
        <RolePortal
          profile={{
            id: 'preview',
            role: previewRole,
            display_name: PREVIEW_NAMES[previewRole],
            phone: null,
            address: null,
            bio: null,
            is_active: true,
            created_at: '',
            updated_at: '',
          }}
        />
      </Suspense>
    )
  }

  if (loading) return <CenteredMessage text="Memuat sistem..." />
  if (profileUnavailable && !profile) return <OfflineSessionPage />

  return (
    <Suspense fallback={<CenteredMessage text="Memuat portal..." />}>
      <Routes>
        <Route path="/login" element={profile ? <RoleRedirect profile={profile} /> : <LoginPage />} />
        <Route path="/lupa-password" element={<ForgotPasswordPage />} />
        <Route path="/verifikasi-kode" element={<Navigate to="/lupa-password" replace />} />
        <Route path="/password-baru" element={<NewPasswordPage recoveryReady={recoveryReady} onRecoveryComplete={() => { clearRecoverySession(); setRecoveryReady(false) }} />} />
        <Route
          path="/guru/*"
          element={
            <ProtectedRoute profile={profile} role="teacher">
              <RolePortal profile={profile!} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orang-tua/*"
          element={
            <ProtectedRoute profile={profile} role="parent">
              <RolePortal profile={profile!} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute profile={profile} role="admin">
              <RolePortal profile={profile!} />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={profile ? <RoleRedirect profile={profile} /> : <Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}

function ProtectedRoute({ profile, role, children }: { profile: UserProfile | null; role: AppRole; children: ReactNode }) {
  if (!profile?.is_active) return <Navigate to="/login" replace />
  if (profile.role !== role) return <RoleRedirect profile={profile} />
  return <>{children}</>
}

function RoleRedirect({ profile }: { profile: UserProfile }) {
  return <Navigate to={rolePath(profile.role)} replace />
}

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice] = useState(() => {
    const value = sessionStorage.getItem(AUTH_NOTICE_KEY) ?? ''
    sessionStorage.removeItem(AUTH_NOTICE_KEY)
    return value
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError || !data.user) {
      setError('Email atau password tidak benar.')
      setBusy(false)
      return
    }

    const profileResult = await fetchActiveProfile(data.user.id)
    if (profileResult.status === 'unavailable') {
      setError('Profil belum dapat diverifikasi. Periksa koneksi internet lalu coba lagi.')
      setBusy(false)
      return
    }
    if (profileResult.status === 'inactive') {
      await supabase.auth.signOut()
      setError('Akun tidak aktif atau belum disiapkan oleh administrator.')
      setBusy(false)
      return
    }

    navigate(rolePath(profileResult.profile.role), { replace: true })
  }

  return (
    <AuthLayout title="Masuk ke RA Nurul Falah" subtitle="Sistem informasi Raudhatul Athfal Nurul Falah">
      <form onSubmit={submit} className="form-stack">
        <Field icon={<Mail size={18} />} label="Email" type="email" value={email} onChange={setEmail} placeholder="nama@email.com" />
        <Field icon={<KeyRound size={18} />} label="Password" type="password" value={password} onChange={setPassword} placeholder="Masukkan password" />
        <div className="form-row-end">
          <button className="link-button" type="button" onClick={() => navigate('/lupa-password')}>
            Lupa password?
          </button>
        </div>
        {notice && <div className="alert success">{notice}</div>}
        {error && <div className="alert error">{error}</div>}
        <button className="primary-button" disabled={busy}>
          {busy ? 'Memeriksa...' : 'Masuk'}
        </button>
      </form>
      <p className="helper-text">Tidak ada pendaftaran publik. Akun dibuat oleh administrator RA Nurul Falah.</p>
    </AuthLayout>
  )
}

function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)

    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl(),
    })

    setMessage('Jika email terdaftar, tautan pemulihan password akan dikirim. Buka tautan tersebut pada perangkat ini untuk melanjutkan.')
    setBusy(false)
  }

  return (
    <AuthLayout title="Lupa password" subtitle="Masukkan email akun Anda untuk menerima tautan pemulihan yang aman.">
      <form onSubmit={submit} className="form-stack">
        <Field icon={<Mail size={18} />} label="Email" type="email" value={email} onChange={setEmail} placeholder="nama@email.com" />
        {message && <div className="alert success">{message}</div>}
        <button className="primary-button" disabled={busy}>
          {busy ? 'Mengirim...' : 'Kirim tautan pemulihan'}
        </button>
        <button type="button" className="secondary-button" onClick={() => navigate('/login')}>
          Kembali ke login
        </button>
      </form>
    </AuthLayout>
  )
}

function NewPasswordPage({ recoveryReady, onRecoveryComplete }: { recoveryReady: boolean; onRecoveryComplete: () => void }) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const strength = useMemo(() => {
    const groups = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length
    let score = 0
    if (password.length >= 10) score++
    if (groups >= 3) score++
    if (password.length >= 14 && groups >= 4) score++
    return score
  }, [password])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    if (password !== confirm) {
      setError('Konfirmasi password tidak sama.')
      return
    }

    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError('Password gagal diperbarui. Gunakan password yang lebih kuat atau ulangi proses pemulihan.')
      setBusy(false)
      return
    }

    setMessage('Password berhasil diperbarui. Sesi lama akan diakhiri dan Anda diarahkan ke login.')
    onRecoveryComplete()
    window.setTimeout(async () => {
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
    }, 1200)
  }

  if (!recoveryReady) {
    return (
      <AuthLayout title="Tautan pemulihan diperlukan" subtitle="Halaman ini hanya dapat dibuka dari tautan pemulihan password yang masih valid.">
        <div className="form-stack">
          <div className="alert error">Sesi pemulihan tidak tersedia atau sudah kedaluwarsa.</div>
          <button type="button" className="primary-button" onClick={() => navigate('/lupa-password', { replace: true })}>
            Minta tautan baru
          </button>
          <button type="button" className="secondary-button" onClick={() => navigate('/login', { replace: true })}>
            Kembali ke login
          </button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Buat password baru" subtitle="Gunakan password baru yang aman dan mudah Anda ingat.">
      <form onSubmit={submit} className="form-stack">
        <Field icon={<KeyRound size={18} />} label="Password baru" type="password" value={password} onChange={setPassword} placeholder="Minimal 10 karakter" />
        <div className="strength">
          <span className={strength >= 1 ? 'filled' : ''} />
          <span className={strength >= 2 ? 'filled' : ''} />
          <span className={strength >= 3 ? 'filled' : ''} />
        </div>
        <Field icon={<ShieldCheck size={18} />} label="Ulangi password baru" type="password" value={confirm} onChange={setConfirm} placeholder="Ketik ulang password" />
        <p className="helper-text">Minimal 10 karakter dan gunakan sedikitnya 3 jenis karakter: huruf besar, huruf kecil, angka, atau simbol.</p>
        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}
        <button className="primary-button" disabled={busy || Boolean(message)}>
          {busy ? 'Menyimpan...' : 'Konfirmasi password'}
        </button>
      </form>
    </AuthLayout>
  )
}

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="auth-page">
      <section className="brand-panel">
        <img className="auth-brand-logo" src={`${import.meta.env.BASE_URL}logo-ra-nurul-falah.png`} alt="Logo RA Nurul Falah" />
        <div>
          <p className="eyebrow">Raudhatul Athfal</p>
          <h1>Nurul Falah</h1>
          <p>Sistem informasi sekolah yang aman, sederhana, dan mudah digunakan guru serta orang tua.</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <h2>{title}</h2>
          <p className="subtitle">{subtitle}</p>
          {children}
        </div>
      </section>
    </div>
  )
}

function Field({
  label,
  icon,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string
  icon: ReactNode
  type: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="field-wrap">
      <span className="field-label">{label}</span>
      <span className="input-wrap">
        {icon}
        <input type={type} required value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      </span>
    </label>
  )
}

function OfflineSessionPage() {
  return <div className="centered-message offline-session">
    <div>
      <strong>Koneksi diperlukan untuk membuka sesi</strong>
      <p>Sesi login tidak dihapus. Hubungkan perangkat ke internet agar status akun dapat diverifikasi dengan aman.</p>
      <button type="button" className="primary-button" onClick={() => window.location.reload()}>Coba lagi</button>
    </div>
  </div>
}

function CenteredMessage({ text }: { text: string }) {
  return <div className="centered-message">{text}</div>
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, name.length - 1))}@${domain}`
}

export default App