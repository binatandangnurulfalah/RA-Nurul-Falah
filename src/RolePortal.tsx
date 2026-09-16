import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, BookOpen, CalendarDays, ChevronDown, ClipboardCheck, Clock3, FileText,
  GraduationCap, Home, LogOut, Megaphone, Menu, Plus, QrCode, Search, Settings,
  ShieldCheck, Sparkles, TrendingUp, UserRound, UsersRound, X,
} from 'lucide-react'
import { AppRole, supabase, UserProfile } from './lib/supabase'
import './portal.css'

type NavItem = { id: string; label: string; icon: typeof Home }
type Account = Pick<UserProfile, 'id' | 'role' | 'display_name' | 'is_active' | 'created_at'>

const menus: Record<AppRole, NavItem[]> = {
  admin: [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'accounts', label: 'Manajemen Akun', icon: UsersRound },
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
        <div className="portal-brand"><span>RA</span><div><strong>Nurul Falah</strong><small>Sistem Informasi Sekolah</small></div></div>
        <nav>
          <p className="nav-caption">MENU UTAMA</p>
          {menu.map((item) => <button key={item.id} className={active.id === item.id ? 'active' : ''} onClick={() => go(item.id)}><item.icon size={19} /><span>{item.label}</span></button>)}
        </nav>
        <div className="sidebar-user"><span className="avatar-soft">{initials(profile.display_name)}</span><div><strong>{profile.display_name || roleName(profile.role)}</strong><small>{roleName(profile.role)}</small></div><button aria-label="Keluar" onClick={logout}><LogOut size={18} /></button></div>
      </aside>
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Tutup menu" onClick={() => setMobileOpen(false)} />}

      <div className="portal-main">
        <header className="portal-topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={22} /></button>
          <div><p>{roleName(profile.role)}</p><h1>{active.label}</h1></div>
          <div className="topbar-actions"><button aria-label="Cari"><Search size={20} /></button><button className="notification" aria-label="Notifikasi"><Bell size={20} /><i /></button><span className="top-avatar">{initials(profile.display_name)}</span></div>
        </header>
        <main className="portal-content">
          {profile.role === 'admin' && <AdminView page={active.id} profile={profile} />}
          {profile.role === 'teacher' && <TeacherView page={active.id} profile={profile} />}
          {profile.role === 'parent' && <ParentView page={active.id} profile={profile} />}
        </main>
      </div>

      <nav className="mobile-bottom-nav">
        {menu.slice(0, 5).map((item) => <button key={item.id} className={active.id === item.id ? 'active' : ''} onClick={() => go(item.id)}><item.icon size={20} /><span>{item.label.split(' ')[0]}</span></button>)}
      </nav>
    </div>
  )
}

function AdminView({ page, profile }: { page: string; profile: UserProfile }) {
  if (page === 'accounts') return <AccountsPage />
  if (page === 'classes') return <ClassesPage />
  if (page === 'announcements') return <AnnouncementsPage canCreate />
  if (page === 'settings') return <SettingsPage />
  return <AdminDashboard profile={profile} />
}

function AdminDashboard({ profile }: { profile: UserProfile }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  useEffect(() => { supabase.from('user_profiles').select('id,role,display_name,is_active,created_at').then(({ data }) => setAccounts((data as Account[]) ?? [])) }, [])
  return <PageStack>
    <Hero eyebrow="PANEL ADMINISTRATOR" title={`Selamat datang, ${firstName(profile.display_name)}`} text="Kelola seluruh aktivitas sekolah dari satu tempat." />
    <Stats items={[
      ['Total Murid', '37', '+2 bulan ini', 'green'], ['Guru Aktif', String(accounts.filter(a => a.role === 'teacher').length), 'Semua aktif', 'blue'],
      ['Orang Tua', String(accounts.filter(a => a.role === 'parent').length), 'Akun terhubung', 'purple'], ['Kehadiran Hari Ini', '86%', '32 dari 37 murid', 'gold'],
    ]} />
    <div className="two-column">
      <Card title="Aktivitas Terbaru" action="Lihat semua"><ActivityList /></Card>
      <Card title="Status Sistem"><SystemStatus /></Card>
    </div>
  </PageStack>
}

