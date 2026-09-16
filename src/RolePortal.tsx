import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileText,
  GraduationCap,
  Home,
  LogOut,
  Megaphone,
  Menu,
  Plus,
  QrCode,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { type AppRole, supabase, type UserProfile } from './lib/supabase'
import './portal.css'

type NavItem = {
  id: string
  label: string
  icon: typeof Home
}

type Account = Pick<UserProfile, 'id' | 'role' | 'display_name' | 'is_active' | 'created_at'>

type Student = {
  id: string
  full_name: string
  nis: string | null
  nisn: string | null
  gender: 'L' | 'P' | null
  birth_place: string | null
  birth_date: string | null
  class_name: string | null
  academic_year: string | null
  is_active: boolean
  qr_token: string
}

type Attendance = {
  id: string
  attendance_date: string
  check_in: string | null
  check_out: string | null
  status: string
  students?: { full_name: string; class_name: string | null } | null
}

type SchoolSchedule = {
  id: string
  class_name: string
  day_of_week: number
  start_time: string
  end_time: string
  activity: string
  teacher_name: string | null
  academic_year: string
}

type StatTone = 'green' | 'blue' | 'purple' | 'gold'
type BadgeTone = StatTone | 'gray'
type StatItem = [label: string, value: string, meta: string, tone: StatTone]

const JAKARTA_TIME_ZONE = 'Asia/Jakarta'
const JAKARTA_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA_TIME_ZONE })

const menus: Record<AppRole, NavItem[]> = {
  admin: [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'accounts', label: 'Manajemen Akun', icon: UsersRound },
    { id: 'students', label: 'Data Murid', icon: GraduationCap },
    { id: 'attendance', label: 'Scan Absensi', icon: QrCode },
    { id: 'classes', label: 'Kelas & Tahun Ajaran', icon: GraduationCap },
    { id: 'announcements', label: 'Pengumuman', icon: Megaphone },
    { id: 'settings', label: 'Pengaturan', icon: Settings },
  ],
  teacher: [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'attendance', label: 'Absensi', icon: QrCode },
    { id: 'students', label: 'Data Murid', icon: UsersRound },
    { id: 'schedule', label: 'Jadwal', icon: CalendarDays },
    { id: 'announcements', label: 'Pengumuman', icon: Megaphone },
    { id: 'profile', label: 'Profil Saya', icon: UserRound },
  ],
  parent: [
    { id: 'dashboard', label: 'Beranda', icon: Home },
    { id: 'children', label: 'Data Anak', icon: UsersRound },
    { id: 'attendance', label: 'Kehadiran Anak', icon: ClipboardCheck },
    { id: 'schedule', label: 'Jadwal', icon: CalendarDays },
    { id: 'announcements', label: 'Pengumuman', icon: Megaphone },
    { id: 'profile', label: 'Profil Keluarga', icon: UserRound },
  ],
}

