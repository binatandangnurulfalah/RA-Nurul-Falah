import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import {
  Bell, BookOpen, CalendarDays, ChevronDown, ClipboardCheck, Clock3, FileText,
  GraduationCap, Home, LogOut, Megaphone, Menu, Plus, QrCode, Search, Settings,
  ShieldCheck, Sparkles, TrendingUp, UserRound, UsersRound, X,
} from 'lucide-react'
import { AppRole, supabase, UserProfile } from './lib/supabase'
import './portal.css'

type NavItem = { id: string; label: string; icon: typeof Home }
type Account = Pick<UserProfile, 'id' | 'role' | 'display_name' | 'is_active' | 'created_at'>
type Student = { id:string; full_name:string; nis:string|null; nisn:string|null; gender:'L'|'P'|null; birth_place:string|null; birth_date:string|null; class_name:string|null; academic_year:string|null; is_active:boolean; qr_token:string }
type Attendance = { id:string; attendance_date:string; check_in:string|null; check_out:string|null; status:string; students?: { full_name:string; class_name:string|null } | null }
type SchoolSchedule = { id:string; class_name:string; day_of_week:number; start_time:string; end_time:string; activity:string; teacher_name:string|null; academic_year:string }

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
  if (page === 'students') return <StudentsPage />
  if (page === 'attendance') return <AttendancePage />
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

function AttendancePage() {
  const [records,setRecords]=useState<Attendance[]>([]); const [manual,setManual]=useState(''); const [scanning,setScanning]=useState(false); const [message,setMessage]=useState(''); const scanner=useRef<{stop:()=>Promise<void>;clear:()=>void}|null>(null)
  const load=()=>supabase.from('attendance_records').select('id,attendance_date,check_in,check_out,status,students(full_name,class_name)').order('created_at',{ascending:false}).limit(20).then(({data})=>setRecords((data as unknown as Attendance[])??[]))
  useEffect(()=>{load();return()=>{scanner.current?.stop().catch(()=>{});scanner.current?.clear()}},[])
  const record=async(token:string)=>{setMessage('Menyimpan absensi...');const {data,error}=await supabase.functions.invoke('record-attendance',{body:{token}});if(error||!data?.ok){setMessage(data?.error||'QR gagal diproses.');return}setMessage(`${data.student.full_name} berhasil ${data.action==='check_in'?'masuk':'pulang'} pukul ${data.time} WIB.`);setManual('');load()}
  const start=async()=>{setMessage('Meminta izin kamera...');try{const {Html5Qrcode}=await import('html5-qrcode');const cameras=await Html5Qrcode.getCameras();if(!cameras.length)throw new Error('Kamera tidak ditemukan.');const reader=new Html5Qrcode('scanner-reader');scanner.current=reader;setScanning(true);await reader.start({facingMode:'environment'},{fps:10,qrbox:{width:230,height:230}},async text=>{await reader.stop();setScanning(false);record(text)},()=>{});setMessage('Arahkan QR murid ke dalam bingkai.')}catch(e){setScanning(false);setMessage(e instanceof Error?e.message:'Kamera tidak dapat diaktifkan.') }}
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date()); const todayRows=records.filter(r=>r.attendance_date===today)
  return <PageStack><PageHeading eyebrow="ABSENSI SEKOLAH" title="Scan Kehadiran" text="Pindai QR murid. Pindai pertama mencatat masuk, pindai berikutnya mencatat pulang."/><div className="scanner-layout"><Card title="Pemindai QR"><div className={`scanner-box ${scanning?'camera-on':''}`}><div id="scanner-reader"/><>{!scanning&&<><QrCode size={68}/><strong>Kamera siap digunakan</strong><p>Arahkan QR murid ke dalam bingkai</p><button className="accent-button" onClick={start}><QrCode size={18}/> Aktifkan Kamera</button></>}</></div><form className="manual-scan" onSubmit={e=>{e.preventDefault();record(manual)}}><input required value={manual} onChange={e=>setManual(e.target.value)} placeholder="Atau tempel kode QR di sini"/><button className="accent-button">Proses</button></form>{message&&<p className="scan-message">{message}</p>}</Card><Card title="Ringkasan Hari Ini"><Stats compact items={[["Masuk",String(todayRows.filter(r=>r.check_in).length),'Murid','green'],["Pulang",String(todayRows.filter(r=>r.check_out).length),'Murid','blue'],["Terlambat",String(todayRows.filter(r=>r.status==='late').length),'Murid','gold']]} /><div className="scan-note"><ShieldCheck size={20}/><p>QR hanya menyimpan kode acak. Pemindaian hanya dapat dilakukan oleh Admin atau Guru yang login.</p></div></Card></div><Card title="Aktivitas Pemindaian Terbaru"><RealAttendanceRows records={records}/></Card></PageStack>
}

