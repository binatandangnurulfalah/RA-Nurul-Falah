import { type FormEvent, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeDollarSign, Edit3, Plus, Printer, ReceiptText, Trash2, Undo2 } from 'lucide-react'
import { DataListSkeleton, DataTable, type DataTableColumn, ErrorState, MobileDataCard, SearchFilterBar, StatCard, StatusBadge } from '../components/data'
import { ConfirmDialog, FormDialog } from '../components/forms'
import { Button, EmptyState, PageHeader } from '../components/ui'
import { queryKeys } from '../data/queryKeys'
import {
  paymentMetaOptions,
  paymentPageOptions,
  paymentTransactionsOptions,
  type PaymentRow,
  type PaymentStudent,
  type PaymentSummary,
  type PaymentTransaction,
} from '../data/queries/payments'
import { useDataFilters } from '../data/useDataFilters'
import { userErrorMessage } from '../lib/error-utils'
import { supabase } from '../lib/supabase'
import { ActionMenu, Dialog, LoadError, useChildSelection } from './AppExperience'
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
  const [recording, setRecording] = useState<Payment | null>(null)
  const [history, setHistory] = useState<Payment | null>(null)
  const [receipt, setReceipt] = useState<{ payment: Payment; transaction: PaymentTransaction } | null>(null)
  const [removing, setRemoving] = useState(false)
  const removingRef = useRef(false)
  const [message, setMessage] = useState<Message | null>(null)

  const setSearch = (value: string) => filters.update({ q: value }, { resetPage: true })
  const resetFilters = () => filters.reset('q')
  const refreshAfterMutation = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    ])
  }

  const closeDelete = () => {
    if (removingRef.current) return
    setDeleting(null)
  }

  const remove = async () => {
    if (!deleting || !canManage || removingRef.current) return
    removingRef.current = true
    setRemoving(true)
    const { error } = await supabase.rpc('delete_student_charge', { p_payment_id: deleting.id })
    removingRef.current = false
    setRemoving(false)
    if (error) {
      setMessage({ tone: 'error', text: error.message })
      return
    }

    const shouldGoBack = rows.length === 1 && page > 1
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Tagihan berhasil dihapus.' })
    await refreshAfterMutation()
    if (shouldGoBack) filters.setPage(page - 1)
  }

  const actionItems = (row: Payment) => {
    const amount = Number(row.amount)
    const paid = Number(row.paid_amount)
    const canRecord = canManage && row.status !== 'waived' && paid < amount
    return [
      { label: 'Riwayat pembayaran', icon: ReceiptText, onSelect: () => setHistory(row) },
      ...(canRecord ? [{ label: 'Catat pembayaran', icon: BadgeDollarSign, onSelect: () => setRecording(row) }] : []),
      ...(canManage ? [
        { label: 'Edit tagihan', icon: Edit3, onSelect: () => setEditing(row) },
        { label: 'Hapus tagihan', icon: Trash2, danger: true, onSelect: () => setDeleting(row) },
      ] : []),
    ]
  }

  const columns: DataTableColumn<Payment>[] = [
    {
      key: 'payment',
      header: 'Tagihan',
      render: (row) => <div className="data-primary-cell"><span className="data-primary-cell__avatar"><BadgeDollarSign size={18} /></span><div className="data-primary-cell__copy"><strong>{row.payment_type}</strong><small>{row.period_label || 'Tanpa periode'}</small></div></div>,
    },
    { key: 'student', header: 'Murid', render: (row) => <div><strong>{row.student_full_name || 'Murid'}</strong><small className="data-cell-subtitle">{row.student_class_name || 'Belum ada kelompok'}</small></div> },
    { key: 'due', header: 'Jatuh Tempo', render: (row) => row.due_date ? dateText(row.due_date) : '—' },
    { key: 'paid', header: 'Dibayar', align: 'right', render: (row) => currency(Number(row.paid_amount)) },
    { key: 'balance', header: 'Sisa', align: 'right', render: (row) => row.status === 'waived' ? 'Dibebaskan' : currency(Math.max(0, Number(row.amount) - Number(row.paid_amount))) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge tone={paymentStatusTone(row.status)}>{paymentLabel(row.status)}</StatusBadge> },
    { key: 'actions', header: 'Aksi', align: 'right', render: (row) => <ActionMenu label={`Aksi tagihan ${row.payment_type}`} items={actionItems(row)} /> },
  ]

  const hasFilters = Boolean(search.trim())
  const emptyState = (
    <EmptyState
      icon={<BadgeDollarSign size={24} />}
      title={hasFilters ? 'Tidak ada tagihan yang cocok' : 'Belum ada data tagihan'}
      description={hasFilters ? 'Ubah pencarian atau reset untuk melihat tagihan lainnya.' : canManage ? 'Tagihan murid akan tampil setelah ditambahkan.' : 'Tagihan anak yang terhubung akan tampil di sini.'}
      action={hasFilters
        ? <Button variant="secondary" onClick={resetFilters}>Reset Pencarian</Button>
        : canManage ? <Button onClick={() => setEditing('new')}><Plus size={17} /> Tambah Tagihan</Button> : undefined}
    />
  )

  return <div className="v2-stack">
    <PageHeader
      eyebrow="KEUANGAN SEKOLAH"
      title="Pembayaran"
      subtitle={canManage ? 'Kelola tagihan dan transaksi pembayaran secara terpisah agar histori keuangan tetap utuh.' : 'Pantau tagihan dan riwayat pembayaran anak yang terhubung.'}
      actions={canManage ? <Button onClick={() => setEditing('new')}><Plus size={17} /> Tambah Tagihan</Button> : undefined}
    />
    {message && <Notice {...message} />}
    {metaQuery.isError && <Notice tone="error" text={userErrorMessage(metaQuery.error, 'Ringkasan pembayaran gagal dimuat.')} />}
    <div className="data-stat-grid">
      <StatCard icon={<BadgeDollarSign size={20} />} label="Total Tagihan" value={currency(Number(summary.total_billed))} supportingText="Seluruh nominal tagihan" tone="warning" />
      <StatCard icon={<BadgeDollarSign size={20} />} label="Sudah Dibayar" value={currency(Number(summary.total_paid))} supportingText="Transaksi aktif diterima" tone="success" />
      <StatCard icon={<BadgeDollarSign size={20} />} label="Sisa Tagihan" value={currency(Number(summary.total_outstanding))} supportingText="Nominal belum terselesaikan" tone="info" />
    </div>
    <section className="v2-panel">
      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Cari murid, jenis atau periode tagihan..."
        searchLabel="Cari data pembayaran"
        onReset={resetFilters}
      />

      {pageQuery.isError ? <ErrorState description={userErrorMessage(pageQuery.error, 'Data pembayaran gagal dimuat.')} onRetry={() => void pageQuery.refetch()} /> : <>
        <div className="desktop-data-view">
          <DataTable rows={rows} columns={columns} getRowKey={(row) => row.id} loading={loading} empty={emptyState} caption="Daftar tagihan murid" />
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
              actions={<ActionMenu label={`Aksi tagihan ${row.payment_type}`} items={actionItems(row)} />}
            />
          ))}</div> : emptyState}
        </div>
        {!loading && rows.length ? <PaginationControls page={page} total={total} onPage={filters.setPage} /> : null}
      </>}
    </section>

    {editing && canManage && <ChargeModal value={editing === 'new' ? null : editing} students={students} onClose={() => setEditing(null)} onDone={async () => {
      setEditing(null)
      setMessage({ tone: 'success', text: 'Tagihan berhasil disimpan.' })
      await refreshAfterMutation()
    }} />}
    {recording && canManage && <RecordPaymentModal payment={recording} onClose={() => setRecording(null)} onDone={async () => {
      setRecording(null)
      setMessage({ tone: 'success', text: 'Transaksi pembayaran berhasil dicatat.' })
      await refreshAfterMutation()
    }} />}
    {history && <PaymentHistoryDialog
      payment={history}
      canManage={canManage}
      onClose={() => setHistory(null)}
      onReceipt={(transaction) => setReceipt({ payment: history, transaction })}
      onChanged={async () => {
        await refreshAfterMutation()
      }}
    />}
    {receipt && <PaymentReceipt payment={receipt.payment} transaction={receipt.transaction} onClose={() => setReceipt(null)} />}
    <ConfirmDialog
      open={Boolean(deleting)}
      title="Hapus tagihan?"
      description={deleting ? `${deleting.payment_type} akan dihapus dari daftar tagihan ${deleting.student_full_name || 'murid'}. Tagihan yang sudah memiliki histori transaksi tidak dapat dihapus.` : ''}
      confirmLabel="Ya, Hapus"
      danger
      busy={removing}
      onClose={closeDelete}
      onConfirm={() => void remove()}
    />
  </div>
}