export default function RolePortal({ profile }: { profile: UserProfile }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const base = profile.role === 'teacher' ? '/guru' : profile.role === 'parent' ? '/orang-tua' : '/admin'
  const page = location.pathname.split('/')[2] || 'dashboard'
  const menu = menus[profile.role]
  const active = menu.find((item) => item.id === page) ?? menu[0]

  const go = (id: string) => {
    navigate(id === 'dashboard' ? base : `${base}/${id}`)
    setMobileOpen(false)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="portal-shell">
      <aside className={`portal-sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="portal-brand">
          <span>RA</span>
          <div>
            <strong>Nurul Falah</strong>
            <small>Sistem Informasi Sekolah</small>
          </div>
        </div>

        <nav>
          <p className="nav-caption">MENU UTAMA</p>
          {menu.map((item) => (
            <button key={item.id} className={active.id === item.id ? 'active' : ''} onClick={() => go(item.id)}>
              <item.icon size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-user">
          <span className="avatar-soft">{initials(profile.display_name)}</span>
          <div>
            <strong>{profile.display_name || roleName(profile.role)}</strong>
            <small>{roleName(profile.role)}</small>
          </div>
          <button aria-label="Keluar" onClick={logout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {mobileOpen && <button className="sidebar-backdrop" aria-label="Tutup menu" onClick={() => setMobileOpen(false)} />}

      <div className="portal-main">
        <header className="portal-topbar">
          <button className="mobile-menu" aria-label="Buka menu" onClick={() => setMobileOpen(true)}>
            <Menu size={22} />
          </button>
          <div>
            <p>{roleName(profile.role)}</p>
            <h1>{active.label}</h1>
          </div>
          <div className="topbar-actions">
            <button aria-label="Cari data" onClick={() => go(profile.role === 'parent' ? 'children' : 'students')}>
              <Search size={20} />
            </button>
            <button className="notification" aria-label="Buka pengumuman" onClick={() => go('announcements')}>
              <Bell size={20} />
              <i />
            </button>
            <span className="top-avatar">{initials(profile.display_name)}</span>
          </div>
        </header>

        <main className="portal-content">
          {profile.role === 'admin' && <AdminView page={active.id} profile={profile} />}
          {profile.role === 'teacher' && <TeacherView page={active.id} profile={profile} />}
          {profile.role === 'parent' && <ParentView page={active.id} profile={profile} />}
        </main>
      </div>

      <nav className="mobile-bottom-nav">
        {menu.slice(0, 5).map((item) => (
          <button key={item.id} className={active.id === item.id ? 'active' : ''} onClick={() => go(item.id)}>
            <item.icon size={20} />
            <span>{item.label.split(' ')[0]}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function AdminView({ page, profile }: { page: string; profile: UserProfile }) {
  if (page === 'accounts') return <AccountsPage />
  if (page === 'students') return <StudentsPage />
  if (page === 'attendance') return <AttendancePage />
  if (page === 'classes') return <ClassesPage />
  if (page === 'announcements') return <AnnouncementsPage canCreate />
  if (page === 'settings') return <SettingsPage />
  return <AdminDashboard profile={profile} />
}

function AdminDashboard({ profile }: { profile: UserProfile }) {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [studentCount, setStudentCount] = useState(0)
  const [todayAttendance, setTodayAttendance] = useState(0)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      const today = todayInJakarta()
      const [accountsResult, studentsResult, attendanceResult] = await Promise.all([
        supabase.from('user_profiles').select('id,role,display_name,is_active,created_at'),
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('attendance_date', today),
      ])

      if (!mounted) return
      setAccounts((accountsResult.data as Account[] | null) ?? [])
      setStudentCount(studentsResult.count ?? 0)
      setTodayAttendance(attendanceResult.count ?? 0)
    }

    void load()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <PageStack>
      <Hero eyebrow="PANEL ADMINISTRATOR" title={`Selamat datang, ${firstName(profile.display_name)}`} text="Kelola seluruh aktivitas sekolah dari satu tempat." />
      <Stats
        items={[
          ['Total Murid', String(studentCount), 'Aktif terdaftar', 'green'],
          ['Guru Aktif', String(accounts.filter((account) => account.role === 'teacher' && account.is_active).length), 'Tenaga pendidik', 'blue'],
          ['Orang Tua', String(accounts.filter((account) => account.role === 'parent' && account.is_active).length), 'Akun terhubung', 'purple'],
          ['Hadir Hari Ini', String(todayAttendance), `Dari ${studentCount} murid`, 'gold'],
        ]}
      />
      <div className="two-column">
        <Card title="Aktivitas Terbaru" action="Lihat akun" onAction={() => navigate('/admin/accounts')}>
          <ActivityList />
        </Card>
        <Card title="Status Sistem">
          <SystemStatus />
        </Card>
      </div>
    </PageStack>
  )
}

function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | AppRole>('all')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('user_profiles')
      .select('id,role,display_name,is_active,created_at')
      .order('created_at', { ascending: false })
    setAccounts((data as Account[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const query = search.trim().toLowerCase()
  const filtered = accounts.filter(
    (account) =>
      (roleFilter === 'all' || account.role === roleFilter) &&
      (account.display_name || '').toLowerCase().includes(query),
  )

  return (
    <PageStack>
      <PageHeading eyebrow="AKSES PENGGUNA" title="Manajemen Akun" text="Buat dan pantau akun guru serta wali murid." button="Tambah Akun" onClick={() => setForm((value) => !value)} />
      <Stats
        items={[
          ['Semua Akun', String(accounts.length), 'Terdaftar', 'green'],
          ['Guru', String(accounts.filter((account) => account.role === 'teacher').length), 'Tenaga pendidik', 'blue'],
          ['Wali Murid', String(accounts.filter((account) => account.role === 'parent').length), 'Keluarga', 'purple'],
        ]}
      />

      {form && <CreateAccount onDone={() => { setForm(false); void load() }} />}

      <Card title="Daftar Pengguna">
        <div className="toolbar">
          <label>
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama pengguna..." />
          </label>
          <select aria-label="Filter role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'all' | AppRole)}>
            <option value="all">Semua role</option>
            <option value="admin">Admin</option>
            <option value="teacher">Guru</option>
            <option value="parent">Wali Murid</option>
          </select>
        </div>

        <div className="data-table">
          <div className="table-head">
            <span>Pengguna</span>
            <span>Role</span>
            <span>Status</span>
            <span>Dibuat</span>
          </div>
          {loading ? (
            <Empty text="Memuat akun..." />
          ) : filtered.length ? (
            filtered.map((account) => (
              <div className="table-row" key={account.id}>
                <div className="user-cell">
                  <span className="avatar-soft">{initials(account.display_name)}</span>
                  <strong>{account.display_name || 'Tanpa nama'}</strong>
                </div>
                <Badge tone={account.role === 'admin' ? 'gold' : account.role === 'teacher' ? 'blue' : 'purple'}>{roleName(account.role)}</Badge>
                <Badge tone={account.is_active ? 'green' : 'gray'}>{account.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
                <span>{formatDate(account.created_at)}</span>
              </div>
            ))
          ) : (
            <Empty text="Tidak ada akun yang sesuai pencarian." />
          )}
        </div>
      </Card>
    </PageStack>
  )
}

function CreateAccount({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'teacher' | 'parent'>('teacher')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setMessage('')

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setMessage('Password minimal 8 karakter dan harus berisi huruf serta angka.')
      return
    }

    setBusy(true)
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        email: email.trim().toLowerCase(),
        password,
        display_name: name.trim(),
        role,
      },
    })

    if (error || !data?.ok) {
      setMessage(data?.error || 'Akun gagal dibuat. Periksa data lalu coba lagi.')
      setBusy(false)
      return
    }

    setMessage('Akun berhasil dibuat.')
    setTimeout(onDone, 700)
  }

  return (
    <Card title="Tambah Akun Baru">
      <form className="account-form" onSubmit={submit}>
        <label>
          Nama lengkap
          <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama pengguna" />
        </label>
        <label>
          Email
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" />
        </label>
        <label>
          Password sementara
          <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 8 karakter" />
        </label>
        <label>
          Jenis akun
          <select value={role} onChange={(event) => setRole(event.target.value as 'teacher' | 'parent')}>
            <option value="teacher">Guru</option>
            <option value="parent">Orang Tua/Wali</option>
          </select>
        </label>
        {message && <p className="form-message">{message}</p>}
        <button className="accent-button" disabled={busy}>
          {busy ? 'Membuat...' : 'Buat Akun'}
        </button>
      </form>
    </Card>
  )
}

function TeacherView({ page, profile }: { page: string; profile: UserProfile }) {
  if (page === 'attendance') return <AttendancePage />
  if (page === 'students') return <StudentsPage />
  if (page === 'schedule') return <SchedulePage teacher />
  if (page === 'announcements') return <AnnouncementsPage canCreate />
  if (page === 'profile') return <ProfilePage role="teacher" profile={profile} />
  return <TeacherDashboard profile={profile} />
}

function TeacherDashboard({ profile }: { profile: UserProfile }) {
  const navigate = useNavigate()
  const [students, setStudents] = useState(0)
  const [records, setRecords] = useState<Attendance[]>([])

  useEffect(() => {
    let mounted = true

    const load = async () => {
      const today = todayInJakarta()
      const [studentsResult, attendanceResult] = await Promise.all([
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('attendance_records').select('id,attendance_date,check_in,check_out,status').eq('attendance_date', today),
      ])

      if (!mounted) return
      setStudents(studentsResult.count ?? 0)
      setRecords((attendanceResult.data as Attendance[] | null) ?? [])
    }

    void load()
    return () => {
      mounted = false
    }
  }, [])

  const present = records.filter((record) => record.check_in).length

  return (
    <PageStack>
      <Hero eyebrow="DASHBOARD GURU" title={`Selamat pagi, ${firstName(profile.display_name)}`} text="Berikut ringkasan kegiatan kelas hari ini." />
      <Stats
        items={[
          ['Murid', String(students), 'Kelompok A & B', 'green'],
          ['Hadir', String(present), 'Hari ini', 'blue'],
          ['Belum Absen', String(Math.max(0, students - present)), 'Perlu diperiksa', 'gold'],
          ['Terlambat', String(records.filter((record) => record.status === 'late').length), 'Hari ini', 'purple'],
        ]}
      />
      <div className="two-column wide-left">
        <Card title="Kehadiran 7 Hari Terakhir">
          <BarChart />
        </Card>
        <Card title="Jadwal Hari Ini">
          <MiniSchedule />
        </Card>
      </div>
      <Card title="Kelola Kehadiran" action="Buka absensi" onAction={() => navigate('/guru/attendance')}>
        <div className="scan-note">
          <ClipboardCheck size={20} />
          <p>Pindai QR murid untuk mencatat jam masuk dan pulang. Ringkasan akan diperbarui otomatis setelah pemindaian.</p>
        </div>
      </Card>
    </PageStack>
  )
}

function ParentView({ page, profile }: { page: string; profile: UserProfile }) {
  if (page === 'children') return <ChildrenPage />
  if (page === 'attendance') return <AttendanceHistory />
  if (page === 'schedule') return <SchedulePage />
  if (page === 'announcements') return <AnnouncementsPage />
  if (page === 'profile') return <ProfilePage role="parent" profile={profile} />
  return <ParentDashboard profile={profile} />
}

function ParentDashboard({ profile }: { profile: UserProfile }) {
  const navigate = useNavigate()
  const [children, setChildren] = useState<Student[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [today, setToday] = useState<Attendance | null>(null)

  useEffect(() => {
    let mounted = true

    const loadChildren = async () => {
      const { data } = await supabase.from('students').select('*').order('full_name')
      if (!mounted) return
      const list = (data as Student[] | null) ?? []
      setChildren(list)
      setSelectedId((value) => value || list[0]?.id || '')
    }

    void loadChildren()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setToday(null)
      return
    }

    let mounted = true
    const loadAttendance = async () => {
      const { data } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('student_id', selectedId)
        .eq('attendance_date', todayInJakarta())
        .maybeSingle()
      if (mounted) setToday(data as Attendance | null)
    }

    void loadAttendance()
    return () => {
      mounted = false
    }
  }, [selectedId])

  const child = children.find((item) => item.id === selectedId)
  const checkInTime = today?.check_in ? formatJakartaTime(today.check_in) : null

  return (
    <PageStack>
      {child ? (
        <div className="child-switch">
          <span className="avatar-soft">{initials(child.full_name)}</span>
          <div>
            <small>Menampilkan data anak</small>
            <strong>{child.full_name} · {child.class_name || 'Belum ada kelas'}</strong>
          </div>
          {children.length > 1 && (
            <select aria-label="Ganti anak" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {children.map((item) => <option value={item.id} key={item.id}>{item.full_name}</option>)}
            </select>
          )}
        </div>
      ) : (
        <Card title="Data Anak">
          <Empty text="Belum ada anak yang terhubung ke akun ini." />
        </Card>
      )}

      <Hero eyebrow="BERANDA WALI MURID" title={`Assalamu'alaikum, ${firstName(profile.display_name)}`} text="Pantau kegiatan dan kehadiran anak dengan mudah." />

      <div className="parent-status">
        <div>
          <span className="status-icon"><ClipboardCheck /></span>
          <small>Status Hari Ini</small>
          <h2>{today ? 'Sudah Masuk' : 'Belum Absen'}</h2>
          <p>{checkInTime ? `${checkInTime} WIB · ${today?.status === 'late' ? 'Terlambat' : 'Tepat waktu'}` : 'Belum ada pemindaian hari ini'}</p>
        </div>
        <div>
          <small>Jemput mulai</small>
          <strong>10.30 WIB</strong>
          <span>Gerbang utama</span>
        </div>
      </div>

      <div className="two-column">
        <Card title="Jadwal Hari Ini">
          <MiniSchedule />
        </Card>
        <Card title="Pengumuman Terbaru">
          <AnnouncementMini onOpen={() => navigate('/orang-tua/announcements')} />
        </Card>
      </div>
    </PageStack>
  )
}

function AttendancePage() {
  const [records, setRecords] = useState<Attendance[]>([])
  const [manual, setManual] = useState('')
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState('')
  const scanner = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null)

  const load = async () => {
    const { data } = await supabase
      .from('attendance_records')
      .select('id,attendance_date,check_in,check_out,status,students(full_name,class_name)')
      .order('created_at', { ascending: false })
      .limit(20)
    setRecords((data as unknown as Attendance[] | null) ?? [])
  }

  useEffect(() => {
    void load()
    return () => {
      scanner.current?.stop().catch(() => undefined)
      scanner.current?.clear()
    }
  }, [])

  const record = async (token: string) => {
    setMessage('Menyimpan absensi...')
    const { data, error } = await supabase.functions.invoke('record-attendance', { body: { token } })

    if (error || !data?.ok) {
      setMessage(data?.error || 'QR gagal diproses.')
      return
    }

    setMessage(`${data.student.full_name} berhasil ${data.action === 'check_in' ? 'masuk' : 'pulang'} pukul ${data.time} WIB.`)
    setManual('')
    await load()
  }

  const start = async () => {
    setMessage('Meminta izin kamera...')
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const cameras = await Html5Qrcode.getCameras()
      if (!cameras.length) throw new Error('Kamera tidak ditemukan.')

      const reader = new Html5Qrcode('scanner-reader')
      scanner.current = reader
      setScanning(true)

      await reader.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        async (text) => {
          await reader.stop()
          setScanning(false)
          await record(text)
        },
        () => undefined,
      )
      setMessage('Arahkan QR murid ke dalam bingkai.')
    } catch (error) {
      setScanning(false)
      setMessage(error instanceof Error ? error.message : 'Kamera tidak dapat diaktifkan.')
    }
  }

  const todayRows = records.filter((record) => record.attendance_date === todayInJakarta())

  return (
    <PageStack>
      <PageHeading eyebrow="ABSENSI SEKOLAH" title="Scan Kehadiran" text="Pindai QR murid. Pindai pertama mencatat masuk, pindai berikutnya mencatat pulang." />
      <div className="scanner-layout">
        <Card title="Pemindai QR">
          <div className={`scanner-box ${scanning ? 'camera-on' : ''}`}>
            <div id="scanner-reader" />
            {!scanning && (
              <>
                <QrCode size={68} />
                <strong>Kamera siap digunakan</strong>
                <p>Arahkan QR murid ke dalam bingkai</p>
                <button className="accent-button" onClick={start}>
                  <QrCode size={18} /> Aktifkan Kamera
                </button>
              </>
            )}
          </div>

          <form className="manual-scan" onSubmit={(event) => { event.preventDefault(); void record(manual) }}>
            <input required value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Atau tempel kode QR di sini" />
            <button className="accent-button">Proses</button>
          </form>
          {message && <p className="scan-message">{message}</p>}
        </Card>

        <Card title="Ringkasan Hari Ini">
          <Stats
            compact
            items={[
              ['Masuk', String(todayRows.filter((record) => record.check_in).length), 'Murid', 'green'],
              ['Pulang', String(todayRows.filter((record) => record.check_out).length), 'Murid', 'blue'],
              ['Terlambat', String(todayRows.filter((record) => record.status === 'late').length), 'Murid', 'gold'],
            ]}
          />
          <div className="scan-note">
            <ShieldCheck size={20} />
            <p>QR hanya menyimpan kode acak. Pemindaian hanya dapat dilakukan oleh Admin atau Guru yang login.</p>
          </div>
        </Card>
      </div>

      <Card title="Aktivitas Pemindaian Terbaru">
        <RealAttendanceRows records={records} />
      </Card>
    </PageStack>
  )
}

