import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  BadgeDollarSign,
  BookOpenCheck,
  CheckCircle2,
  ContactRound,
  Edit3,
  ExternalLink,
  FileText,
  GraduationCap,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { type AppRole, supabase, type UserProfile } from '../lib/supabase'
import { EmptyCard, Notice, PageTitle, SkeletonRows } from './PortalPages'

type Message = { tone: 'success' | 'error'; text: string }
type StudentLite = { id: string; full_name: string; class_name: string | null; academic_year: string | null; is_active?: boolean }
type TeacherAccount = Pick<UserProfile, 'id' | 'display_name' | 'phone' | 'is_active'>
type TeacherProfile = {
  teacher_user_id: string
  employee_no: string | null
  nuptk: string | null
  position: string | null
  employment_status: string | null
  education: string | null
  gender: 'L' | 'P' | null
  birth_place: string | null
  birth_date: string | null
  joined_date: string | null
  notes: string | null
}
type TeacherRow = TeacherAccount & { detail: TeacherProfile | null }
type ReportCard = {
  id: string
  student_id: string
  academic_year: string
  semester: number
  religion_character: string | null
  identity_independence: string | null
  literacy_steam: string | null
  growth_notes: string | null
  teacher_note: string | null
  is_published: boolean
  created_at: string
  updated_at: string
}
type Payment = {
  id: string
  student_id: string
  payment_type: string
  period_label: string | null
  amount: number | string
  paid_amount: number | string
  due_date: string | null
  paid_at: string | null
  status: 'unpaid' | 'partial' | 'paid' | 'waived'
  notes: string | null
  created_at: string
}
type SchoolDocument = {
  id: string
  title: string
  category: string
  document_number: string | null
  document_date: string | null
  recipient: string | null
  description: string | null
  file_url: string | null
  audience: 'all' | 'admin' | 'teacher' | 'parent'
  is_published: boolean
  created_at: string
}

export function ModuleLaunchpad({ role, go }: { role: AppRole; go: (page: string) => void }) {
  const items = role === 'admin'
    ? [
        ['Data Guru', 'Data profesional tenaga pendidik', ContactRound, 'teachers', 'mint'],
        ['Penilaian & Rapor', 'Catatan perkembangan murid', BookOpenCheck, 'reports', 'blue'],
        ['Pembayaran', 'Tagihan dan pembayaran murid', BadgeDollarSign, 'payments', 'gold'],
        ['Dokumen & Surat', 'Arsip dan dokumen sekolah', FileText, 'documents', 'purple'],
      ] as const
    : role === 'teacher'
      ? [
          ['Penilaian & Rapor', 'Isi perkembangan murid', BookOpenCheck, 'reports', 'blue'],
          ['Dokumen & Surat', 'Dokumen resmi untuk Guru', FileText, 'documents', 'purple'],
        ] as const
      : [
          ['Rapor Anak', 'Lihat rapor yang telah diterbitkan', BookOpenCheck, 'reports', 'blue'],
          ['Pembayaran', 'Pantau tagihan dan pembayaran', BadgeDollarSign, 'payments', 'gold'],
          ['Dokumen & Surat', 'Dokumen resmi untuk Wali', FileText, 'documents', 'purple'],
        ] as const

  return <section className="school-launchpad"><header><div><small>MODUL SEKOLAH</small><h3>Layanan utama</h3></div><p>Akses cepat sesuai hak akun Anda.</p></header><div>{items.map(([title, text, Icon, page, tone]) => <button key={page} className={tone} onClick={() => go(page)}><span><Icon size={21} /></span><div><strong>{title}</strong><small>{text}</small></div></button>)}</div></section>
}

