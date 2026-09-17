import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  CheckCircle2,
  Edit3,
  GraduationCap,
  Megaphone,
  Plus,
  QrCode,
  Save,
  Search,
  Trash2,
  UsersRound,
} from 'lucide-react'
import { type AppRole, supabase, type UserProfile } from '../lib/supabase'
import { EmptyCard, Notice, PageTitle, SkeletonRows } from './PortalPages'
import { Dialog } from './AppExperience'

type Account = Pick<UserProfile, 'id' | 'role' | 'display_name' | 'is_active' | 'created_at'>
type Student = {
  id: string
  full_name: string
  nis: string | null
  nisn: string | null
  nik: string | null
  gender: 'L' | 'P' | null
  birth_place: string | null
  birth_date: string | null
  class_name: string | null
  academic_year: string | null
  is_active: boolean
  qr_token: string
}
type SchoolClass = { id: string; name: string; teacher_name: string | null; academic_year: string; is_active: boolean; teacher_class_assignments?: { teacher_profile_id: string; teacher_profiles: { full_name: string; teacher_user_id: string | null } | null }[] }
type TeacherOption = { id: string; full_name: string; teacher_user_id: string | null }
type Schedule = { id: string; class_name: string; day_of_week: number; start_time: string; end_time: string; activity: string; teacher_name: string | null; academic_year: string; is_active: boolean }
type Announcement = { id: string; title: string; body: string; audience: 'all' | 'teacher' | 'parent'; is_published: boolean; created_at: string; updated_at: string }
type Message = { tone: 'success' | 'error'; text: string }

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | AppRole>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [deleting, setDeleting] = useState<Account | null>(null)
  const [message, setMessage] = useState<Message | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('user_profiles').select('id,role,display_name,is_active,created_at').order('created_at', { ascending: false })
    if (error) setMessage({ tone: 'error', text: error.message })
    setAccounts((data as Account[] | null) ?? [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return accounts.filter((a) => (roleFilter === 'all' || a.role === roleFilter) && (!q || (a.display_name || '').toLowerCase().includes(q)))
  }, [accounts, roleFilter, search])

  const remove = async () => {
    if (!deleting) return
    const { data, error } = await supabase.functions.invoke('admin-manage-user', { body: { action: 'delete', user_id: deleting.id } })
    if (error || !data?.ok) { setMessage({ tone: 'error', text: data?.error || 'Akun gagal dihapus.' }); return }
    setDeleting(null); setMessage({ tone: 'success', text: 'Akun berhasil dihapus.' }); await load()
  }

  return <div className="v2-stack"><PageTitle eyebrow="AKSES PENGGUNA" title="Manajemen Akun" text="Tambah, edit, nonaktifkan, reset password, atau hapus akun pengguna." action={<button className="v2-primary" onClick={() => setCreateOpen(true)}><Plus size={17} /> Tambah Akun</button>} />{message && <Notice {...message} />}
    <div className="v2-stat-grid three"><MiniStat label="Semua Akun" value={accounts.length} tone="green" /><MiniStat label="Guru" value={accounts.filter((a) => a.role === 'teacher').length} tone="blue" /><MiniStat label="Wali Murid" value={accounts.filter((a) => a.role === 'parent').length} tone="purple" /></div>
    <section className="v2-panel"><div className="v2-toolbar"><label><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama pengguna..." /></label><select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as 'all' | AppRole)}><option value="all">Semua role</option><option value="admin">Admin</option><option value="teacher">Guru</option><option value="parent">Wali</option></select></div>{loading ? <SkeletonRows /> : filtered.length ? <div className="v2-list">{filtered.map((account) => <div className="v2-user-row" key={account.id}><span className="v2-avatar">{initials(account.display_name)}</span><div className="grow"><strong>{account.display_name || 'Tanpa nama'}</strong><small>{roleLabel(account.role)} · {account.is_active ? 'Aktif' : 'Nonaktif'}</small></div><span className={`v2-badge ${account.is_active ? 'green' : 'gray'}`}>{account.is_active ? 'Aktif' : 'Nonaktif'}</span><button className="v2-icon-button" title="Edit akun" onClick={() => setEditing(account)}><Edit3 size={17} /></button><button className="v2-icon-button danger" title="Hapus akun" onClick={() => setDeleting(account)}><Trash2 size={17} /></button></div>)}</div> : <EmptyCard text="Tidak ada akun yang sesuai filter." />}</section>
    {createOpen && <CreateAccountModal onClose={() => setCreateOpen(false)} onDone={async () => { setCreateOpen(false); setMessage({ tone: 'success', text: 'Akun baru berhasil dibuat.' }); await load() }} />}
    {editing && <EditAccountModal account={editing} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); setMessage({ tone: 'success', text: 'Akun berhasil diperbarui.' }); await load() }} />}
    {deleting && <ConfirmModal title="Hapus akun?" text={`Akun ${deleting.display_name || 'pengguna'} akan dihapus permanen beserta akses loginnya.`} confirm="Ya, Hapus" danger onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}
  </div>
}

function CreateAccountModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'teacher' as 'teacher' | 'parent' })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setErrorText('')
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) { setErrorText('Password minimal 8 karakter serta berisi huruf dan angka.'); return }
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('admin-create-user', { body: { email: form.email.trim().toLowerCase(), password: form.password, display_name: form.name.trim(), role: form.role } })
    setBusy(false)
    if (error || !data?.ok) { setErrorText(data?.error || 'Akun gagal dibuat.'); return }
    onDone()
  }
  return <Modal title="Tambah Akun" onClose={onClose}><form className="v2-form" onSubmit={submit}><label>Nama lengkap<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>Password sementara<input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label><label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'teacher' | 'parent' })}><option value="teacher">Guru</option><option value="parent">Orang Tua/Wali</option></select></label>{errorText && <p className="v2-field-error">{errorText}</p>}<button className="v2-primary" disabled={busy}><Plus size={17} /> {busy ? 'Membuat...' : 'Buat Akun'}</button></form></Modal>
}

function EditAccountModal({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: account.display_name || '', role: account.role, active: account.is_active, password: '' })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setErrorText('')
    const { data, error } = await supabase.functions.invoke('admin-manage-user', { body: { action: 'update', user_id: account.id, display_name: form.name.trim(), role: form.role, is_active: form.active, new_password: form.password } })
    setBusy(false)
    if (error || !data?.ok) { setErrorText(data?.error || 'Akun gagal diperbarui.'); return }
    onDone()
  }
  return <Modal title="Edit Akun" onClose={onClose}><form className="v2-form" onSubmit={submit}><label>Nama lengkap<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })}><option value="admin">Admin</option><option value="teacher">Guru</option><option value="parent">Wali</option></select></label><label className="v2-toggle"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><span>Akun aktif</span></label><label>Password baru <small>Opsional</small><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Kosongkan jika tidak diubah" /></label>{errorText && <p className="v2-field-error">{errorText}</p>}<button className="v2-primary" disabled={busy}><Save size={17} /> {busy ? 'Menyimpan...' : 'Simpan Perubahan'}</button></form></Modal>
}

