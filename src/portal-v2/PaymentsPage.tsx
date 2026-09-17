import { type FormEvent, useEffect, useState } from 'react'
import { BadgeDollarSign, Edit3, Plus, Printer, ReceiptText, Search, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getPageRange, sanitizeSearch } from '../lib/data-utils.js'
import { ActionMenu, Dialog, useChildSelection } from './AppExperience'
import { PAGE_SIZE, PaginationControls, useDebouncedValue } from './DataExperience'
import { EmptyCard, Notice, PageTitle, SkeletonRows } from './PortalPages'

type Message = { tone: 'success' | 'error'; text: string }
type StudentLite = { id: string; full_name: string; class_name: string | null; academic_year: string | null; is_active?: boolean }
type Payment = {
  id: string
  student_id: string
  payment_type: string
  period_label: string | null
  amount: number | string
  paid_amount: number | string
  due_date: string | null
  paid_at: string | null
  status: 'unpaid' | 'partial' | 'paid' | 'waived'
  notes: string | null
  created_at: string
  student_full_name: string
  student_class_name: string | null
}
type PaymentSummary = { total_billed: number | string; total_paid: number | string; total_outstanding: number | string }

const EMPTY_SUMMARY: PaymentSummary = { total_billed: 0, total_paid: 0, total_outstanding: 0 }

