import { type FormEvent, useEffect, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, Edit3, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { DataListSkeleton, DataTable, type DataTableColumn, ErrorState, MobileDataCard, SearchFilterBar, StatCard, StatusBadge } from '../components/data'
import { ConfirmDialog, FormDialog } from '../components/forms'
import { Button, EmptyState, PageHeader } from '../components/ui'
import { supabase } from '../lib/supabase'
import { getPageRange, sanitizeSearch } from '../lib/data-utils.js'
import { ActionMenu, useChildSelection } from './AppExperience'
import { PAGE_SIZE, PaginationControls, useDebouncedValue } from './DataExperience'
import { Notice } from './PortalPages'

type AttendanceRecord = {
  id: string
  student_id: string
  attendance_date: string
  check_in: string | null
  check_out: string | null
  status: string
  created_at: string
  student_full_name: string
  student_class_name: string | null
  student_nis: string | null
}
type Student = { id: string; full_name: string; nis: string | null; class_name: string | null }
type Message = { tone: 'success' | 'error'; text: string }
type AttendanceSummary = { total_records: number; checked_out_records: number; late_records: number }

const JAKARTA = 'Asia/Jakarta'
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA }).format(new Date())
const EMPTY_SUMMARY: AttendanceSummary = { total_records: 0, checked_out_records: 0, late_records: 0 }

