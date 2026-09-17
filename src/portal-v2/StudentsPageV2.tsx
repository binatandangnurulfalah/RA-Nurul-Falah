import { type FormEvent, useEffect, useState } from 'react'
import { Edit3, Plus, QrCode, Save, Search, Trash2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, type UserProfile } from '../lib/supabase'
import { getPageRange, sanitizeSearch } from '../lib/data-utils.js'
import { ActionMenu, Dialog } from './AppExperience'
import { cachedQuery, invalidateQueryCache, PAGE_SIZE, PaginationControls, useDebouncedValue } from './DataExperience'
import { EmptyCard, Notice, PageTitle, SkeletonRows } from './PortalPages'

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
type SchoolClass = { id: string; name: string; academic_year: string; is_active: boolean }
type Message = { tone: 'success' | 'error'; text: string }

export default function StudentsPageV2({ role }: { role: 'admin' | 'teacher' }) {
  const [students, setStudents] = useState<Student[]>([])
  const [parents, setParents] = useState<Account[]>([])
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [editing, setEditing] = useState<Student | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Student | null>(null)
  const [qrStudent, setQrStudent] = useState<Student | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const debouncedSearch = useDebouncedValue(search)

  const load = async () => {
    setLoading(true)
    const range = getPageRange(page, PAGE_SIZE)
    let studentQuery = supabase.from('students').select('*', { count: 'exact' }).order('full_name').range(range.from, range.to)
    if (classFilter !== 'all') studentQuery = studentQuery.eq('class_name', classFilter)
    if (debouncedSearch.trim()) {
      const query = sanitizeSearch(debouncedSearch)
      studentQuery = studentQuery.or(`full_name.ilike.%${query}%,nik.ilike.%${query}%,nis.ilike.%${query}%,nisn.ilike.%${query}%`)
    }

    const [studentResult, parentResult, classResult] = await Promise.all([
      studentQuery,
      cachedQuery('students:parents', async () => supabase.from('user_profiles').select('id,role,display_name,is_active,created_at').eq('role', 'parent').eq('is_active', true).order('display_name')),
      cachedQuery('students:classes', async () => supabase.from('school_classes').select('id,name,academic_year,is_active').eq('is_active', true).order('name')),
    ])

    if (studentResult.error) setMessage({ tone: 'error', text: studentResult.error.message })
    setStudents((studentResult.data as Student[] | null) ?? [])
    setParents((parentResult.data as Account[] | null) ?? [])
    setClasses((classResult.data as SchoolClass[] | null) ?? [])
    setTotal(studentResult.count ?? 0)
    setLoading(false)
  }

  useEffect(() => { void load() }, [page, debouncedSearch, classFilter])
  useEffect(() => { setPage(1) }, [debouncedSearch, classFilter])

  const remove = async () => {
    if (!deleting || role !== 'admin') return
    const { error } = await supabase.from('students').delete().eq('id', deleting.id)
    if (error) { setMessage({ tone: 'error', text: error.message }); return }
    invalidateQueryCache('students:')
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Data murid berhasil dihapus.' })
    await load()
  }

  return <div className="v2-stack">
    <PageTitle
      eyebrow="AKADEMIK"
      title="Data Murid"
      text={role === 'admin' ? 'Tambah, edit, hubungkan satu atau beberapa wali, tampilkan QR, dan hapus data murid.' : 'Tambah, edit, hubungkan satu atau beberapa wali, dan tampilkan QR murid.'}
      action={<button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Tambah Murid</button>}
    />
    {message && <Notice {...message} />}
    <section className="v2-panel">
      <div className="v2-toolbar">
        <label><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, NIK, NIS, atau NISN..." /></label>
        <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
          <option value="all">Semua kelompok</option>
          {classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.name}>{schoolClass.name}</option>)}
        </select>
      </div>
      {loading ? <SkeletonRows /> : students.length ? <>
        <div className="v2-card-grid">
          {students.map((student) => <article className="v2-person-card" key={student.id}>
            <span>{initials(student.full_name)}</span>
            <div>
              <h3>{student.full_name}</h3>
              <p>{student.class_name || 'Belum ada kelompok'}</p>
              <small>{student.nisn ? `NISN ${student.nisn}` : student.nik ? `NIK ${student.nik}` : 'Identitas belum diisi'} · {student.is_active ? 'Aktif' : 'Nonaktif'}</small>
            </div>
            <ActionMenu label={`Aksi untuk ${student.full_name}`} items={[
              { label: 'Tampilkan QR', icon: QrCode, onSelect: () => setQrStudent(student) },
              { label: 'Edit data murid', icon: Edit3, onSelect: () => setEditing(student) },
              ...(role === 'admin' ? [{ label: 'Hapus murid', icon: Trash2, danger: true, onSelect: () => setDeleting(student) }] : []),
            ]} />
          </article>)}
        </div>
        <PaginationControls page={page} total={total} onPage={setPage} />
      </> : <EmptyCard text="Tidak ada murid yang sesuai pencarian." />}
    </section>

    {editing && <StudentModal
      student={editing === 'new' ? null : editing}
      parents={parents}
      classes={classes}
      onClose={() => setEditing(null)}
      onDone={async () => {
        const wasNew = editing === 'new'
        invalidateQueryCache('students:')
        setEditing(null)
        setMessage({ tone: 'success', text: wasNew ? 'Murid berhasil ditambahkan.' : 'Data murid dan wali berhasil diperbarui.' })
        await load()
      }}
    />}
    {deleting && <ConfirmModal title="Hapus data murid?" text={`${deleting.full_name} beserta riwayat absensi dan hubungan walinya akan terhapus.`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}
    {qrStudent && <StudentQrModal student={qrStudent} onClose={() => setQrStudent(null)} />}
  </div>
}