export function StudentsPage({ role }: { role: 'admin' | 'teacher' }) {
  const [students, setStudents] = useState<Student[]>([])
  const [parents, setParents] = useState<Account[]>([])
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [editing, setEditing] = useState<Student | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Student | null>(null)
  const [qrStudent, setQrStudent] = useState<Student | null>(null)
  const [message, setMessage] = useState<Message | null>(null)

  const load = async () => {
    setLoading(true)
    const [studentResult, parentResult, classResult] = await Promise.all([
      supabase.from('students').select('*').order('full_name'),
      supabase.from('user_profiles').select('id,role,display_name,is_active,created_at').eq('role', 'parent').eq('is_active', true).order('display_name'),
      supabase.from('school_classes').select('*').eq('is_active', true).order('name'),
    ])
    setStudents((studentResult.data as Student[] | null) ?? [])
    setParents((parentResult.data as Account[] | null) ?? [])
    setClasses((classResult.data as SchoolClass[] | null) ?? [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter((s) => (classFilter === 'all' || s.class_name === classFilter) && (!q || `${s.full_name} ${s.nik || ''} ${s.nis || ''} ${s.nisn || ''}`.toLowerCase().includes(q)))
  }, [classFilter, search, students])

  const remove = async () => {
    if (!deleting || role !== 'admin') return
    const { error } = await supabase.from('students').delete().eq('id', deleting.id)
    if (error) { setMessage({ tone: 'error', text: error.message }); return }
    setDeleting(null); setMessage({ tone: 'success', text: 'Data murid berhasil dihapus.' }); await load()
  }

  return <div className="v2-stack"><PageTitle eyebrow="AKADEMIK" title="Data Murid" text={role === 'admin' ? 'Tambah, edit, hubungkan wali, tampilkan QR, dan hapus data murid.' : 'Tambah, edit, hubungkan wali, dan tampilkan QR murid.'} action={<button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Tambah Murid</button>} />{message && <Notice {...message} />}
    <section className="v2-panel"><div className="v2-toolbar"><label><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, NIK, NIS, atau NISN..." /></label><select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}><option value="all">Semua kelompok</option>{classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>{loading ? <SkeletonRows /> : filtered.length ? <div className="v2-card-grid">{filtered.map((student) => <article className="v2-person-card" key={student.id}><span>{initials(student.full_name)}</span><div><h3>{student.full_name}</h3><p>{student.class_name || 'Belum ada kelompok'}</p><small>{student.nisn ? `NISN ${student.nisn}` : student.nik ? `NIK ${student.nik}` : 'Identitas belum diisi'} · {student.is_active ? 'Aktif' : 'Nonaktif'}</small></div><div className="v2-inline-actions"><button title="Tampilkan QR" onClick={() => setQrStudent(student)}><QrCode size={17} /></button><button title="Edit" onClick={() => setEditing(student)}><Edit3 size={17} /></button>{role === 'admin' && <button className="danger" title="Hapus" onClick={() => setDeleting(student)}><Trash2 size={17} /></button>}</div></article>)}</div> : <EmptyCard text="Tidak ada murid yang sesuai pencarian." />}</section>
    {editing && <StudentModal student={editing === 'new' ? null : editing} parents={parents} classes={classes} onClose={() => setEditing(null)} onDone={async () => { const wasNew = editing === 'new'; setEditing(null); setMessage({ tone: 'success', text: wasNew ? 'Murid berhasil ditambahkan.' : 'Data murid berhasil diperbarui.' }); await load() }} />}
    {deleting && <ConfirmModal title="Hapus data murid?" text={`${deleting.full_name} beserta riwayat absensi dan hubungan walinya akan terhapus.`} confirm="Ya, Hapus" danger onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}
    {qrStudent && <StudentQrModal student={qrStudent} onClose={() => setQrStudent(null)} />}
  </div>
}

function StudentQrModal({ student, onClose }: { student: Student; onClose: () => void }) {
  return <Dialog title={student.full_name} onClose={onClose}><p>{student.nis ? `NIS ${student.nis} · ` : ''}{student.class_name || 'RA Nurul Falah'}</p><div className="v2-qr"><QRCodeSVG value={`RA-NF:${student.qr_token}`} size={230} level="H" includeMargin /></div><small>QR digunakan untuk absensi masuk dan pulang.</small><button className="v2-primary full-button" onClick={() => window.print()}><QrCode size={17} /> Cetak QR</button></Dialog>
}

function StudentModal({ student, parents, classes, onClose, onDone }: { student: Student | null; parents: Account[]; classes: SchoolClass[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ full_name: student?.full_name || '', nik: student?.nik || '', nis: student?.nis || '', nisn: student?.nisn || '', gender: student?.gender || '', birth_place: student?.birth_place || '', birth_date: student?.birth_date || '', class_name: student?.class_name || '', academic_year: student?.academic_year || classes[0]?.academic_year || '2026/2027', active: student?.is_active ?? true, guardian: '' })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    if (!student) return
    void supabase.from('student_guardians').select('guardian_user_id').eq('student_id', student.id).limit(1).maybeSingle().then(({ data }) => setForm((f) => ({ ...f, guardian: data?.guardian_user_id || '' })))
  }, [student])

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setErrorText('')
    const payload = { full_name: form.full_name.trim(), nik: form.nik.trim() || null, nis: form.nis.trim() || null, nisn: form.nisn.trim() || null, gender: form.gender || null, birth_place: form.birth_place.trim() || null, birth_date: form.birth_date || null, class_name: form.class_name || null, academic_year: form.academic_year.trim() || null, is_active: form.active }
    let studentId = student?.id
    if (student) {
      const { error } = await supabase.from('students').update(payload).eq('id', student.id)
      if (error) { setBusy(false); setErrorText(error.code === '23505' ? 'NIS atau NISN sudah digunakan.' : error.message); return }
    } else {
      const { data, error } = await supabase.from('students').insert(payload).select('id').single()
      if (error || !data) { setBusy(false); setErrorText(error?.code === '23505' ? 'NIS atau NISN sudah digunakan.' : error?.message || 'Gagal menyimpan murid.'); return }
      studentId = data.id
    }
    if (studentId) {
      await supabase.from('student_guardians').delete().eq('student_id', studentId)
      if (form.guardian) await supabase.from('student_guardians').insert({ student_id: studentId, guardian_user_id: form.guardian, relationship: 'Wali' })
    }
    setBusy(false); onDone()
  }

  return <Modal title={student ? 'Edit Murid' : 'Tambah Murid'} onClose={onClose} wide><form className="v2-form v2-form-grid" onSubmit={submit}><label>Nama lengkap<input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label><label>NIK<input inputMode="numeric" maxLength={16} value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value.replace(/\D/g, '').slice(0, 16) })} /></label><label>NIS<input value={form.nis} onChange={(e) => setForm({ ...form, nis: e.target.value })} /></label><label>NISN<input value={form.nisn} onChange={(e) => setForm({ ...form, nisn: e.target.value })} /></label><label>Jenis kelamin<select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as '' | 'L' | 'P' })}><option value="">Pilih</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></label><label>Tempat lahir<input value={form.birth_place} onChange={(e) => setForm({ ...form, birth_place: e.target.value })} /></label><label>Tanggal lahir<input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></label><label>Kelompok<select value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })}><option value="">Belum ditentukan</option>{classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></label><label>Tahun ajaran<input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} /></label><label>Wali murid<select value={form.guardian} onChange={(e) => setForm({ ...form, guardian: e.target.value })}><option value="">Belum dihubungkan</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.display_name || 'Wali murid'}</option>)}</select></label><label className="v2-toggle"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><span>Murid aktif</span></label>{errorText && <p className="v2-field-error full">{errorText}</p>}<div className="v2-form-actions full"><button type="button" className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-primary" disabled={busy}><Save size={17} /> {busy ? 'Menyimpan...' : 'Simpan Murid'}</button></div></form></Modal>
}