function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [parents, setParents] = useState<Account[]>([])
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<Student | null>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    const { data } = await supabase.from('students').select('*').order('full_name')
    setStudents((data as Student[] | null) ?? [])
  }

  useEffect(() => {
    void load()
    void supabase
      .from('user_profiles')
      .select('id,role,display_name,is_active,created_at')
      .eq('role', 'parent')
      .eq('is_active', true)
      .then(({ data }) => setParents((data as Account[] | null) ?? []))
  }, [])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('Menyimpan...')

    const form = new FormData(event.currentTarget)
    const payload = {
      full_name: String(form.get('full_name')).trim(),
      nis: optionalValue(form.get('nis')),
      nisn: optionalValue(form.get('nisn')),
      gender: optionalValue(form.get('gender')),
      class_name: optionalValue(form.get('class_name')),
      birth_place: optionalValue(form.get('birth_place')),
      birth_date: optionalValue(form.get('birth_date')),
    }

    const { data, error } = await supabase.from('students').insert(payload).select().single()
    if (error) {
      setMessage(error.code === '23505' ? 'NIS atau NISN sudah digunakan.' : error.message)
      return
    }

    const guardian = optionalValue(form.get('guardian'))
    if (guardian && data) {
      await supabase.from('student_guardians').insert({
        student_id: data.id,
        guardian_user_id: guardian,
        relationship: 'Wali',
      })
    }

    event.currentTarget.reset()
    setMessage('Data murid dan QR berhasil dibuat.')
    setShowForm(false)
    await load()
  }

  const query = search.trim().toLowerCase()
  const filtered = students.filter((student) => `${student.full_name} ${student.nis ?? ''} ${student.nisn ?? ''}`.toLowerCase().includes(query))

  return (
    <PageStack>
      <PageHeading eyebrow="AKADEMIK" title="Data Murid" text="Kelola identitas murid, hubungkan wali, dan tampilkan QR absensi." button="Tambah Murid" onClick={() => setShowForm((value) => !value)} />

      {showForm && (
        <Card title="Tambah Murid">
          <form className="student-form" onSubmit={save}>
            <label>Nama lengkap<input name="full_name" required /></label>
            <label>NIS<input name="nis" /></label>
            <label>NISN<input name="nisn" /></label>
            <label>
              Jenis kelamin
              <select name="gender" defaultValue="">
                <option value="">Pilih</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
            </label>
            <label>Kelompok<input name="class_name" placeholder="Kelompok A" /></label>
            <label>Tempat lahir<input name="birth_place" /></label>
            <label>Tanggal lahir<input name="birth_date" type="date" /></label>
            <label>
              Wali murid
              <select name="guardian" defaultValue="">
                <option value="">Belum dihubungkan</option>
                {parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.display_name || 'Wali murid'}</option>)}
              </select>
            </label>
            <button className="accent-button">Simpan & Buat QR</button>
          </form>
          {message && <p className="form-message">{message}</p>}
        </Card>
      )}

      <Card title="Daftar Murid">
        <div className="toolbar">
          <label>
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, NIS, atau NISN..." />
          </label>
        </div>
        {filtered.length ? (
          <div className="student-grid">
            {filtered.map((student) => (
              <div className="student-card" key={student.id}>
                <span className="avatar-soft">{initials(student.full_name)}</span>
                <div>
                  <strong>{student.full_name}</strong>
                  <small>{student.nis ? `NIS ${student.nis} · ` : ''}{student.class_name || 'Belum ada kelas'}</small>
                </div>
                <button className="qr-button" onClick={() => setSelected(student)}>
                  <QrCode size={17} /> QR
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="Belum ada data murid. Tambahkan murid pertama untuk membuat QR absensi." />
        )}
      </Card>

      {selected && <QrModal student={selected} onClose={() => setSelected(null)} />}
    </PageStack>
  )
}

function ChildrenPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [selected, setSelected] = useState<Student | null>(null)

  useEffect(() => {
    void supabase
      .from('students')
      .select('*')
      .order('full_name')
      .then(({ data }) => setStudents((data as Student[] | null) ?? []))
  }, [])

  return (
    <PageStack>
      <PageHeading eyebrow="DATA KELUARGA" title="Data Anak" text="Identitas dan QR absensi anak yang terhubung ke akun Anda." />
      {students.length ? (
        students.map((student) => (
          <div className="child-profile-card" key={student.id}>
            <div className="child-photo">{initials(student.full_name)}</div>
            <div>
              <Badge tone="green">Aktif</Badge>
              <h2>{student.full_name}</h2>
              <p>{student.class_name || 'Belum ada kelas'} · Tahun Ajaran {student.academic_year || '-'}</p>
              <small>{student.nis ? `NIS ${student.nis}` : 'NIS belum diisi'}</small>
            </div>
            <button onClick={() => setSelected(student)}>
              <QrCode size={17} /> Tampilkan QR
            </button>
          </div>
        ))
      ) : (
        <Card title="Data Anak">
          <Empty text="Belum ada anak yang dihubungkan. Hubungi Admin atau Guru." />
        </Card>
      )}
      {selected && <QrModal student={selected} onClose={() => setSelected(null)} />}
    </PageStack>
  )
}