function StudentsPage() {
  const [students,setStudents]=useState<Student[]>([]); const [parents,setParents]=useState<Account[]>([]); const [showForm,setShowForm]=useState(false); const [selected,setSelected]=useState<Student|null>(null); const [search,setSearch]=useState(''); const [message,setMessage]=useState('')
  const load=()=>supabase.from('students').select('*').order('full_name').then(({data})=>setStudents((data as Student[])??[]))
  useEffect(()=>{load();supabase.from('user_profiles').select('id,role,display_name,is_active,created_at').eq('role','parent').eq('is_active',true).then(({data})=>setParents((data as Account[])??[]))},[])
  const save=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setMessage('Menyimpan...');const f=new FormData(e.currentTarget);const payload={full_name:String(f.get('full_name')),nis:String(f.get('nis'))||null,nisn:String(f.get('nisn'))||null,gender:String(f.get('gender'))||null,class_name:String(f.get('class_name'))||null,birth_place:String(f.get('birth_place'))||null,birth_date:String(f.get('birth_date'))||null};const {data,error}=await supabase.from('students').insert(payload).select().single();if(error){setMessage(error.code==='23505'?'NIS atau NISN sudah digunakan.':error.message);return}const guardian=String(f.get('guardian'));if(guardian&&data)await supabase.from('student_guardians').insert({student_id:data.id,guardian_user_id:guardian,relationship:'Wali'});setMessage('Data murid dan QR berhasil dibuat.');setShowForm(false);load()}
  const filtered=students.filter(s=>(s.full_name+' '+(s.nis??'')+' '+(s.nisn??'')).toLowerCase().includes(search.toLowerCase()))
  return <PageStack><PageHeading eyebrow="AKADEMIK" title="Data Murid" text="Kelola identitas murid, hubungkan wali, dan tampilkan QR absensi." button="Tambah Murid" onClick={()=>setShowForm(!showForm)}/>{showForm&&<Card title="Tambah Murid"><form className="student-form" onSubmit={save}><label>Nama lengkap<input name="full_name" required/></label><label>NIS<input name="nis"/></label><label>NISN<input name="nisn"/></label><label>Jenis kelamin<select name="gender" defaultValue=""><option value="">Pilih</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></label><label>Kelompok<input name="class_name" placeholder="Kelompok A"/></label><label>Tempat lahir<input name="birth_place"/></label><label>Tanggal lahir<input name="birth_date" type="date"/></label><label>Wali murid<select name="guardian" defaultValue=""><option value="">Belum dihubungkan</option>{parents.map(p=><option key={p.id} value={p.id}>{p.display_name||'Wali murid'}</option>)}</select></label><button className="accent-button">Simpan & Buat QR</button></form>{message&&<p className="form-message">{message}</p>}</Card>}<Card title="Daftar Murid"><div className="toolbar"><label><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama, NIS, atau NISN..."/></label></div>{filtered.length?<div className="student-grid">{filtered.map(s=><div className="student-card" key={s.id}><span className="avatar-soft">{initials(s.full_name)}</span><div><strong>{s.full_name}</strong><small>{s.nis?`NIS ${s.nis} · `:''}{s.class_name||'Belum ada kelas'}</small></div><button className="qr-button" onClick={()=>setSelected(s)}><QrCode size={17}/> QR</button></div>)}</div>:<Empty text="Belum ada data murid. Tambahkan murid pertama untuk membuat QR absensi."/>}</Card>{selected&&<QrModal student={selected} onClose={()=>setSelected(null)}/>}</PageStack>
}