function ChargeModal({ value, students, onClose, onDone }: { value: Payment | null; students: StudentLite[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    student_id: value?.student_id || students[0]?.id || '',
    type: value?.payment_type || '',
    period: value?.period_label || '',
    amount: String(value?.amount ?? ''),
    due: value?.due_date || '',
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
    if (!Number.isFinite(amount) || amount < 0) {
      setErrorText('Nominal tagihan tidak valid.')
      return
    }
    if (value && amount < Number(value.paid_amount)) {
      setErrorText('Nominal tagihan tidak boleh lebih kecil dari pembayaran yang sudah diterima.')
      return
    }

    busyRef.current = true
    setBusy(true)
    setErrorText('')
    const { error } = await supabase.rpc('save_student_charge', {
      p_payment_id: value?.id || null,
      p_student_id: form.student_id,
      p_payment_type: form.type.trim(),
      p_period_label: form.period.trim() || null,
      p_amount: amount,
      p_due_date: form.due || null,
      p_is_waived: form.waived,
      p_notes: form.notes.trim() || null,
    })
    busyRef.current = false
    setBusy(false)
    if (error) {
      setErrorText(error.message)
      return
    }
    onDone()
  }

  return <FormDialog
    open
    title={value ? 'Edit Tagihan' : 'Tambah Tagihan'}
    description="Atur nominal dan detail tagihan. Pembayaran dicatat terpisah agar histori transaksi tidak tertimpa."
    submitLabel="Simpan Tagihan"
    busy={busy}
    error={errorText}
    onSubmit={submit}
    onClose={() => { if (!busyRef.current) onClose() }}
  >
    <div className="v2-form v2-form-grid">
      <label>Murid<select required value={form.student_id} onChange={(event) => setForm({ ...form, student_id: event.target.value })}>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name} {student.class_name ? `· ${student.class_name}` : ''}</option>)}</select></label>
      <label>Jenis pembayaran<input required minLength={2} maxLength={100} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} placeholder="SPP / Kegiatan / Seragam" /></label>
      <label>Periode<input maxLength={120} value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} placeholder="September 2026" /></label>
      <label>Total tagihan<input required type="number" min="0" step="1000" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
      <label>Jatuh tempo<input type="date" value={form.due} onChange={(event) => setForm({ ...form, due: event.target.value })} /></label>
      <label className="v2-toggle"><input type="checkbox" checked={form.waived} onChange={(event) => setForm({ ...form, waived: event.target.checked })} /><span>Bebaskan sisa tagihan</span></label>
      {value && <div className="full v2-notice success"><BadgeDollarSign size={18} /><span>Sudah dibayar {currency(Number(value.paid_amount))}. Nilai ini dihitung otomatis dari transaksi aktif.</span></div>}
      <label className="full">Catatan<textarea maxLength={2000} rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
    </div>
  </FormDialog>
}