export function TeachersPage() {
  const [rows, setRows] = useState<TeacherRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<TeacherRow | 'new' | null>(null)
  const [deleting, setDeleting] = useState<TeacherRow | null>(null)
  const [message, setMessage] = useState<Message | null>(null)

  const load = async () => {
    setLoading(true)
    const [accountsResult, detailsResult] = await Promise.all([
      supabase.from('user_profiles').select('id,display_name,phone,is_active').eq('role', 'teacher').order('display_name'),
      supabase.from('teacher_profiles').select('*'),
    ])
    if (accountsResult.error || detailsResult.error) setMessage({ tone: 'error', text: accountsResult.error?.message || detailsResult.error?.message || 'Data Guru gagal dimuat.' })
    const accounts = (accountsResult.data as TeacherAccount[] | null) ?? []
    const details = (detailsResult.data as TeacherProfile[] | null) ?? []
    const byId = new Map(details.map((item) => [item.teacher_user_id, item]))
    setRows(accounts.map((account) => ({ ...account, detail: byId.get(account.id) ?? null })))
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => !q || `${row.display_name || ''} ${row.detail?.employee_no || ''} ${row.detail?.nuptk || ''} ${row.detail?.position || ''}`.toLowerCase().includes(q))
  }, [rows, search])

  const remove = async () => {
    if (!deleting?.detail) return
    const { error } = await supabase.from('teacher_profiles').delete().eq('teacher_user_id', deleting.id)
    if (error) { setMessage({ tone: 'error', text: error.message }); return }
    setDeleting(null); setMessage({ tone: 'success', text: 'Detail Guru dihapus. Akun login Guru tetap aktif.' }); await load()
  }

  const available = rows.filter((row) => !row.detail)
  return <div className="v2-stack"><PageTitle eyebrow="TENAGA PENDIDIK" title="Data Guru" text="Kelola identitas profesional Guru tanpa mencampur data login akun." action={<button className="v2-primary" onClick={() => setEditing('new')} disabled={!available.length}><Plus size={17} /> Lengkapi Data Guru</button>} />{message && <Notice {...message} />}
    <div className="v2-stat-grid three"><MiniStat icon={<ContactRound size={20} />} label="Total Guru" value={rows.length} tone="green" /><MiniStat icon={<CheckCircle2 size={20} />} label="Data Lengkap" value={rows.filter((row) => row.detail).length} tone="blue" /><MiniStat icon={<UserRound size={20} />} label="Belum Lengkap" value={available.length} tone="gold" /></div>
    <section className="v2-panel"><div className="v2-toolbar"><label><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, NUPTK, nomor pegawai..." /></label></div>{loading ? <SkeletonRows /> : filtered.length ? <div className="school-card-grid">{filtered.map((row) => <article className="school-person" key={row.id}><span className="v2-avatar">{initials(row.display_name)}</span><div className="grow"><div className="school-meta"><span className={`v2-badge ${row.is_active ? 'green' : 'gray'}`}>{row.is_active ? 'Aktif' : 'Nonaktif'}</span>{row.detail ? <span className="v2-badge blue">Data lengkap</span> : <span className="v2-badge gold">Belum lengkap</span>}</div><h3>{row.display_name || 'Guru'}</h3><p>{row.detail?.position || 'Jabatan belum diisi'} · {row.detail?.employment_status || 'Status kepegawaian belum diisi'}</p><small>{row.detail?.nuptk ? `NUPTK ${row.detail.nuptk}` : row.detail?.employee_no ? `No. Pegawai ${row.detail.employee_no}` : row.phone || 'Identitas profesional belum dilengkapi'}</small></div><div className="v2-inline-actions"><button title="Edit data Guru" onClick={() => setEditing(row)}><Edit3 size={17} /></button>{row.detail && <button className="danger" title="Hapus detail Guru" onClick={() => setDeleting(row)}><Trash2 size={17} /></button>}</div></article>)}</div> : <EmptyCard text="Belum ada akun Guru. Buat akun Guru dari menu Manajemen Akun terlebih dahulu." />}</section>
    {editing && <TeacherModal row={editing === 'new' ? null : editing} available={available} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); setMessage({ tone: 'success', text: 'Data Guru berhasil disimpan.' }); await load() }} />}
    {deleting && <Confirm title="Hapus detail Guru?" text={`Detail profesional ${deleting.display_name || 'Guru'} akan dihapus, tetapi akun loginnya tetap ada.`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}
  </div>
}

