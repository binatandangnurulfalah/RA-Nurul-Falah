import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { KeyRound, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { AppRole, supabase, UserProfile } from './lib/supabase'

function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const loadProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return

      if (!session?.user) {
        setProfile(null)
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (!mounted) return
      if (error || !data || !data.is_active) {
        await supabase.auth.signOut()
        setProfile(null)
      } else {
        setProfile(data as UserProfile)
      }
      setLoading(false)
    }

    loadProfile()

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      loadProfile()
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (loading) return <CenteredMessage text="Memuat sistem..." />

  return (
    <Routes>
      <Route path="/login" element={profile ? <RoleRedirect profile={profile} /> : <LoginPage />} />
      <Route path="/lupa-password" element={<ForgotPasswordPage />} />
      <Route path="/verifikasi-kode" element={<VerifyOtpPage />} />
      <Route path="/password-baru" element={<NewPasswordPage />} />
      <Route path="/guru/*" element={<ProtectedRoute profile={profile} role="teacher"><DashboardShell profile={profile!} /></ProtectedRoute>} />
      <Route path="/orang-tua/*" element={<ProtectedRoute profile={profile} role="parent"><DashboardShell profile={profile!} /></ProtectedRoute>} />
      <Route path="/admin/*" element={<ProtectedRoute profile={profile} role="admin"><DashboardShell profile={profile!} /></ProtectedRoute>} />
      <Route path="*" element={profile ? <RoleRedirect profile={profile} /> : <Navigate to="/login" replace />} />
    </Routes>
  )
}

function ProtectedRoute({ profile, role, children }: { profile: UserProfile | null; role: AppRole; children: React.ReactNode }) {
  if (!profile) return <Navigate to="/login" replace />
  if (!profile.is_active) return <Navigate to="/login" replace />
  if (profile.role !== role) return <RoleRedirect profile={profile} />
  return <>{children}</>
}

function RoleRedirect({ profile }: { profile: UserProfile }) {
  if (profile.role === 'teacher') return <Navigate to="/guru" replace />
  if (profile.role === 'parent') return <Navigate to="/orang-tua" replace />
  return <Navigate to="/admin" replace />
}

function LoginPage() {
  const navigate = useNavigate()
  const [role, setRole] = useState<'teacher' | 'parent'>('teacher')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError || !data.user) {
      setError('Email atau password tidak benar.')
      setBusy(false)
      return
    }

    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', data.user.id)
      .single()

    if (profileError || !userProfile || !userProfile.is_active) {
      await supabase.auth.signOut()
      setError('Akun tidak aktif atau belum disiapkan oleh administrator.')
      setBusy(false)
      return
    }

    if (userProfile.role !== role) {
      await supabase.auth.signOut()
      setError(role === 'teacher' ? 'Akun ini bukan akun guru.' : 'Akun ini bukan akun orang tua/wali.')
      setBusy(false)
      return
    }

    navigate(role === 'teacher' ? '/guru' : '/orang-tua', { replace: true })
  }

  return (
    <AuthLayout title="Masuk ke RA Nurul Falah" subtitle="Sistem informasi Raudhatul Athfal Nurul Falah">
      <div className="role-switch">
        <button className={role === 'teacher' ? 'active' : ''} onClick={() => setRole('teacher')} type="button">Guru</button>
        <button className={role === 'parent' ? 'active' : ''} onClick={() => setRole('parent')} type="button">Orang Tua</button>
      </div>
      <form onSubmit={submit} className="form-stack">
        <Field icon={<Mail size={18} />} label="Email" type="email" value={email} onChange={setEmail} placeholder="nama@email.com" />
        <Field icon={<KeyRound size={18} />} label="Password" type="password" value={password} onChange={setPassword} placeholder="Masukkan password" />
        <div className="form-row-end"><button className="link-button" type="button" onClick={() => navigate('/lupa-password')}>Lupa password?</button></div>
        {error && <div className="alert error">{error}</div>}
        <button className="primary-button" disabled={busy}>{busy ? 'Memeriksa...' : 'Masuk'}</button>
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
        <button className="primary-button" disabled={busy}>{busy ? 'Mengirim...' : 'Kirim kode verifikasi'}</button>
        <button type="button" className="secondary-button" onClick={() => navigate('/login')}>Kembali ke login</button>
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
        <input className="otp-input" inputMode="numeric" maxLength={6} value={token} onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" />
        {error && <div className="alert error">{error}</div>}
        <button className="primary-button" disabled={busy || token.length !== 6}>{busy ? 'Memverifikasi...' : 'Verifikasi'}</button>
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
    let score = 0
    if (password.length >= 8) score++
    if (/[A-Za-z]/.test(password)) score++
    if (/\d/.test(password)) score++
    return score
  }, [password])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('Password minimal 8 karakter dan harus berisi huruf serta angka.')
      return
    }
    if (password !== confirm) {
      setError('Konfirmasi password tidak sama.')
      return
    }

    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError('Password gagal diperbarui. Silakan ulangi proses lupa password.')
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
        <Field icon={<KeyRound size={18} />} label="Password baru" type="password" value={password} onChange={setPassword} placeholder="Minimal 8 karakter" />
        <div className="strength"><span className={strength >= 1 ? 'filled' : ''} /><span className={strength >= 2 ? 'filled' : ''} /><span className={strength >= 3 ? 'filled' : ''} /></div>
        <Field icon={<ShieldCheck size={18} />} label="Ulangi password baru" type="password" value={confirm} onChange={setConfirm} placeholder="Ketik ulang password" />
        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}
        <button className="primary-button" disabled={busy || Boolean(message)}>{busy ? 'Menyimpan...' : 'Konfirmasi password'}</button>
      </form>
    </AuthLayout>
  )
}

function DashboardShell({ profile }: { profile: UserProfile }) {
  const navigate = useNavigate()
  const location = useLocation()
  const roleLabel = profile.role === 'teacher' ? 'Guru' : profile.role === 'parent' ? 'Orang Tua' : 'Administrator'

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="dashboard-page">
      <header className="topbar">
        <div>
          <strong>RA Nurul Falah</strong>
          <span>{roleLabel}</span>
        </div>
        <button className="logout-button" onClick={logout}><LogOut size={18} /> Keluar</button>
      </header>
      <main className="dashboard-content">
        <div className="welcome-card">
          <div className="avatar"><UserRound size={28} /></div>
          <div>
            <p>Selamat datang</p>
            <h1>{profile.display_name || roleLabel}</h1>
            <small>{location.pathname}</small>
          </div>
        </div>
        <div className="placeholder-card">
          <h2>Autentikasi berhasil</h2>
          <p>Akun aktif dan role berhasil diverifikasi dari database. Dashboard fitur sekolah akan dibangun pada tahap berikutnya.</p>
        </div>
      </main>
    </div>
  )
}

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <section className="brand-panel">
        <div className="brand-mark">RA</div>
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

function Field({ label, icon, type, value, onChange, placeholder }: { label: string; icon: React.ReactNode; type: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="field-wrap">
      <span className="field-label">{label}</span>
      <span className="input-wrap">{icon}<input type={type} required value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></span>
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