function RecordPaymentModal({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const remaining = Math.max(0, Number(payment.amount) - Number(payment.paid_amount))
  const [form, setForm] = useState({
    amount: remaining ? String(remaining) : '',
    paid_at: jakartaDate(),
    method: 'cash' as 'cash' | 'bank_transfer' | 'qris' | 'other',
    reference: '',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busyRef.current) return
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      setErrorText('Nominal pembayaran harus lebih dari 0 dan tidak boleh melebihi sisa tagihan.')
      return
    }

    busyRef.current = true
    setBusy(true)
    setErrorText('')
    const { error } = await supabase.rpc('record_payment_transaction', {
      p_payment_id: payment.id,
      p_amount: amount,
      p_paid_at: form.paid_at ? `${form.paid_at}T12:00:00+07:00` : new Date().toISOString(),
      p_method: form.method,
      p_reference_no: form.reference.trim() || null,
      p_notes: form.notes.trim() || null,
    })
    busyRef.current = false
    setBusy(false)
    if (error) {
      setErrorText(error.message)
      return
    }
    onDone()
  }

  return <FormDialog
    open
    title="Catat Pembayaran"
    description={`${payment.student_full_name || 'Murid'} · ${payment.payment_type} · Sisa ${currency(remaining)}`}
    submitLabel="Simpan Transaksi"
    busy={busy}
    error={errorText}
    onSubmit={submit}
    onClose={() => { if (!busyRef.current) onClose() }}
  >
    <div className="v2-form v2-form-grid">
      <label>Nominal pembayaran<input required type="number" min="1" max={remaining} step="1000" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
      <label>Tanggal pembayaran<input required type="date" value={form.paid_at} onChange={(event) => setForm({ ...form, paid_at: event.target.value })} /></label>
      <label>Metode<select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value as typeof form.method })}><option value="cash">Tunai</option><option value="bank_transfer">Transfer Bank</option><option value="qris">QRIS</option><option value="other">Lainnya</option></select></label>
      <label>Nomor referensi<input maxLength={120} value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder="Opsional" /></label>
      <label className="full">Catatan<textarea maxLength={2000} rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
    </div>
  </FormDialog>
}

