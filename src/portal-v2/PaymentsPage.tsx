import { type FormEvent, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeDollarSign, Edit3, Plus, Printer, ReceiptText, Trash2 } from 'lucide-react'
import { DataListSkeleton, DataTable, type DataTableColumn, ErrorState, MobileDataCard, SearchFilterBar, StatCard, StatusBadge } from '../components/data'
import { ConfirmDialog, FormDialog } from '../components/forms'
import { Button, EmptyState, PageHeader } from '../components/ui'
import { queryKeys } from '../data/queryKeys'
import { paymentMetaOptions, paymentPageOptions, type PaymentRow, type PaymentStudent, type PaymentSummary } from '../data/queries/payments'
import { useDataFilters } from '../data/useDataFilters'
import { userErrorMessage } from '../lib/error-utils'
import { supabase } from '../lib/supabase'
import { ActionMenu, Dialog, useChildSelection } from './AppExperience'
import { PAGE_SIZE, PaginationControls, useDebouncedValue } from './DataExperience'
import { Notice } from './PortalPages'

type Message = { tone: 'success' | 'error'; text: string }
type StudentLite = PaymentStudent
type Payment = PaymentRow
const EMPTY_SUMMARY: PaymentSummary = { total_billed: 0, total_paid: 0, total_outstanding: 0 }