function AttendanceHistory() {
  const [records, setRecords] = useState<Attendance[]>([])

  useEffect(() => {
    void supabase
      .from('attendance_records')
      .select('id,attendance_date,check_in,check_out,status,students(full_name,class_name)')
      .order('attendance_date', { ascending: false })
      .limit(50)
      .then(({ data }) => setRecords((data as unknown as Attendance[] | null) ?? []))
  }, [])

  const present = records.filter((record) => record.status === 'present').length
  const late = records.filter((record) => record.status === 'late').length

  return (
    <PageStack>
      <PageHeading eyebrow="MONITORING" title="Kehadiran Anak" text="Riwayat jam masuk, pulang, dan status kehadiran." />
      <Stats
        items={[
          ['Hadir', String(present), 'Riwayat', 'green'],
          ['Terlambat', String(late), 'Riwayat', 'gold'],
          ['Total', String(records.length), 'Catatan', 'blue'],
          ['Persentase', records.length ? `${Math.round(((present + late) / records.length) * 100)}%` : '0%', 'Kehadiran', 'purple'],
        ]}
      />
      <Card title="Riwayat Kehadiran">
        <RealAttendanceRows records={records} />
      </Card>
    </PageStack>
  )
}

function QrModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const value = `RA-NF:${student.qr_token}`

  return (
    <div className="qr-modal-backdrop" onClick={onClose}>
      <section className="qr-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" aria-label="Tutup QR" onClick={onClose}>
          <X />
        </button>
        <span className="qr-logo">RA</span>
        <h2>{student.full_name}</h2>
        <p>{student.nis ? `NIS ${student.nis} · ` : ''}{student.class_name || 'RA Nurul Falah'}</p>
        <div className="qr-canvas">
          <QRCodeSVG value={value} size={240} level="H" includeMargin />
        </div>
        <small>Tunjukkan QR ini kepada Guru saat masuk dan pulang.</small>
        <button className="accent-button" onClick={() => window.print()}>
          <FileText size={17} /> Cetak QR
        </button>
      </section>
    </div>
  )
}

