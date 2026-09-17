import { useEffect, useState } from 'react'
import { History, Megaphone, ReceiptText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getPageRange } from '../lib/data-utils.js'
import { PAGE_SIZE, PaginationControls } from './DataExperience'
import { EmptyCard, Notice, PageTitle, SkeletonRows } from './PortalPages'

type Message = { tone: 'success' | 'error'; text: string }
type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE'
type AuditTable = 'announcements' | 'student_payments'
type AuditEvent = {
  id: number | string
  table_name: AuditTable
  record_id: string
  action: AuditAction
  actor_user_id: string | null
  actor_role: 'admin' | 'teacher' | 'parent' | null
  actor_display_name: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changed_at: string
}

export function AuditTrailPage() {
  const [rows, setRows] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [tableFilter, setTableFilter] = useState<'all' | AuditTable>('all')
  const [actionFilter, setActionFilter] = useState<'all' | AuditAction>('all')
  const [message, setMessage] = useState<Message | null>(null)

  const load = async () => {
    setLoading(true)
    const range = getPageRange(page, PAGE_SIZE)
    let query = supabase
      .from('audit_events_view')
      .select('id,table_name,record_id,action,actor_user_id,actor_role,actor_display_name,old_data,new_data,changed_at', { count: 'exact' })
      .order('changed_at', { ascending: false })
      .range(range.from, range.to)

    if (tableFilter !== 'all') query = query.eq('table_name', tableFilter)
    if (actionFilter !== 'all') query = query.eq('action', actionFilter)

    const { data, error, count } = await query
    if (error) {
      setMessage({ tone: 'error', text: error.message })
      setRows([])
      setTotal(0)
    } else {
      setRows((data as AuditEvent[] | null) ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [page, tableFilter, actionFilter])
  useEffect(() => { setPage(1) }, [tableFilter, actionFilter])

  return <div className="v2-stack">
    <PageTitle eyebrow="KEAMANAN & KONTROL" title="Riwayat Aktivitas" text="Jejak perubahan penting pada Pengumuman dan Pembayaran. Riwayat ini hanya dapat dibaca Administrator." />
    {message && <Notice {...message} />}
    <section className="v2-panel">
      <div className="v2-toolbar">
        <select value={tableFilter} onChange={(event) => setTableFilter(event.target.value as 'all' | AuditTable)}>
          <option value="all">Semua modul</option>
          <option value="announcements">Pengumuman</option>
          <option value="student_payments">Pembayaran</option>
        </select>
        <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value as 'all' | AuditAction)}>
          <option value="all">Semua aktivitas</option>
          <option value="INSERT">Tambah</option>
          <option value="UPDATE">Ubah</option>
          <option value="DELETE">Hapus</option>
        </select>
      </div>
      {loading ? <SkeletonRows /> : rows.length ? <>
        <div className="v2-list">
          {rows.map((row) => <article className="v2-user-row" key={row.id}>
            <span className="v2-avatar">{row.table_name === 'announcements' ? <Megaphone size={18} /> : <ReceiptText size={18} />}</span>
            <div className="grow">
              <strong>{describeAudit(row)}</strong>
              <small>{row.actor_display_name || roleLabel(row.actor_role)} · {dateTimeText(row.changed_at)}</small>
            </div>
            <span className={`v2-badge ${actionTone(row.action)}`}>{actionLabel(row.action)}</span>
          </article>)}
        </div>
        <PaginationControls page={page} total={total} onPage={setPage} />
      </> : <EmptyCard text="Belum ada aktivitas yang sesuai filter." />}
    </section>
    <section className="v2-panel"><div className="v2-user-row"><span className="v2-avatar"><History size={18} /></span><div className="grow"><strong>Audit trail bersifat append-only dari aplikasi</strong><small>Frontend tidak memiliki izin untuk menambah, mengubah, atau menghapus riwayat audit secara langsung.</small></div></div></section>
  </div>
}

function describeAudit(row: AuditEvent) {
  const data = row.new_data ?? row.old_data ?? {}
  if (row.table_name === 'announcements') {
    const title = typeof data.title === 'string' && data.title.trim() ? data.title : 'Pengumuman'
    return `${actionLabel(row.action)} pengumuman · ${title}`
  }
  const paymentType = typeof data.payment_type === 'string' && data.payment_type.trim() ? data.payment_type : 'Pembayaran'
  const amount = Number(data.amount)
  const amountText = Number.isFinite(amount) ? ` · ${currency(amount)}` : ''
  return `${actionLabel(row.action)} pembayaran · ${paymentType}${amountText}`
}

function actionLabel(action: AuditAction) {
  return action === 'INSERT' ? 'Tambah' : action === 'UPDATE' ? 'Ubah' : 'Hapus'
}

function actionTone(action: AuditAction) {
  return action === 'INSERT' ? 'green' : action === 'UPDATE' ? 'blue' : 'gold'
}

function roleLabel(role: AuditEvent['actor_role']) {
  return role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Guru' : role === 'parent' ? 'Wali' : 'Sistem'
}

function dateTimeText(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function currency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}
