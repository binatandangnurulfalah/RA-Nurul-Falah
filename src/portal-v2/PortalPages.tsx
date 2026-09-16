import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  CalendarDays,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  GraduationCap,
  QrCode,
  Save,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { type AppRole, supabase, type UserProfile } from '../lib/supabase'

type Student = {
  id: string
  full_name: string
  nis: string | null
  class_name: string | null
  academic_year: string | null
  qr_token: string
}

type SchoolSetting = {
  id: number
  school_name: string
  address: string | null
  phone: string | null
  email: string | null
  timezone: string
  late_cutoff: string
  academic_year: string
}

const JAKARTA = 'Asia/Jakarta'
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA }).format(new Date())

export function DashboardPage({ role, profile, go }: { role: AppRole; profile: UserProfile; go: (page: string) => void }) {
  const [studentCount, setStudentCount] = useState(0)
  const [attendanceCount, setAttendanceCount] = useState(0)
  const [lateCount, setLateCount] = useState(0)
  const [accountCount, setAccountCount] = useState(0)
  const [children, setChildren] = useState<Student[]>([])
  const [selectedChildId, setSelectedChildId] = useState('')
  const [todayRecord, setTodayRecord] = useState<{ check_in: string | null; check_out: string | null; status: string } | null>(null)
  const [draftReports, setDraftReports] = useState(0)
  const [openPayments, setOpenPayments] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (role === 'parent') {
        const { data: childData } = await supabase.from('students').select('id,full_name,nis,class_name,academic_year,qr_token').order('full_name')
        if (!mounted) return
        const list = (childData as Student[] | null) ?? []
        setChildren(list)
        if (list[0]) setSelectedChildId((current) => current || list[0].id)
        if (mounted) setLoading(false)
        return
      }

      const [studentsResult, attendanceResult, lateResult, accountsResult, reportsResult, paymentsResult] = await Promise.all([
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('attendance_date', today()),
        supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('attendance_date', today()).eq('status', 'late'),
        role === 'admin'
          ? supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('is_active', true)
          : Promise.resolve({ count: 0 }),
        supabase.from('report_cards').select('id', { count: 'exact', head: true }).eq('is_published', false),
        role === 'admin'
          ? supabase.from('student_payments').select('id', { count: 'exact', head: true }).in('status', ['unpaid', 'partial'])
          : Promise.resolve({ count: 0 }),
      ])
      if (!mounted) return
      setStudentCount(studentsResult.count ?? 0)
      setAttendanceCount(attendanceResult.count ?? 0)
      setLateCount(lateResult.count ?? 0)
      setAccountCount(accountsResult.count ?? 0)
      setDraftReports(reportsResult.count ?? 0)
      setOpenPayments(paymentsResult.count ?? 0)
      setLoading(false)
    }
    void load()
    return () => { mounted = false }
  }, [role])

  useEffect(() => {
    if (role !== 'parent' || !selectedChildId) return
    let mounted = true
    setTodayRecord(null)
    void supabase.from('attendance_records').select('check_in,check_out,status').eq('student_id', selectedChildId).eq('attendance_date', today()).maybeSingle().then(({ data }) => {
      if (mounted) setTodayRecord(data as typeof todayRecord)
    })
    return () => { mounted = false }
  }, [role, selectedChildId])

  const greeting = new Intl.DateTimeFormat('id-ID', { timeZone: JAKARTA, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const firstName = (profile.display_name || 'Pengguna').split(' ')[0]

  if (role === 'parent') {
    const child = children.find((item) => item.id === selectedChildId) ?? children[0]
    return (
      <div className="v2-stack">
        <section className="v2-hero parent"><div><small>BERANDA WALI</small><h2>Assalamu'alaikum, {firstName}</h2><p>{greeting} · Pantau aktivitas anak dengan ringkas.</p></div><UserRound size={54} /></section>
        {loading ? <SkeletonCards /> : child ? (
          <>
            {children.length > 1 && <div className="v5-child-switcher" role="tablist" aria-label="Pilih anak">{children.map((item) => <button role="tab" aria-selected={item.id === child.id} className={item.id === child.id ? 'active' : ''} key={item.id} onClick={() => setSelectedChildId(item.id)}>{item.full_name.split(' ')[0]}</button>)}</div>}
            <section className="v2-child-focus"><span>{initials(child.full_name)}</span><div><small>Anak terhubung</small><h3>{child.full_name}</h3><p>{child.class_name || 'Belum ada kelompok'} · {child.academic_year || 'Tahun ajaran belum diisi'}</p></div><button onClick={() => go('children')}><QrCode size={18} /> QR Anak</button></section>
            <div className="v2-stat-grid three">
              <StatCard icon={ClipboardCheck} label="Status Hari Ini" value={todayRecord?.check_in ? 'Sudah Absen' : 'Belum Absen'} meta={todayRecord?.status === 'late' ? 'Terlambat' : todayRecord?.check_in ? 'Tepat waktu' : 'Belum tercatat'} tone="green" />
              <StatCard icon={CheckCircle2} label="Jam Masuk" value={todayRecord?.check_in ? timeText(todayRecord.check_in) : '—'} meta="WIB" tone="blue" />
              <StatCard icon={CalendarDays} label="Jam Pulang" value={todayRecord?.check_out ? timeText(todayRecord.check_out) : '—'} meta="WIB" tone="gold" />
            </div>
            <section className="v5-section"><header><div><small>AKSES CEPAT</small><h3>Kebutuhan utama</h3></div></header><QuickGrid items={[
              ['Rapor Anak', 'Lihat perkembangan terbaru', BookOpenCheck, () => go('reports')],
              ['Pembayaran', 'Pantau tagihan anak', ClipboardCheck, () => go('payments')],
              ['Data Absen', 'Riwayat kehadiran', CheckCircle2, () => go('attendance-data')],
              ['Pengumuman', 'Informasi dari sekolah', CalendarDays, () => go('announcements')],
            ]} /></section>
          </>
        ) : <EmptyCard text="Belum ada anak yang terhubung ke akun ini." />}
      </div>
    )
  }

  return (
    <div className="v2-stack">
      <section className={`v2-hero ${role}`}><div><small>{role === 'admin' ? 'PANEL ADMINISTRATOR' : 'DASHBOARD GURU'}</small><h2>Selamat datang, {firstName}</h2><p>{greeting} · {role === 'admin' ? 'Kelola operasional sekolah dari satu tempat.' : 'Kelola kegiatan belajar dan kehadiran murid.'}</p></div>{role === 'admin' ? <ShieldCheck size={54} /> : <GraduationCap size={54} />}</section>
      {loading ? <SkeletonCards /> : <div className="v2-stat-grid four">
        <StatCard icon={UsersRound} label="Murid Aktif" value={String(studentCount)} meta="Terdaftar" tone="green" />
        <StatCard icon={ClipboardCheck} label="Hadir Hari Ini" value={String(attendanceCount)} meta={studentCount ? `${Math.round((attendanceCount / studentCount) * 100)}%` : '0%'} tone="blue" />
        <StatCard icon={CalendarDays} label="Terlambat" value={String(lateCount)} meta="Hari ini" tone="gold" />
        <StatCard icon={role === 'admin' ? UsersRound : Settings} label={role === 'admin' ? 'Akun Aktif' : 'Belum Absen'} value={role === 'admin' ? String(accountCount) : String(Math.max(0, studentCount - attendanceCount))} meta={role === 'admin' ? 'Pengguna' : 'Perlu diperiksa'} tone="purple" />
      </div>}
      <section className="v5-attention"><header><div><small>PERLU PERHATIAN</small><h3>Prioritas hari ini</h3></div></header><div>
        <button onClick={() => go('attendance-data')}><strong>{Math.max(0, studentCount - attendanceCount)}</strong><span>Murid belum absen</span></button>
        {role === 'admin' && <button onClick={() => go('payments')}><strong>{openPayments}</strong><span>Tagihan belum selesai</span></button>}
        <button onClick={() => go('reports')}><strong>{draftReports}</strong><span>Rapor masih draft</span></button>
      </div></section>
      <section className="v5-section"><header><div><small>AKSI CEPAT</small><h3>Mulai pekerjaan</h3></div></header><QuickGrid items={role === 'admin' ? [
        ['Scan QR', 'Catat masuk atau pulang', QrCode, () => go('attendance')],
        ['Tambah Murid', 'Kelola data murid', GraduationCap, () => go('students')],
        ['Isi Rapor', 'Catat perkembangan', BookOpenCheck, () => go('reports')],
        ['Pengumuman', 'Bagikan informasi', CalendarDays, () => go('announcements')],
      ] : [
        ['Scan QR', 'Catat masuk atau pulang', QrCode, () => go('attendance')],
        ['Data Absen', 'Periksa kehadiran', ClipboardCheck, () => go('attendance-data')],
        ['Isi Rapor', 'Catat perkembangan', BookOpenCheck, () => go('reports')],
        ['Jadwal Hari Ini', 'Lihat agenda kelas', CalendarDays, () => go('schedule')],
      ]} /></section>
    </div>
  )
}

export function ChildrenPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [selected, setSelected] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void supabase.from('students').select('id,full_name,nis,class_name,academic_year,qr_token').order('full_name').then(({ data }) => {
      setStudents((data as Student[] | null) ?? [])
      setLoading(false)
    })
  }, [])

  return <div className="v2-stack"><PageTitle eyebrow="DATA KELUARGA" title="Data Anak" text="Data resmi anak yang terhubung dengan akun wali." />{loading ? <SkeletonRows /> : students.length ? <div className="v2-card-grid">{students.map((student) => <article className="v2-person-card" key={student.id}><span>{initials(student.full_name)}</span><div><h3>{student.full_name}</h3><p>{student.class_name || 'Belum ada kelompok'}</p><small>{student.nis ? `NIS ${student.nis}` : 'NIS belum diisi'} · {student.academic_year || '-'}</small></div><button onClick={() => setSelected(student)}><QrCode size={17} /> Tampilkan QR</button></article>)}</div> : <EmptyCard text="Belum ada anak yang terhubung." />}{selected && <div className="v2-modal-layer"><button className="v2-backdrop" aria-label="Tutup" onClick={() => setSelected(null)} /><section className="v2-modal qr"><button className="v2-close" onClick={() => setSelected(null)}><X size={19} /></button><span className="v2-modal-icon"><QrCode /></span><h2>{selected.full_name}</h2><p>{selected.class_name || 'RA Nurul Falah'}</p><div className="v2-qr"><QRCodeSVG value={`RA-NF:${selected.qr_token}`} size={230} level="H" includeMargin /></div><small>Tunjukkan QR kepada Guru saat masuk dan pulang.</small></section></div>}</div>
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SchoolSetting | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const load = async () => {
    const { data } = await supabase.from('school_settings').select('*').eq('id', 1).single()
    setSettings(data as SchoolSetting | null)
  }
  useEffect(() => { void load() }, [])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!settings) return
    setBusy(true); setMessage(null)
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('school_settings').update({ school_name: settings.school_name.trim(), address: settings.address?.trim() || null, phone: settings.phone?.trim() || null, email: settings.email?.trim() || null, timezone: settings.timezone.trim() || 'Asia/Jakarta', late_cutoff: settings.late_cutoff, academic_year: settings.academic_year.trim(), updated_by: userData.user?.id || null }).eq('id', 1)
    setBusy(false)
    if (error) { setMessage({ tone: 'error', text: error.message }); return }
    setEditing(false); setMessage({ tone: 'success', text: 'Pengaturan sekolah berhasil diperbarui.' }); await load()
  }

  if (!settings) return <div className="v2-stack"><PageTitle eyebrow="KONFIGURASI" title="Pengaturan Sekolah" text="Memuat konfigurasi..." /><SkeletonRows /></div>
  return <div className="v2-stack"><PageTitle eyebrow="KONFIGURASI" title="Pengaturan Sekolah" text="Nilai ini digunakan langsung oleh sistem, termasuk batas terlambat absensi." action={!editing ? <button className="v2-primary" onClick={() => setEditing(true)}><Edit3 size={17} /> Edit Pengaturan</button> : undefined} />{message && <Notice {...message} />}<section className="v2-panel">{editing ? <form className="v2-form v2-form-grid" onSubmit={save}><label>Nama sekolah<input value={settings.school_name} onChange={(e) => setSettings({ ...settings, school_name: e.target.value })} /></label><label>Tahun ajaran<input value={settings.academic_year} onChange={(e) => setSettings({ ...settings, academic_year: e.target.value })} /></label><label>Batas terlambat<input type="time" value={settings.late_cutoff.slice(0, 5)} onChange={(e) => setSettings({ ...settings, late_cutoff: e.target.value })} /></label><label>Zona waktu<input value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} /></label><label>Telepon<input value={settings.phone || ''} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} /></label><label>Email<input type="email" value={settings.email || ''} onChange={(e) => setSettings({ ...settings, email: e.target.value })} /></label><label className="full">Alamat<textarea rows={3} value={settings.address || ''} onChange={(e) => setSettings({ ...settings, address: e.target.value })} /></label><div className="v2-form-actions full"><button type="button" className="v2-secondary" onClick={() => { setEditing(false); void load() }}>Batal</button><button className="v2-primary" disabled={busy}><Save size={17} /> {busy ? 'Menyimpan...' : 'Simpan Pengaturan'}</button></div></form> : <div className="v2-settings-grid"><Info label="Nama Sekolah" value={settings.school_name} /><Info label="Tahun Ajaran" value={settings.academic_year} /><Info label="Batas Terlambat" value={`${settings.late_cutoff.slice(0, 5)} WIB`} /><Info label="Zona Waktu" value={settings.timezone} /><Info label="Telepon" value={settings.phone || 'Belum diisi'} /><Info label="Email" value={settings.email || 'Belum diisi'} /><Info label="Alamat" value={settings.address || 'Belum diisi'} /></div>}</section></div>
}