function RealAttendanceRows({ records }: { records: Attendance[] }) {
  if (!records.length) return <Empty text="Belum ada catatan absensi." />

  return (
    <div className="attendance-rows">
      {records.map((record) => (
        <div key={record.id}>
          <span className="avatar-soft">{initials(record.students?.full_name || 'Murid')}</span>
          <p>
            <strong>{record.students?.full_name || 'Murid'}</strong>
            <small>{formatLongDate(record.attendance_date)} · {record.students?.class_name || 'Belum ada kelas'}</small>
          </p>
          <span>{record.check_in ? formatJakartaTime(record.check_in) : '--'} / {record.check_out ? formatJakartaTime(record.check_out) : '--'}</span>
          <Badge tone={record.status === 'late' ? 'gold' : 'green'}>{record.status === 'late' ? 'Terlambat' : 'Hadir'}</Badge>
        </div>
      ))}
    </div>
  )
}

function SchedulePage({ teacher = false }: { teacher?: boolean }) {
  const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat']
  const [day, setDay] = useState(1)
  const [rows, setRows] = useState<SchoolSchedule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void supabase
      .from('school_schedules')
      .select('*')
      .eq('is_active', true)
      .order('day_of_week')
      .order('start_time')
      .order('class_name')
      .then(({ data }) => {
        setRows((data as SchoolSchedule[] | null) ?? [])
        setLoading(false)
      })
  }, [])

  const selected = rows.filter((row) => row.day_of_week === day)
  const academicYear = selected[0]?.academic_year || rows[0]?.academic_year || '2026/2027'

  return (
    <PageStack>
      <PageHeading eyebrow="AGENDA BELAJAR" title="Jadwal Mingguan" text={teacher ? 'Jadwal kegiatan belajar Kelompok A dan B selama satu minggu.' : 'Jadwal kegiatan belajar anak selama satu minggu.'} />
      <div className="week-tabs">
        {days.map((label, index) => (
          <button className={day === index + 1 ? 'active' : ''} onClick={() => setDay(index + 1)} key={label}>
            {label}
          </button>
        ))}
      </div>
      <Card title={`${days[day - 1]} · Tahun Ajaran ${academicYear}`}>
        {loading ? <Empty text="Memuat jadwal..." /> : <ScheduleTimeline entries={selected} />}
      </Card>
    </PageStack>
  )
}