export function PaymentsPage({ role }: { role: 'admin' | 'parent' }) {
  const queryClient = useQueryClient()
  const canManage = role === 'admin'
  const childSelection = useChildSelection()
  const selectedChildId = role === 'parent' ? childSelection.selectedChildId : ''
  const filters = useDataFilters({ q: '' })
  const search = filters.value('q')
  const page = filters.page
  const debouncedSearch = useDebouncedValue(search)
  const pageQuery = useQuery(paymentPageOptions({ page, pageSize: PAGE_SIZE, search: debouncedSearch, studentId: selectedChildId }))
  const metaQuery = useQuery(paymentMetaOptions({ canManage, studentId: selectedChildId }))
  const rows = pageQuery.data?.rows ?? []
  const total = pageQuery.data?.total ?? 0
  const students = metaQuery.data?.students ?? []
  const summary = metaQuery.data?.summary ?? EMPTY_SUMMARY
  const loading = pageQuery.isPending
  const [editing, setEditing] = useState<Payment | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Payment | null>(null)
  const [removing, setRemoving] = useState(false)
  const removingRef = useRef(false)
  const [receipt, setReceipt] = useState<Payment | null>(null)
  const [message, setMessage] = useState<Message | null>(null)

  const setSearch = (value: string) => filters.update({ q: value }, { resetPage: true })
  const resetFilters = () => filters.reset('q')
  const refreshAfterMutation = async () => queryClient.invalidateQueries({ queryKey: queryKeys.payments.all })

  const closeDelete = () => {
    if (removingRef.current) return
    setDeleting(null)
  }

  const remove = async () => {
    if (!deleting || !canManage || removingRef.current) return
    removingRef.current = true
    setRemoving(true)
    const { error } = await supabase.from('student_payments').delete().eq('id', deleting.id)
    removingRef.current = false
    setRemoving(false)
    if (error) {
      setMessage({ tone: 'error', text: error.message })
      return
    }

    const shouldGoBack = rows.length === 1 && page > 1
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Data pembayaran berhasil dihapus.' })
    await refreshAfterMutation()
    if (shouldGoBack) filters.setPage(page - 1)
  }

  const actionItems = (row: Payment) => [
    { label: 'Lihat kuitansi', icon: ReceiptText, onSelect: () => setReceipt(row) },
    ...(canManage ? [
      { label: 'Edit pembayaran', icon: Edit3, onSelect: () => setEditing(row) },
      { label: 'Hapus pembayaran', icon: Trash2, danger: true, onSelect: () => setDeleting(row) },
    ] : []),
  ]

  const columns: DataTableColumn<Payment>[] = [
    {
      key: 'payment',
      header: 'Pembayaran',
      render: (row) => <div className="data-primary-cell"><span className="data-primary-cell__avatar"><BadgeDollarSign size={18} /></span><div className="data-primary-cell__copy"><strong>{row.payment_type}</strong><small>{row.period_label || 'Tanpa periode'}</small></div></div>,
    },
    { key: 'student', header: 'Murid', render: (row) => <div><strong>{row.student_full_name || 'Murid'}</strong><small className="data-cell-subtitle">{row.student_class_name || 'Belum ada kelompok'}</small></div> },
    { key: 'due', header: 'Jatuh Tempo', render: (row) => row.due_date ? dateText(row.due_date) : '—' },
    { key: 'paid', header: 'Dibayar', align: 'right', render: (row) => currency(Number(row.paid_amount)) },
    { key: 'balance', header: 'Sisa', align: 'right', render: (row) => row.status === 'waived' ? 'Dibebaskan' : currency(Math.max(0, Number(row.amount) - Number(row.paid_amount))) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge tone={paymentStatusTone(row.status)}>{paymentLabel(row.status)}</StatusBadge> },
    { key: 'actions', header: 'Aksi', align: 'right', render: (row) => <ActionMenu label={`Aksi pembayaran ${row.payment_type}`} items={actionItems(row)} /> },
  ]

  const hasFilters = Boolean(search.trim())
  const emptyState = (
    <EmptyState
      icon={<BadgeDollarSign size={24} />}
      title={hasFilters ? 'Tidak ada pembayaran yang cocok' : 'Belum ada data pembayaran'}
      description={hasFilters ? 'Ubah pencarian atau reset untuk melihat transaksi lainnya.' : canManage ? 'Tagihan dan pembayaran murid akan tampil setelah ditambahkan.' : 'Tagihan anak yang terhubung akan tampil di sini.'}
      action={hasFilters
        ? <Button variant="secondary" onClick={resetFilters}>Reset Pencarian</Button>
        : canManage ? <Button onClick={() => setEditing('new')}><Plus size={17} /> Tambah Tagihan</Button> : undefined}
    />
  )

  return <div className="v2-stack">
    <PageHeader
      eyebrow="KEUANGAN SEKOLAH"
      title="Pembayaran"
      subtitle={canManage ? 'Kelola tagihan, pembayaran, jatuh tempo dan status pembayaran murid.' : 'Pantau tagihan dan pembayaran anak yang terhubung.'}
      actions={canManage ? <Button onClick={() => setEditing('new')}><Plus size={17} /> Tambah Tagihan</Button> : undefined}
    />
    {message && <Notice {...message} />}
    {metaQuery.isError && <Notice tone="error" text={userErrorMessage(metaQuery.error, 'Ringkasan pembayaran gagal dimuat.')} />}
    <div className="data-stat-grid">
      <StatCard icon={<BadgeDollarSign size={20} />} label="Total Tagihan" value={currency(Number(summary.total_billed))} supportingText="Seluruh nominal tagihan" tone="warning" />
      <StatCard icon={<BadgeDollarSign size={20} />} label="Sudah Dibayar" value={currency(Number(summary.total_paid))} supportingText="Pembayaran diterima" tone="success" />
      <StatCard icon={<BadgeDollarSign size={20} />} label="Sisa Tagihan" value={currency(Number(summary.total_outstanding))} supportingText="Nominal belum terselesaikan" tone="info" />
    </div>
    <section className="v2-panel">
      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Cari murid, jenis atau periode pembayaran..."
        searchLabel="Cari data pembayaran"
        onReset={resetFilters}
      />

      {pageQuery.isError ? <ErrorState description={userErrorMessage(pageQuery.error, 'Data pembayaran gagal dimuat.')} onRetry={() => void pageQuery.refetch()} /> : <>
        <div className="desktop-data-view">
          <DataTable rows={rows} columns={columns} getRowKey={(row) => row.id} loading={loading} empty={emptyState} caption="Daftar pembayaran murid" />
        </div>
        <div className="mobile-data-view">
          {loading ? <DataListSkeleton /> : rows.length ? <div className="mobile-data-list">{rows.map((row) => (
            <MobileDataCard
              key={row.id}
              leading={<BadgeDollarSign size={18} />}
              title={row.payment_type}
              subtitle={`${row.student_full_name || 'Murid'} · ${row.period_label || 'Tanpa periode'}`}
              badges={<StatusBadge tone={paymentStatusTone(row.status)}>{paymentLabel(row.status)}</StatusBadge>}
              fields={[
                { label: 'Total', value: currency(Number(row.amount)) },
                { label: 'Dibayar', value: currency(Number(row.paid_amount)) },
                { label: 'Sisa', value: row.status === 'waived' ? 'Dibebaskan' : currency(Math.max(0, Number(row.amount) - Number(row.paid_amount))) },
                { label: 'Jatuh tempo', value: row.due_date ? dateText(row.due_date) : '—' },
              ]}
              actions={<ActionMenu label={`Aksi pembayaran ${row.payment_type}`} items={actionItems(row)} />}
            />
          ))}</div> : emptyState}
        </div>
        {!loading && rows.length ? <PaginationControls page={page} total={total} onPage={filters.setPage} /> : null}
      </>}
    </section>

    {editing && canManage && <PaymentModal value={editing === 'new' ? null : editing} students={students} onClose={() => setEditing(null)} onDone={async () => {
      setEditing(null)
      setMessage({ tone: 'success', text: 'Data pembayaran berhasil disimpan.' })
      await refreshAfterMutation()
    }} />}
    {receipt && <PaymentReceipt payment={receipt} onClose={() => setReceipt(null)} />}
    <ConfirmDialog
      open={Boolean(deleting)}
      title="Hapus pembayaran?"
      description={deleting ? `${deleting.payment_type} akan dihapus dari riwayat pembayaran ${deleting.student_full_name || 'murid'}.` : ''}
      confirmLabel="Ya, Hapus"
      danger
      busy={removing}
      onClose={closeDelete}
      onConfirm={() => void remove()}
    />
  </div>
}

