import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarRange, Edit3, GraduationCap, Plus, Save, Trash2 } from 'lucide-react'
import { queryKeys } from '../data/queryKeys'
import { supabase } from '../lib/supabase'
import { EmptyCard, Notice, PageTitle, SkeletonRows } from './PortalPages'
import { ActionMenu, Dialog } from './AppExperience'

type SchoolClass = {
  id: string
  name: string
  teacher_name: string | null
  academic_year_id: string
  academic_year: string
  is_active: boolean
  teacher_class_assignments?: {
    teacher_profile_id: string
    teacher_profiles: { full_name: string; teacher_user_id: string | null } | null
  }[]
}

type AcademicYear = {
  id: string
  label: string
  start_date: string
  end_date: string
  is_current: boolean
  is_active: boolean
}

type TeacherOption = { id: string; full_name: string; teacher_user_id: string | null }
type Message = { tone: 'success' | 'error'; text: string }

export function ClassesPage() {
  const queryClient = useQueryClient()
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [singleTeacherClassMode, setSingleTeacherClassMode] = useState(false)
  const [editing, setEditing] = useState<SchoolClass | 'new' | null>(null)
  const [editingYear, setEditingYear] = useState<AcademicYear | 'new' | null>(null)
  const [deleting, setDeleting] = useState<SchoolClass | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [classResult, studentResult, teacherResult, yearResult, settingsResult] = await Promise.all([
      supabase
        .from('school_classes')
        .select('*,teacher_class_assignments(teacher_profile_id,teacher_profiles(full_name,teacher_user_id))')
        .order('academic_year', { ascending: false })
        .order('name'),
      supabase.from('students').select('class_id').eq('is_active', true),
      supabase.from('teacher_profiles').select('id,full_name,teacher_user_id').order('full_name'),
      supabase.from('academic_years').select('id,label,start_date,end_date,is_current,is_active').order('start_date', { ascending: false }),
      supabase.from('school_settings').select('single_teacher_class_mode').eq('id', 1).single(),
    ])

    const list = (classResult.data as SchoolClass[] | null) ?? []
    const nextCounts: Record<string, number> = {}
    for (const row of studentResult.data ?? []) {
      if (row.class_id) nextCounts[row.class_id] = (nextCounts[row.class_id] || 0) + 1
    }

    if (classResult.error || studentResult.error || teacherResult.error || yearResult.error || settingsResult.error) {
      setMessage({
        tone: 'error',
        text: classResult.error?.message || studentResult.error?.message || teacherResult.error?.message || yearResult.error?.message || settingsResult.error?.message || 'Data akademik gagal dimuat.',
      })
    }

    setClasses(list)
    setTeachers((teacherResult.data as TeacherOption[] | null) ?? [])
    setAcademicYears((yearResult.data as AcademicYear[] | null) ?? [])
    setSingleTeacherClassMode(Boolean(settingsResult.data?.single_teacher_class_mode))
    setCounts(nextCounts)
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const invalidateAcademicConsumers = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.students.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    ])
  }

  const remove = async () => {
    if (!deleting) return
    if ((counts[deleting.id] || 0) > 0) {
      setMessage({ tone: 'error', text: 'Kelas masih memiliki murid. Pindahkan murid terlebih dahulu sebelum menghapus kelas.' })
      setDeleting(null)
      return
    }

    const { error } = await supabase.from('school_classes').delete().eq('id', deleting.id)
    if (error) {
      setMessage({ tone: 'error', text: error.message })
      return
    }

    await invalidateAcademicConsumers()
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Kelas berhasil dihapus.' })
    await load()
  }

  return <div className="v2-stack">
    <PageTitle
      eyebrow="STRUKTUR AKADEMIK"
      title="Kelas & Tahun Ajaran"
      text={singleTeacherClassMode ? 'Pola 1 Guru = 1 Kelas aktif. Setiap Guru hanya dapat mewakili satu kelas pada tahun ajaran yang sama.' : 'Kelola kelompok belajar, penugasan Guru, dan tahun ajaran resmi sekolah dengan pola penugasan fleksibel.'}
      action={<button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Tambah Kelas</button>}
    />
    {message && <Notice {...message} />}

    <section className="v2-panel">
      <div className="v2-section-heading">
        <div>
          <small>TAHUN AJARAN</small>
          <h2>Periode akademik</h2>
          <p>Tahun berjalan menjadi sumber resmi untuk kelas, murid, jadwal, dan pengaturan sekolah.</p>
        </div>
        <button className="v2-secondary" onClick={() => setEditingYear('new')}><CalendarRange size={17} /> Tambah Tahun Ajaran</button>
      </div>
      {loading ? <SkeletonRows /> : academicYears.length ? <div className="v2-card-grid">
        {academicYears.map((year) => <article className="v2-class-card" key={year.id}>
          <span><CalendarRange /></span>
          <div>
            <small>{formatDate(year.start_date)} – {formatDate(year.end_date)}</small>
            <h3>{year.label}</h3>
            <p>{year.is_current ? 'Tahun ajaran berjalan' : year.is_active ? 'Tersedia untuk data akademik' : 'Dinonaktifkan'}</p>
          </div>
          <span className={`v2-badge ${year.is_current ? 'green' : year.is_active ? 'blue' : 'gray'}`}>{year.is_current ? 'Berjalan' : year.is_active ? 'Aktif' : 'Nonaktif'}</span>
          <ActionMenu label={`Aksi tahun ajaran ${year.label}`} items={[{ label: 'Edit tahun ajaran', icon: Edit3, onSelect: () => setEditingYear(year) }]} />
        </article>)}
      </div> : <EmptyCard text="Belum ada tahun ajaran resmi." />}
    </section>

    {loading ? <SkeletonRows /> : classes.length ? <div className="v2-card-grid">
      {classes.map((schoolClass) => {
        const assigned = schoolClass.teacher_class_assignments
          ?.map((item) => item.teacher_profiles?.full_name)
          .filter(Boolean)
          .join(', ')
        return <article className="v2-class-card" key={schoolClass.id}>
          <span><GraduationCap /></span>
          <div>
            <small>{schoolClass.academic_year}</small>
            <h3>{schoolClass.name}</h3>
            <p>{assigned || schoolClass.teacher_name || 'Guru belum ditentukan'} · {counts[schoolClass.id] || 0} murid</p>
          </div>
          <span className={`v2-badge ${schoolClass.is_active ? 'green' : 'gray'}`}>{schoolClass.is_active ? 'Aktif' : 'Nonaktif'}</span>
          <ActionMenu
            label={`Aksi untuk kelas ${schoolClass.name}`}
            items={[
              { label: 'Edit kelas', icon: Edit3, onSelect: () => setEditing(schoolClass) },
              { label: 'Hapus kelas', icon: Trash2, danger: true, onSelect: () => setDeleting(schoolClass) },
            ]}
          />
        </article>
      })}
    </div> : <EmptyCard text="Belum ada kelas. Tambahkan kelompok belajar pertama." />}

    {editing && <ClassModal
      value={editing === 'new' ? null : editing}
      teachers={teachers}
      academicYears={academicYears.filter((year) => year.is_active || year.id === (editing === 'new' ? undefined : editing.academic_year_id))}
      singleTeacherClassMode={singleTeacherClassMode}
      onClose={() => setEditing(null)}
      onDone={async () => {
        await invalidateAcademicConsumers()
        setEditing(null)
        setMessage({ tone: 'success', text: 'Data kelas dan penugasan Guru berhasil disimpan.' })
        await load()
      }}
    />}

    {editingYear && <AcademicYearModal
      value={editingYear === 'new' ? null : editingYear}
      onClose={() => setEditingYear(null)}
      onDone={async () => {
        await invalidateAcademicConsumers()
        setEditingYear(null)
        setMessage({ tone: 'success', text: 'Tahun ajaran berhasil disimpan.' })
        await load()
      }}
    />}

    {deleting && <Dialog title="Hapus kelas?" onClose={() => setDeleting(null)} confirm>
      <span className="v2-modal-icon danger"><Trash2 /></span>
      <p>Kelas {deleting.name} akan dihapus jika tidak memiliki murid.</p>
      <div className="v2-form-actions">
        <button className="v2-secondary" onClick={() => setDeleting(null)}>Batal</button>
        <button className="v2-danger" onClick={() => void remove()}>Hapus Kelas</button>
      </div>
    </Dialog>}
  </div>
}

