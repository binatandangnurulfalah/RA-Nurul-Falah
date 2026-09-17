import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Edit3, GraduationCap, Plus, Save, Trash2 } from 'lucide-react'
import { queryKeys } from '../data/queryKeys'
import { supabase } from '../lib/supabase'
import { EmptyCard, Notice, PageTitle, SkeletonRows } from './PortalPages'
import { ActionMenu, Dialog } from './AppExperience'

type SchoolClass = {
  id: string
  name: string
  teacher_name: string | null
  academic_year: string
  is_active: boolean
  teacher_class_assignments?: {
    teacher_profile_id: string
    teacher_profiles: { full_name: string; teacher_user_id: string | null } | null
  }[]
}

type TeacherOption = { id: string; full_name: string; teacher_user_id: string | null }
type Message = { tone: 'success' | 'error'; text: string }

export function ClassesPage() {
  const queryClient = useQueryClient()
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [editing, setEditing] = useState<SchoolClass | 'new' | null>(null)
  const [deleting, setDeleting] = useState<SchoolClass | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [classResult, studentResult, teacherResult] = await Promise.all([
      supabase
        .from('school_classes')
        .select('*,teacher_class_assignments(teacher_profile_id,teacher_profiles(full_name,teacher_user_id))')
        .order('name'),
      supabase.from('students').select('class_name').eq('is_active', true),
      supabase.from('teacher_profiles').select('id,full_name,teacher_user_id').order('full_name'),
    ])

    const list = (classResult.data as SchoolClass[] | null) ?? []
    const nextCounts: Record<string, number> = {}
    for (const row of studentResult.data ?? []) {
      if (row.class_name) nextCounts[row.class_name] = (nextCounts[row.class_name] || 0) + 1
    }

    if (classResult.error || studentResult.error || teacherResult.error) {
      setMessage({
        tone: 'error',
        text: classResult.error?.message || studentResult.error?.message || teacherResult.error?.message || 'Data kelas gagal dimuat.',
      })
    }

    setClasses(list)
    setTeachers((teacherResult.data as TeacherOption[] | null) ?? [])
    setCounts(nextCounts)
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const invalidateClassConsumers = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.students.all })
  }

  const remove = async () => {
    if (!deleting) return
    if ((counts[deleting.name] || 0) > 0) {
      setMessage({ tone: 'error', text: 'Kelas masih memiliki murid. Pindahkan murid terlebih dahulu sebelum menghapus kelas.' })
      setDeleting(null)
      return
    }

    const { error } = await supabase.from('school_classes').delete().eq('id', deleting.id)
    if (error) {
      setMessage({ tone: 'error', text: error.message })
      return
    }

    await invalidateClassConsumers()
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Kelas berhasil dihapus.' })
    await load()
  }

  return <div className="v2-stack">
    <PageTitle
      eyebrow="STRUKTUR AKADEMIK"
      title="Kelas & Tahun Ajaran"
      text="Kelola kelompok belajar, wali/guru kelas, dan tahun ajaran."
      action={<button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Tambah Kelas</button>}
    />
    {message && <Notice {...message} />}
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
            <p>{assigned || schoolClass.teacher_name || 'Guru belum ditentukan'} · {counts[schoolClass.name] || 0} murid</p>
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
      onClose={() => setEditing(null)}
      onDone={async () => {
        await invalidateClassConsumers()
        setEditing(null)
        setMessage({ tone: 'success', text: 'Data kelas dan penugasan Guru berhasil disimpan.' })
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

function ClassModal({ value, teachers, onClose, onDone }: {
  value: SchoolClass | null
  teachers: TeacherOption[]
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState({
    name: value?.name || '',
    teacher_profile_ids: value?.teacher_class_assignments?.map((item) => item.teacher_profile_id) || [],
    academic_year: value?.academic_year || '2026/2027',
    active: value?.is_active ?? true,
  })
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setErrorText('')

    const { error } = await supabase.rpc('save_class_with_assignments', {
      p_class_id: value?.id,
      p_name: form.name.trim(),
      p_academic_year: form.academic_year.trim(),
      p_is_active: form.active,
      p_teacher_profile_ids: form.teacher_profile_ids,
    })

    busyRef.current = false
    setBusy(false)
    if (error) {
      const text = error.code === '23505'
        ? 'Nama kelas sudah digunakan.'
        : error.code === '23503'
          ? 'Satu atau lebih data Guru tidak ditemukan. Muat ulang halaman lalu coba lagi.'
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
      <fieldset className="v5-teacher-picker">
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
      </fieldset>
      <label>Tahun ajaran<input required value={form.academic_year} onChange={(event) => setForm({ ...form, academic_year: event.target.value })} /></label>
      <label className="v2-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>Kelas aktif</span></label>
      {errorText && <p className="v2-field-error">{errorText}</p>}
      <button className="v2-primary" disabled={busy}><Save size={17} /> {busy ? 'Menyimpan...' : 'Simpan'}</button>
    </form>
  </Dialog>
}