function AnnouncementsPage({ canCreate = false }: { canCreate?: boolean }) {
  return (
    <PageStack>
      <PageHeading eyebrow="INFORMASI SEKOLAH" title="Pengumuman" text={canCreate ? 'Daftar informasi sekolah. Pembuatan pengumuman akan tersedia setelah modul konten diaktifkan.' : 'Informasi penting dan kabar terbaru dari RA Nurul Falah.'} />
      <div className="announcement-grid">
        <AnnouncementCard title="Libur Maulid Nabi" date="20–25 September 2026" important />
        <AnnouncementCard title="Kegiatan Manasik Haji" date="Sabtu, 28 September 2026" />
        <AnnouncementCard title="Pengumpulan Fotokopi Kartu Keluarga" date="Batas 30 September 2026" />
      </div>
    </PageStack>
  )
}

function ClassesPage() {
  const navigate = useNavigate()

  return (
    <PageStack>
      <PageHeading eyebrow="STRUKTUR SEKOLAH" title="Kelas & Tahun Ajaran" text="Ringkasan rombongan belajar, semester, dan penugasan guru." />
      <Stats
        items={[
          ['Tahun Ajaran', '2026/27', 'Aktif', 'green'],
          ['Semester', 'Ganjil', 'Periode berjalan', 'blue'],
          ['Rombel', '2', 'Kelompok A & B', 'purple'],
        ]}
      />
      <div className="class-grid">
        <ClassCard name="Kelompok A" students="1 murid contoh" teacher="Ibu Nur Aisyah" onManage={() => navigate('/admin/students')} />
        <ClassCard name="Kelompok B" students="1 murid contoh" teacher="Bapak Hasbi Himatudin" onManage={() => navigate('/admin/students')} />
      </div>
    </PageStack>
  )
}