function TeacherModal({ row, available, onClose, onDone }: { row: TeacherRow | null; available: TeacherRow[]; onClose: () => void; onDone: () => void }) {
  const detail = row?.detail
  const [form, setForm] = useState({ teacher_user_id: row?.id || available[0]?.id || '', employee_no: detail?.employee_no || '', nuptk: detail?.nuptk || '', position: detail?.position || '', employment_status: detail?.employment_status || '', education: detail?.education || '', gender: detail?.gender || '', birth_place: detail?.birth_place || '', birth_date: detail?.birth_date || '', joined_date: detail?.joined_date || '', notes: detail?.notes || '' })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setErrorText('')
    const payload = { teacher_user_id: form.teacher_user_id, employee_no: form.employee_no.trim() || null, nuptk: form.nuptk.trim() || null, position: form.position.trim() || null, employment_status: form.employment_status.trim() || null, education: form.education.trim() || null, gender: form.gender || null, birth_place: form.birth_place.trim() || null, birth_date: form.birth_date || null, joined_date: form.joined_date || null, notes: form.notes.trim() || null }
    const result = detail ? await supabase.from('teacher_profiles').update(payload).eq('teacher_user_id', row!.id) : await supabase.from('teacher_profiles').insert(payload)
    setBusy(false)
    if (result.error) { setErrorText(result.error.code === '23505' ? 'Nomor pegawai atau NUPTK sudah digunakan.' : result.error.message); return }
    onDone()
  }
  return <Modal title={detail ? 'Edit Data Guru' : 'Lengkapi Data Guru'} onClose={onClose} wide><form className="v2-form v2-form-grid" onSubmit={submit}>{!row && <label className="full">Akun Guru<select required value={form.teacher_user_id} onChange={(e) => setForm({ ...form, teacher_user_id: e.target.value })}>{available.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.display_name || 'Guru'}</option>)}</select></label>}<label>No. pegawai<input value={form.employee_no} onChange={(e) => setForm({ ...form, employee_no: e.target.value })} /></label><label>NUPTK<input value={form.nuptk} onChange={(e) => setForm({ ...form, nuptk: e.target.value })} /></label><label>Jabatan<input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Guru Kelas / Kepala RA" /></label><label>Status kepegawaian<input value={form.employment_status} onChange={(e) => setForm({ ...form, employment_status: e.target.value })} placeholder="Tetap / Honorer" /></label><label>Pendidikan terakhir<input value={form.education} onChange={(e) => setForm({ ...form, education: e.target.value })} placeholder="S1 PGRA" /></label><label>Jenis kelamin<select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">Belum diisi</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></label><label>Tempat lahir<input value={form.birth_place} onChange={(e) => setForm({ ...form, birth_place: e.target.value })} /></label><label>Tanggal lahir<input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></label><label>Tanggal mulai mengajar<input type="date" value={form.joined_date} onChange={(e) => setForm({ ...form, joined_date: e.target.value })} /></label><label className="full">Catatan<textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>{errorText && <p className="v2-field-error full">{errorText}</p>}<div className="v2-form-actions full"><button type="button" className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Data Guru'}</button></div></form></Modal>
}