function PaymentHistoryDialog({ payment, canManage, onClose, onReceipt, onChanged }: { payment: Payment; canManage: boolean; onClose: () => void; onReceipt: (transaction: PaymentTransaction) => void; onChanged: () => Promise<void> }) {
  const queryClient = useQueryClient()
  const transactionsQuery = useQuery(paymentTransactionsOptions(payment.id))
  const transactions = transactionsQuery.data ?? []
  const [voiding, setVoiding] = useState<PaymentTransaction | null>(null)

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.detail(payment.id), exact: true }),
      onChanged(),
    ])
  }

  return <>
    <Dialog title="Riwayat Pembayaran" onClose={onClose}>
      <div className="v2-stack">
        <div className="v2-info"><small>Tagihan</small><strong>{payment.payment_type} · {payment.period_label || 'Tanpa periode'}</strong></div>
        <div className="v2-info"><small>Ringkasan</small><strong>{currency(Number(payment.paid_amount))} dari {currency(Number(payment.amount))}</strong></div>
        {transactionsQuery.isError ? <LoadError text={userErrorMessage(transactionsQuery.error, 'Riwayat transaksi belum dapat dimuat.')} onRetry={() => void transactionsQuery.refetch()} /> : transactionsQuery.isPending ? <DataListSkeleton /> : transactions.length ? <div className="mobile-data-list">{transactions.map((transaction) => (
          <MobileDataCard
            key={transaction.id}
            leading={<ReceiptText size={18} />}
            title={currency(Number(transaction.amount))}
            subtitle={`${dateTimeText(transaction.paid_at)} · ${paymentMethodLabel(transaction.method)}`}
            badges={<StatusBadge tone={transaction.voided_at ? 'warning' : 'success'}>{transaction.voided_at ? 'Dibatalkan' : 'Aktif'}</StatusBadge>}
            fields={[
              { label: 'Referensi', value: transaction.reference_no || '—' },
              { label: 'Catatan', value: transaction.notes || '—' },
              ...(transaction.voided_at ? [{ label: 'Alasan batal', value: transaction.void_reason || '—' }] : []),
            ]}
            actions={<ActionMenu label="Aksi transaksi pembayaran" items={[
              { label: 'Lihat kuitansi', icon: Printer, onSelect: () => onReceipt(transaction) },
              ...(canManage && !transaction.voided_at && transaction.method !== 'legacy'
                ? [{ label: 'Batalkan transaksi', icon: Undo2, danger: true, onSelect: () => setVoiding(transaction) }]
                : []),
            ]} />}
          />
        ))}</div> : <EmptyState icon={<ReceiptText size={24} />} title="Belum ada transaksi" description="Pembayaran untuk tagihan ini belum pernah dicatat." />}
      </div>
    </Dialog>
    {voiding && <VoidPaymentDialog transaction={voiding} onClose={() => setVoiding(null)} onDone={async () => {
      setVoiding(null)
      await refresh()
    }} />}
  </>
}