export function ClassesPage() {
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [editing, setEditing] = useState<SchoolClass | 'new' | null>(null)
  const [deleting, setDeleting] = useState<SchoolClass | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [classResult, studentResult, teacherResult] = await Promise.all([supabase.from('school_classes').select('*,teacher_class_assignments(teacher_profile_id,teacher_profiles(full_name,teacher_user_id))').order('name'), supabase.from('students').select('class_name').eq('is_active', true), supabase.from('teacher_profiles').select('id,full_name,teacher_user_id').order('full_name')])
    const list = (classResult.data as SchoolClass[] | null) ?? []
    const nextCounts: Record<string, number> = {}
    for (const row of studentResult.data ?? []) if (row.class_name) nextCounts[row.class_name] = (nextCounts[row.class_name] || 0) + 1
    if (classResult.error || studentResult.error || teacherResult.error) setMessage({ tone: 'error', text: classResult.error?.message || studentResult.error?.message || teacherResult.error?.message || 'Data kelas gagal dimuat.' })
    setClasses(list); setTeachers((teacherResult.data as TeacherOption[] | null) ?? []); setCounts(nextCounts); setLoading(false)
  }
  useEffect(() => { void load() }, [])

  const remove = async () => {
    if (!deleting) return
    if ((counts[deleting.name] || 0) > 0) { setMessage({ tone: 'error', text: 'Kelas masih memiliki murid. Pindahkan murid terlebih dahulu sebelum menghapus kelas.' }); setDeleting(null); return }
    const { error } = await supabase.from('school_classes').delete().eq('id', deleting.id)
    if (error) { setMessage({ tone: 'error', text: error.message }); return }
    setDeleting(null); setMessage({ tone: 'success', text: 'Kelas berhasil dihapus.' }); await load()
  }

  return <div className="v2-stack"><PageTitle eyebrow="STRUKTUR AKADEMIK" title="Kelas & Tahun Ajaran" text="Kelola kelompok belajar, wali/guru kelas, dan tahun ajaran." action={<button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Tambah Kelas</button>} />{message && <Notice {...message} />}{loading ? <SkeletonRows /> : classes.length ? <div className="v2-card-grid">{classes.map((c) => { const assigned = c.teacher_class_assignments?.map((item) => item.teacher_profiles?.full_name).filter(Boolean).join(', '); return <article className="v2-class-card" key={c.id}><span><GraduationCap /></span><div><small>{c.academic_year}</small><h3>{c.name}</h3><p>{assigned || c.teacher_name || 'Guru belum ditentukan'} · {counts[c.name] || 0} murid</p></div><span className={`v2-badge ${c.is_active ? 'green' : 'gray'}`}>{c.is_active ? 'Aktif' : 'Nonaktif'}</span><div className="v2-inline-actions"><button aria-label={`Edit kelas ${c.name}`} onClick={() => setEditing(c)}><Edit3 size={17} /></button><button aria-label={`Hapus kelas ${c.name}`} className="danger" onClick={() => setDeleting(c)}><Trash2 size={17} /></button></div></article> })}</div> : <EmptyCard text="Belum ada kelas. Tambahkan kelompok belajar pertama." />}{editing && <ClassModal value={editing === 'new' ? null : editing} teachers={teachers} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); setMessage({ tone: 'success', text: 'Data kelas dan penugasan Guru berhasil disimpan.' }); await load() }} />}{deleting && <ConfirmModal title="Hapus kelas?" text={`Kelas ${deleting.name} akan dihapus jika tidak memiliki murid.`} confirm="Hapus Kelas" danger onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}</div>
}