function ChildrenPage() {
  const [students,setStudents]=useState<Student[]>([]); const [selected,setSelected]=useState<Student|null>(null)
  useEffect(()=>{supabase.from('students').select('*').order('full_name').then(({data})=>setStudents((data as Student[])??[]))},[])
  return <PageStack><PageHeading eyebrow="DATA KELUARGA" title="Data Anak" text="Identitas dan QR absensi anak yang terhubung ke akun Anda."/>{students.length?students.map(s=><div className="child-profile-card" key={s.id}><div className="child-photo">{initials(s.full_name)}</div><div><Badge tone="green">Aktif</Badge><h2>{s.full_name}</h2><p>{s.class_name||'Belum ada kelas'} · Tahun Ajaran {s.academic_year||'-'}</p><small>{s.nis?`NIS ${s.nis}`:'NIS belum diisi'}</small></div><button onClick={()=>setSelected(s)}><QrCode size={17}/> Tampilkan QR</button></div>):<Card title="Data Anak"><Empty text="Belum ada anak yang dihubungkan. Hubungi Admin atau Guru."/></Card>}{selected&&<QrModal student={selected} onClose={()=>setSelected(null)}/>}</PageStack>
}

function AttendanceHistory() {
  const [records,setRecords]=useState<Attendance[]>([]); useEffect(()=>{supabase.from('attendance_records').select('id,attendance_date,check_in,check_out,status,students(full_name,class_name)').order('attendance_date',{ascending:false}).limit(50).then(({data})=>setRecords((data as unknown as Attendance[])??[]))},[])
  const present=records.filter(r=>r.status==='present').length,late=records.filter(r=>r.status==='late').length
  return <PageStack><PageHeading eyebrow="MONITORING" title="Kehadiran Anak" text="Riwayat jam masuk, pulang, dan status kehadiran."/><Stats items={[["Hadir",String(present),'Riwayat','green'],["Terlambat",String(late),'Riwayat','gold'],["Total",String(records.length),'Catatan','blue'],["Persentase",records.length?`${Math.round(((present+late)/records.length)*100)}%`:'0%','Kehadiran','purple']]}/><Card title="Riwayat Kehadiran"><RealAttendanceRows records={records}/></Card></PageStack>
}