function VoidPaymentDialog({ transaction, onClose, onDone }: { transaction: PaymentTransaction; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busyRef.current) return
    if (reason.trim().length < 3) {
      setErrorText('Alasan pembatalan minimal 3 karakter.')
      return
    }
    busyRef.current = true
    setBusy(true)
    setErrorText('')
    const { error } = await supabase.rpc('void_payment_transaction', {
      p_transaction_id: transaction.id,
      p_reason: reason.trim(),
    })
    busyRef.current = false
    setBusy(false)
    if (error) {
      setErrorText(error.message)
      return
    }
    onDone()
  }

  return <FormDialog
    open
    title="Batalkan Transaksi"
    description={`Transaksi ${currency(Number(transaction.amount))} akan dibatalkan, bukan dihapus. Histori tetap tersimpan untuk audit.`}
    submitLabel="Batalkan Transaksi"
    busy={busy}
    error={errorText}
    danger
    onSubmit={submit}
    onClose={() => { if (!busyRef.current) onClose() }}
  >
    <div className="v2-form">
      <label>Alasan pembatalan<textarea required minLength={3} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    </div>
  </FormDialog>
}

function PaymentReceipt({ payment, transaction, onClose }: { payment: Payment; transaction: PaymentTransaction; onClose: () => void }) {
  return <Dialog title="Kuitansi Pembayaran" onClose={onClose}>
    <div className="v5-print-document v5-receipt">
      <header><strong>RA NURUL FALAH</strong><small>Bukti transaksi pembayaran sekolah</small></header>
      <dl>
        <div><dt>Nama murid</dt><dd>{payment.student_full_name || 'Murid'}</dd></div>
        <div><dt>Jenis pembayaran</dt><dd>{payment.payment_type}</dd></div>
        <div><dt>Periode</dt><dd>{payment.period_label || '—'}</dd></div>
        <div><dt>Nominal transaksi</dt><dd>{currency(Number(transaction.amount))}</dd></div>
        <div><dt>Metode</dt><dd>{paymentMethodLabel(transaction.method)}</dd></div>
        <div><dt>Referensi</dt><dd>{transaction.reference_no || '—'}</dd></div>
        <div><dt>Tanggal</dt><dd>{dateTimeText(transaction.paid_at)}</dd></div>
        <div><dt>Status</dt><dd>{transaction.voided_at ? 'Dibatalkan' : 'Sah'}</dd></div>
      </dl>
      {transaction.voided_at && <p>Transaksi ini telah dibatalkan dan tidak dihitung ke total pembayaran aktif.</p>}
      <p>Dicetak dari Sistem Informasi RA Nurul Falah.</p>
    </div>
    <button className="v2-primary v5-print-button" onClick={() => window.print()}><Printer size={17} /> Cetak / Simpan PDF</button>
  </Dialog>
}

function currency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

function jakartaDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
}

function dateText(value: string) {
  const date = new Date(`${value}T12:00:00+07:00`)
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function dateTimeText(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function paymentMethodLabel(method: PaymentTransaction['method']) {
  return method === 'cash' ? 'Tunai' : method === 'bank_transfer' ? 'Transfer Bank' : method === 'qris' ? 'QRIS' : method === 'legacy' ? 'Migrasi Lama' : 'Lainnya'
}

function paymentStatusTone(status: Payment['status']) {
  return status === 'paid' ? 'success' : status === 'partial' ? 'info' : status === 'waived' ? 'purple' : 'warning'
}

function paymentLabel(status: Payment['status']) {
  return status === 'paid' ? 'Lunas' : status === 'partial' ? 'Sebagian' : status === 'waived' ? 'Dibebaskan' : 'Belum Bayar'
}