export function PageTitle({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: ReactNode }) {
  return <header className="v2-page-title"><div><small>{eyebrow}</small><h2>{title}</h2><p>{text}</p></div>{action}</header>
}

export function Notice({ tone, text }: { tone: 'success' | 'error'; text: string }) { return <div className={`v2-notice ${tone}`}>{tone === 'success' ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}<span>{text}</span></div> }
export function EmptyCard({ text }: { text: string }) { return <section className="v2-empty"><span>—</span><h3>Belum ada data</h3><p>{text}</p></section> }
export function SkeletonRows() { return <div className="v2-skeleton-list">{Array.from({ length: 4 }, (_, i) => <i key={i} />)}</div> }
function SkeletonCards() { return <div className="v2-stat-grid four">{Array.from({ length: 4 }, (_, i) => <div className="v2-skeleton-card" key={i} />)}</div> }

function StatCard({ icon: Icon, label, value, meta, tone }: { icon: typeof UsersRound; label: string; value: string; meta: string; tone: string }) { return <article className={`v2-stat ${tone}`}><span><Icon size={21} /></span><div><small>{label}</small><strong>{value}</strong><p>{meta}</p></div></article> }
function QuickGrid({ items }: { items: [string, string, typeof UsersRound, () => void][] }) { return <section className="v2-quick-grid">{items.map(([label, text, Icon, onClick]) => <button key={label} onClick={onClick}><span><Icon size={23} /></span><div><strong>{label}</strong><small>{text}</small></div></button>)}</section> }
function Info({ label, value }: { label: string; value: string }) { return <div className="v2-info"><small>{label}</small><strong>{value}</strong></div> }
function initials(name?: string | null) { return (name || 'Pengguna').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }
function timeText(value: string) { return new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: JAKARTA }) }