function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(false)
  const load = () => { setLoading(true); supabase.from('user_profiles').select('id,role,display_name,is_active,created_at').order('created_at', { ascending: false }).then(({ data }) => { setAccounts((data as Account[]) ?? []); setLoading(false) }) }
  useEffect(load, [])
  return <PageStack>
    <PageHeading eyebrow="AKSES PENGGUNA" title="Manajemen Akun" text="Buat dan pantau akun guru serta wali murid." button="Tambah Akun" onClick={() => setForm(!form)} />
    <Stats items={[["Semua Akun", String(accounts.length), "Terdaftar", 'green'], ["Guru", String(accounts.filter(a=>a.role==='teacher').length), "Tenaga pendidik", 'blue'], ["Wali Murid", String(accounts.filter(a=>a.role==='parent').length), "Keluarga", 'purple']]} />
    {form && <CreateAccount onDone={() => { setForm(false); load() }} />}
    <Card title="Daftar Pengguna"><div className="toolbar"><label><Search size={17}/><input placeholder="Cari nama pengguna..." /></label><button>Semua role <ChevronDown size={15}/></button></div><div className="data-table"><div className="table-head"><span>Pengguna</span><span>Role</span><span>Status</span><span>Dibuat</span></div>{loading ? <Empty text="Memuat akun..."/> : accounts.map(a => <div className="table-row" key={a.id}><div className="user-cell"><span className="avatar-soft">{initials(a.display_name)}</span><strong>{a.display_name || 'Tanpa nama'}</strong></div><Badge tone={a.role === 'admin' ? 'gold' : a.role === 'teacher' ? 'blue' : 'purple'}>{roleName(a.role)}</Badge><Badge tone={a.is_active ? 'green' : 'gray'}>{a.is_active ? 'Aktif' : 'Nonaktif'}</Badge><span>{date(a.created_at)}</span></div>)}</div></Card>
  </PageStack>
}

function CreateAccount({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [role, setRole] = useState<'teacher'|'parent'>('teacher'); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setMessage(''); const { data, error } = await supabase.functions.invoke('admin-create-user', { body: { email: email.trim(), password, display_name: name.trim(), role } }); if (error || !data?.ok) { setMessage(data?.error || 'Akun gagal dibuat. Pastikan password minimal 8 karakter, berisi huruf dan angka.'); setBusy(false); return } setMessage('Akun berhasil dibuat.'); setTimeout(onDone, 700) }
  return <Card title="Tambah Akun Baru"><form className="account-form" onSubmit={submit}><label>Nama lengkap<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Nama pengguna"/></label><label>Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nama@email.com"/></label><label>Password sementara<input required type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimal 8 karakter"/></label><label>Jenis akun<select value={role} onChange={e=>setRole(e.target.value as 'teacher'|'parent')}><option value="teacher">Guru</option><option value="parent">Orang Tua/Wali</option></select></label>{message && <p className="form-message">{message}</p>}<button className="accent-button" disabled={busy}>{busy ? 'Membuat...' : 'Buat Akun'}</button></form></Card>
}

function TeacherView({ page, profile }: { page: string; profile: UserProfile }) {
  if (page === 'attendance') return <AttendancePage />
  if (page === 'students') return <StudentsPage />
  if (page === 'schedule') return <SchedulePage teacher />
  if (page === 'announcements') return <AnnouncementsPage canCreate />
  if (page === 'profile') return <ProfilePage role="teacher" />
  return <PageStack><Hero eyebrow="DASHBOARD GURU" title={`Selamat pagi, ${firstName(profile.display_name)}`} text="Berikut ringkasan kegiatan kelas hari ini." /><Stats items={[["Murid",'37','Kelompok A & B','green'],["Hadir",'32','86% kehadiran','blue'],["Belum Absen",'3','Perlu diperiksa','gold'],["Izin / Sakit",'2','Hari ini','purple']]} /><div className="two-column wide-left"><Card title="Kehadiran 7 Hari Terakhir"><BarChart /></Card><Card title="Jadwal Hari Ini"><MiniSchedule /></Card></div><Card title="Belum Absen Hari Ini" action="Buka absensi"><StudentStrip /></Card></PageStack>
}

function ParentView({ page, profile }: { page: string; profile: UserProfile }) {
  if (page === 'children') return <ChildrenPage />
  if (page === 'attendance') return <AttendanceHistory />
  if (page === 'schedule') return <SchedulePage />
  if (page === 'announcements') return <AnnouncementsPage />
  if (page === 'profile') return <ProfilePage role="parent" />
  return <PageStack><div className="child-switch"><span className="avatar-soft">AN</span><div><small>Menampilkan data anak</small><strong>Ahmad Nauval · Kelompok B</strong></div><button>Ganti anak <ChevronDown size={15}/></button></div><Hero eyebrow="BERANDA WALI MURID" title={`Assalamu'alaikum, ${firstName(profile.display_name)}`} text="Pantau kegiatan dan kehadiran anak dengan mudah." /><div className="parent-status"><div><span className="status-icon"><ClipboardCheck/></span><small>Status Hari Ini</small><h2>Sudah Masuk</h2><p>07.03 WIB · Tepat waktu</p></div><div><small>Jemput mulai</small><strong>10.30 WIB</strong><span>Gerbang utama</span></div></div><div className="two-column"><Card title="Jadwal Hari Ini"><MiniSchedule /></Card><Card title="Pengumuman Terbaru"><AnnouncementMini /></Card></div></PageStack>
}

