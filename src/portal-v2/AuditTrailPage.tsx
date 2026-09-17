import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, History, ShieldCheck } from 'lucide-react'
import { DataListSkeleton, DataTable, type DataTableColumn, ErrorState, MobileDataCard, SearchFilterBar, StatusBadge } from '../components/data'
import { Button, EmptyState, PageHeader } from '../components/ui'
import { auditPageOptions, type AuditAction, type AuditEventRow, type AuditTable } from '../data/queries/audit'
import { useDataFilters } from '../data/useDataFilters'
import { userErrorMessage } from '../lib/error-utils'
import { Dialog } from './AppExperience'
import { PAGE_SIZE, PaginationControls, useDebouncedValue } from './DataExperience'

export function AuditTrailPage() {
  const filters = useDataFilters({ q: '', module: 'all', action: 'all', date: '' })
  const actorSearch = filters.value('q')
  const tableFilter = filters.value('module') || 'all'
  const actionFilter = filters.value('action') || 'all'
  const dateFilter = filters.value('date')
  const page = filters.page
  const debouncedActor = useDebouncedValue(actorSearch)
  const pageQuery = useQuery(auditPageOptions({
    page,
    pageSize: PAGE_SIZE,
    tableFilter,
    actionFilter,
    dateFilter,
    actorSearch: debouncedActor,
  }))
  const rows = pageQuery.data?.rows ?? []
  const total = pageQuery.data?.total ?? 0
  const [detail, setDetail] = useState<AuditEventRow | null>(null)

  const setActorSearch = (value: string) => filters.update({ q: value }, { resetPage: true })
  const setTableFilter = (value: string) => filters.update({ module: value }, { resetPage: true })
  const setActionFilter = (value: string) => filters.update({ action: value }, { resetPage: true })
  const setDateFilter = (value: string) => filters.update({ date: value }, { resetPage: true })
  const resetFilters = () => filters.reset('q', 'module', 'action', 'date')
  const activeFilterCount = (tableFilter !== 'all' ? 1 : 0) + (actionFilter !== 'all' ? 1 : 0) + (dateFilter ? 1 : 0)
  const hasFilters = Boolean(actorSearch.trim()) || activeFilterCount > 0

  const columns: DataTableColumn<AuditEventRow>[] = [
    { key: 'time', header: 'Waktu', render: (row) => dateTimeText(row.changed_at) },
    { key: 'actor', header: 'Pelaku', render: (row) => <div className="data-primary-cell__copy"><strong>{row.actor_display_name || roleLabel(row.actor_role)}</strong><small>{roleLabel(row.actor_role)}</small></div> },
    { key: 'type', header: 'Jenis', render: (row) => <div className="data-primary-cell__copy"><strong>{moduleLabel(row.table_name)}</strong><small>{actionLabel(row)}</small></div> },
    { key: 'detail', header: 'Detail', render: (row) => describeAudit(row) },
    { key: 'action', header: 'Aksi', align: 'right', render: (row) => <Button size="sm" variant="ghost" onClick={() => setDetail(row)}><Eye size={15} /> Detail</Button> },
  ]

  const emptyState = <EmptyState
    icon={<History size={24} />}
    title={hasFilters ? 'Tidak ada aktivitas yang cocok' : 'Belum ada aktivitas audit'}
    description={hasFilters ? 'Ubah filter atau pencarian pelaku untuk melihat aktivitas lainnya.' : 'Perubahan penting sistem akan tercatat otomatis di sini.'}
    action={hasFilters ? <Button variant="secondary" onClick={resetFilters}>Reset Filter</Button> : undefined}
  />

  return <div className="v2-stack">
    <PageHeader
      eyebrow="KEAMANAN & KONTROL"
      title="Catatan Aktivitas"
      subtitle="Jejak perubahan penting lintas modul. Hanya Administrator yang dapat membaca audit trail ini."
    />

    <section className="v2-panel">
      <SearchFilterBar
        searchValue={actorSearch}
        onSearchChange={setActorSearch}
        placeholder="Cari nama pelaku..."
        searchLabel="Cari pelaku aktivitas"
        activeFilterCount={activeFilterCount}
        onReset={resetFilters}
      >
        <select aria-label="Filter modul audit" value={tableFilter} onChange={(event) => setTableFilter(event.target.value)}>
          <option value="all">Semua modul</option>
          {AUDIT_TABLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select aria-label="Filter jenis aktivitas" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
          <option value="all">Semua aktivitas</option>
          <option value="INSERT">Tambah</option>
          <option value="UPDATE">Ubah</option>
          <option value="DELETE">Hapus</option>
          <option value="EVENT">Aktivitas akun</option>
        </select>
        <input aria-label="Filter tanggal aktivitas" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
      </SearchFilterBar>

      {pageQuery.isError ? <ErrorState description={userErrorMessage(pageQuery.error, 'Riwayat aktivitas gagal dimuat.')} onRetry={() => void pageQuery.refetch()} /> : <>
        <div className="desktop-data-view">
          <DataTable rows={rows} columns={columns} getRowKey={(row) => String(row.id)} loading={pageQuery.isPending} empty={emptyState} caption="Catatan aktivitas sistem" />
        </div>
        <div className="mobile-data-view">
          {pageQuery.isPending ? <DataListSkeleton /> : rows.length ? <div className="mobile-data-list">{rows.map((row) => (
            <MobileDataCard
              key={row.id}
              leading={<History size={18} />}
              title={moduleLabel(row.table_name)}
              subtitle={`${row.actor_display_name || roleLabel(row.actor_role)} · ${dateTimeText(row.changed_at)}`}
              badges={<StatusBadge tone={actionTone(row.action)}>{actionLabel(row)}</StatusBadge>}
              fields={[
                { label: 'Detail', value: describeAudit(row) },
                { label: 'Record', value: shortRecordKey(row.record_key) },
              ]}
              actions={<Button size="sm" variant="ghost" onClick={() => setDetail(row)}><Eye size={15} /> Detail</Button>}
            />
          ))}</div> : emptyState}
        </div>
        {!pageQuery.isPending && rows.length ? <PaginationControls page={page} total={total} onPage={filters.setPage} /> : null}
      </>}
    </section>

    <section className="v2-panel">
      <div className="v2-user-row">
        <span className="v2-avatar"><ShieldCheck size={18} /></span>
        <div className="grow">
          <strong>Audit trail append-only dan disanitasi di database</strong>
          <small>Frontend tidak dapat menambah, mengubah, atau menghapus log. Password, token, QR token, NIK, path dokumen privat, serta konten naratif sensitif tidak disimpan dalam payload audit.</small>
        </div>
      </div>
    </section>

    {detail ? <AuditDetailDialog row={detail} onClose={() => setDetail(null)} /> : null}
  </div>
}

function AuditDetailDialog({ row, onClose }: { row: AuditEventRow; onClose: () => void }) {
  const fields = row.changed_fields ?? []
  return <Dialog title="Detail Aktivitas" eyebrow={moduleLabel(row.table_name).toUpperCase()} onClose={onClose} wide>
    <div className="v2-form">
      <div className="v2-user-row">
        <span className="v2-avatar"><History size={18} /></span>
        <div className="grow">
          <strong>{describeAudit(row)}</strong>
          <small>{row.actor_display_name || roleLabel(row.actor_role)} · {dateTimeText(row.changed_at)}</small>
        </div>
        <StatusBadge tone={actionTone(row.action)}>{actionLabel(row)}</StatusBadge>
      </div>
      <p className="helper-text">Record: {row.record_key}</p>
      {fields.length ? <div className="v2-list">{fields.map((field) => (
        <article className="v2-user-row" key={field}>
          <div className="grow">
            <strong>{fieldLabel(field)}</strong>
            <small>Sebelum: {valueText(row.old_data?.[field])}</small>
            <small>Sesudah: {valueText(row.new_data?.[field])}</small>
          </div>
        </article>
      ))}</div> : <p className="helper-text">Aktivitas ini tidak memiliki diff field yang dapat ditampilkan.</p>}
      <div className="v2-form-actions"><Button variant="secondary" onClick={onClose}>Tutup</Button></div>
    </div>
  </Dialog>
}

const AUDIT_TABLES: { value: AuditTable; label: string }[] = [
  { value: 'attendance_records', label: 'Absensi' },
  { value: 'students', label: 'Murid' },
  { value: 'teacher_profiles', label: 'Guru' },
  { value: 'school_classes', label: 'Kelas' },
  { value: 'academic_years', label: 'Tahun Ajaran' },
  { value: 'teacher_class_assignments', label: 'Penugasan Guru' },
  { value: 'student_guardians', label: 'Relasi Wali' },
  { value: 'report_cards', label: 'Rapor' },
  { value: 'student_payments', label: 'Pembayaran' },
  { value: 'school_documents', label: 'Dokumen' },
  { value: 'announcements', label: 'Pengumuman' },
  { value: 'school_settings', label: 'Pengaturan Sekolah' },
  { value: 'account_management', label: 'Manajemen Akun' },
]

function describeAudit(row: AuditEventRow) {
  const data = row.new_data ?? row.old_data ?? {}
  if (row.table_name === 'account_management') return accountEventLabel(row.event_name)
  if (row.table_name === 'attendance_records') return `${actionLabel(row)} absensi${typeof data.attendance_date === 'string' ? ` · ${data.attendance_date}` : ''}`
  if (row.table_name === 'students') return `${actionLabel(row)} murid · ${safeText(data.full_name, 'Data murid')}`
  if (row.table_name === 'teacher_profiles') return `${actionLabel(row)} guru · ${safeText(data.full_name, 'Data guru')}`
  if (row.table_name === 'school_classes') return `${actionLabel(row)} kelas · ${safeText(data.name, 'Kelas')}`
  if (row.table_name === 'academic_years') return `${actionLabel(row)} tahun ajaran · ${safeText(data.label, 'Tahun ajaran')}`
  if (row.table_name === 'school_documents') return `${actionLabel(row)} dokumen · ${safeText(data.title, 'Dokumen')}`
  if (row.table_name === 'announcements') return `${actionLabel(row)} pengumuman · ${safeText(data.title, 'Pengumuman')}`
  if (row.table_name === 'student_payments') return `${actionLabel(row)} pembayaran · ${safeText(data.payment_type, 'Pembayaran')}`
  if (row.table_name === 'report_cards') return `${actionLabel(row)} rapor · ${safeText(data.academic_year, 'Rapor')}`
  return `${actionLabel(row)} ${moduleLabel(row.table_name).toLowerCase()}`
}

function moduleLabel(table: AuditTable) {
  return AUDIT_TABLES.find((item) => item.value === table)?.label ?? table
}

function actionLabel(row: Pick<AuditEventRow, 'action' | 'event_name'>) {
  if (row.action === 'EVENT') return accountEventLabel(row.event_name)
  return row.action === 'INSERT' ? 'Tambah' : row.action === 'UPDATE' ? 'Ubah' : 'Hapus'
}

function accountEventLabel(eventName: string | null) {
  if (eventName === 'ACCOUNT_CREATED') return 'Akun dibuat'
  if (eventName === 'ACCOUNT_UPDATED') return 'Akun diperbarui'
  if (eventName === 'ACCOUNT_DELETED') return 'Akun dihapus'
  if (eventName === 'PASSWORD_RESET_REQUESTED') return 'Reset password diminta'
  return 'Aktivitas akun'
}

function actionTone(action: AuditAction): 'success' | 'info' | 'warning' | 'neutral' {
  return action === 'INSERT' ? 'success' : action === 'UPDATE' || action === 'EVENT' ? 'info' : action === 'DELETE' ? 'warning' : 'neutral'
}

function roleLabel(role: AuditEventRow['actor_role']) {
  return role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Guru' : role === 'parent' ? 'Wali' : 'Sistem'
}

function dateTimeText(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function shortRecordKey(value: string) {
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value
}

function safeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function valueText(value: unknown) {
  if (value === undefined) return 'Tidak disimpan / tidak berubah'
  if (value === null) return 'Kosong'
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function fieldLabel(field: string) {
  return field.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