function ClassModal({ value, teachers, academicYears, singleTeacherClassMode, onClose, onDone }: {
  value: SchoolClass | null
  teachers: TeacherOption[]
  academicYears: AcademicYear[]
  singleTeacherClassMode: boolean
  onClose: () => void
  onDone: () => void
}) {
  const currentYear = academicYears.find((year) => year.is_current) ?? academicYears[0]
  const [form, setForm] = useState({
    name: value?.name || '',
    teacher_profile_ids: value?.teacher_class_assignments?.map((item) => item.teacher_profile_id) || [],
    academic_year_id: value?.academic_year_id || currentYear?.id || '',
    active: value?.is_active ?? true,
  })
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busyRef.current) return
    const selectedYear = academicYears.find((year) => year.id === form.academic_year_id)
    if (!selectedYear) {
      setErrorText('Pilih tahun ajaran yang valid.')
      return
    }

    busyRef.current = true
    setBusy(true)
    setErrorText('')

    const { error } = await supabase.rpc('save_class_with_assignments', {
      p_class_id: value?.id,
      p_name: form.name.trim(),
      p_academic_year: selectedYear.label,
      p_is_active: form.active,
      p_teacher_profile_ids: form.teacher_profile_ids,
    })

    busyRef.current = false
    setBusy(false)
    if (error) {
      const text = error.code === '23505'
        ? 'Nama kelas sudah digunakan pada tahun ajaran tersebut.'
        : error.code === '23503'
          ? 'Tahun ajaran atau satu dari data Guru tidak ditemukan. Muat ulang halaman lalu coba lagi.'
          : error.code === '23514'
            ? (singleTeacherClassMode
              ? 'Penugasan ditolak oleh pola 1 Guru = 1 Kelas. Pastikan kelas hanya memiliki satu Guru dan Guru tersebut belum mewakili kelas lain pada tahun ajaran yang sama.'
              : 'Tahun ajaran kelas yang sudah memiliki murid atau jadwal tidak dapat dipindahkan. Buat kelas baru untuk tahun berikutnya.')
            : error.code === '42501'
              ? 'Akun ini tidak memiliki izin untuk mengelola kelas.'
              : error.message
      setErrorText(text)
      return
    }

    onDone()
  }

  return <Dialog title={value ? 'Edit Kelas' : 'Tambah Kelas'} eyebrow="FORMULIR" onClose={() => { if (!busyRef.current) onClose() }}>
    <form className="v2-form" onSubmit={submit}>
      <label>Nama kelas<input required minLength={2} maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Kelompok A" /></label>
      {singleTeacherClassMode ? <label>
        Guru yang ditugaskan
        <select
          value={form.teacher_profile_ids[0] || ''}
          onChange={(event) => setForm({ ...form, teacher_profile_ids: event.target.value ? [event.target.value] : [] })}
        >
          <option value="">Belum ditentukan</option>
          {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}{teacher.teacher_user_id ? '' : ' · akun belum terhubung'}</option>)}
        </select>
        <small>Mode 1 Guru = 1 Kelas aktif. Guru yang sama tidak dapat mewakili kelas lain pada tahun ajaran ini.</small>
      </label> : <fieldset className="v5-teacher-picker">
        <legend>Guru yang ditugaskan</legend>
        {teachers.length ? teachers.map((teacher) => <label key={teacher.id}>
          <input
            type="checkbox"
            checked={form.teacher_profile_ids.includes(teacher.id)}
            onChange={(event) => setForm({
              ...form,
              teacher_profile_ids: event.target.checked
                ? [...form.teacher_profile_ids, teacher.id]
                : form.teacher_profile_ids.filter((id) => id !== teacher.id),
            })}
          />
          <span>{teacher.full_name}<small>{teacher.teacher_user_id ? 'Akun terhubung' : 'Belum memiliki akun'}</small></span>
        </label>) : <p>Belum ada data Guru.</p>}
      </fieldset>}
      <label>Tahun ajaran<select required value={form.academic_year_id} onChange={(event) => setForm({ ...form, academic_year_id: event.target.value })}>
        <option value="" disabled>Pilih tahun ajaran</option>
        {academicYears.map((year) => <option value={year.id} key={year.id}>{year.label}{year.is_current ? ' · berjalan' : ''}</option>)}
      </select></label>
      <label className="v2-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>Kelas aktif</span></label>
      {errorText && <p className="v2-field-error">{errorText}</p>}
      <button className="v2-primary" disabled={busy || !academicYears.length}><Save size={17} /> {busy ? 'Menyimpan...' : 'Simpan'}</button>
    </form>
  </Dialog>
}