function AttendancePage() { return <PageStack><PageHeading eyebrow="ABSENSI SEKOLAH" title="Scan Kehadiran" text="Pindai QR guru atau murid untuk mencatat jam masuk dan pulang." button="Mulai Scan" /><div className="scanner-layout"><Card title="Pemindai QR"><div className="scanner-box"><QrCode size={78}/><strong>Kamera siap digunakan</strong><p>Arahkan QR ke dalam bingkai</p><button className="accent-button"><QrCode size={18}/> Aktifkan Kamera</button></div></Card><Card title="Ringkasan Hari Ini"><Stats compact items={[["Masuk",'32','Murid','green'],["Pulang",'0','Belum waktunya','blue'],["Terlambat",'2','Murid','gold']]} /><div className="scan-note"><ShieldCheck size={20}/><p>QR hanya menyimpan kode acak. Data pribadi tetap aman di server.</p></div></Card></div><Card title="Aktivitas Pemindaian Terbaru"><AttendanceRows /></Card></PageStack> }
function StudentsPage() { return <PageStack><PageHeading eyebrow="AKADEMIK" title="Data Murid" text="Kelola identitas, wali, domisili, dan dokumen murid." button="Tambah Murid"/><Card title="Daftar Murid"><div className="toolbar"><label><Search size={17}/><input placeholder="Cari nama atau NISN..."/></label><button>Kelompok B <ChevronDown size={15}/></button></div><div className="student-grid">{['Ahmad Nauval','Aisyah Putri','Fauzan Akbar','Nabila Rahma','Rafa Alfarizi','Zahra Humaira'].map((n,i)=><div className="student-card" key={n}><span className="avatar-soft">{initials(n)}</span><div><strong>{n}</strong><small>NIS 2026{String(i+1).padStart(2,'0')} · Kelompok {i%2?'A':'B'}</small></div><Badge tone={i===3?'gold':'green'}>{i===3?'Perlu verifikasi':'Aktif'}</Badge></div>)}</div></Card></PageStack> }
function ChildrenPage() { return <PageStack><PageHeading eyebrow="DATA KELUARGA" title="Data Anak" text="Lengkapi dan pantau status verifikasi data anak." button="Tambah Data Anak"/><div className="child-profile-card"><div className="child-photo">AN</div><div><Badge tone="green">Terverifikasi</Badge><h2>Ahmad Nauval</h2><p>Kelompok B · Tahun Ajaran 2026/2027</p><div className="completion"><span><i style={{width:'88%'}}/></span><small>Kelengkapan data 88%</small></div></div><button>Edit Data</button></div><Card title="Dokumen Anak"><DocumentGrid /></Card></PageStack> }
function AttendanceHistory() { return <PageStack><PageHeading eyebrow="MONITORING" title="Kehadiran Anak" text="Riwayat jam masuk, pulang, dan status kehadiran."/><Stats items={[["Hadir",'18','Bulan ini','green'],["Terlambat",'1','Bulan ini','gold'],["Izin",'1','Bulan ini','blue'],["Persentase",'90%','Kehadiran','purple']]}/><Card title="Riwayat September 2026"><AttendanceRows history/></Card></PageStack> }
function SchedulePage({ teacher=false }: {teacher?:boolean}) { return <PageStack><PageHeading eyebrow="AGENDA BELAJAR" title="Jadwal Mingguan" text={teacher?'Atur kegiatan belajar untuk setiap kelas.':'Jadwal kegiatan belajar anak selama satu minggu.'} button={teacher?'Tambah Jadwal':undefined}/><div className="week-tabs">{['Senin','Selasa','Rabu','Kamis','Jumat'].map((d,i)=><button className={i===0?'active':''} key={d}>{d}</button>)}</div><Card title="Senin, 16 September"><ScheduleTimeline /></Card></PageStack> }
function AnnouncementsPage({canCreate=false}:{canCreate?:boolean}) { return <PageStack><PageHeading eyebrow="INFORMASI SEKOLAH" title="Pengumuman" text="Informasi penting dan kabar terbaru dari RA Nurul Falah." button={canCreate?'Buat Pengumuman':undefined}/><div className="announcement-grid"><AnnouncementCard title="Libur Maulid Nabi" date="20–25 September 2026" important/><AnnouncementCard title="Kegiatan Manasik Haji" date="Sabtu, 28 September 2026"/><AnnouncementCard title="Pengumpulan Fotokopi Kartu Keluarga" date="Batas 30 September 2026"/></div></PageStack> }
function ClassesPage() { return <PageStack><PageHeading eyebrow="STRUKTUR SEKOLAH" title="Kelas & Tahun Ajaran" text="Atur rombongan belajar, semester, dan penugasan guru." button="Tambah Kelas"/><Stats items={[["Tahun Ajaran",'2026/27','Aktif','green'],["Semester",'Ganjil','Periode berjalan','blue'],["Rombel",'2','Kelompok A & B','purple']]}/><div className="class-grid"><ClassCard name="Kelompok A" students="18 murid" teacher="Ibu Siti Aminah"/><ClassCard name="Kelompok B" students="19 murid" teacher="Ibu Nur Aisyah"/></div></PageStack> }
function SettingsPage() { return <PageStack><PageHeading eyebrow="KONFIGURASI" title="Pengaturan Sekolah" text="Sesuaikan identitas dan aturan operasional sekolah."/><Card title="Identitas Sekolah"><div className="settings-list"><SettingRow title="Nama sekolah" value="RA Nurul Falah"/><SettingRow title="Tahun ajaran aktif" value="2026/2027 · Ganjil"/><SettingRow title="Jam masuk" value="07.00 WIB"/><SettingRow title="Batas terlambat" value="07.15 WIB"/></div></Card></PageStack> }
function ProfilePage({role}:{role:'teacher'|'parent'}) { return <PageStack><PageHeading eyebrow="PROFIL" title={role==='teacher'?'Profil Guru':'Profil Keluarga'} text="Pastikan informasi dan dokumen Anda selalu terbaru." button="Edit Profil"/><div className="profile-hero"><span className="profile-avatar"><UserRound size={44}/></span><div><Badge tone="green">Aktif</Badge><h2>{role==='teacher'?'Siti Aminah, S.Pd.':'Keluarga Bapak Ahmad'}</h2><p>{role==='teacher'?'Guru Kelas · Kelompok B':'Wali dari Ahmad Nauval'}</p></div></div><Card title="Kelengkapan Profil"><div className="completion large"><span><i style={{width:role==='teacher'?'76%':'84%'}}/></span><strong>{role==='teacher'?'76%':'84%'}</strong></div><DocumentGrid /></Card></PageStack> }