function ClassModal({ value, teachers, onClose, onDone }: { value: SchoolClass | null; teachers: TeacherOption[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: value?.name || '', teacher_profile_ids: value?.teacher_class_assignments?.map((item) => item.teacher_profile_id) || [], academic_year: value?.academic_year || '2026/2027', active: value?.is_active ?? true })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setErrorText('')
    const selectedNames = teachers.filter((teacher) => form.teacher_profile_ids.includes(teacher.id)).map((teacher) => teacher.full_name)
    const payload = { name: form.name.trim(), teacher_name: selectedNames.join(', ') || null, academic_year: form.academic_year.trim(), is_active: form.active }
    let classId = value?.id
    if (value) {
      const oldName = value.name
      const { error } = await supabase.from('school_classes').update(payload).eq('id', value.id)
      if (error) { setBusy(false); setErrorText(error.message); return }
      if (oldName !== payload.name) {
        await Promise.all([supabase.from('students').update({ class_name: payload.name }).eq('class_name', oldName), supabase.from('school_schedules').update({ class_name: payload.name }).eq('class_name', oldName)])
      }
    } else {
      const { data, error } = await supabase.from('school_classes').insert(payload).select('id').single()
      if (error) { setBusy(false); setErrorText(error.code === '23505' ? 'Nama kelas sudah digunakan.' : error.message); return }
      classId = data?.id
    }
    if (classId) {
      const { error: clearError } = await supabase.from('teacher_class_assignments').delete().eq('class_id', classId)
      if (clearError) { setBusy(false); setErrorText(clearError.message); return }
      if (form.teacher_profile_ids.length) {
        const { error: assignmentError } = await supabase.from('teacher_class_assignments').insert(form.teacher_profile_ids.map((teacherProfileId) => ({ class_id: classId, teacher_profile_id: teacherProfileId })))
        if (assignmentError) { setBusy(false); setErrorText(assignmentError.message); return }
      }
    }
    setBusy(false); onDone()
  }
  return <Modal title={value ? 'Edit Kelas' : 'Tambah Kelas'} onClose={onClose}><form className="v2-form" onSubmit={submit}><label>Nama kelas<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kelompok A" /></label><fieldset className="v5-teacher-picker"><legend>Guru yang ditugaskan</legend>{teachers.length ? teachers.map((teacher) => <label key={teacher.id}><input type="checkbox" checked={form.teacher_profile_ids.includes(teacher.id)} onChange={(event) => setForm({ ...form, teacher_profile_ids: event.target.checked ? [...form.teacher_profile_ids, teacher.id] : form.teacher_profile_ids.filter((id) => id !== teacher.id) })} /><span>{teacher.full_name}<small>{teacher.teacher_user_id ? 'Akun terhubung' : 'Belum memiliki akun'}</small></span></label>) : <p>Belum ada data Guru.</p>}</fieldset><label>Tahun ajaran<input required value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} /></label><label className="v2-toggle"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><span>Kelas aktif</span></label>{errorText && <p className="v2-field-error">{errorText}</p>}<button className="v2-primary" disabled={busy}><Save size={17} /> {busy ? 'Menyimpan...' : 'Simpan'}</button></form></Modal>
}