function AcademicYearModal({ value, onClose, onDone }: { value: AcademicYear | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    label: value?.label || '',
    is_current: value?.is_current ?? false,
    is_active: value?.is_active ?? true,
  })
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busyRef.current) return
    const label = form.label.trim()
    if (!/^\d{4}\/\d{4}$/.test(label)) {
      setErrorText('Gunakan format YYYY/YYYY, misalnya 2026/2027.')
      return
    }
    const [start, end] = label.split('/').map(Number)
    if (end !== start + 1) {
      setErrorText('Rentang tahun ajaran harus berurutan, misalnya 2026/2027.')
      return
    }

    busyRef.current = true
    setBusy(true)
    setErrorText('')
    const { error } = await supabase.rpc('save_academic_year', {
      p_academic_year_id: value?.id,
      p_label: label,
      p_is_current: value?.is_current ? true : form.is_current,
      p_is_active: value?.is_current ? true : form.is_active,
    })
    busyRef.current = false
    setBusy(false)

    if (error) {
      const text = error.code === '23505'
        ? 'Tahun ajaran tersebut sudah ada.'
        : error.code === '23514'
          ? 'Satu tahun ajaran aktif harus tetap ditetapkan sebagai tahun berjalan.'
          : error.code === '42501'
            ? 'Akun ini tidak memiliki izin untuk mengelola tahun ajaran.'
            : error.message
      setErrorText(text)
      return
    }
    onDone()
  }

  return <Dialog title={value ? 'Edit Tahun Ajaran' : 'Tambah Tahun Ajaran'} eyebrow="PERIODE AKADEMIK" onClose={() => { if (!busyRef.current) onClose() }}>
    <form className="v2-form" onSubmit={submit}>
      <label>Tahun ajaran<input required inputMode="numeric" pattern="[0-9]{4}/[0-9]{4}" placeholder="2026/2027" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></label>
      <label className="v2-toggle"><input type="checkbox" checked={value?.is_current ? true : form.is_current} disabled={Boolean(value?.is_current)} onChange={(event) => setForm({ ...form, is_current: event.target.checked, is_active: event.target.checked ? true : form.is_active })} /><span>Tetapkan sebagai tahun berjalan</span></label>
      <label className="v2-toggle"><input type="checkbox" checked={value?.is_current ? true : form.is_active} disabled={Boolean(value?.is_current)} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /><span>Tahun ajaran aktif</span></label>
      {value?.is_current && <p className="helper-text">Tahun ajaran yang sedang berjalan harus tetap aktif. Untuk menggantinya, buat atau edit periode lain lalu tetapkan sebagai tahun berjalan.</p>}
      {errorText && <p className="v2-field-error">{errorText}</p>}
      <button className="v2-primary" disabled={busy}><Save size={17} /> {busy ? 'Menyimpan...' : 'Simpan Tahun Ajaran'}</button>
    </form>
  </Dialog>
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}
