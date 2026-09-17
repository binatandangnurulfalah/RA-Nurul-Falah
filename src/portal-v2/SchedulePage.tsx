import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Edit3, Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ActionMenu, Dialog } from './AppExperience'
import { EmptyCard, Notice, PageTitle, SkeletonRows } from './PortalPages'

type Schedule = {
  id: string
  class_id: string
  class_name: string
  academic_year_id: string
  academic_year: string
  day_of_week: number
  start_time: string
  end_time: string
  activity: string
  teacher_name: string | null
  is_active: boolean
}

type SchoolClass = {
  id: string
  name: string
  academic_year_id: string
  academic_year: string
  is_active: boolean
}

type Message = { tone: 'success' | 'error'; text: string }

export default function SchedulePage({ canManage }: { canManage: boolean }) {
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
    const [scheduleResult, classResult] = await Promise.all([
      supabase.from('school_schedules').select('*').eq('is_active', true).order('day_of_week').order('start_time'),
      supabase.from('school_classes').select('id,name,academic_year_id,academic_year,is_active').eq('is_active', true).order('academic_year', { ascending: false }).order('name'),
    ])
    if (scheduleResult.error || classResult.error) setMessage({ tone: 'error', text: scheduleResult.error?.message || classResult.error?.message || 'Jadwal gagal dimuat.' })
    setRows((scheduleResult.data as Schedule[] | null) ?? [])
    setClasses((classResult.data as SchoolClass[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])
  const selected = rows.filter((row) => row.day_of_week === day)

  const remove = async () => {
    if (!deleting || !canManage) return
    const { error } = await supabase.from('school_schedules').delete().eq('id', deleting.id)
    if (error) { setMessage({ tone: 'error', text: error.message }); return }
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Jadwal berhasil dihapus.' })
    await load()
  }

  return <div className="v2-stack">
    <PageTitle eyebrow="AGENDA BELAJAR" title="Jadwal Mingguan" text={canManage ? 'Tambah, edit, dan hapus jadwal berdasarkan kelas resmi dan tahun ajarannya.' : 'Jadwal kegiatan belajar anak sesuai kelompoknya.'} action={canManage ? <button className="v2-primary" onClick={() => setEditing('new')} disabled={!classes.length}><Plus size={17} /> Tambah Jadwal</button> : undefined} />
    {message && <Notice {...message} />}
    {canManage && !loading && !classes.length && <Notice tone="error" text="Belum ada kelas aktif. Tambahkan kelas terlebih dahulu sebelum membuat jadwal." />}
    <div className="v2-tabs">{days.map((label, index) => <button key={label} className={day === index + 1 ? 'active' : ''} onClick={() => setDay(index + 1)}>{label}</button>)}</div>
    <section className="v2-panel">{loading ? <SkeletonRows /> : selected.length ? <div className="v2-schedule-list">{selected.map((row) => <article key={row.id}><time>{row.start_time.slice(0, 5)}–{row.end_time.slice(0, 5)}</time><span className="dot" /><div><strong>{row.activity}</strong><small>{row.class_name} · {row.academic_year} · {row.teacher_name || 'Guru kelas'}</small></div>{canManage && <ActionMenu label={`Aksi jadwal ${row.activity}`} items={[{ label: 'Edit jadwal', icon: Edit3, onSelect: () => setEditing(row) }, { label: 'Hapus jadwal', icon: Trash2, danger: true, onSelect: () => setDeleting(row) }]} />}</article>)}</div> : <EmptyCard text="Belum ada jadwal untuk hari ini." />}</section>
    {editing && canManage && <ScheduleModal value={editing === 'new' ? null : editing} classes={classes} defaultDay={day} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); setMessage({ tone: 'success', text: 'Jadwal berhasil disimpan.' }); await load() }} />}
    {deleting && <ConfirmDialog text={`${deleting.activity} akan dihapus dari jadwal mingguan.`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}
  </div>
}