export function SchedulePage({ canManage }: { canManage: boolean }) {
  const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat']
  const [rows, setRows] = useState<Schedule[]>([])
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [day, setDay] = useState(1)
  const [editing, setEditing] = useState<Schedule | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Schedule | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [scheduleResult, classResult] = await Promise.all([supabase.from('school_schedules').select('*').eq('is_active', true).order('day_of_week').order('start_time'), supabase.from('school_classes').select('*').eq('is_active', true).order('name')])
    setRows((scheduleResult.data as Schedule[] | null) ?? []); setClasses((classResult.data as SchoolClass[] | null) ?? []); setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const selected = rows.filter((r) => r.day_of_week === day)

  const remove = async () => {
    if (!deleting || !canManage) return
    const { error } = await supabase.from('school_schedules').delete().eq('id', deleting.id)
    if (error) { setMessage({ tone: 'error', text: error.message }); return }
    setDeleting(null); setMessage({ tone: 'success', text: 'Jadwal berhasil dihapus.' }); await load()
  }

  return <div className="v2-stack"><PageTitle eyebrow="AGENDA BELAJAR" title="Jadwal Mingguan" text={canManage ? 'Tambah, edit, dan hapus jadwal kegiatan belajar.' : 'Jadwal kegiatan belajar anak sesuai kelompoknya.'} action={canManage ? <button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Tambah Jadwal</button> : undefined} />{message && <Notice {...message} />}<div className="v2-tabs">{days.map((d, i) => <button key={d} className={day === i + 1 ? 'active' : ''} onClick={() => setDay(i + 1)}>{d}</button>)}</div><section className="v2-panel">{loading ? <SkeletonRows /> : selected.length ? <div className="v2-schedule-list">{selected.map((row) => <article key={row.id}><time>{row.start_time.slice(0, 5)}–{row.end_time.slice(0, 5)}</time><span className="dot" /><div><strong>{row.activity}</strong><small>{row.class_name} · {row.teacher_name || 'Guru kelas'}</small></div>{canManage && <div className="v2-inline-actions"><button onClick={() => setEditing(row)}><Edit3 size={16} /></button><button className="danger" onClick={() => setDeleting(row)}><Trash2 size={16} /></button></div>}</article>)}</div> : <EmptyCard text="Belum ada jadwal untuk hari ini." />}</section>{editing && canManage && <ScheduleModal value={editing === 'new' ? null : editing} classes={classes} defaultDay={day} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); setMessage({ tone: 'success', text: 'Jadwal berhasil disimpan.' }); await load() }} />}{deleting && <ConfirmModal title="Hapus jadwal?" text={`${deleting.activity} akan dihapus dari jadwal mingguan.`} confirm="Hapus Jadwal" danger onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}</div>
}

