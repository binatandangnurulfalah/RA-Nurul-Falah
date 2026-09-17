import { lazy, Suspense, type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { KeyRound, Mail, ShieldCheck } from 'lucide-react'
import AdminMfaGate from './AdminMfaGate'
import { type AppRole, supabase, type UserProfile } from './lib/supabase'
import { validatePassword } from './lib/auth-utils.js'

const RolePortal = lazy(() => import('./RolePortal'))

const ROLE_PATHS: Record<AppRole, string> = {
  admin: '/admin',
  teacher: '/guru',
  parent: '/orang-tua',
}

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

async function fetchActiveProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data?.is_active) return null
  return data as UserProfile
}

function App() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const isLocalPreview = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
  const previewRoleParam = isLocalPreview ? new URLSearchParams(window.location.search).get('previewRole') : null
  const previewRole = isAppRole(previewRoleParam) ? previewRoleParam : null

  useEffect(() => {
    let mounted = true

    const loadProfile = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!mounted) return

      if (!session?.user) {
        setProfile(null)
        setLoading(false)
        return
      }

      const activeProfile = await fetchActiveProfile(session.user.id)
      if (!mounted) return

      if (!activeProfile) {
        await supabase.auth.signOut()
        setProfile(null)
      } else {
        setProfile(activeProfile)
      }
      setLoading(false)
    }

    void loadProfile()

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setLoading(false)
        navigate('/password-baru', { replace: true })
        return
      }
      void loadProfile()
    })
    const verifyVisibleSession = () => {
      if (document.visibilityState !== 'visible') return
      void supabase.auth.getUser().then(async ({ data, error }) => {
        if (!mounted || (!error && data.user)) return
        await supabase.auth.signOut()
        if (mounted) {
          setProfile(null)
          setLoading(false)
        }
      })
    }
    document.addEventListener('visibilitychange', verifyVisibleSession)

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', verifyVisibleSession)
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

  return (
    <Suspense fallback={<CenteredMessage text="Memuat portal..." />}>
      <Routes>
        <Route path="/login" element={profile ? <RoleRedirect profile={profile} /> : <LoginPage />} />
        <Route path="/lupa-password" element={<ForgotPasswordPage />} />
        <Route path="/verifikasi-kode" element={<VerifyOtpPage />} />
        <Route path="/password-baru" element={<NewPasswordPage />} />
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
  if (role === 'admin') return <AdminMfaGate>{children}</AdminMfaGate>
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

    const userProfile = await fetchActiveProfile(data.user.id)
    if (!userProfile) {
      await supabase.auth.signOut()
      setError('Akun tidak aktif atau belum disiapkan oleh administrator.')
      setBusy(false)
      return
    }

    navigate(rolePath(userProfile.role), { replace: true })
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

    await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })

    sessionStorage.setItem('ra_recovery_email', email.trim())
    setMessage('Jika email terdaftar, kode verifikasi akan dikirim ke email tersebut.')
    setBusy(false)
    setTimeout(() => navigate('/verifikasi-kode'), 900)
  }

  return (
    <AuthLayout title="Lupa password" subtitle="Masukkan email akun Anda untuk menerima kode verifikasi.">
      <form onSubmit={submit} className="form-stack">
        <Field icon={<Mail size={18} />} label="Email" type="email" value={email} onChange={setEmail} placeholder="nama@email.com" />
        {message && <div className="alert success">{message}</div>}
        <button className="primary-button" disabled={busy}>
          {busy ? 'Mengirim...' : 'Kirim kode verifikasi'}
        </button>
        <button type="button" className="secondary-button" onClick={() => navigate('/login')}>
          Kembali ke login
        </button>
      </form>
    </AuthLayout>
  )
}

function VerifyOtpPage() {
  const navigate = useNavigate()
  const email = sessionStorage.getItem('ra_recovery_email') ?? ''
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!email) return <Navigate to="/lupa-password" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')

    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (verifyError) {
      setError('Kode verifikasi salah atau sudah kedaluwarsa.')
      setBusy(false)
      return
    }

    navigate('/password-baru', { replace: true })
  }

  return (
    <AuthLayout title="Verifikasi kode" subtitle={`Masukkan kode 6 digit yang dikirim ke ${maskEmail(email)}.`}>
      <form onSubmit={submit} className="form-stack">
        <label className="field-label">Kode verifikasi</label>
        <input
          className="otp-input"
          inputMode="numeric"
          maxLength={6}
          value={token}
          onChange={(event) => setToken(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
        />
        {error && <div className="alert error">{error}</div>}
        <button className="primary-button" disabled={busy || token.length !== 6}>
          {busy ? 'Memverifikasi...' : 'Verifikasi'}
        </button>
      </form>
    </AuthLayout>
  )
}

function NewPasswordPage() {
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

    setMessage('Password berhasil diperbarui. Anda akan diarahkan ke halaman login dalam 5 detik.')
    sessionStorage.removeItem('ra_recovery_email')
    setTimeout(async () => {
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
    }, 5000)
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

function CenteredMessage({ text }: { text: string }) {
  return <div className="centered-message">{text}</div>
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, name.length - 1))}@${domain}`
}

export default App