export function ReportsPage({ role }: { role: AppRole }) {
  const canManage = role !== 'parent'
  const canDelete = role === 'admin'
  const [students, setStudents] = useState<StudentLite[]>([])
  const [rows, setRows] = useState<ReportCard[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<ReportCard | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ReportCard | null>(null)
  const [viewing, setViewing] = useState<ReportCard | null>(null)
  const [message, setMessage] = useState<Message | null>(null)

  const load = async () => {
    setLoading(true)
    const [studentResult, reportResult] = await Promise.all([
      supabase.from('students').select('id,full_name,class_name,academic_year,is_active').eq('is_active', true).order('full_name'),
      supabase.from('report_cards').select('*').order('academic_year', { ascending: false }).order('semester', { ascending: false }).order('updated_at', { ascending: false }),
    ])
    if (studentResult.error || reportResult.error) setMessage({ tone: 'error', text: studentResult.error?.message || reportResult.error?.message || 'Rapor gagal dimuat.' })
    setStudents((studentResult.data as StudentLite[] | null) ?? [])
    setRows((reportResult.data as ReportCard[] | null) ?? [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const studentMap = useMemo(() => new Map(students.map((student) => [student.id, student])), [students])
  const filtered = useMemo(() => { const q = search.trim().toLowerCase(); return rows.filter((row) => { const student = studentMap.get(row.student_id); return !q || `${student?.full_name || ''} ${student?.class_name || ''} ${row.academic_year}`.toLowerCase().includes(q) }) }, [rows, search, studentMap])
  const remove = async () => { if (!deleting || !canDelete) return; const { error } = await supabase.from('report_cards').delete().eq('id', deleting.id); if (error) { setMessage({ tone: 'error', text: error.message }); return }; setDeleting(null); setMessage({ tone: 'success', text: 'Rapor berhasil dihapus.' }); await load() }

  return <div className="v2-stack"><PageTitle eyebrow="PERKEMBANGAN MURID" title={role === 'parent' ? 'Rapor Anak' : 'Penilaian & Rapor'} text={canManage ? 'Catat perkembangan anak dan terbitkan rapor untuk Wali.' : 'Rapor yang sudah diterbitkan oleh RA Nurul Falah.'} action={canManage ? <button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Buat Rapor</button> : undefined} />{message && <Notice {...message} />}
    <div className="v2-stat-grid three"><MiniStat icon={<BookOpenCheck size={20} />} label="Total Rapor" value={rows.length} tone="blue" /><MiniStat icon={<CheckCircle2 size={20} />} label="Terbit" value={rows.filter((row) => row.is_published).length} tone="green" /><MiniStat icon={<GraduationCap size={20} />} label="Draft" value={rows.filter((row) => !row.is_published).length} tone="gold" /></div>
    <section className="v2-panel"><div className="v2-toolbar"><label><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama murid, kelas, tahun ajaran..." /></label></div>{loading ? <SkeletonRows /> : filtered.length ? <div className="school-card-grid">{filtered.map((row) => { const student = studentMap.get(row.student_id); return <article className="school-report-card" key={row.id}><div className="school-report-icon"><BookOpenCheck /></div><div className="grow"><div className="school-meta"><span className={`v2-badge ${row.is_published ? 'green' : 'gray'}`}>{row.is_published ? 'Terbit' : 'Draft'}</span><span>Semester {row.semester}</span><span>{row.academic_year}</span></div><h3>{student?.full_name || 'Murid'}</h3><p>{student?.class_name || 'Belum ada kelompok'}</p><small>{row.teacher_note || row.growth_notes || 'Catatan perkembangan belum diisi.'}</small></div><div className="v2-inline-actions"><button title="Lihat rapor" onClick={() => setViewing(row)}><BookOpenCheck size={17} /></button>{canManage && <button title="Edit rapor" onClick={() => setEditing(row)}><Edit3 size={17} /></button>}{canDelete && <button className="danger" title="Hapus rapor" onClick={() => setDeleting(row)}><Trash2 size={17} /></button>}</div></article>})}</div> : <EmptyCard text={role === 'parent' ? 'Belum ada rapor yang diterbitkan.' : 'Belum ada data rapor.'} />}</section>
    {editing && canManage && <ReportModal value={editing === 'new' ? null : editing} students={students} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); setMessage({ tone: 'success', text: 'Rapor berhasil disimpan.' }); await load() }} />}
    {viewing && <ReportViewer value={viewing} student={studentMap.get(viewing.student_id)} onClose={() => setViewing(null)} />}
    {deleting && <Confirm title="Hapus rapor?" text={`Rapor ${studentMap.get(deleting.student_id)?.full_name || 'murid'} semester ${deleting.semester} akan dihapus.`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}
  </div>
}

function ReportModal({ value, students, onClose, onDone }: { value: ReportCard | null; students: StudentLite[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ student_id: value?.student_id || students[0]?.id || '', academic_year: value?.academic_year || students[0]?.academic_year || '2026/2027', semester: value?.semester || 1, religion_character: value?.religion_character || '', identity_independence: value?.identity_independence || '', literacy_steam: value?.literacy_steam || '', growth_notes: value?.growth_notes || '', teacher_note: value?.teacher_note || '', published: value?.is_published ?? false })
  const [busy, setBusy] = useState(false); const [errorText, setErrorText] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setErrorText(''); const payload = { student_id: form.student_id, academic_year: form.academic_year.trim(), semester: Number(form.semester), religion_character: form.religion_character.trim() || null, identity_independence: form.identity_independence.trim() || null, literacy_steam: form.literacy_steam.trim() || null, growth_notes: form.growth_notes.trim() || null, teacher_note: form.teacher_note.trim() || null, is_published: form.published }; const result = value ? await supabase.from('report_cards').update(payload).eq('id', value.id) : await supabase.from('report_cards').insert(payload); setBusy(false); if (result.error) { setErrorText(result.error.code === '23505' ? 'Rapor murid untuk tahun ajaran dan semester ini sudah ada.' : result.error.message); return }; onDone() }
  return <Modal title={value ? 'Edit Rapor' : 'Buat Rapor'} onClose={onClose} wide><form className="v2-form v2-form-grid" onSubmit={submit}><label>Murid<select required value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name} {student.class_name ? `· ${student.class_name}` : ''}</option>)}</select></label><label>Tahun ajaran<input required value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} /></label><label>Semester<select value={form.semester} onChange={(e) => setForm({ ...form, semester: Number(e.target.value) })}><option value={1}>Semester 1</option><option value={2}>Semester 2</option></select></label><label className="v2-toggle"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /><span>Terbitkan untuk Wali</span></label><label className="full">Nilai Agama & Budi Pekerti<textarea rows={4} value={form.religion_character} onChange={(e) => setForm({ ...form, religion_character: e.target.value })} placeholder="Perkembangan nilai agama, akhlak, kebiasaan baik..." /></label><label className="full">Jati Diri<textarea rows={4} value={form.identity_independence} onChange={(e) => setForm({ ...form, identity_independence: e.target.value })} placeholder="Kemandirian, sosial emosional, motorik dan kebiasaan diri..." /></label><label className="full">Dasar Literasi & STEAM<textarea rows={4} value={form.literacy_steam} onChange={(e) => setForm({ ...form, literacy_steam: e.target.value })} placeholder="Bahasa, numerasi, sains, teknologi, rekayasa dan seni..." /></label><label className="full">Catatan pertumbuhan / perkembangan lain<textarea rows={3} value={form.growth_notes} onChange={(e) => setForm({ ...form, growth_notes: e.target.value })} /></label><label className="full">Pesan Guru untuk Wali<textarea rows={3} value={form.teacher_note} onChange={(e) => setForm({ ...form, teacher_note: e.target.value })} /></label>{errorText && <p className="v2-field-error full">{errorText}</p>}<div className="v2-form-actions full"><button type="button" className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Rapor'}</button></div></form></Modal>
}