function ScheduleModal({ value, classes, defaultDay, onClose, onDone }: { value: Schedule | null; classes: SchoolClass[]; defaultDay: number; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ class_name: value?.class_name || classes[0]?.name || '', day: value?.day_of_week || defaultDay, start: value?.start_time.slice(0, 5) || '07:30', end: value?.end_time.slice(0, 5) || '08:00', activity: value?.activity || '', teacher: value?.teacher_name || '', academic_year: value?.academic_year || classes[0]?.academic_year || '2026/2027' })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setErrorText('')
    const payload = { class_name: form.class_name, day_of_week: form.day, start_time: form.start, end_time: form.end, activity: form.activity.trim(), teacher_name: form.teacher.trim() || null, academic_year: form.academic_year.trim(), is_active: true }
    const result = value ? await supabase.from('school_schedules').update(payload).eq('id', value.id) : await supabase.from('school_schedules').insert(payload)
    setBusy(false)
    if (result.error) { setErrorText(result.error.code === '23505' ? 'Sudah ada jadwal pada kelas, hari, dan jam tersebut.' : result.error.message); return }
    onDone()
  }
  return <Modal title={value ? 'Edit Jadwal' : 'Tambah Jadwal'} onClose={onClose} wide><form className="v2-form v2-form-grid" onSubmit={submit}><label>Kelompok<select required value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })}>{classes.map((c) => <option value={c.name} key={c.id}>{c.name}</option>)}</select></label><label>Hari<select value={form.day} onChange={(e) => setForm({ ...form, day: Number(e.target.value) })}>{['Senin','Selasa','Rabu','Kamis','Jumat'].map((d,i) => <option value={i+1} key={d}>{d}</option>)}</select></label><label>Jam mulai<input required type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label><label>Jam selesai<input required type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label><label className="full">Kegiatan<input required value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} /></label><label>Guru<input value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} /></label><label>Tahun ajaran<input required value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} /></label>{errorText && <p className="v2-field-error full">{errorText}</p>}<div className="v2-form-actions full"><button type="button" className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-primary" disabled={busy}><Save size={17} /> Simpan Jadwal</button></div></form></Modal>
}

