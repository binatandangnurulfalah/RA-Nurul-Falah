import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Edit3,
  GraduationCap,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { type AppRole, supabase, type UserProfile } from '../lib/supabase'
import { Dialog, LoadError, useChildSelection } from './AppExperience'
import '../dashboard-v11.css'

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

type DashboardScheduleItem = {
  id: string
  class_name: string
  activity: string
  start_time: string
  end_time: string
  teacher_name: string | null
}

type DashboardAttendanceItem = {
  id: string
  student_id: string
  student_name: string
  status: string
  check_in: string | null
  check_out: string | null
  event_time: string
}

type DashboardAnnouncementItem = {
  id: string
  title: string
  created_at: string
}

type DashboardSummary = {
  role: AppRole
  generated_at: string
  attendance_date: string
  active_students: number
  attendance_today: number
  recorded_today: number
  late_today: number
  absent_today: number
  unrecorded_today: number
  active_accounts: number
  draft_reports: number
  open_payments: number
  today_schedule_count: number
  published_announcements: number
  today_schedule: DashboardScheduleItem[]
  recent_attendance: DashboardAttendanceItem[]
  recent_announcements: DashboardAnnouncementItem[]
}

const JAKARTA = 'Asia/Jakarta'
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA }).format(new Date())

export function DashboardPage({ role, profile, go }: { role: AppRole; profile: UserProfile; go: (page: string) => void }) {
  const childSelection = useChildSelection()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [summaryError, setSummaryError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [loading, setLoading] = useState(true)
  const [todayRecord, setTodayRecord] = useState<{ check_in: string | null; check_out: string | null; status: string } | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setSummaryError('')
      const { data, error } = await supabase.rpc('dashboard_summary')
      if (!mounted) return
      if (error) {
        setSummary(null)
        setSummaryError('Ringkasan dashboard belum dapat dimuat. Periksa koneksi lalu coba lagi.')
      } else {
        setSummary(data as unknown as DashboardSummary)
      }
      setLoading(false)
    }
    void load()
    return () => { mounted = false }
  }, [role, reloadToken])

  useEffect(() => {
    if (role !== 'parent' || !childSelection.selectedChildId) {
      setTodayRecord(null)
      return
    }
    let mounted = true
    setTodayRecord(null)
    void supabase.from('attendance_records').select('check_in,check_out,status').eq('student_id', childSelection.selectedChildId).eq('attendance_date', today()).maybeSingle().then(({ data }) => {
      if (mounted) setTodayRecord(data as typeof todayRecord)
    })
    return () => { mounted = false }
  }, [role, childSelection.selectedChildId])

  const greeting = new Intl.DateTimeFormat('id-ID', { timeZone: JAKARTA, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const firstName = (profile.display_name || 'Pengguna').split(' ')[0]
  const reload = () => setReloadToken((value) => value + 1)

  if (role === 'parent') {
    const children = childSelection.children as Student[]
    const child = children.find((item) => item.id === childSelection.selectedChildId) ?? children[0]
    return (
      <div className="v2-stack">
        <section className="v2-hero parent"><div><small>BERANDA WALI</small><h2>Assalamu'alaikum, {firstName}</h2><p>{greeting} · Pantau aktivitas anak dengan ringkas.</p></div><UserRound size={54} /></section>
        {summaryError && <LoadError text={summaryError} onRetry={reload} />}
        {childSelection.error && <LoadError text={childSelection.error} onRetry={childSelection.retry} />}
        {loading ? <SkeletonCards /> : child ? (
          <>
            <section className="v2-child-focus"><span>{initials(child.full_name)}</span><div><small>Anak terhubung</small><h3>{child.full_name}</h3><p>{child.class_name || 'Belum ada kelompok'} · {child.academic_year || 'Tahun ajaran belum diisi'}</p></div><button onClick={() => go('children')}><QrCode size={18} /> QR Anak</button></section>
            <div className="v2-stat-grid four">
              <StatCard icon={ClipboardCheck} label="Status Hari Ini" value={todayRecord?.check_in ? 'Sudah Absen' : 'Belum Absen'} meta={todayRecord?.status === 'late' ? 'Terlambat' : todayRecord?.check_in ? 'Tepat waktu' : 'Belum tercatat'} tone="green" />
              <StatCard icon={CheckCircle2} label="Jam Masuk" value={todayRecord?.check_in ? timeText(todayRecord.check_in) : '—'} meta="WIB" tone="blue" />
              <StatCard icon={CalendarDays} label="Jam Pulang" value={todayRecord?.check_out ? timeText(todayRecord.check_out) : '—'} meta="WIB" tone="gold" />
              <StatCard icon={AlertTriangle} label="Tagihan Aktif" value={String(summary?.open_payments ?? 0)} meta="Anak terhubung" tone="purple" />
            </div>
            <DashboardInfoGrid summary={summary} role={role} go={go} />
            <section className="v5-section"><header><div><small>AKSES CEPAT</small><h3>Kebutuhan utama</h3></div></header><QuickGrid items={[
              ['Rapor Anak', 'Lihat perkembangan terbaru', BookOpenCheck, () => go('reports')],
              ['Pembayaran', 'Pantau tagihan anak', ClipboardCheck, () => go('payments')],
              ['Data Absen', 'Riwayat kehadiran', CheckCircle2, () => go('attendance-data')],
              ['Pengumuman', 'Informasi dari sekolah', Bell, () => go('announcements')],
            ]} /></section>
          </>
        ) : <EmptyCard text="Belum ada anak yang terhubung ke akun ini." />}
      </div>
    )
  }

  const studentCount = summary?.active_students ?? 0
  const attendanceCount = summary?.attendance_today ?? 0
  const lateCount = summary?.late_today ?? 0
  const unrecordedCount = summary?.unrecorded_today ?? 0
  const accountCount = summary?.active_accounts ?? 0
  const draftReports = summary?.draft_reports ?? 0
  const openPayments = summary?.open_payments ?? 0

  return (
    <div className="v2-stack">
      <section className={`v2-hero ${role}`}><div><small>{role === 'admin' ? 'PANEL ADMINISTRATOR' : 'DASHBOARD GURU'}</small><h2>Selamat datang, {firstName}</h2><p>{greeting} · {role === 'admin' ? 'Kelola operasional sekolah dari satu tempat.' : 'Kelola kegiatan belajar dan kehadiran murid.'}</p></div>{role === 'admin' ? <ShieldCheck size={54} /> : <GraduationCap size={54} />}</section>
      {summaryError && <LoadError text={summaryError} onRetry={reload} />}
      {loading ? <SkeletonCards /> : <div className="v2-stat-grid four">
        <StatCard icon={UsersRound} label={role === 'teacher' ? 'Murid Dalam Scope' : 'Murid Aktif'} value={String(studentCount)} meta={role === 'teacher' ? 'Kelas yang ditugaskan' : 'Terdaftar'} tone="green" />
        <StatCard icon={ClipboardCheck} label="Hadir Hari Ini" value={String(attendanceCount)} meta={studentCount ? `${Math.round((attendanceCount / studentCount) * 100)}%` : '0%'} tone="blue" />
        <StatCard icon={CalendarDays} label="Terlambat" value={String(lateCount)} meta="Hari ini" tone="gold" />
        <StatCard icon={role === 'admin' ? UsersRound : AlertTriangle} label={role === 'admin' ? 'Akun Aktif' : 'Belum Absen'} value={role === 'admin' ? String(accountCount) : String(unrecordedCount)} meta={role === 'admin' ? 'Pengguna' : 'Belum tercatat'} tone="purple" />
      </div>}
      {!loading && <section className="v5-attention"><header><div><small>PERLU PERHATIAN</small><h3>Prioritas hari ini</h3></div><button className="v11-refresh" onClick={reload} aria-label="Muat ulang ringkasan"><RefreshCw size={16} /> Perbarui</button></header><div>
        <button onClick={() => go('attendance-data')}><strong>{unrecordedCount}</strong><span>Murid belum tercatat</span></button>
        {role === 'admin' && <button onClick={() => go('payments')}><strong>{openPayments}</strong><span>Tagihan belum selesai</span></button>}
        <button onClick={() => go('reports')}><strong>{draftReports}</strong><span>Rapor masih draft</span></button>
      </div></section>}
      {!loading && <DashboardInfoGrid summary={summary} role={role} go={go} />}
      <section className="v5-section"><header><div><small>AKSI CEPAT</small><h3>Mulai pekerjaan</h3></div></header><QuickGrid items={role === 'admin' ? [
        ['Scan QR', 'Catat masuk atau pulang', QrCode, () => go('attendance')],
        ['Tambah Murid', 'Kelola data murid', GraduationCap, () => go('students')],
        ['Isi Rapor', 'Catat perkembangan', BookOpenCheck, () => go('reports')],
        ['Pengumuman', 'Bagikan informasi', Bell, () => go('announcements')],
      ] : [
        ['Scan QR', 'Catat masuk atau pulang', QrCode, () => go('attendance')],
        ['Data Absen', 'Periksa kehadiran', ClipboardCheck, () => go('attendance-data')],
        ['Isi Rapor', 'Catat perkembangan', BookOpenCheck, () => go('reports')],
        ['Jadwal Hari Ini', 'Lihat agenda kelas', CalendarDays, () => go('schedule')],
      ]} /></section>
    </div>
  )
}

function DashboardInfoGrid({ summary, role, go }: { summary: DashboardSummary | null; role: AppRole; go: (page: string) => void }) {
  const schedules = summary?.today_schedule ?? []
  const attendance = summary?.recent_attendance ?? []
  const announcements = summary?.recent_announcements ?? []

  return (
    <section className="v11-dashboard-grid" aria-label="Ringkasan kegiatan">
      <article className="v2-panel v11-dashboard-panel">
        <header><div><small>JADWAL HARI INI</small><h3>{summary?.today_schedule_count ?? 0} kegiatan</h3></div><button onClick={() => go('schedule')}>Lihat jadwal</button></header>
        {schedules.length ? <div className="v11-timeline">{schedules.map((item) => <div key={item.id}><time>{item.start_time.slice(0, 5)}</time><span /><div><strong>{item.activity}</strong><small>{item.class_name}{item.teacher_name ? ` · ${item.teacher_name}` : ''}</small></div></div>)}</div> : <DashboardMiniEmpty icon={Clock3} text="Tidak ada jadwal aktif hari ini." />}
      </article>
      {role !== 'parent' ? <article className="v2-panel v11-dashboard-panel">
        <header><div><small>ABSENSI TERBARU</small><h3>Aktivitas hari ini</h3></div><button onClick={() => go('attendance-data')}>Lihat semua</button></header>
        {attendance.length ? <div className="v11-activity-list">{attendance.map((item) => <div key={item.id}><span>{initials(item.student_name)}</span><div><strong>{item.student_name}</strong><small>{attendanceEvent(item)}</small></div><b className={`v11-status ${item.status}`}>{statusText(item.status)}</b></div>)}</div> : <DashboardMiniEmpty icon={ClipboardCheck} text="Belum ada aktivitas absensi hari ini." />}
      </article> : <article className="v2-panel v11-dashboard-panel">
        <header><div><small>RINGKASAN KELUARGA</small><h3>{summary?.active_students ?? 0} anak terhubung</h3></div><button onClick={() => go('children')}>Data anak</button></header>
        <div className="v11-parent-summary"><span><UsersRound size={22} /></span><div><strong>{summary?.open_payments ?? 0} tagihan aktif</strong><small>Ringkasan ini hanya menghitung data anak yang terhubung ke akun Wali.</small></div></div>
      </article>}
      <article className="v2-panel v11-dashboard-panel v11-announcements">
        <header><div><small>PENGUMUMAN TERBARU</small><h3>{summary?.published_announcements ?? 0} informasi tersedia</h3></div><button onClick={() => go('announcements')}>Buka pengumuman</button></header>
        {announcements.length ? <div className="v11-announcement-list">{announcements.map((item) => <button key={item.id} onClick={() => go('announcements')}><Bell size={17} /><span><strong>{item.title}</strong><small>{dateText(item.created_at)}</small></span></button>)}</div> : <DashboardMiniEmpty icon={Bell} text="Belum ada pengumuman yang dipublikasikan." />}
      </article>
    </section>
  )
}

function DashboardMiniEmpty({ icon: Icon, text }: { icon: typeof UsersRound; text: string }) {
  return <div className="v11-mini-empty"><Icon size={20} /><span>{text}</span></div>
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

  return <div className="v2-stack"><PageTitle eyebrow="DATA KELUARGA" title="Data Anak" text="Data resmi anak yang terhubung dengan akun wali." />{loading ? <SkeletonRows /> : students.length ? <div className="v2-card-grid">{students.map((student) => <article className="v2-person-card" key={student.id}><span>{initials(student.full_name)}</span><div><h3>{student.full_name}</h3><p>{student.class_name || 'Belum ada kelompok'}</p><small>{student.nis ? `NIS ${student.nis}` : 'NIS belum diisi'} · {student.academic_year || '-'}</small></div><button onClick={() => setSelected(student)}><QrCode size={17} /> Tampilkan QR</button></article>)}</div> : <EmptyCard text="Belum ada anak yang terhubung." />}{selected && <Dialog title={selected.full_name} onClose={() => setSelected(null)}><div className="v2-qr"><QRCodeSVG value={`RA-NF:${selected.qr_token}`} size={230} level="H" includeMargin /></div><p>{selected.class_name || 'RA Nurul Falah'}</p><small>Tunjukkan QR kepada Guru saat masuk dan pulang.</small></Dialog>}</div>
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
function dateText(value: string) { return new Intl.DateTimeFormat('id-ID', { timeZone: JAKARTA, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function statusText(value: string) { return value === 'late' ? 'Terlambat' : value === 'present' ? 'Hadir' : value === 'sick' ? 'Sakit' : value === 'excused' ? 'Izin' : value === 'absent' ? 'Alpa' : value }
function attendanceEvent(item: DashboardAttendanceItem) { if (item.check_out) return `Pulang ${timeText(item.check_out)} WIB`; if (item.check_in) return `Masuk ${timeText(item.check_in)} WIB`; return statusText(item.status) }
