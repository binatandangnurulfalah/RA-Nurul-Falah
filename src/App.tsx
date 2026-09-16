import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { KeyRound, LogOut, Mail, ShieldCheck, UserPlus, UserRound, UsersRound } from 'lucide-react'
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
      <Route path="/guru/*" element={<ProtectedRoute profile={profile} role="teacher"><DashboardShell profile={profile!}><RolePlaceholder role="Guru" /></DashboardShell></ProtectedRoute>} />
      <Route path="/orang-tua/*" element={<ProtectedRoute profile={profile} role="parent"><DashboardShell profile={profile!}><RolePlaceholder role="Orang Tua" /></DashboardShell></ProtectedRoute>} />
      <Route path="/admin/*" element={<ProtectedRoute profile={profile} role="admin"><DashboardShell profile={profile!}><AdminDashboard /></DashboardShell></ProtectedRoute>} />
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
  const [role, setRole] = useState<AppRole>('teacher')
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
      const roleName = role === 'teacher' ? 'guru' : role === 'parent' ? 'orang tua/wali' : 'administrator'
      setError(`Akun ini bukan akun ${roleName}.`)
      setBusy(false)
      return
    }

    navigate(role === 'teacher' ? '/guru' : role === 'parent' ? '/orang-tua' : '/admin', { replace: true })
  }

  return (
    <AuthLayout title="Masuk ke RA Nurul Falah" subtitle="Sistem informasi Raudhatul Athfal Nurul Falah">
      <div className="role-switch">
        <button className={role === 'teacher' ? 'active' : ''} onClick={() => setRole('teacher')} type="button">Guru</button>
        <button className={role === 'parent' ? 'active' : ''} onClick={() => setRole('parent')} type="button">Orang Tua</button>
        <button className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')} type="button">Admin</button>
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

function DashboardShell({ profile, children }: { profile: UserProfile; children: React.ReactNode }) {
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
        {children}
      </main>
    </div>
  )
}

type AccountRow = Pick<UserProfile, 'id' | 'role' | 'display_name' | 'is_active' | 'created_at'>

function AdminDashboard() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id,role,display_name,is_active,created_at')
      .order('created_at', { ascending: false })

    if (error) setLoadError('Daftar akun belum dapat dimuat. Silakan coba lagi.')
    setAccounts((data as AccountRow[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  const teachers = accounts.filter((account) => account.role === 'teacher').length
  const parents = accounts.filter((account) => account.role === 'parent').length

  return (
    <>
      <section className="stats-grid" aria-label="Ringkasan akun">
        <StatCard icon={<UsersRound size={22} />} label="Semua akun" value={accounts.length} />
        <StatCard icon={<UserRound size={22} />} label="Guru" value={teachers} />
        <StatCard icon={<UserRound size={22} />} label="Orang tua" value={parents} />
      </section>

      <section className="management-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Manajemen pengguna</p>
            <h2>Akun Guru dan Orang Tua</h2>
            <p>Buat akun baru tanpa membuka pendaftaran publik.</p>
          </div>
          <button className="primary-button inline-button" onClick={() => setFormOpen((value) => !value)}>
            <UserPlus size={18} /> {formOpen ? 'Tutup formulir' : 'Tambah akun'}
          </button>
        </div>

        {formOpen && <CreateAccountForm onCreated={() => { setFormOpen(false); loadAccounts() }} />}
        {loadError && <div className="alert error">{loadError}</div>}

        <div className="account-list">
          <div className="account-list-header"><span>Nama</span><span>Role</span><span>Status</span></div>
          {loading && <div className="empty-state">Memuat daftar akun...</div>}
          {!loading && accounts.length === 0 && <div className="empty-state">Belum ada akun.</div>}
          {!loading && accounts.map((account) => (
            <div className="account-row" key={account.id}>
              <div className="account-identity">
                <span className="small-avatar">{initials(account.display_name)}</span>
                <div><strong>{account.display_name || 'Tanpa nama'}</strong><small>Dibuat {formatDate(account.created_at)}</small></div>
              </div>
              <span className={`role-badge ${account.role}`}>{roleLabel(account.role)}</span>
              <span className={`status-badge ${account.is_active ? 'active' : 'inactive'}`}>{account.is_active ? 'Aktif' : 'Nonaktif'}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function CreateAccountForm({ onCreated }: { onCreated: () => void }) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'teacher' | 'parent'>('teacher')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('Password minimal 8 karakter dan harus berisi huruf serta angka.')
      setBusy(false)
      return
    }

    const { data, error: invokeError } = await supabase.functions.invoke('admin-create-user', {
      body: {
        email: email.trim().toLowerCase(),
        password,
        display_name: displayName.trim(),
        role,
      },
    })

    if (invokeError || !data?.ok) {
      let message = data?.error || 'Akun gagal dibuat. Periksa kembali data atau coba beberapa saat lagi.'
      const context = (invokeError as { context?: Response } | null)?.context
      if (context) {
        try {
          const responseBody = await context.clone().json()
          if (responseBody?.error) message = responseBody.error
        } catch {
          // Gunakan pesan aman di atas jika respons bukan JSON.
        }
      }
      setError(message)
      setBusy(false)
      return
    }

    setSuccess(`Akun ${role === 'teacher' ? 'guru' : 'orang tua'} berhasil dibuat.`)
    setBusy(false)
    setTimeout(onCreated, 900)
  }

  return (
    <form className="create-account-form" onSubmit={submit}>
      <div className="form-title"><UserPlus size={20} /><div><strong>Tambah akun baru</strong><small>Email langsung dikonfirmasi oleh sistem.</small></div></div>
      <div className="form-grid">
        <Field icon={<UserRound size={18} />} label="Nama lengkap" type="text" value={displayName} onChange={setDisplayName} placeholder="Nama guru atau orang tua" />
        <Field icon={<Mail size={18} />} label="Email" type="email" value={email} onChange={setEmail} placeholder="nama@email.com" />
        <Field icon={<KeyRound size={18} />} label="Password sementara" type="password" value={password} onChange={setPassword} placeholder="Minimal 8 karakter" />
        <label className="field-wrap">
          <span className="field-label">Jenis akun</span>
          <select value={role} onChange={(event) => setRole(event.target.value as 'teacher' | 'parent')}>
            <option value="teacher">Guru</option>
            <option value="parent">Orang Tua/Wali</option>
          </select>
        </label>
      </div>
      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}
      <div className="form-actions"><button className="primary-button" disabled={busy || Boolean(success)}>{busy ? 'Membuat akun...' : 'Buat akun'}</button></div>
    </form>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="stat-card"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>
}

function RolePlaceholder({ role }: { role: string }) {
  return <div className="placeholder-card"><h2>Autentikasi berhasil</h2><p>Dashboard {role} akan diisi dengan fitur sekolah pada tahap berikutnya.</p></div>
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

function roleLabel(role: AppRole) {
  if (role === 'teacher') return 'Guru'
  if (role === 'parent') return 'Orang Tua'
  return 'Admin'
}

function initials(name: string | null) {
  if (!name) return 'A'
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

export default App