export function AnnouncementsPage({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<Announcement[]>([])
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Announcement | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => { setLoading(true); const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }); setRows((data as Announcement[] | null) ?? []); setLoading(false) }
  useEffect(() => { void load() }, [])
  const remove = async () => { if (!deleting || !canManage) return; const { error } = await supabase.from('announcements').delete().eq('id', deleting.id); if (error) { setMessage({ tone: 'error', text: error.message }); return }; setDeleting(null); setMessage({ tone: 'success', text: 'Pengumuman berhasil dihapus.' }); await load() }

  return <div className="v2-stack"><PageTitle eyebrow="INFORMASI SEKOLAH" title="Pengumuman" text={canManage ? 'Buat dan kelola informasi resmi untuk Guru dan Wali.' : 'Informasi resmi terbaru dari RA Nurul Falah.'} action={canManage ? <button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Buat Pengumuman</button> : undefined} />{message && <Notice {...message} />}{loading ? <SkeletonRows /> : rows.length ? <div className="v2-announcement-grid">{rows.map((row) => <article className="v2-announcement" key={row.id}><div className="v2-announcement-icon"><Megaphone /></div><div className="grow"><div className="v2-meta"><span className={`v2-badge ${row.is_published ? 'green' : 'gray'}`}>{row.is_published ? 'Terbit' : 'Draft'}</span><span>{audienceLabel(row.audience)}</span><span>{dateText(row.created_at)}</span></div><h3>{row.title}</h3><p>{row.body}</p></div>{canManage && <div className="v2-inline-actions"><button onClick={() => setEditing(row)}><Edit3 size={17} /></button><button className="danger" onClick={() => setDeleting(row)}><Trash2 size={17} /></button></div>}</article>)}</div> : <EmptyCard text="Belum ada pengumuman aktif." />}{editing && canManage && <AnnouncementModal value={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); setMessage({ tone: 'success', text: 'Pengumuman berhasil disimpan.' }); await load() }} />}{deleting && <ConfirmModal title="Hapus pengumuman?" text={deleting.title} confirm="Hapus Pengumuman" danger onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}</div>
}

function AnnouncementModal({ value, onClose, onDone }: { value: Announcement | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ title: value?.title || '', body: value?.body || '', audience: value?.audience || 'all' as 'all' | 'teacher' | 'parent', published: value?.is_published ?? true })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setErrorText(''); const payload = { title: form.title.trim(), body: form.body.trim(), audience: form.audience, is_published: form.published }; const result = value ? await supabase.from('announcements').update(payload).eq('id', value.id) : await supabase.from('announcements').insert(payload); setBusy(false); if (result.error) { setErrorText(result.error.message); return }; onDone() }
  return <Modal title={value ? 'Edit Pengumuman' : 'Buat Pengumuman'} onClose={onClose} wide><form className="v2-form" onSubmit={submit}><label>Judul<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label>Isi pengumuman<textarea required rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label><label>Ditujukan untuk<select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as 'all' | 'teacher' | 'parent' })}><option value="all">Semua pengguna</option><option value="teacher">Guru</option><option value="parent">Orang Tua/Wali</option></select></label><label className="v2-toggle"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /><span>Publikasikan sekarang</span></label>{errorText && <p className="v2-field-error">{errorText}</p>}<button className="v2-primary" disabled={busy}><Save size={17} /> Simpan Pengumuman</button></form></Modal>
}

function Modal({ title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) { return <Dialog title={title} eyebrow="FORMULIR" onClose={onClose} wide={wide}>{children}</Dialog> }
function ConfirmModal({ title, text, confirm, danger = false, onClose, onConfirm }: { title: string; text: string; confirm: string; danger?: boolean; onClose: () => void; onConfirm: () => void }) { return <Dialog title={title} onClose={onClose} confirm><span className={`v2-modal-icon ${danger ? 'danger' : ''}`}>{danger ? <Trash2 /> : <CheckCircle2 />}</span><p>{text}</p><div className="v2-form-actions"><button className="v2-secondary" onClick={onClose}>Batal</button><button className={danger ? 'v2-danger' : 'v2-primary'} onClick={onConfirm}>{confirm}</button></div></Dialog> }
function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) { return <article className={`v2-stat mini ${tone}`}><span><UsersRound size={20} /></span><div><small>{label}</small><strong>{value}</strong><p>Terdaftar</p></div></article> }
function initials(name?: string | null) { return (name || 'Pengguna').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }
function roleLabel(role: AppRole) { return role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Guru' : 'Wali Murid' }
function audienceLabel(value: string) { return value === 'teacher' ? 'Guru' : value === 'parent' ? 'Wali Murid' : 'Semua' }
function dateText(value: string) { return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) }