function QrModal({student,onClose}:{student:Student;onClose:()=>void}) { const value=`RA-NF:${student.qr_token}`; return <div className="qr-modal-backdrop" onClick={onClose}><section className="qr-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose}><X/></button><span className="qr-logo">RA</span><h2>{student.full_name}</h2><p>{student.nis?`NIS ${student.nis} · `:''}{student.class_name||'RA Nurul Falah'}</p><div className="qr-canvas"><QRCodeSVG value={value} size={240} level="H" includeMargin/></div><small>Tunjukkan QR ini kepada Guru saat masuk dan pulang.</small><button className="accent-button" onClick={()=>window.print()}><FileText size={17}/> Cetak QR</button></section></div> }
function RealAttendanceRows({records}:{records:Attendance[]}) { if(!records.length)return <Empty text="Belum ada catatan absensi."/>;return <div className="attendance-rows">{records.map(r=><div key={r.id}><span className="avatar-soft">{initials(r.students?.full_name||'Murid')}</span><p><strong>{r.students?.full_name||'Murid'}</strong><small>{new Date(r.attendance_date+'T00:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})} · {r.students?.class_name||'Belum ada kelas'}</small></p><span>{r.check_in?new Date(r.check_in).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}):'--'} / {r.check_out?new Date(r.check_out).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}):'--'}</span><Badge tone={r.status==='late'?'gold':'green'}>{r.status==='late'?'Terlambat':'Hadir'}</Badge></div>)}</div> }
function SchedulePage({ teacher=false }: {teacher?:boolean}) {
  const days=['Senin','Selasa','Rabu','Kamis','Jumat']; const [day,setDay]=useState(1); const [rows,setRows]=useState<SchoolSchedule[]>([]); const [loading,setLoading]=useState(true)
  useEffect(()=>{setLoading(true);supabase.from('school_schedules').select('*').eq('is_active',true).order('day_of_week').order('start_time').order('class_name').then(({data})=>{setRows((data as SchoolSchedule[])??[]);setLoading(false)})},[])
  const selected=rows.filter(r=>r.day_of_week===day)
  return <PageStack><PageHeading eyebrow="AGENDA BELAJAR" title="Jadwal Mingguan" text={teacher?'Jadwal kegiatan belajar Kelompok A dan B selama satu minggu.':'Jadwal kegiatan belajar anak selama satu minggu.'}/><div className="week-tabs">{days.map((d,i)=><button className={day===i+1?'active':''} onClick={()=>setDay(i+1)} key={d}>{d}</button>)}</div><Card title={`${days[day-1]} · Tahun Ajaran 2026/2027`}>{loading?<Empty text="Memuat jadwal..."/>:<ScheduleTimeline entries={selected}/>}</Card></PageStack>
}
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
function ScheduleTimeline({entries}:{entries:SchoolSchedule[]}) { if(!entries.length)return <Empty text="Belum ada jadwal untuk hari ini."/>;return <div className="schedule-timeline">{entries.map((x,i)=><div key={x.id}><time>{x.start_time.slice(0,5).replace(':','.')}–{x.end_time.slice(0,5).replace(':','.')}</time><span className={`timeline-mark c${i%5}`}/><p><strong>{x.activity}</strong><small>{x.teacher_name||'Guru kelas'} · {x.class_name}</small></p><Badge tone={x.class_name.endsWith('A')?'purple':'green'}>{x.class_name}</Badge></div>)}</div> }
function AnnouncementMini() { return <div className="announcement-mini"><Badge tone="gold">PENTING</Badge><strong>Libur Maulid Nabi</strong><p>Kegiatan sekolah diliburkan pada Jumat, 20 September 2026.</p><button>Baca selengkapnya</button></div> }
function AnnouncementCard({title,date,important=false}:{title:string;date:string;important?:boolean}) { return <article className="announcement-card"><div className={important?'important':''}><Megaphone size={25}/></div>{important&&<Badge tone="gold">PENTING</Badge>}<h3>{title}</h3><p>Informasi kegiatan dan pemberitahuan untuk seluruh keluarga besar RA Nurul Falah.</p><small><CalendarDays size={14}/>{date}</small><button>Baca selengkapnya</button></article> }
function DocumentGrid() { return <div className="document-grid">{[['Akta Kelahiran',true],['Kartu Keluarga',true],['KTP Orang Tua',true],['Pasfoto Anak',false]].map(([n,ok])=><div key={String(n)}><FileText size={20}/><p><strong>{String(n)}</strong><small>{ok?'Sudah diunggah':'Belum diunggah'}</small></p><Badge tone={ok?'green':'gold'}>{ok?'Lengkap':'Lengkapi'}</Badge></div>)}</div> }
function ClassCard({name,students,teacher}:{name:string;students:string;teacher:string}) { return <Card title={name}><div className="class-card"><span><GraduationCap size={30}/></span><p><strong>{students}</strong><small>Wali kelas: {teacher}</small></p><button>Kelola Kelas</button></div></Card> }
function SettingRow({title,value}:{title:string;value:string}) { return <div><p><strong>{title}</strong><small>{value}</small></p><button>Ubah</button></div> }

function roleName(role:AppRole){ return role==='admin'?'Administrator':role==='teacher'?'Guru':'Wali Murid' }
function initials(name:string|null){ return (name||'Pengguna').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase() }
function firstName(name:string|null){ return (name||'Pengguna').split(' ')[0] }
function date(value:string){ return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value)) }

