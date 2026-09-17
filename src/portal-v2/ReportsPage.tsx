import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { BookOpenCheck, CheckCircle2, Edit3, GraduationCap, Plus, Printer, Search, Trash2 } from 'lucide-react'
import { type AppRole, supabase } from '../lib/supabase'
import { getPageRange, sanitizeSearch } from '../lib/data-utils.js'
import { ActionMenu, Dialog, useChildSelection } from './AppExperience'
import { PAGE_SIZE, PaginationControls, useDebouncedValue } from './DataExperience'
import { EmptyCard, Notice, PageTitle, SkeletonRows } from './PortalPages'

type Message = { tone: 'success' | 'error'; text: string }
type StudentLite = { id: string; full_name: string; class_name: string | null; academic_year: string | null; is_active?: boolean }
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
  student_full_name: string
  student_class_name: string | null
}
type ReportStats = { total: number; published: number; draft: number }

export function ReportsPage({ role }: { role: AppRole }) {
  const childSelection = useChildSelection()
  const canManage = role !== 'parent'
  const canDelete = role === 'admin'
  const selectedChildId = role === 'parent' ? childSelection.selectedChildId : ''
  const [students, setStudents] = useState<StudentLite[]>([])
  const [rows, setRows] = useState<ReportCard[]>([])
  const [stats, setStats] = useState<ReportStats>({ total: 0, published: 0, draft: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [editing, setEditing] = useState<ReportCard | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ReportCard | null>(null)
  const [viewing, setViewing] = useState<ReportCard | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const debouncedSearch = useDebouncedValue(search)

  const loadRows = async () => {
    setLoading(true)
    const range = getPageRange(page, PAGE_SIZE)
    let query = supabase
      .from('report_cards_search')
      .select('id,student_id,academic_year,semester,religion_character,identity_independence,literacy_steam,growth_notes,teacher_note,is_published,created_at,updated_at,student_full_name,student_class_name', { count: 'exact' })
      .order('academic_year', { ascending: false })
      .order('semester', { ascending: false })
      .order('updated_at', { ascending: false })
      .range(range.from, range.to)

    if (selectedChildId) query = query.eq('student_id', selectedChildId)
    const normalizedSearch = sanitizeSearch(debouncedSearch)
    if (normalizedSearch) {
      query = query.or(`student_full_name.ilike.%${normalizedSearch}%,student_class_name.ilike.%${normalizedSearch}%,academic_year.ilike.%${normalizedSearch}%`)
    }

    const { data, error, count } = await query
    if (error) setMessage({ tone: 'error', text: error.message })
    setRows((data as ReportCard[] | null) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }

  const loadStats = async () => {
    const baseCount = () => {
      let query = supabase.from('report_cards').select('id', { count: 'exact', head: true })
      if (selectedChildId) query = query.eq('student_id', selectedChildId)
      return query
    }
    const publishedCount = () => {
      let query = supabase.from('report_cards').select('id', { count: 'exact', head: true }).eq('is_published', true)
      if (selectedChildId) query = query.eq('student_id', selectedChildId)
      return query
    }
    const draftCount = () => {
      let query = supabase.from('report_cards').select('id', { count: 'exact', head: true }).eq('is_published', false)
      if (selectedChildId) query = query.eq('student_id', selectedChildId)
      return query
    }

    const [allResult, publishedResult, draftResult] = await Promise.all([baseCount(), publishedCount(), draftCount()])
    const firstError = allResult.error || publishedResult.error || draftResult.error
    if (firstError) setMessage({ tone: 'error', text: firstError.message })
    setStats({ total: allResult.count ?? 0, published: publishedResult.count ?? 0, draft: draftResult.count ?? 0 })
  }

  const loadStudents = async () => {
    if (!canManage) {
      setStudents([])
      return
    }
    const { data, error } = await supabase.from('students').select('id,full_name,class_name,academic_year,is_active').eq('is_active', true).order('full_name')
    if (error) setMessage({ tone: 'error', text: error.message })
    setStudents((data as StudentLite[] | null) ?? [])
  }

  useEffect(() => { void loadRows() }, [page, debouncedSearch, selectedChildId])
  useEffect(() => { setPage(1) }, [debouncedSearch, selectedChildId])
  useEffect(() => { void loadStats() }, [selectedChildId])
  useEffect(() => { void loadStudents() }, [canManage])

  const refreshAfterMutation = async () => {
    await Promise.all([loadRows(), loadStats()])
  }

  const remove = async () => {
    if (!deleting || !canDelete) return
    const { error } = await supabase.from('report_cards').delete().eq('id', deleting.id)
    if (error) {
      setMessage({ tone: 'error', text: error.message })
      return
    }

    const shouldGoBack = rows.length === 1 && page > 1
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Rapor berhasil dihapus.' })
    if (shouldGoBack) {
      setPage((current) => Math.max(1, current - 1))
      await loadStats()
    } else {
      await refreshAfterMutation()
    }
  }

  return <div className="v2-stack">
    <PageTitle eyebrow="PERKEMBANGAN MURID" title={role === 'parent' ? 'Rapor Anak' : 'Penilaian & Rapor'} text={canManage ? 'Catat perkembangan anak dan terbitkan rapor untuk Wali.' : 'Rapor yang sudah diterbitkan oleh RA Nurul Falah.'} action={canManage ? <button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Buat Rapor</button> : undefined} />
    {message && <Notice {...message} />}
    <div className="v2-stat-grid three">
      <MiniStat icon={<BookOpenCheck size={20} />} label="Total Rapor" value={stats.total} tone="blue" />
      <MiniStat icon={<CheckCircle2 size={20} />} label="Terbit" value={stats.published} tone="green" />
      <MiniStat icon={<GraduationCap size={20} />} label="Draft" value={stats.draft} tone="gold" />
    </div>
    <section className="v2-panel">
      <div className="v2-toolbar"><label><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama murid, kelas, tahun ajaran..." /></label></div>
      {loading ? <SkeletonRows /> : rows.length ? <>
        <div className="school-card-grid">
          {rows.map((row) => <article className="school-report-card" key={row.id}>
            <div className="school-report-icon"><BookOpenCheck /></div>
            <div className="grow">
              <div className="school-meta"><span className={`v2-badge ${row.is_published ? 'green' : 'gray'}`}>{row.is_published ? 'Terbit' : 'Draft'}</span><span>Semester {row.semester}</span><span>{row.academic_year}</span></div>
              <h3>{row.student_full_name || 'Murid'}</h3>
              <p>{row.student_class_name || 'Belum ada kelompok'}</p>
              <small>{row.teacher_note || row.growth_notes || 'Catatan perkembangan belum diisi.'}</small>
            </div>
            <ActionMenu label={`Aksi rapor ${row.student_full_name || 'murid'}`} items={[
              { label: 'Lihat rapor', icon: BookOpenCheck, onSelect: () => setViewing(row) },
              ...(canManage ? [{ label: 'Edit rapor', icon: Edit3, onSelect: () => setEditing(row) }] : []),
              ...(canDelete ? [{ label: 'Hapus rapor', icon: Trash2, danger: true, onSelect: () => setDeleting(row) }] : []),
            ]} />
          </article>)}
        </div>
        <PaginationControls page={page} total={total} onPage={setPage} />
      </> : <EmptyCard text={role === 'parent' ? 'Belum ada rapor yang diterbitkan.' : 'Belum ada data rapor yang sesuai pencarian.'} />}
    </section>
    {editing && canManage && <ReportModal value={editing === 'new' ? null : editing} students={students} onClose={() => setEditing(null)} onDone={async () => {
      setEditing(null)
      setMessage({ tone: 'success', text: 'Rapor berhasil disimpan.' })
      await refreshAfterMutation()
    }} />}
    {viewing && <ReportViewer value={viewing} onClose={() => setViewing(null)} />}
    {deleting && <Confirm title="Hapus rapor?" text={`Rapor ${deleting.student_full_name || 'murid'} semester ${deleting.semester} akan dihapus.`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}
  </div>
}

function ReportModal({ value, students, onClose, onDone }: { value: ReportCard | null; students: StudentLite[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    student_id: value?.student_id || students[0]?.id || '',
    academic_year: value?.academic_year || students[0]?.academic_year || '2026/2027',
    semester: value?.semester || 1,
    religion_character: value?.religion_character || '',
    identity_independence: value?.identity_independence || '',
    literacy_steam: value?.literacy_steam || '',
    growth_notes: value?.growth_notes || '',
    teacher_note: value?.teacher_note || '',
    published: value?.is_published ?? false,
  })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrorText('')
    const payload = {
      student_id: form.student_id,
      academic_year: form.academic_year.trim(),
      semester: Number(form.semester),
      religion_character: form.religion_character.trim() || null,
      identity_independence: form.identity_independence.trim() || null,
      literacy_steam: form.literacy_steam.trim() || null,
      growth_notes: form.growth_notes.trim() || null,
      teacher_note: form.teacher_note.trim() || null,
      is_published: form.published,
    }
    const result = value
      ? await supabase.from('report_cards').update(payload).eq('id', value.id)
      : await supabase.from('report_cards').insert(payload)
    setBusy(false)
    if (result.error) {
      setErrorText(result.error.code === '23505' ? 'Rapor murid untuk tahun ajaran dan semester ini sudah ada.' : result.error.message)
      return
    }
    onDone()
  }

  return <Dialog title={value ? 'Edit Rapor' : 'Buat Rapor'} onClose={onClose} wide>
    <form className="v2-form v2-form-grid" onSubmit={submit}>
      <label>Murid<select required value={form.student_id} onChange={(event) => setForm({ ...form, student_id: event.target.value })}>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name} {student.class_name ? `· ${student.class_name}` : ''}</option>)}</select></label>
      <label>Tahun ajaran<input required value={form.academic_year} onChange={(event) => setForm({ ...form, academic_year: event.target.value })} /></label>
      <label>Semester<select value={form.semester} onChange={(event) => setForm({ ...form, semester: Number(event.target.value) })}><option value={1}>Semester 1</option><option value={2}>Semester 2</option></select></label>
      <label className="v2-toggle"><input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} /><span>Terbitkan untuk Wali</span></label>
      <label className="full">Nilai Agama & Budi Pekerti<textarea rows={4} value={form.religion_character} onChange={(event) => setForm({ ...form, religion_character: event.target.value })} placeholder="Perkembangan nilai agama, akhlak, kebiasaan baik..." /></label>
      <label className="full">Jati Diri<textarea rows={4} value={form.identity_independence} onChange={(event) => setForm({ ...form, identity_independence: event.target.value })} placeholder="Kemandirian, sosial emosional, motorik dan kebiasaan diri..." /></label>
      <label className="full">Dasar Literasi & STEAM<textarea rows={4} value={form.literacy_steam} onChange={(event) => setForm({ ...form, literacy_steam: event.target.value })} placeholder="Bahasa, numerasi, sains, teknologi, rekayasa dan seni..." /></label>
      <label className="full">Catatan pertumbuhan / perkembangan lain<textarea rows={3} value={form.growth_notes} onChange={(event) => setForm({ ...form, growth_notes: event.target.value })} /></label>
      <label className="full">Pesan Guru untuk Wali<textarea rows={3} value={form.teacher_note} onChange={(event) => setForm({ ...form, teacher_note: event.target.value })} /></label>
      {errorText && <p className="v2-field-error full">{errorText}</p>}
      <div className="v2-form-actions full"><button type="button" className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Rapor'}</button></div>
    </form>
  </Dialog>
}