function ReportViewer({ value, student, onClose }: { value: ReportCard; student?: StudentLite; onClose: () => void }) {
  const items = [['Nilai Agama & Budi Pekerti', value.religion_character], ['Jati Diri', value.identity_independence], ['Dasar Literasi & STEAM', value.literacy_steam], ['Perkembangan Lain', value.growth_notes], ['Pesan Guru', value.teacher_note]]
  return <Modal title={`Rapor ${student?.full_name || 'Murid'}`} onClose={onClose} wide><div className="report-view-head"><span className="v2-badge blue">Semester {value.semester}</span><span>{student?.class_name || 'RA Nurul Falah'}</span><span>{value.academic_year}</span></div><div className="report-view-sections">{items.map(([label, text]) => <section key={label}><small>{label}</small><p>{text || 'Belum ada catatan.'}</p></section>)}</div></Modal>
}

export function PaymentsPage({ role }: { role: 'admin' | 'parent' }) {
  const canManage = role === 'admin'
  const [students, setStudents] = useState<StudentLite[]>([]); const [rows, setRows] = useState<Payment[]>([]); const [loading, setLoading] = useState(true); const [search, setSearch] = useState(''); const [editing, setEditing] = useState<Payment | 'new' | null>(null); const [deleting, setDeleting] = useState<Payment | null>(null); const [message, setMessage] = useState<Message | null>(null)
  const load = async () => { setLoading(true); const [studentResult, paymentResult] = await Promise.all([supabase.from('students').select('id,full_name,class_name,academic_year,is_active').eq('is_active', true).order('full_name'), supabase.from('student_payments').select('*').order('created_at', { ascending: false })]); if (studentResult.error || paymentResult.error) setMessage({ tone: 'error', text: studentResult.error?.message || paymentResult.error?.message || 'Data pembayaran gagal dimuat.' }); setStudents((studentResult.data as StudentLite[] | null) ?? []); setRows((paymentResult.data as Payment[] | null) ?? []); setLoading(false) }
  useEffect(() => { void load() }, [])
  const studentMap = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]); const filtered = useMemo(() => { const q = search.trim().toLowerCase(); return rows.filter((row) => { const student = studentMap.get(row.student_id); return !q || `${student?.full_name || ''} ${row.payment_type} ${row.period_label || ''}`.toLowerCase().includes(q) }) }, [rows, search, studentMap])
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0); const paid = rows.reduce((sum, row) => sum + Math.min(Number(row.amount), Number(row.paid_amount)), 0); const outstanding = rows.filter((row) => row.status !== 'waived').reduce((sum, row) => sum + Math.max(0, Number(row.amount) - Number(row.paid_amount)), 0)
  const remove = async () => { if (!deleting || !canManage) return; const { error } = await supabase.from('student_payments').delete().eq('id', deleting.id); if (error) { setMessage({ tone: 'error', text: error.message }); return }; setDeleting(null); setMessage({ tone: 'success', text: 'Data pembayaran berhasil dihapus.' }); await load() }
  return <div className="v2-stack"><PageTitle eyebrow="KEUANGAN SEKOLAH" title="Pembayaran" text={canManage ? 'Kelola tagihan, pembayaran, jatuh tempo dan status pembayaran murid.' : 'Pantau tagihan dan pembayaran anak yang terhubung.'} action={canManage ? <button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Tambah Tagihan</button> : undefined} />{message && <Notice {...message} />}<div className="v2-stat-grid three"><MoneyStat label="Total Tagihan" value={total} tone="gold" /><MoneyStat label="Sudah Dibayar" value={paid} tone="green" /><MoneyStat label="Sisa Tagihan" value={outstanding} tone="blue" /></div><section className="v2-panel"><div className="v2-toolbar"><label><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari murid, jenis atau periode pembayaran..." /></label></div>{loading ? <SkeletonRows /> : filtered.length ? <div className="payment-list">{filtered.map((row) => { const student = studentMap.get(row.student_id); return <article key={row.id}><span className="payment-icon"><BadgeDollarSign /></span><div className="grow"><div className="school-meta"><span className={`v2-badge ${paymentTone(row.status)}`}>{paymentLabel(row.status)}</span>{row.period_label && <span>{row.period_label}</span>}{row.due_date && <span>Jatuh tempo {dateText(row.due_date)}</span>}</div><h3>{row.payment_type}</h3><p>{student?.full_name || 'Murid'} · {student?.class_name || 'Belum ada kelompok'}</p><small>{currency(Number(row.paid_amount))} dari {currency(Number(row.amount))} dibayar</small></div><strong className="payment-balance">{row.status === 'waived' ? 'Dibebaskan' : currency(Math.max(0, Number(row.amount) - Number(row.paid_amount)))}</strong>{canManage && <div className="v2-inline-actions"><button onClick={() => setEditing(row)}><Edit3 size={17} /></button><button className="danger" onClick={() => setDeleting(row)}><Trash2 size={17} /></button></div>}</article>})}</div> : <EmptyCard text="Belum ada data pembayaran." />}</section>{editing && canManage && <PaymentModal value={editing === 'new' ? null : editing} students={students} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); setMessage({ tone: 'success', text: 'Data pembayaran berhasil disimpan.' }); await load() }} />}{deleting && <Confirm title="Hapus pembayaran?" text={`${deleting.payment_type} akan dihapus dari riwayat pembayaran.`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}</div>
}