function SettingsPage() {
  return (
    <PageStack>
      <PageHeading eyebrow="KONFIGURASI" title="Pengaturan Sekolah" text="Konfigurasi operasional yang digunakan sistem." />
      <Card title="Identitas Sekolah">
        <div className="settings-list">
          <SettingRow title="Nama sekolah" value="RA Nurul Falah" />
          <SettingRow title="Tahun ajaran aktif" value="2026/2027 · Ganjil" />
          <SettingRow title="Jam masuk" value="07.00 WIB" />
          <SettingRow title="Batas terlambat" value="07.15 WIB" />
        </div>
      </Card>
      <div className="scan-note">
        <ShieldCheck size={20} />
        <p>Pengaturan ditampilkan sebagai informasi. Perubahan konfigurasi inti dilakukan melalui pembaruan sistem agar aturan absensi tetap konsisten.</p>
      </div>
    </PageStack>
  )
}

function ProfilePage({ role, profile }: { role: 'teacher' | 'parent'; profile: UserProfile }) {
  return (
    <PageStack>
      <PageHeading eyebrow="PROFIL" title={role === 'teacher' ? 'Profil Guru' : 'Profil Keluarga'} text="Informasi akun aktif Anda." />
      <div className="profile-hero">
        <span className="profile-avatar"><UserRound size={44} /></span>
        <div>
          <Badge tone="green">Aktif</Badge>
          <h2>{profile.display_name || roleName(profile.role)}</h2>
          <p>{role === 'teacher' ? 'Akun Guru RA Nurul Falah' : 'Akun Wali Murid RA Nurul Falah'}</p>
        </div>
      </div>
      <Card title="Status Akun">
        <div className="system-list">
          <div><span className="status-dot online" /><span>Akun aktif dan dapat mengakses sistem</span><strong>AKTIF</strong></div>
          <div><span className="status-dot online" /><span>Hak akses sesuai role</span><strong>{roleName(profile.role).toUpperCase()}</strong></div>
        </div>
      </Card>
    </PageStack>
  )
}

function Hero({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <section className="portal-hero">
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
        <span>{text}</span>
      </div>
      <div className="hero-art"><Sparkles size={42} /><i /><i /></div>
    </section>
  )
}

function PageHeading({ eyebrow, title, text, button, onClick }: { eyebrow: string; title: string; text: string; button?: string; onClick?: () => void }) {
  return (
    <div className="page-heading">
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
        <span>{text}</span>
      </div>
      {button && (
        <button className="accent-button" onClick={onClick}>
          <Plus size={18} /> {button}
        </button>
      )}
    </div>
  )
}

function PageStack({ children }: { children: ReactNode }) {
  return <div className="page-stack">{children}</div>
}

function Card({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <section className="portal-card">
      <header>
        <h3>{title}</h3>
        {action && onAction && <button onClick={onAction}>{action}</button>}
      </header>
      {children}
    </section>
  )
}