function StudentModal({ student, parents, classes, onClose, onDone }: { student: Student | null; parents: Account[]; classes: SchoolClass[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    full_name: student?.full_name || '',
    nik: student?.nik || '',
    nis: student?.nis || '',
    nisn: student?.nisn || '',
    gender: student?.gender || '',
    birth_place: student?.birth_place || '',
    birth_date: student?.birth_date || '',
    class_name: student?.class_name || '',
    academic_year: student?.academic_year || classes[0]?.academic_year || '2026/2027',
    active: student?.is_active ?? true,
    guardians: [] as string[],
  })
  const [guardianLoading, setGuardianLoading] = useState(Boolean(student))
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    if (!student) return
    let mounted = true
    setGuardianLoading(true)
    void supabase
      .from('student_guardians')
      .select('guardian_user_id')
      .eq('student_id', student.id)
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) setErrorText('Data wali murid gagal dimuat. Silakan tutup lalu buka kembali formulir.')
        else setForm((current) => ({ ...current, guardians: (data ?? []).map((row) => row.guardian_user_id) }))
        setGuardianLoading(false)
      })
    return () => { mounted = false }
  }, [student])

  const toggleGuardian = (guardianId: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      guardians: checked
        ? Array.from(new Set([...current.guardians, guardianId]))
        : current.guardians.filter((id) => id !== guardianId),
    }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (guardianLoading) return
    setBusy(true)
    setErrorText('')

    const { error } = await supabase.rpc('save_student_with_guardians', {
      p_student_id: student?.id,
      p_full_name: form.full_name.trim(),
      p_nik: form.nik.trim() || undefined,
      p_nis: form.nis.trim() || undefined,
      p_nisn: form.nisn.trim() || undefined,
      p_gender: form.gender || undefined,
      p_birth_place: form.birth_place.trim() || undefined,
      p_birth_date: form.birth_date || undefined,
      p_class_name: form.class_name || undefined,
      p_academic_year: form.academic_year.trim() || undefined,
      p_is_active: form.active,
      p_guardian_user_ids: form.guardians,
    })

    setBusy(false)
    if (error) {
      if (error.code === '23505') setErrorText('NIK, NIS, atau NISN sudah digunakan oleh murid lain.')
      else setErrorText(error.message || 'Data murid gagal disimpan.')
      return
    }
    onDone()
  }

  return <Dialog title={student ? 'Edit Murid' : 'Tambah Murid'} eyebrow="DATA MURID" onClose={onClose} wide>
    <form className="v2-form v2-form-grid" onSubmit={submit}>
      <label>Nama lengkap<input required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
      <label>NIK<input inputMode="numeric" maxLength={16} value={form.nik} onChange={(event) => setForm({ ...form, nik: event.target.value.replace(/\D/g, '').slice(0, 16) })} /></label>
      <label>NIS<input value={form.nis} onChange={(event) => setForm({ ...form, nis: event.target.value })} /></label>
      <label>NISN<input value={form.nisn} onChange={(event) => setForm({ ...form, nisn: event.target.value })} /></label>
      <label>Jenis kelamin<select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value as '' | 'L' | 'P' })}><option value="">Pilih</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></label>
      <label>Tempat lahir<input value={form.birth_place} onChange={(event) => setForm({ ...form, birth_place: event.target.value })} /></label>
      <label>Tanggal lahir<input type="date" value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} /></label>
      <label>Kelompok<select value={form.class_name} onChange={(event) => setForm({ ...form, class_name: event.target.value })}><option value="">Belum ditentukan</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.name}>{schoolClass.name}</option>)}</select></label>
      <label>Tahun ajaran<input value={form.academic_year} onChange={(event) => setForm({ ...form, academic_year: event.target.value })} /></label>
      <label className="v2-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>Murid aktif</span></label>

      <fieldset className="full v5-teacher-picker">
        <legend>Wali murid terhubung</legend>
        {guardianLoading ? <p>Memuat data wali...</p> : parents.length ? parents.map((parent) => <label key={parent.id}>
          <input type="checkbox" checked={form.guardians.includes(parent.id)} onChange={(event) => toggleGuardian(parent.id, event.target.checked)} />
          <span>{parent.display_name || 'Wali murid'}<small>{form.guardians.includes(parent.id) ? 'Terhubung ke murid' : 'Belum terhubung'}</small></span>
        </label>) : <p>Belum ada akun Orang Tua/Wali aktif. Data murid tetap dapat disimpan tanpa akun wali.</p>}
      </fieldset>
      <p className="full helper-text">Satu murid dapat dihubungkan ke beberapa akun wali. Perubahan data murid dan daftar wali disimpan sekaligus dalam satu transaksi.</p>

      {errorText && <p className="v2-field-error full">{errorText}</p>}
      <div className="v2-form-actions full">
        <button type="button" className="v2-secondary" onClick={onClose}>Batal</button>
        <button className="v2-primary" disabled={busy || guardianLoading}><Save size={17} /> {busy ? 'Menyimpan...' : 'Simpan Murid'}</button>
      </div>
    </form>
  </Dialog>
}

function StudentQrModal({ student, onClose }: { student: Student; onClose: () => void }) {
  return <Dialog title={student.full_name} onClose={onClose}>
    <p>{student.nis ? `NIS ${student.nis} · ` : ''}{student.class_name || 'RA Nurul Falah'}</p>
    <div className="v2-qr"><QRCodeSVG value={`RA-NF:${student.qr_token}`} size={230} level="H" includeMargin /></div>
    <small>QR digunakan untuk absensi masuk dan pulang.</small>
    <button className="v2-primary full-button" onClick={() => window.print()}><QrCode size={17} /> Cetak QR</button>
  </Dialog>
}

function ConfirmModal({ title, text, onClose, onConfirm }: { title: string; text: string; onClose: () => void; onConfirm: () => void }) {
  return <Dialog title={title} onClose={onClose} confirm>
    <span className="v2-modal-icon danger"><Trash2 /></span>
    <p>{text}</p>
    <div className="v2-form-actions"><button className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-danger" onClick={onConfirm}>Ya, Hapus</button></div>
  </Dialog>
}

function initials(name?: string | null) {
  return (name || 'Murid').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}