function PaymentModal({ value, students, onClose, onDone }: { value: Payment | null; students: StudentLite[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ student_id: value?.student_id || students[0]?.id || '', type: value?.payment_type || '', period: value?.period_label || '', amount: String(value?.amount ?? ''), paid: String(value?.paid_amount ?? '0'), due: value?.due_date || '', paid_at: value?.paid_at ? value.paid_at.slice(0, 10) : '', waived: value?.status === 'waived', notes: value?.notes || '' }); const [busy, setBusy] = useState(false); const [errorText, setErrorText] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); const amount = Number(form.amount); const paidAmount = Number(form.paid); if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(paidAmount) || paidAmount < 0) { setErrorText('Nominal pembayaran tidak valid.'); return }; const status: Payment['status'] = form.waived ? 'waived' : paidAmount >= amount && amount > 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid'; setBusy(true); setErrorText(''); const payload = { student_id: form.student_id, payment_type: form.type.trim(), period_label: form.period.trim() || null, amount, paid_amount: paidAmount, due_date: form.due || null, paid_at: form.paid_at ? `${form.paid_at}T12:00:00+07:00` : null, status, notes: form.notes.trim() || null }; const result = value ? await supabase.from('student_payments').update(payload).eq('id', value.id) : await supabase.from('student_payments').insert(payload); setBusy(false); if (result.error) { setErrorText(result.error.message); return }; onDone() }
  return <Modal title={value ? 'Edit Pembayaran' : 'Tambah Tagihan'} onClose={onClose} wide><form className="v2-form v2-form-grid" onSubmit={submit}><label>Murid<select required value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name} {student.class_name ? `· ${student.class_name}` : ''}</option>)}</select></label><label>Jenis pembayaran<input required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="SPP / Kegiatan / Seragam" /></label><label>Periode<input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="September 2026" /></label><label>Total tagihan<input required type="number" min="0" step="1000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label><label>Sudah dibayar<input required type="number" min="0" step="1000" value={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.value })} /></label><label>Jatuh tempo<input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></label><label>Tanggal pembayaran<input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} /></label><label className="v2-toggle"><input type="checkbox" checked={form.waived} onChange={(e) => setForm({ ...form, waived: e.target.checked })} /><span>Dibebaskan dari tagihan</span></label><label className="full">Catatan<textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>{errorText && <p className="v2-field-error full">{errorText}</p>}<div className="v2-form-actions full"><button type="button" className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Pembayaran'}</button></div></form></Modal>
}