function Stats({ items, compact = false }: { items: StatItem[]; compact?: boolean }) {
  return (
    <div className={`portal-stats ${compact ? 'compact' : ''}`}>
      {items.map(([label, value, meta, tone]) => (
        <div className={`portal-stat ${tone}`} key={label}>
          <span><TrendingUp size={19} /></span>
          <div>
            <small>{label}</small>
            <strong>{value}</strong>
            <p>{meta}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`portal-badge ${tone}`}>{children}</span>
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>
}

function BarChart() {
  const values = [72, 85, 78, 91, 86, 94, 88]
  const labels = ['S', 'S', 'R', 'K', 'J', 'S', 'M']

  return (
    <div className="bar-chart">
      {values.map((height, index) => (
        <div key={`${labels[index]}-${index}`}>
          <span style={{ height: `${height}%` }} />
          <small>{labels[index]}</small>
        </div>
      ))}
    </div>
  )
}

function MiniSchedule() {
  return (
    <div className="mini-schedule">
      <div><time>07.30</time><span className="dot green" /><p><strong>Membaca Iqra</strong><small>Ruang Kelompok B</small></p></div>
      <div><time>08.15</time><span className="dot blue" /><p><strong>Kegiatan Motorik</strong><small>Halaman sekolah</small></p></div>
      <div><time>09.00</time><span className="dot gold" /><p><strong>Istirahat & Makan</strong><small>Ruang kelas</small></p></div>
    </div>
  )
}

function ActivityList() {
  const activities = [
    ['Akun baru dibuat', 'Wali Murid · 10 menit lalu'],
    ['Data murid diverifikasi', 'Nabila Rahma · 35 menit lalu'],
    ['Pengumuman diterbitkan', 'Admin · 1 jam lalu'],
  ]

  return (
    <div className="activity-list">
      {activities.map(([title, meta]) => (
        <div key={title}>
          <span><Clock3 size={17} /></span>
          <p><strong>{title}</strong><small>{meta}</small></p>
        </div>
      ))}
    </div>
  )
}

function SystemStatus() {
  return (
    <div className="system-list">
      <div><span className="status-dot online" /><span>Database & Auth</span><strong>Normal</strong></div>
      <div><span className="status-dot online" /><span>Pemindai QR</span><strong>Siap</strong></div>
      <div><span className="status-dot warning" /><span>Kelengkapan Data</span><strong>3 perlu diperiksa</strong></div>
    </div>
  )
}

function ScheduleTimeline({ entries }: { entries: SchoolSchedule[] }) {
  if (!entries.length) return <Empty text="Belum ada jadwal untuk hari ini." />

  return (
    <div className="schedule-timeline">
      {entries.map((entry, index) => (
        <div key={entry.id}>
          <time>{entry.start_time.slice(0, 5).replace(':', '.')}–{entry.end_time.slice(0, 5).replace(':', '.')}</time>
          <span className={`timeline-mark c${index % 5}`} />
          <p><strong>{entry.activity}</strong><small>{entry.teacher_name || 'Guru kelas'} · {entry.class_name}</small></p>
          <Badge tone={entry.class_name.endsWith('A') ? 'purple' : 'green'}>{entry.class_name}</Badge>
        </div>
      ))}
    </div>
  )
}

function AnnouncementMini({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="announcement-mini">
      <Badge tone="gold">PENTING</Badge>
      <strong>Libur Maulid Nabi</strong>
      <p>Kegiatan sekolah diliburkan pada Jumat, 20 September 2026.</p>
      <button onClick={onOpen}>Baca selengkapnya</button>
    </div>
  )
}

function AnnouncementCard({ title, date, important = false }: { title: string; date: string; important?: boolean }) {
  return (
    <details className="announcement-card">
      <summary>
        <div className={important ? 'important' : ''}><Megaphone size={25} /></div>
        {important && <Badge tone="gold">PENTING</Badge>}
        <h3>{title}</h3>
        <small><CalendarDays size={14} />{date}</small>
        <span>Baca selengkapnya</span>
      </summary>
      <p>Informasi kegiatan dan pemberitahuan ini berlaku untuk seluruh keluarga besar RA Nurul Falah. Silakan hubungi pihak sekolah apabila memerlukan penjelasan tambahan.</p>
    </details>
  )
}

function ClassCard({ name, students, teacher, onManage }: { name: string; students: string; teacher: string; onManage: () => void }) {
  return (
    <Card title={name}>
      <div className="class-card">
        <span><GraduationCap size={30} /></span>
        <p><strong>{students}</strong><small>Wali kelas: {teacher}</small></p>
        <button onClick={onManage}>Lihat Murid</button>
      </div>
    </Card>
  )
}

function SettingRow({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <p><strong>{title}</strong><small>{value}</small></p>
      <Badge tone="green">Aktif</Badge>
    </div>
  )
}

function todayInJakarta() {
  return JAKARTA_DATE.format(new Date())
}

function formatJakartaTime(value: string) {
  return new Date(value).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: JAKARTA_TIME_ZONE,
  })
}

function formatLongDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function optionalValue(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim()
  return text || null
}

function roleName(role: AppRole) {
  if (role === 'admin') return 'Administrator'
  if (role === 'teacher') return 'Guru'
  return 'Wali Murid'
}

function initials(name: string | null) {
  return (name || 'Pengguna')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function firstName(name: string | null) {
  return (name || 'Pengguna').split(' ')[0]
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}