function ReportViewer({ value, onClose }: { value: ReportCard; onClose: () => void }) {
  const items = [['Nilai Agama & Budi Pekerti', value.religion_character], ['Jati Diri', value.identity_independence], ['Dasar Literasi & STEAM', value.literacy_steam], ['Perkembangan Lain', value.growth_notes], ['Pesan Guru', value.teacher_note]]
  return <Dialog title={`Rapor ${value.student_full_name || 'Murid'}`} onClose={onClose} wide>
    <div className="v5-print-document"><div className="report-view-head"><span className="v2-badge blue">Semester {value.semester}</span><span>{value.student_class_name || 'RA Nurul Falah'}</span><span>{value.academic_year}</span></div><div className="report-view-sections">{items.map(([label, text]) => <section key={label}><small>{label}</small><p>{text || 'Belum ada catatan.'}</p></section>)}</div></div>
    <button className="v2-primary v5-print-button" onClick={() => window.print()}><Printer size={17} /> Cetak / Simpan PDF</button>
  </Dialog>
}

function Confirm({ title, text, onClose, onConfirm }: { title: string; text: string; onClose: () => void; onConfirm: () => void }) {
  return <Dialog title={title} onClose={onClose} confirm><span className="v2-modal-icon danger"><Trash2 /></span><p>{text}</p><div className="v2-form-actions"><button className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-danger" onClick={onConfirm}>Ya, Hapus</button></div></Dialog>
}

function MiniStat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: string }) {
  return <article className={`v2-stat mini ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>Data tercatat</p></div></article>
}