export function AttendanceDataManager({ canManage, parentView }: { canManage: boolean; parentView: boolean }) {
  const childSelection = useChildSelection()
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<AttendanceSummary>(EMPTY_SUMMARY)
  const [editing, setEditing] = useState<AttendanceRecord | 'new' | null>(null)
  const [deleting, setDeleting] = useState<AttendanceRecord | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [removing, setRemoving] = useState(false)
  const removingRef = useRef(false)
  const [message, setMessage] = useState<Message | null>(null)
  const debouncedSearch = useDebouncedValue(search)

  const load = async () => {
    setLoading(true)
    setLoadError('')
    const range = getPageRange(page, PAGE_SIZE)
    let query = supabase
      .from('attendance_records_search')
      .select('id,student_id,attendance_date,check_in,check_out,status,created_at,student_full_name,student_class_name,student_nis', { count: 'exact' })
      .order('attendance_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(range.from, range.to)

    if (parentView && childSelection.selectedChildId) query = query.eq('student_id', childSelection.selectedChildId)
    if (dateFilter) query = query.eq('attendance_date', dateFilter)
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    const normalizedSearch = sanitizeSearch(debouncedSearch)
    if (normalizedSearch) query = query.or(`student_full_name.ilike.%${normalizedSearch}%,student_nis.ilike.%${normalizedSearch}%,student_class_name.ilike.%${normalizedSearch}%`)

    const [recordsResult, studentsResult, summaryResult] = await Promise.all([
      query,
      canManage
        ? supabase.from('students').select('id,full_name,nis,class_name').eq('is_active', true).order('full_name')
        : Promise.resolve({ data: [] as Student[], error: null }),
      supabase.rpc('attendance_summary_for_date', { p_date: TODAY, p_student_id: parentView ? childSelection.selectedChildId || undefined : undefined }),
    ])

    if (recordsResult.error) {
      setLoadError(recordsResult.error.message || 'Data absensi gagal dimuat.')
      setRecords([])
      setTotal(0)
    } else {
      setRecords((recordsResult.data as AttendanceRecord[] | null) ?? [])
      setTotal(recordsResult.count ?? 0)
    }

    if (studentsResult.error || summaryResult.error) {
      setMessage({ tone: 'error', text: studentsResult.error?.message || summaryResult.error?.message || 'Data pendukung absensi gagal dimuat.' })
    }
    setStudents((studentsResult.data as Student[] | null) ?? [])
    setSummary(((summaryResult.data as AttendanceSummary[] | null)?.[0]) ?? EMPTY_SUMMARY)
    setLoading(false)
  }

  useEffect(() => { void load() }, [canManage, page, dateFilter, statusFilter, parentView, childSelection.selectedChildId, debouncedSearch])
  useEffect(() => { setPage(1) }, [dateFilter, statusFilter, parentView, childSelection.selectedChildId, debouncedSearch])

  const resetFilters = () => {
    setSearch('')
    setDateFilter('')
    setStatusFilter('all')
  }

  const startDelete = (record: AttendanceRecord) => {
    setDeleteReason('')
    setDeleting(record)
  }

  const closeDelete = () => {
    if (removingRef.current) return
    setDeleteReason('')
    setDeleting(null)
  }

  const remove = async () => {
    if (!deleting || !canManage || removingRef.current || deleteReason.trim().length < 3) return
    removingRef.current = true
    setRemoving(true)
    const { data, error } = await supabase.functions.invoke('manage-attendance-record', {
      body: { action: 'delete', record_id: deleting.id, correction_reason: deleteReason.trim() },
    })
    removingRef.current = false
    setRemoving(false)
    if (error || !data?.ok) {
      setMessage({ tone: 'error', text: data?.error || 'Absensi gagal dihapus.' })
      return
    }
    setDeleting(null)
    setDeleteReason('')
    setMessage({ tone: 'success', text: 'Data absensi berhasil dihapus.' })
    await load()
  }

  const actionItems = (record: AttendanceRecord) => [
    { label: 'Edit absensi', icon: Edit3, onSelect: () => setEditing(record) },
    { label: 'Hapus absensi', icon: Trash2, danger: true, onSelect: () => startDelete(record) },
  ]

  const columns: DataTableColumn<AttendanceRecord>[] = [
    {
      key: 'student',
      header: 'Murid',
      render: (record) => <div className="data-primary-cell"><span className="data-primary-cell__avatar">{initials(record.student_full_name)}</span><div className="data-primary-cell__copy"><strong>{record.student_full_name || 'Murid'}</strong><small>{record.student_nis ? `NIS ${record.student_nis}` : record.student_class_name || 'Identitas belum dilengkapi'}</small></div></div>,
    },
    { key: 'date', header: 'Tanggal', render: (record) => dateText(record.attendance_date) },
    { key: 'check-in', header: 'Masuk', render: (record) => record.check_in ? timeText(record.check_in) : '—' },
    { key: 'check-out', header: 'Pulang', render: (record) => record.check_out ? timeText(record.check_out) : '—' },
    { key: 'status', header: 'Status', render: (record) => <StatusBadge tone={statusTone(record.status)}>{statusLabel(record.status)}</StatusBadge> },
    ...(canManage ? [{ key: 'actions', header: 'Aksi', align: 'right' as const, render: (record: AttendanceRecord) => <ActionMenu label={`Aksi absensi ${record.student_full_name || 'murid'}`} items={actionItems(record)} /> }] : []),
  ]

  const activeFilterCount = (dateFilter ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)
  const hasFilters = Boolean(search.trim()) || activeFilterCount > 0
  const emptyState = (
    <EmptyState
      icon={<Clock3 size={24} />}
      title={hasFilters ? 'Tidak ada absensi yang cocok' : 'Belum ada data absensi'}
      description={hasFilters ? 'Ubah pencarian atau reset filter untuk melihat catatan lainnya.' : 'Riwayat kehadiran akan tampil setelah data absensi tercatat.'}
      action={hasFilters
        ? <Button variant="secondary" onClick={resetFilters}>Reset Filter</Button>
        : canManage ? <Button onClick={() => setEditing('new')}><Plus size={17} /> Tambah Manual</Button> : undefined}
    />
  )

  return <div className="v2-stack">
    <PageHeader
      eyebrow={parentView ? 'KEHADIRAN ANAK' : 'REKAP KEHADIRAN'}
      title="Data Absen"
      subtitle={parentView ? 'Riwayat masuk, pulang, dan status kehadiran anak yang terhubung.' : 'Cari, filter, tambah, edit, dan koreksi data kehadiran.'}
      actions={canManage ? <Button onClick={() => setEditing('new')}><Plus size={17} /> Tambah Manual</Button> : undefined}
    />
    {message && <Notice {...message} />}
    <div className="data-stat-grid">
      <StatCard icon={<Clock3 size={20} />} label="Absen Hari Ini" value={summary.total_records} supportingText="Catatan kehadiran" tone="success" />
      <StatCard icon={<CheckCircle2 size={20} />} label="Sudah Pulang" value={summary.checked_out_records} supportingText="Check-out tercatat" tone="info" />
      <StatCard icon={<Clock3 size={20} />} label="Terlambat" value={summary.late_records} supportingText="Perlu perhatian" tone="warning" />
    </div>
    <section className="v2-panel">
      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        placeholder={parentView ? 'Cari nama anak...' : 'Cari nama, NIS, kelompok...'}
        searchLabel="Cari data absensi"
        activeFilterCount={activeFilterCount}
        onReset={resetFilters}
      >
        <input aria-label="Filter tanggal absensi" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
        <select aria-label="Filter status absensi" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">Semua status</option>
          <option value="present">Hadir</option>
          <option value="late">Terlambat</option>
          <option value="sick">Sakit</option>
          <option value="excused">Izin</option>
          <option value="absent">Tidak hadir</option>
        </select>
        <Button variant="secondary" onClick={() => void load()} disabled={loading} aria-label="Muat ulang data absensi"><RefreshCw size={16} /> Muat Ulang</Button>
      </SearchFilterBar>

      {loadError ? <ErrorState description={loadError} onRetry={() => void load()} /> : <>
        <div className="desktop-data-view">
          <DataTable rows={records} columns={columns} getRowKey={(record) => record.id} loading={loading} empty={emptyState} caption="Daftar data absensi" />
        </div>
        <div className="mobile-data-view">
          {loading ? <DataListSkeleton /> : records.length ? <div className="mobile-data-list">{records.map((record) => (
            <MobileDataCard
              key={record.id}
              leading={initials(record.student_full_name)}
              title={record.student_full_name || 'Murid'}
              subtitle={`${dateText(record.attendance_date)} · ${record.student_class_name || 'Belum ada kelompok'}`}
              badges={<StatusBadge tone={statusTone(record.status)}>{statusLabel(record.status)}</StatusBadge>}
              fields={[
                { label: 'NIS', value: record.student_nis || 'Belum diisi' },
                { label: 'Masuk', value: record.check_in ? timeText(record.check_in) : '—' },
                { label: 'Pulang', value: record.check_out ? timeText(record.check_out) : '—' },
              ]}
              actions={canManage ? <ActionMenu label={`Aksi absensi ${record.student_full_name || 'murid'}`} items={actionItems(record)} /> : undefined}
            />
          ))}</div> : emptyState}
        </div>
        {!loading && records.length ? <PaginationControls page={page} total={total} onPage={setPage} /> : null}
      </>}
    </section>

    {editing && canManage && <AttendanceModal value={editing === 'new' ? null : editing} students={students} onClose={() => setEditing(null)} onDone={async () => {
      setEditing(null)
      setMessage({ tone: 'success', text: 'Data absensi berhasil disimpan.' })
      await load()
    }} />}
    <ConfirmDialog
      open={Boolean(deleting)}
      title="Hapus data absensi?"
      description={deleting ? `${deleting.student_full_name || 'Murid'} · ${dateText(deleting.attendance_date)} akan dihapus dan alasannya dicatat pada audit.` : ''}
      confirmLabel="Ya, Hapus"
      danger
      busy={removing}
      confirmDisabled={deleteReason.trim().length < 3}
      onClose={closeDelete}
      onConfirm={() => void remove()}
    >
      <div className="v2-form">
        <label>Alasan penghapusan<textarea required minLength={3} rows={3} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Jelaskan alasan data absensi dihapus" /></label>
      </div>
    </ConfirmDialog>
  </div>
}

function AttendanceModal({ value, students, onClose, onDone }: { value: AttendanceRecord | null; students: Student[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    student_id: value?.student_id || students[0]?.id || '',
    date: value?.attendance_date || TODAY,
    check_in: value?.check_in ? timeTextRaw(value.check_in) : '',
    check_out: value?.check_out ? timeTextRaw(value.check_out) : '',
    status: value?.status || 'present',
    correction_reason: '',
  })
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setErrorText('')
    const { data, error } = await supabase.functions.invoke('manage-attendance-record', {
      body: {
        action: value ? 'update' : 'create',
        record_id: value?.id,
        student_id: form.student_id,
        attendance_date: form.date,
        check_in: form.check_in || null,
        check_out: form.check_out || null,
        status: form.status,
        correction_reason: value ? form.correction_reason.trim() : undefined,
      },
    })
    busyRef.current = false
    setBusy(false)
    if (error || !data?.ok) {
      setErrorText(data?.error || 'Data absensi gagal disimpan.')
      return
    }
    onDone()
  }

  return <FormDialog
    open
    title={value ? 'Edit Data Absen' : 'Tambah Absen Manual'}
    description={value ? 'Perubahan data manual wajib disertai alasan koreksi agar jejak audit tetap jelas.' : 'Tambahkan catatan absensi manual tanpa mengubah alur scanner live camera.'}
    submitLabel="Simpan Absensi"
    busy={busy}
    error={errorText}
    onSubmit={submit}
    onClose={onClose}
  >
    <div className="v2-form v2-form-grid">
      <label className="full">Murid<select required value={form.student_id} onChange={(event) => setForm({ ...form, student_id: event.target.value })}>{students.map((student) => <option value={student.id} key={student.id}>{student.full_name} {student.class_name ? `· ${student.class_name}` : ''}</option>)}</select></label>
      <label>Tanggal<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
      <label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="present">Hadir</option><option value="late">Terlambat</option><option value="sick">Sakit</option><option value="excused">Izin</option><option value="absent">Tidak hadir</option></select></label>
      <label>Jam masuk<input type="time" value={form.check_in} onChange={(event) => setForm({ ...form, check_in: event.target.value })} /></label>
      <label>Jam pulang<input type="time" value={form.check_out} onChange={(event) => setForm({ ...form, check_out: event.target.value })} /></label>
      {value && <label className="full">Alasan koreksi<textarea required minLength={3} rows={3} value={form.correction_reason} onChange={(event) => setForm({ ...form, correction_reason: event.target.value })} placeholder="Contoh: Koreksi jam pulang berdasarkan catatan guru piket" /><small>Wajib untuk menjaga jejak audit.</small></label>}
    </div>
  </FormDialog>
}

function initials(name?: string | null) { return (name || 'Murid').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }
function dateText(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) }
function timeText(value: string) { return new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: JAKARTA }) }
function timeTextRaw(value: string) { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: JAKARTA }).format(new Date(value)) }
function statusLabel(status: string) { if (status === 'late') return 'Terlambat'; if (status === 'sick') return 'Sakit'; if (status === 'excused') return 'Izin'; if (status === 'absent') return 'Tidak hadir'; return 'Hadir' }
function statusTone(status: string): 'success' | 'warning' | 'info' | 'purple' | 'danger' | 'neutral' { if (status === 'late') return 'warning'; if (status === 'sick') return 'info'; if (status === 'excused') return 'purple'; if (status === 'absent') return 'danger'; if (status === 'present') return 'success'; return 'neutral' }