export function DocumentsPage({ role }: { role: AppRole }) {
  const canManage = role === 'admin'; const [rows, setRows] = useState<SchoolDocument[]>([]); const [loading, setLoading] = useState(true); const [search, setSearch] = useState(''); const [editing, setEditing] = useState<SchoolDocument | 'new' | null>(null); const [deleting, setDeleting] = useState<SchoolDocument | null>(null); const [message, setMessage] = useState<Message | null>(null)
  const load = async () => { setLoading(true); const { data, error } = await supabase.from('school_documents').select('*').order('document_date', { ascending: false }).order('created_at', { ascending: false }); if (error) setMessage({ tone: 'error', text: error.message }); setRows((data as SchoolDocument[] | null) ?? []); setLoading(false) }
  useEffect(() => { void load() }, [])
  const filtered = useMemo(() => { const q = search.trim().toLowerCase(); return rows.filter((row) => !q || `${row.title} ${row.category} ${row.document_number || ''} ${row.recipient || ''}`.toLowerCase().includes(q)) }, [rows, search]); const remove = async () => { if (!deleting || !canManage) return; const { error } = await supabase.from('school_documents').delete().eq('id', deleting.id); if (error) { setMessage({ tone: 'error', text: error.message }); return }; setDeleting(null); setMessage({ tone: 'success', text: 'Dokumen berhasil dihapus.' }); await load() }
  return <div className="v2-stack"><PageTitle eyebrow="ARSIP SEKOLAH" title="Dokumen & Surat" text={canManage ? 'Kelola surat, arsip dan tautan dokumen resmi sekolah.' : 'Dokumen resmi yang dibagikan kepada akun Anda.'} action={canManage ? <button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Tambah Dokumen</button> : undefined} />{message && <Notice {...message} />}<section className="v2-panel"><div className="v2-toolbar"><label><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari judul, kategori, nomor surat..." /></label></div>{loading ? <SkeletonRows /> : filtered.length ? <div className="document-grid">{filtered.map((row) => <article key={row.id}><span className="document-icon"><FileText /></span><div className="grow"><div className="school-meta"><span className={`v2-badge ${row.is_published ? 'green' : 'gray'}`}>{row.is_published ? 'Terbit' : 'Draft'}</span><span>{audienceLabel(row.audience)}</span>{row.document_date && <span>{dateText(row.document_date)}</span>}</div><h3>{row.title}</h3><p>{row.category}{row.document_number ? ` · ${row.document_number}` : ''}</p><small>{row.description || row.recipient || 'Tidak ada keterangan tambahan.'}</small></div><div className="document-actions">{row.file_url && <a href={row.file_url} target="_blank" rel="noreferrer" title="Buka dokumen"><ExternalLink size={17} /></a>}{canManage && <button onClick={() => setEditing(row)}><Edit3 size={17} /></button>}{canManage && <button className="danger" onClick={() => setDeleting(row)}><Trash2 size={17} /></button>}</div></article>)}</div> : <EmptyCard text="Belum ada dokumen yang tersedia." />}</section>{editing && canManage && <DocumentModal value={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); setMessage({ tone: 'success', text: 'Dokumen berhasil disimpan.' }); await load() }} />}{deleting && <Confirm title="Hapus dokumen?" text={deleting.title} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}</div>
}