function ScheduleModal({ value, classes, defaultDay, onClose, onDone }: { value: Schedule | null; classes: SchoolClass[]; defaultDay: number; onClose: () => void; onDone: () => void }) {
  const initialClass = classes.find((schoolClass) => schoolClass.id === value?.class_id) ?? classes[0]
  const [form, setForm] = useState({
    class_id: value?.class_id || initialClass?.id || '',
    day: value?.day_of_week || defaultDay,
    start: value?.start_time.slice(0, 5) || '07:30',
    end: value?.end_time.slice(0, 5) || '08:00',
    activity: value?.activity || '',
    teacher: value?.teacher_name || '',
  })
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [errorText, setErrorText] = useState('')
  const selectedClass = classes.find((schoolClass) => schoolClass.id === form.class_id)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busyRef.current) return
    if (!selectedClass) {
      setErrorText('Pilih kelas aktif yang valid.')
      return
    }
    if (form.end <= form.start) {
      setErrorText('Jam selesai harus setelah jam mulai.')
      return
    }

    busyRef.current = true
    setBusy(true)
    setErrorText('')
    const payload = {
      class_id: selectedClass.id,
      class_name: selectedClass.name,
      academic_year_id: selectedClass.academic_year_id,
      academic_year: selectedClass.academic_year,
      day_of_week: form.day,
      start_time: form.start,
      end_time: form.end,
      activity: form.activity.trim(),
      teacher_name: form.teacher.trim() || null,
      is_active: true,
    }
    const result = value ? await supabase.from('school_schedules').update(payload).eq('id', value.id) : await supabase.from('school_schedules').insert(payload)
    busyRef.current = false
    setBusy(false)
    if (result.error) {
      const text = result.error.code === '23505'
        ? 'Sudah ada jadwal pada kelas, hari, dan jam tersebut.'
        : result.error.code === '23503'
          ? 'Kelas atau tahun ajaran tidak ditemukan. Muat ulang halaman lalu coba lagi.'
          : result.error.message
      setErrorText(text)
      return
    }
    onDone()
  }

  return <Dialog title={value ? 'Edit Jadwal' : 'Tambah Jadwal'} eyebrow="FORMULIR" onClose={() => { if (!busyRef.current) onClose() }} wide><form className="v2-form v2-form-grid" onSubmit={submit}><label>Kelompok<select required value={form.class_id} onChange={(event) => setForm({ ...form, class_id: event.target.value })}><option value="" disabled>Pilih kelas</option>{classes.map((schoolClass) => <option value={schoolClass.id} key={schoolClass.id}>{schoolClass.name} · {schoolClass.academic_year}</option>)}</select></label><label>Tahun ajaran<input value={selectedClass?.academic_year || ''} readOnly aria-readonly="true" /></label><label>Hari<select value={form.day} onChange={(event) => setForm({ ...form, day: Number(event.target.value) })}>{['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'].map((label, index) => <option value={index + 1} key={label}>{label}</option>)}</select></label><label>Jam mulai<input required type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} /></label><label>Jam selesai<input required type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} /></label><label className="full">Kegiatan<input required value={form.activity} onChange={(event) => setForm({ ...form, activity: event.target.value })} /></label><label>Guru<input value={form.teacher} onChange={(event) => setForm({ ...form, teacher: event.target.value })} /></label>{errorText && <p className="v2-field-error full">{errorText}</p>}<div className="v2-form-actions full"><button type="button" className="v2-secondary" disabled={busy} onClick={onClose}>Batal</button><button className="v2-primary" disabled={busy || !selectedClass}><Save size={17} /> {busy ? 'Menyimpan...' : 'Simpan Jadwal'}</button></div></form></Dialog>
}

function ConfirmDialog({ text, onClose, onConfirm }: { text: string; onClose: () => void; onConfirm: () => void }) {
  return <Dialog title="Hapus jadwal?" onClose={onClose} confirm><span className="v2-modal-icon danger"><Trash2 /></span><p>{text}</p><div className="v2-form-actions"><button className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-danger" onClick={onConfirm}>Hapus Jadwal</button></div></Dialog>
}
