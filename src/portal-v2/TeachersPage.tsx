import { type FormEvent, useEffect, useState } from 'react'
import { CheckCircle2, ContactRound, Edit3, Plus, Search, Trash2, UserRound } from 'lucide-react'
import { supabase, type UserProfile } from '../lib/supabase'
import { getPageRange, sanitizeSearch } from '../lib/data-utils.js'
import { ActionMenu, Dialog } from './AppExperience'
import { PAGE_SIZE, PaginationControls, useDebouncedValue } from './DataExperience'
import { EmptyCard, Notice, PageTitle, SkeletonRows } from './PortalPages'

type Message = { tone: 'success' | 'error'; text: string }
type TeacherAccount = Pick<UserProfile, 'id' | 'display_name' | 'phone' | 'is_active'>
type TeacherProfile = {
  id: string
  teacher_user_id: string | null
  full_name: string
  nik: string | null
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
type LinkedTeacherAccount = { teacher_user_id: string | null }
type TeacherStats = { total: number; linked: number; unlinked: number }

export function TeachersPage() {
  const [rows, setRows] = useState<TeacherProfile[]>([])
  const [teacherAccounts, setTeacherAccounts] = useState<TeacherAccount[]>([])
  const [linkedAccountIds, setLinkedAccountIds] = useState<Set<string>>(new Set())
  const [stats, setStats] = useState<TeacherStats>({ total: 0, linked: 0, unlinked: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [editing, setEditing] = useState<TeacherProfile | 'new' | null>(null)
  const [deleting, setDeleting] = useState<TeacherProfile | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const debouncedSearch = useDebouncedValue(search)

  const loadRows = async () => {
    setLoading(true)
    const range = getPageRange(page, PAGE_SIZE)
    let query = supabase
      .from('teacher_profiles_search')
      .select('id,teacher_user_id,full_name,nik,employee_no,nuptk,position,employment_status,education,gender,birth_place,birth_date,joined_date,notes', { count: 'exact' })
      .order('full_name')
      .range(range.from, range.to)

    const normalizedSearch = sanitizeSearch(debouncedSearch)
    if (normalizedSearch) {
      query = query.or(`full_name.ilike.%${normalizedSearch}%,nik.ilike.%${normalizedSearch}%,employee_no.ilike.%${normalizedSearch}%,nuptk.ilike.%${normalizedSearch}%,position.ilike.%${normalizedSearch}%`)
    }

    const { data, error, count } = await query
    if (error) setMessage({ tone: 'error', text: error.message })
    setRows((data as TeacherProfile[] | null) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }

  const loadMeta = async () => {
    const [accountsResult, linkedIdsResult, totalResult, linkedResult] = await Promise.all([
      supabase.from('user_profiles').select('id,display_name,phone,is_active').eq('role', 'teacher').order('display_name'),
      supabase.from('teacher_profiles').select('teacher_user_id').not('teacher_user_id', 'is', null),
      supabase.from('teacher_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('teacher_profiles').select('id', { count: 'exact', head: true }).not('teacher_user_id', 'is', null),
    ])

    const firstError = accountsResult.error || linkedIdsResult.error || totalResult.error || linkedResult.error
    if (firstError) setMessage({ tone: 'error', text: firstError.message })

    setTeacherAccounts((accountsResult.data as TeacherAccount[] | null) ?? [])
    const linkedIds = ((linkedIdsResult.data as LinkedTeacherAccount[] | null) ?? [])
      .map((row) => row.teacher_user_id)
      .filter((id): id is string => Boolean(id))
    setLinkedAccountIds(new Set(linkedIds))

    const totalCount = totalResult.count ?? 0
    const linkedCount = linkedResult.count ?? 0
    setStats({ total: totalCount, linked: linkedCount, unlinked: Math.max(0, totalCount - linkedCount) })
  }

  useEffect(() => { void loadRows() }, [page, debouncedSearch])
  useEffect(() => { setPage(1) }, [debouncedSearch])
  useEffect(() => { void loadMeta() }, [])

  const refreshAfterMutation = async () => {
    await Promise.all([loadRows(), loadMeta()])
  }

  const remove = async () => {
    if (!deleting) return
    const { error } = await supabase.from('teacher_profiles').delete().eq('id', deleting.id)
    if (error) {
      setMessage({ tone: 'error', text: error.message })
      return
    }

    const shouldGoBack = rows.length === 1 && page > 1
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Data Guru berhasil dihapus. Akun login, jika ada, tetap aktif.' })
    if (shouldGoBack) {
      setPage((current) => Math.max(1, current - 1))
      await loadMeta()
    } else {
      await refreshAfterMutation()
    }
  }

  const availableAccounts = teacherAccounts.filter((account) => {
    if (editing && editing !== 'new' && editing.teacher_user_id === account.id) return true
    return !linkedAccountIds.has(account.id)
  })

  return <div className="v2-stack">
    <PageTitle eyebrow="TENAGA PENDIDIK" title="Data Guru" text="Kelola data Guru. Akun login dapat dihubungkan nanti setelah email tersedia." action={<button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Tambah Guru</button>} />
    {message && <Notice {...message} />}
    <div className="v2-stat-grid three">
      <MiniStat icon={<ContactRound size={20} />} label="Total Guru" value={stats.total} tone="green" />
      <MiniStat icon={<CheckCircle2 size={20} />} label="Terhubung Akun" value={stats.linked} tone="blue" />
      <MiniStat icon={<UserRound size={20} />} label="Tanpa Akun" value={stats.unlinked} tone="gold" />
    </div>
    <section className="v2-panel">
      <div className="v2-toolbar"><label><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, NIK, NUPTK, nomor pegawai..." /></label></div>
      {loading ? <SkeletonRows /> : rows.length ? <>
        <div className="school-card-grid">
          {rows.map((row) => <article className="school-person" key={row.id}>
            <span className="v2-avatar">{initials(row.full_name)}</span>
            <div className="grow">
              <div className="school-meta"><span className="v2-badge green">Aktif</span>{row.teacher_user_id ? <span className="v2-badge blue">Punya akun</span> : <span className="v2-badge gold">Belum punya akun</span>}</div>
              <h3>{row.full_name}</h3>
              <p>{row.position || 'Guru'} · {row.employment_status || 'Status kepegawaian belum diisi'}</p>
              <small>{row.nuptk ? `NUPTK ${row.nuptk}` : row.employee_no ? `No. Pegawai ${row.employee_no}` : row.nik ? `NIK ${row.nik}` : 'Identitas profesional belum dilengkapi'}</small>
            </div>
            <ActionMenu label={`Aksi untuk Guru ${row.full_name}`} items={[
              { label: 'Edit data Guru', icon: Edit3, onSelect: () => setEditing(row) },
              { label: 'Hapus data Guru', icon: Trash2, danger: true, onSelect: () => setDeleting(row) },
            ]} />
          </article>)}
        </div>
        <PaginationControls page={page} total={total} onPage={setPage} />
      </> : <EmptyCard text="Belum ada data Guru yang sesuai pencarian." />}
    </section>
    {editing && <TeacherModal row={editing === 'new' ? null : editing} available={availableAccounts} onClose={() => setEditing(null)} onDone={async () => {
      setEditing(null)
      setMessage({ tone: 'success', text: 'Data Guru berhasil disimpan.' })
      await refreshAfterMutation()
    }} />}
    {deleting && <Confirm title="Hapus data Guru?" text={`Data profesional ${deleting.full_name} akan dihapus, tetapi akun login yang terhubung tidak dihapus.`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}
  </div>
}

function TeacherModal({ row, available, onClose, onDone }: { row: TeacherProfile | null; available: TeacherAccount[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    full_name: row?.full_name || '',
    nik: row?.nik || '',
    teacher_user_id: row?.teacher_user_id || '',
    employee_no: row?.employee_no || '',
    nuptk: row?.nuptk || '',
    position: row?.position || 'Guru',
    employment_status: row?.employment_status || '',
    education: row?.education || '',
    gender: row?.gender || '',
    birth_place: row?.birth_place || '',
    birth_date: row?.birth_date || '',
    joined_date: row?.joined_date || '',
    notes: row?.notes || '',
  })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrorText('')
    const payload = {
      full_name: form.full_name.trim(),
      nik: form.nik.trim() || null,
      teacher_user_id: form.teacher_user_id || null,
      employee_no: form.employee_no.trim() || null,
      nuptk: form.nuptk.trim() || null,
      position: form.position.trim() || null,
      employment_status: form.employment_status.trim() || null,
      education: form.education.trim() || null,
      gender: form.gender || null,
      birth_place: form.birth_place.trim() || null,
      birth_date: form.birth_date || null,
      joined_date: form.joined_date || null,
      notes: form.notes.trim() || null,
    }
    const result = row
      ? await supabase.from('teacher_profiles').update(payload).eq('id', row.id)
      : await supabase.from('teacher_profiles').insert(payload)
    setBusy(false)
    if (result.error) {
      setErrorText(result.error.code === '23505' ? 'Nomor pegawai atau NUPTK sudah digunakan.' : result.error.message)
      return
    }
    onDone()
  }

  return <Dialog title={row ? 'Edit Data Guru' : 'Tambah Data Guru'} onClose={onClose} wide>
    <form className="v2-form v2-form-grid" onSubmit={submit}>
      <label>Nama lengkap<input required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
      <label>NIK<input inputMode="numeric" maxLength={16} value={form.nik} onChange={(event) => setForm({ ...form, nik: event.target.value.replace(/\D/g, '').slice(0, 16) })} /></label>
      <label className="full">Akun login (opsional)<select value={form.teacher_user_id} onChange={(event) => setForm({ ...form, teacher_user_id: event.target.value })}><option value="">Belum dihubungkan</option>{available.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.display_name || 'Guru'}</option>)}</select></label>
      <label>No. pegawai<input value={form.employee_no} onChange={(event) => setForm({ ...form, employee_no: event.target.value })} /></label>
      <label>NUPTK<input value={form.nuptk} onChange={(event) => setForm({ ...form, nuptk: event.target.value })} /></label>
      <label>Jabatan<input value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} placeholder="Guru Kelas / Kepala RA" /></label>
      <label>Status kepegawaian<input value={form.employment_status} onChange={(event) => setForm({ ...form, employment_status: event.target.value })} placeholder="Tetap / Honorer" /></label>
      <label>Pendidikan terakhir<input value={form.education} onChange={(event) => setForm({ ...form, education: event.target.value })} placeholder="S1 PGRA" /></label>
      <label>Jenis kelamin<select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="">Belum diisi</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></label>
      <label>Tempat lahir<input value={form.birth_place} onChange={(event) => setForm({ ...form, birth_place: event.target.value })} /></label>
      <label>Tanggal lahir<input type="date" value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} /></label>
      <label>Tanggal mulai mengajar<input type="date" value={form.joined_date} onChange={(event) => setForm({ ...form, joined_date: event.target.value })} /></label>
      <label className="full">Catatan<textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      {errorText && <p className="v2-field-error full">{errorText}</p>}
      <div className="v2-form-actions full"><button type="button" className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Data Guru'}</button></div>
    </form>
  </Dialog>
}

function Confirm({ title, text, onClose, onConfirm }: { title: string; text: string; onClose: () => void; onConfirm: () => void }) {
  return <Dialog title={title} onClose={onClose} confirm><span className="v2-modal-icon danger"><Trash2 /></span><p>{text}</p><div className="v2-form-actions"><button className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-danger" onClick={onConfirm}>Ya, Hapus</button></div></Dialog>
}

function MiniStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return <article className={`v2-stat mini ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>Data tercatat</p></div></article>
}

function initials(name?: string | null) {
  return (name || 'Guru').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}