function Hero({eyebrow,title,text}:{eyebrow:string;title:string;text:string}) { return <section className="portal-hero"><div><p>{eyebrow}</p><h2>{title}</h2><span>{text}</span></div><div className="hero-art"><Sparkles size={42}/><i/><i/></div></section> }
function PageHeading({eyebrow,title,text,button,onClick}:{eyebrow:string;title:string;text:string;button?:string;onClick?:()=>void}) { return <div className="page-heading"><div><p>{eyebrow}</p><h2>{title}</h2><span>{text}</span></div>{button&&<button className="accent-button" onClick={onClick}><Plus size={18}/>{button}</button>}</div> }
function PageStack({children}:{children:React.ReactNode}) { return <div className="page-stack">{children}</div> }
function Card({title,action,children}:{title:string;action?:string;children:React.ReactNode}) { return <section className="portal-card"><header><h3>{title}</h3>{action&&<button>{action}</button>}</header>{children}</section> }
function Stats({items,compact=false}:{items:string[][];compact?:boolean}) { return <div className={`portal-stats ${compact?'compact':''}`}>{items.map(([label,value,meta,tone])=><div className={`portal-stat ${tone}`} key={label}><span><TrendingUp size={19}/></span><div><small>{label}</small><strong>{value}</strong><p>{meta}</p></div></div>)}</div> }
function Badge({tone,children}:{tone:string;children:React.ReactNode}) { return <span className={`portal-badge ${tone}`}>{children}</span> }
function Empty({text}:{text:string}) { return <div className="empty-state">{text}</div> }
function BarChart() { return <div className="bar-chart">{[72,85,78,91,86,94,88].map((h,i)=><div key={i}><span style={{height:`${h}%`}}/><small>{['S','S','R','K','J','S','M'][i]}</small></div>)}</div> }
function MiniSchedule() { return <div className="mini-schedule"><div><time>07.30</time><span className="dot green"/><p><strong>Membaca Iqra</strong><small>Ruang Kelompok B</small></p></div><div><time>08.15</time><span className="dot blue"/><p><strong>Kegiatan Motorik</strong><small>Halaman sekolah</small></p></div><div><time>09.00</time><span className="dot gold"/><p><strong>Istirahat & Makan</strong><small>Ruang kelas</small></p></div></div> }
function ActivityList() { return <div className="activity-list">{[['Akun baru dibuat','Wali Murid · 10 menit lalu'],['Data murid diverifikasi','Nabila Rahma · 35 menit lalu'],['Pengumuman diterbitkan','Admin · 1 jam lalu']].map(([a,b])=><div key={a}><span><Clock3 size={17}/></span><p><strong>{a}</strong><small>{b}</small></p></div>)}</div> }
function SystemStatus() { return <div className="system-list"><div><span className="status-dot online"/>Database & Auth<strong>Normal</strong></div><div><span className="status-dot online"/>Pemindai QR<strong>Siap</strong></div><div><span className="status-dot warning"/>Kelengkapan Data<strong>3 perlu diperiksa</strong></div></div> }
function StudentStrip() { return <div className="student-strip">{['Rafa Alfarizi','Zahra Humaira','Dimas Pratama'].map(n=><div key={n}><span className="avatar-soft">{initials(n)}</span><p><strong>{n}</strong><small>Kelompok B</small></p><button>Hubungi Wali</button></div>)}</div> }
function AttendanceRows({history=false}:{history?:boolean}) { return <div className="attendance-rows">{['Ahmad Nauval','Aisyah Putri','Fauzan Akbar','Nabila Rahma'].map((n,i)=><div key={n}><span className="avatar-soft">{initials(n)}</span><p><strong>{history?['Senin, 16 Sep','Jumat, 13 Sep','Kamis, 12 Sep','Rabu, 11 Sep'][i]:n}</strong><small>{history?'Masuk 07.0'+i+' · Pulang 10.3'+i:'Kelompok '+(i%2?'A':'B')}</small></p><Badge tone={i===2?'gold':'green'}>{i===2?'Terlambat':'Hadir'}</Badge></div>)}</div> }
function ScheduleTimeline() { return <div className="schedule-timeline">{[['07.30–08.00','Membaca Iqra','Ibu Siti'],['08.00–08.45','Kegiatan Motorik','Ibu Nur'],['08.45–09.15','Kognitif & Bahasa','Ibu Siti'],['09.15–09.45','Istirahat & Makan','Pendamping'],['09.45–10.30','Seni dan Kreativitas','Ibu Nur']].map((x,i)=><div key={x[0]}><time>{x[0]}</time><span className={`timeline-mark c${i}`}/><p><strong>{x[1]}</strong><small>{x[2]} · Kelompok B</small></p></div>)}</div> }
function AnnouncementMini() { return <div className="announcement-mini"><Badge tone="gold">PENTING</Badge><strong>Libur Maulid Nabi</strong><p>Kegiatan sekolah diliburkan pada Jumat, 20 September 2026.</p><button>Baca selengkapnya</button></div> }
function AnnouncementCard({title,date,important=false}:{title:string;date:string;important?:boolean}) { return <article className="announcement-card"><div className={important?'important':''}><Megaphone size={25}/></div>{important&&<Badge tone="gold">PENTING</Badge>}<h3>{title}</h3><p>Informasi kegiatan dan pemberitahuan untuk seluruh keluarga besar RA Nurul Falah.</p><small><CalendarDays size={14}/>{date}</small><button>Baca selengkapnya</button></article> }
function DocumentGrid() { return <div className="document-grid">{[['Akta Kelahiran',true],['Kartu Keluarga',true],['KTP Orang Tua',true],['Pasfoto Anak',false]].map(([n,ok])=><div key={String(n)}><FileText size={20}/><p><strong>{String(n)}</strong><small>{ok?'Sudah diunggah':'Belum diunggah'}</small></p><Badge tone={ok?'green':'gold'}>{ok?'Lengkap':'Lengkapi'}</Badge></div>)}</div> }
function ClassCard({name,students,teacher}:{name:string;students:string;teacher:string}) { return <Card title={name}><div className="class-card"><span><GraduationCap size={30}/></span><p><strong>{students}</strong><small>Wali kelas: {teacher}</small></p><button>Kelola Kelas</button></div></Card> }
function SettingRow({title,value}:{title:string;value:string}) { return <div><p><strong>{title}</strong><small>{value}</small></p><button>Ubah</button></div> }

function roleName(role:AppRole){ return role==='admin'?'Administrator':role==='teacher'?'Guru':'Wali Murid' }
function initials(name:string|null){ return (name||'Pengguna').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase() }
function firstName(name:string|null){ return (name||'Pengguna').split(' ')[0] }
function date(value:string){ return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value)) }

