import { type FormEvent, useEffect, useState } from 'react'
import { CheckCircle2, ContactRound, Edit3, Plus, Trash2, UserRound } from 'lucide-react'
import { DataListSkeleton, DataTable, type DataTableColumn, MobileDataCard, SearchFilterBar, StatCard, StatusBadge } from '../components/data'
import { ConfirmDialog } from '../components/forms'
import { Button, EmptyState, PageHeader } from '../components/ui'
import { supabase, type UserProfile } from '../lib/supabase'
import { getPageRange, sanitizeSearch } from '../lib/data-utils.js'
import { ActionMenu, Dialog } from './AppExperience'
import { PAGE_SIZE, PaginationControls, useDebouncedValue } from './DataExperience'
import { Notice } from './PortalPages'

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
  const [removing, setRemoving] = useState(false)
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
    if (!deleting || removing) return
    setRemoving(true)
    const { error } = await supabase.from('teacher_profiles').delete().eq('id', deleting.id)
    if (error) {
      setRemoving(false)
      setMessage({ tone: 'error', text: error.message })
      return
    }

    const shouldGoBack = rows.length === 1 && page > 1
    setRemoving(false)
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

  const actionItems = (row: TeacherProfile) => [
    { label: 'Edit data Guru', icon: Edit3, onSelect: () => setEditing(row) },
    { label: 'Hapus data Guru', icon: Trash2, danger: true, onSelect: () => setDeleting(row) },
  ]

  const identityText = (row: TeacherProfile) => row.nuptk ? `NUPTK ${row.nuptk}` : row.employee_no ? `No. Pegawai ${row.employee_no}` : row.nik ? `NIK ${row.nik}` : 'Belum dilengkapi'

  const columns: DataTableColumn<TeacherProfile>[] = [
    {
      key: 'teacher',
      header: 'Guru',
      render: (row) => <div className="data-primary-cell"><span className="data-primary-cell__avatar">{initials(row.full_name)}</span><div className="data-primary-cell__copy"><strong>{row.full_name}</strong><small>{identityText(row)}</small></div></div>,
    },
    { key: 'position', header: 'Jabatan', render: (row) => row.position || 'Guru' },
    { key: 'employment', header: 'Kepegawaian', render: (row) => row.employment_status || 'Belum diisi' },
    { key: 'account', header: 'Akun', render: (row) => <StatusBadge tone={row.teacher_user_id ? 'info' : 'warning'}>{row.teacher_user_id ? 'Terhubung' : 'Belum terhubung'}</StatusBadge> },
    { key: 'actions', header: 'Aksi', align: 'right', render: (row) => <ActionMenu label={`Aksi untuk Guru ${row.full_name}`} items={actionItems(row)} /> },
  ]

  const hasSearch = Boolean(search.trim())
  const emptyState = (
    <EmptyState
      icon={<UserRound size={24} />}
      title={hasSearch ? 'Tidak ada Guru yang cocok' : 'Belum ada data Guru'}
      description={hasSearch ? 'Ubah kata pencarian atau reset pencarian untuk melihat data lainnya.' : 'Data Guru akan muncul setelah ditambahkan ke sistem.'}
      action={hasSearch
        ? <Button variant="secondary" onClick={() => setSearch('')}>Reset Pencarian</Button>
        : <Button onClick={() => setEditing('new')}><Plus size={17} /> Tambah Guru</Button>}
    />
  )

  return <div className="v2-stack">
    <PageHeader
      eyebrow="TENAGA PENDIDIK"
      title="Data Guru"
      subtitle="Kelola data Guru. Akun login dapat dihubungkan nanti setelah email tersedia."
      actions={<Button onClick={() => setEditing('new')}><Plus size={17} /> Tambah Guru</Button>}
    />
    {message && <Notice {...message} />}
    <div className="data-stat-grid">
      <StatCard icon={<ContactRound size={20} />} label="Total Guru" value={stats.total} supportingText="Data tercatat" tone="success" />
      <StatCard icon={<CheckCircle2 size={20} />} label="Terhubung Akun" value={stats.linked} supportingText="Akun login aktif/tersedia" tone="info" />
      <StatCard icon={<UserRound size={20} />} label="Tanpa Akun" value={stats.unlinked} supportingText="Belum dihubungkan" tone="warning" />
    </div>
    <section className="v2-panel">
      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Cari nama, NIK, NUPTK atau nomor pegawai"
        searchLabel="Cari Guru"
        onReset={() => setSearch('')}
      />

      <div className="desktop-data-view">
        <DataTable rows={rows} columns={columns} getRowKey={(row) => row.id} loading={loading} empty={emptyState} caption="Daftar Guru" />
      </div>
      <div className="mobile-data-view">
        {loading ? <DataListSkeleton /> : rows.length ? <div className="mobile-data-list">{rows.map((row) => (
          <MobileDataCard
            key={row.id}
            leading={initials(row.full_name)}
            title={row.full_name}
            subtitle={`${row.position || 'Guru'} · ${row.employment_status || 'Status kepegawaian belum diisi'}`}
            badges={<StatusBadge tone={row.teacher_user_id ? 'info' : 'warning'}>{row.teacher_user_id ? 'Punya akun' : 'Belum punya akun'}</StatusBadge>}
            fields={[
              { label: 'Identitas', value: identityText(row) },
              { label: 'Pendidikan', value: row.education || 'Belum diisi' },
            ]}
            actions={<ActionMenu label={`Aksi untuk Guru ${row.full_name}`} items={actionItems(row)} />}
          />
        ))}</div> : emptyState}
      </div>
      {!loading && rows.length ? <PaginationControls page={page} total={total} onPage={setPage} /> : null}
    </section>
    {editing && <TeacherModal row={editing === 'new' ? null : editing} available={availableAccounts} onClose={() => setEditing(null)} onDone={async () => {
      setEditing(null)
      setMessage({ tone: 'success', text: 'Data Guru berhasil disimpan.' })
      await refreshAfterMutation()
    }} />}
    <ConfirmDialog
      open={Boolean(deleting)}
      title="Hapus data Guru?"
      description={deleting ? `Data profesional ${deleting.full_name} akan dihapus, tetapi akun login yang terhubung tidak dihapus.` : ''}
      confirmLabel="Ya, Hapus"
      danger
      busy={removing}
      onClose={() => setDeleting(null)}
      onConfirm={() => void remove()}
    />
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

function initials(name?: string | null) {
  return (name || 'Guru').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}