export function PaymentsPage({ role }: { role: 'admin' | 'parent' }) {
  const canManage = role === 'admin'
  const childSelection = useChildSelection()
  const selectedChildId = role === 'parent' ? childSelection.selectedChildId : ''
  const [students, setStudents] = useState<StudentLite[]>([])
  const [rows, setRows] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<PaymentSummary>(EMPTY_SUMMARY)
  const [editing, setEditing] = useState<Payment | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Payment | null>(null)
  const [receipt, setReceipt] = useState<Payment | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const debouncedSearch = useDebouncedValue(search)

  const loadRows = async () => {
    setLoading(true)
    const range = getPageRange(page, PAGE_SIZE)
    let query = supabase
      .from('student_payments_search')
      .select('id,student_id,payment_type,period_label,amount,paid_amount,due_date,paid_at,status,notes,created_at,student_full_name,student_class_name', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(range.from, range.to)

    if (selectedChildId) query = query.eq('student_id', selectedChildId)
    const normalizedSearch = sanitizeSearch(debouncedSearch)
    if (normalizedSearch) {
      query = query.or(`student_full_name.ilike.%${normalizedSearch}%,student_class_name.ilike.%${normalizedSearch}%,payment_type.ilike.%${normalizedSearch}%,period_label.ilike.%${normalizedSearch}%`)
    }

    const { data, error, count } = await query
    if (error) setMessage({ tone: 'error', text: error.message })
    setRows((data as Payment[] | null) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }

  const loadSummary = async () => {
    const { data, error } = await supabase.rpc('payment_summary', { p_student_id: selectedChildId || null })
    if (error) {
      setMessage({ tone: 'error', text: error.message })
      setSummary(EMPTY_SUMMARY)
      return
    }
    const nextSummary = (data as PaymentSummary[] | null)?.[0]
    setSummary(nextSummary ?? EMPTY_SUMMARY)
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
  useEffect(() => { void loadSummary() }, [selectedChildId])
  useEffect(() => { void loadStudents() }, [canManage])

  const refreshAfterMutation = async () => {
    await Promise.all([loadRows(), loadSummary()])
  }

  const remove = async () => {
    if (!deleting || !canManage) return
    const { error } = await supabase.from('student_payments').delete().eq('id', deleting.id)
    if (error) {
      setMessage({ tone: 'error', text: error.message })
      return
    }

    const shouldGoBack = rows.length === 1 && page > 1
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Data pembayaran berhasil dihapus.' })
    if (shouldGoBack) {
      setPage((current) => Math.max(1, current - 1))
      await loadSummary()
    } else {
      await refreshAfterMutation()
    }
  }

  return <div className="v2-stack">
    <PageTitle eyebrow="KEUANGAN SEKOLAH" title="Pembayaran" text={canManage ? 'Kelola tagihan, pembayaran, jatuh tempo dan status pembayaran murid.' : 'Pantau tagihan dan pembayaran anak yang terhubung.'} action={canManage ? <button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Tambah Tagihan</button> : undefined} />
    {message && <Notice {...message} />}
    <div className="v2-stat-grid three">
      <MoneyStat label="Total Tagihan" value={Number(summary.total_billed)} tone="gold" />
      <MoneyStat label="Sudah Dibayar" value={Number(summary.total_paid)} tone="green" />
      <MoneyStat label="Sisa Tagihan" value={Number(summary.total_outstanding)} tone="blue" />
    </div>
    <section className="v2-panel">
      <div className="v2-toolbar"><label><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari murid, jenis atau periode pembayaran..." /></label></div>
      {loading ? <SkeletonRows /> : rows.length ? <>
        <div className="payment-list">
          {rows.map((row) => <article key={row.id}>
            <span className="payment-icon"><BadgeDollarSign /></span>
            <div className="grow">
              <div className="school-meta"><span className={`v2-badge ${paymentTone(row.status)}`}>{paymentLabel(row.status)}</span>{row.period_label && <span>{row.period_label}</span>}{row.due_date && <span>Jatuh tempo {dateText(row.due_date)}</span>}</div>
              <h3>{row.payment_type}</h3>
              <p>{row.student_full_name || 'Murid'} · {row.student_class_name || 'Belum ada kelompok'}</p>
              <small>{currency(Number(row.paid_amount))} dari {currency(Number(row.amount))} dibayar</small>
            </div>
            <strong className="payment-balance">{row.status === 'waived' ? 'Dibebaskan' : currency(Math.max(0, Number(row.amount) - Number(row.paid_amount)))}</strong>
            <ActionMenu label={`Aksi pembayaran ${row.payment_type}`} items={[
              { label: 'Lihat kuitansi', icon: ReceiptText, onSelect: () => setReceipt(row) },
              ...(canManage ? [{ label: 'Edit pembayaran', icon: Edit3, onSelect: () => setEditing(row) }, { label: 'Hapus pembayaran', icon: Trash2, danger: true, onSelect: () => setDeleting(row) }] : []),
            ]} />
          </article>)}
        </div>
        <PaginationControls page={page} total={total} onPage={setPage} />
      </> : <EmptyCard text="Belum ada data pembayaran yang sesuai pencarian." />}
    </section>
    {editing && canManage && <PaymentModal value={editing === 'new' ? null : editing} students={students} onClose={() => setEditing(null)} onDone={async () => {
      setEditing(null)
      setMessage({ tone: 'success', text: 'Data pembayaran berhasil disimpan.' })
      await refreshAfterMutation()
    }} />}
    {receipt && <PaymentReceipt payment={receipt} onClose={() => setReceipt(null)} />}
    {deleting && <Confirm title="Hapus pembayaran?" text={`${deleting.payment_type} akan dihapus dari riwayat pembayaran.`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}
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
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
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
    setBusy(false)
    if (result.error) {
      setErrorText(result.error.message)
      return
    }
    onDone()
  }

  return <Dialog title={value ? 'Edit Pembayaran' : 'Tambah Tagihan'} onClose={onClose} wide>
    <form className="v2-form v2-form-grid" onSubmit={submit}>
      <label>Murid<select required value={form.student_id} onChange={(event) => setForm({ ...form, student_id: event.target.value })}>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name} {student.class_name ? `· ${student.class_name}` : ''}</option>)}</select></label>
      <label>Jenis pembayaran<input required value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} placeholder="SPP / Kegiatan / Seragam" /></label>
      <label>Periode<input value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} placeholder="September 2026" /></label>
      <label>Total tagihan<input required type="number" min="0" step="1000" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
      <label>Sudah dibayar<input required type="number" min="0" max={form.amount || undefined} step="1000" value={form.paid} onChange={(event) => setForm({ ...form, paid: event.target.value })} /></label>
      <label>Jatuh tempo<input type="date" value={form.due} onChange={(event) => setForm({ ...form, due: event.target.value })} /></label>
      <label>Tanggal pembayaran<input type="date" value={form.paid_at} onChange={(event) => setForm({ ...form, paid_at: event.target.value })} /></label>
      <label className="v2-toggle"><input type="checkbox" checked={form.waived} onChange={(event) => setForm({ ...form, waived: event.target.checked })} /><span>Dibebaskan dari tagihan</span></label>
      <label className="full">Catatan<textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      {errorText && <p className="v2-field-error full">{errorText}</p>}
      <div className="v2-form-actions full"><button type="button" className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Pembayaran'}</button></div>
    </form>
  </Dialog>
}

function Confirm({ title, text, onClose, onConfirm }: { title: string; text: string; onClose: () => void; onConfirm: () => void }) {
  return <Dialog title={title} onClose={onClose} confirm><span className="v2-modal-icon danger"><Trash2 /></span><p>{text}</p><div className="v2-form-actions"><button className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-danger" onClick={onConfirm}>Ya, Hapus</button></div></Dialog>
}

function MoneyStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <article className={`v2-stat mini ${tone}`}><span><BadgeDollarSign size={20} /></span><div><small>{label}</small><strong className="money-value">{currency(value)}</strong><p>Rekap transaksi</p></div></article>
}

function currency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

function dateText(value: string) {
  const date = new Date(`${value}T12:00:00+07:00`)
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function paymentTone(status: Payment['status']) {
  return status === 'paid' ? 'green' : status === 'partial' ? 'blue' : status === 'waived' ? 'purple' : 'gold'
}

function paymentLabel(status: Payment['status']) {
  return status === 'paid' ? 'Lunas' : status === 'partial' ? 'Sebagian' : status === 'waived' ? 'Dibebaskan' : 'Belum Bayar'
}