function DocumentModal({ value, onClose, onDone }: { value: SchoolDocument | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ title: value?.title || '', category: value?.category || 'Umum', number: value?.document_number || '', date: value?.document_date || '', recipient: value?.recipient || '', description: value?.description || '', url: value?.file_url || '', audience: value?.audience || 'all' as SchoolDocument['audience'], published: value?.is_published ?? true }); const [busy, setBusy] = useState(false); const [errorText, setErrorText] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setErrorText(''); const payload = { title: form.title.trim(), category: form.category.trim() || 'Umum', document_number: form.number.trim() || null, document_date: form.date || null, recipient: form.recipient.trim() || null, description: form.description.trim() || null, file_url: form.url.trim() || null, audience: form.audience, is_published: form.published }; const result = value ? await supabase.from('school_documents').update(payload).eq('id', value.id) : await supabase.from('school_documents').insert(payload); setBusy(false); if (result.error) { setErrorText(result.error.message); return }; onDone() }
  return <Modal title={value ? 'Edit Dokumen' : 'Tambah Dokumen'} onClose={onClose} wide><form className="v2-form v2-form-grid" onSubmit={submit}><label className="full">Judul dokumen<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label>Kategori<input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Surat Edaran / Formulir / Arsip" /></label><label>Nomor surat<input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></label><label>Tanggal dokumen<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label><label>Penerima / tujuan<input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} /></label><label>Ditampilkan kepada<select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as SchoolDocument['audience'] })}><option value="all">Guru & Wali</option><option value="teacher">Guru saja</option><option value="parent">Wali saja</option><option value="admin">Admin saja</option></select></label><label className="v2-toggle"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /><span>Publikasikan</span></label><label className="full">Tautan file<input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://... (opsional)" /></label><label className="full">Deskripsi<textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>{errorText && <p className="v2-field-error full">{errorText}</p>}<div className="v2-form-actions full"><button type="button" className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Dokumen'}</button></div></form></Modal>
}

function Modal({ title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) { return <div className="v2-modal-layer"><button className="v2-backdrop" aria-label="Tutup" onClick={onClose} /><section className={`v2-modal ${wide ? 'wide' : ''}`}><header><div><small>RA NURUL FALAH</small><h2>{title}</h2></div><button className="v2-close" aria-label="Tutup" onClick={onClose}><X size={19} /></button></header>{children}</section></div> }
function Confirm({ title, text, onClose, onConfirm }: { title: string; text: string; onClose: () => void; onConfirm: () => void }) { return <div className="v2-modal-layer"><button className="v2-backdrop" aria-label="Tutup" onClick={onClose} /><section className="v2-modal confirm"><span className="v2-modal-icon danger"><Trash2 /></span><h2>{title}</h2><p>{text}</p><div className="v2-form-actions"><button className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-danger" onClick={onConfirm}>Ya, Hapus</button></div></section></div> }
function MiniStat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: string }) { return <article className={`v2-stat mini ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>Data tercatat</p></div></article> }
function MoneyStat({ label, value, tone }: { label: string; value: number; tone: string }) { return <article className={`v2-stat mini ${tone}`}><span><BadgeDollarSign size={20} /></span><div><small>{label}</small><strong className="money-value">{currency(value)}</strong><p>Rekap transaksi</p></div></article> }
function initials(name?: string | null) { return (name || 'Guru').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }
function currency(value: number) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value) }
function dateText(value: string) { const date = new Date(`${value}T12:00:00+07:00`); return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date) }
function paymentTone(status: Payment['status']) { return status === 'paid' ? 'green' : status === 'partial' ? 'blue' : status === 'waived' ? 'purple' : 'gold' }
function paymentLabel(status: Payment['status']) { return status === 'paid' ? 'Lunas' : status === 'partial' ? 'Sebagian' : status === 'waived' ? 'Dibebaskan' : 'Belum Bayar' }
function audienceLabel(audience: SchoolDocument['audience']) { return audience === 'all' ? 'Guru & Wali' : audience === 'teacher' ? 'Guru' : audience === 'parent' ? 'Wali' : 'Admin' }