function PaymentReceipt({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  return <Dialog title="Kuitansi Pembayaran" onClose={onClose}>
    <div className="v5-print-document v5-receipt"><header><strong>RA NURUL FALAH</strong><small>Bukti pembayaran sekolah</small></header><dl><div><dt>Nama murid</dt><dd>{payment.student_full_name || 'Murid'}</dd></div><div><dt>Jenis pembayaran</dt><dd>{payment.payment_type}</dd></div><div><dt>Periode</dt><dd>{payment.period_label || '—'}</dd></div><div><dt>Nominal dibayar</dt><dd>{currency(Number(payment.paid_amount))}</dd></div><div><dt>Status</dt><dd>{paymentLabel(payment.status)}</dd></div><div><dt>Tanggal</dt><dd>{payment.paid_at ? dateText(payment.paid_at.slice(0, 10)) : 'Belum dibayar'}</dd></div></dl><p>Dicetak dari Sistem Informasi RA Nurul Falah.</p></div>
    <button className="v2-primary v5-print-button" onClick={() => window.print()}><Printer size={17} /> Cetak / Simpan PDF</button>
  </Dialog>
}

function PaymentModal({ value, students, onClose, onDone }: { value: Payment | null; students: StudentLite[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    student_id: value?.student_id || students[0]?.id || '',
    type: value?.payment_type || '',
    period: value?.period_label || '',
    amount: String(value?.amount ?? ''),
    paid: String(value?.paid_amount ?? '0'),
    due: value?.due_date || '',
    paid_at: value?.paid_at ? value.paid_at.slice(0, 10) : '',
    waived: value?.status === 'waived',
    notes: value?.notes || '',
  })
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busyRef.current) return
    const amount = Number(form.amount)
    const paidAmount = Number(form.paid)
    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(paidAmount) || paidAmount < 0) {
      setErrorText('Nominal pembayaran tidak valid.')
      return
    }
    if (paidAmount > amount) {
      setErrorText('Nominal yang sudah dibayar tidak boleh melebihi total tagihan.')
      return
    }
    const status: Payment['status'] = form.waived ? 'waived' : paidAmount === amount && amount > 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid'
    busyRef.current = true
    setBusy(true)
    setErrorText('')
    const payload = {
      student_id: form.student_id,
      payment_type: form.type.trim(),
      period_label: form.period.trim() || null,
      amount,
      paid_amount: paidAmount,
      due_date: form.due || null,
      paid_at: form.paid_at ? `${form.paid_at}T12:00:00+07:00` : null,
      status,
      notes: form.notes.trim() || null,
    }
    const result = value
      ? await supabase.from('student_payments').update(payload).eq('id', value.id)
      : await supabase.from('student_payments').insert(payload)
    busyRef.current = false
    setBusy(false)
    if (result.error) {
      setErrorText(result.error.message)
      return
    }
    onDone()
  }

  return <FormDialog
    open
    title={value ? 'Edit Pembayaran' : 'Tambah Tagihan'}
    submitLabel="Simpan Pembayaran"
    busy={busy}
    error={errorText}
    onSubmit={submit}
    onClose={() => { if (!busyRef.current) onClose() }}
  >
    <div className="v2-form v2-form-grid">
      <label>Murid<select required value={form.student_id} onChange={(event) => setForm({ ...form, student_id: event.target.value })}>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name} {student.class_name ? `· ${student.class_name}` : ''}</option>)}</select></label>
      <label>Jenis pembayaran<input required value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} placeholder="SPP / Kegiatan / Seragam" /></label>
      <label>Periode<input value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} placeholder="September 2026" /></label>
      <label>Total tagihan<input required type="number" min="0" step="1000" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
      <label>Sudah dibayar<input required type="number" min="0" max={form.amount || undefined} step="1000" value={form.paid} onChange={(event) => setForm({ ...form, paid: event.target.value })} /></label>
      <label>Jatuh tempo<input type="date" value={form.due} onChange={(event) => setForm({ ...form, due: event.target.value })} /></label>
      <label>Tanggal pembayaran<input type="date" value={form.paid_at} onChange={(event) => setForm({ ...form, paid_at: event.target.value })} /></label>
      <label className="v2-toggle"><input type="checkbox" checked={form.waived} onChange={(event) => setForm({ ...form, waived: event.target.checked })} /><span>Dibebaskan dari tagihan</span></label>
      <label className="full">Catatan<textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
    </div>
  </FormDialog>
}

function currency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

function dateText(value: string) {
  const date = new Date(`${value}T12:00:00+07:00`)
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function paymentStatusTone(status: Payment['status']) {
  return status === 'paid' ? 'success' : status === 'partial' ? 'info' : status === 'waived' ? 'purple' : 'warning'
}

function paymentLabel(status: Payment['status']) {
  return status === 'paid' ? 'Lunas' : status === 'partial' ? 'Sebagian' : status === 'waived' ? 'Dibebaskan' : 'Belum Bayar'
}
