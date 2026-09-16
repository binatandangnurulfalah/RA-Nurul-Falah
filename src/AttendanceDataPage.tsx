import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './attendance-data.css'

type AttendanceRecord = {
  id: string
  attendance_date: string
  check_in: string | null
  check_out: string | null
  status: string
  created_at: string
  students?: {
    full_name: string
    class_name: string | null
    nis: string | null
  } | null
}

type AttendanceDataPageProps = {
  canDelete?: boolean
  parentView?: boolean
}

const JAKARTA_TIME_ZONE = 'Asia/Jakarta'
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA_TIME_ZONE }).format(new Date())

export default function AttendanceDataPage({ canDelete = false, parentView = false }: AttendanceDataPageProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [pendingDelete, setPendingDelete] = useState<AttendanceRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('attendance_records')
      .select('id,attendance_date,check_in,check_out,status,created_at,students(full_name,class_name,nis)')
      .order('attendance_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(250)

    if (error) {
      setMessage({ tone: 'error', text: 'Data absensi gagal dimuat.' })
      setRecords([])
    } else {
      setRecords((data as unknown as AttendanceRecord[] | null) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return records.filter((record) => {
      const name = record.students?.full_name ?? ''
      const nis = record.students?.nis ?? ''
      const className = record.students?.class_name ?? ''
      const matchesSearch = !query || `${name} ${nis} ${className}`.toLowerCase().includes(query)
      const matchesDate = !dateFilter || record.attendance_date === dateFilter
      const matchesStatus = statusFilter === 'all' || record.status === statusFilter
      return matchesSearch && matchesDate && matchesStatus
    })
  }, [dateFilter, records, search, statusFilter])

  const todayRecords = records.filter((record) => record.attendance_date === TODAY)
  const todayLate = todayRecords.filter((record) => record.status === 'late').length
  const todayOut = todayRecords.filter((record) => record.check_out).length

  const removeRecord = async () => {
    if (!canDelete || !pendingDelete || deleting) return
    setDeleting(true)
    setMessage(null)

    const { data, error } = await supabase.functions.invoke('delete-attendance-record', {
      body: { record_id: pendingDelete.id },
    })

    if (error || !data?.ok) {
      setMessage({ tone: 'error', text: data?.error || 'Data absensi gagal dihapus.' })
      setDeleting(false)
      return
    }

    setRecords((current) => current.filter((record) => record.id !== pendingDelete.id))
    setMessage({ tone: 'success', text: `Data absensi ${pendingDelete.students?.full_name || 'murid'} berhasil dihapus.` })
    setPendingDelete(null)
    setDeleting(false)
  }

  return (
    <div className="attendance-data-page">
      <header className="attendance-data-heading">
        <div>
          <p>{parentView ? 'KEHADIRAN ANAK' : 'REKAP KEHADIRAN'}</p>
          <h2>Data Absen</h2>
          <span>
            {parentView
              ? 'Lihat riwayat masuk, pulang, dan status kehadiran anak yang terhubung ke akun Anda.'
              : canDelete
                ? 'Lihat, cari, filter, dan hapus catatan absensi yang keliru.'
                : 'Lihat, cari, dan filter catatan absensi.'}
          </span>
        </div>
        <button className="attendance-refresh" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={18} />
          Muat ulang
        </button>
      </header>

      <div className="attendance-data-stats">
        <article>
          <span className="green"><UsersRound size={21} /></span>
          <div><small>{parentView ? 'Kehadiran Hari Ini' : 'Absen Hari Ini'}</small><strong>{todayRecords.length}</strong><p>{parentView ? 'Anak tercatat' : 'Catatan masuk'}</p></div>
        </article>
        <article>
          <span className="blue"><Clock3 size={21} /></span>
          <div><small>Sudah Pulang</small><strong>{todayOut}</strong><p>Hari ini</p></div>
        </article>
        <article>
          <span className="gold"><AlertTriangle size={21} /></span>
          <div><small>Terlambat</small><strong>{todayLate}</strong><p>Hari ini</p></div>
        </article>
      </div>

      {message && (
        <div className={`attendance-data-message ${message.tone}`}>
          {message.tone === 'success' ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}
          <span>{message.text}</span>
          <button aria-label="Tutup pesan" onClick={() => setMessage(null)}><X size={17} /></button>
        </div>
      )}

      <section className="attendance-data-card">
        <div className="attendance-data-card-head">
          <div>
            <h3>{parentView ? 'Riwayat Kehadiran Anak' : 'Riwayat Absensi'}</h3>
            <p>{filtered.length} data ditampilkan</p>
          </div>
        </div>

        <div className="attendance-data-toolbar">
          <label className="attendance-search">
            <Search size={18} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={parentView ? 'Cari nama anak atau kelompok...' : 'Cari nama, NIS, atau kelompok...'} />
          </label>
          <label className="attendance-filter-field">
            <CalendarDays size={17} />
            <input aria-label="Filter tanggal" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
          </label>
          <select aria-label="Filter status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Semua status</option>
            <option value="present">Hadir</option>
            <option value="late">Terlambat</option>
            <option value="sick">Sakit</option>
            <option value="excused">Izin</option>
            <option value="absent">Tidak hadir</option>
          </select>
          {(search || dateFilter || statusFilter !== 'all') && (
            <button className="attendance-reset" onClick={() => { setSearch(''); setDateFilter(''); setStatusFilter('all') }}>
              Reset
            </button>
          )}
        </div>

        {loading ? (
          <div className="attendance-data-loading">{Array.from({ length: 5 }, (_, index) => <i key={index} />)}</div>
        ) : filtered.length ? (
          <div className="attendance-record-list">
            <div className={`attendance-record-head ${canDelete ? '' : 'read-only'}`}>
              <span>Murid</span><span>Tanggal</span><span>Masuk / Pulang</span><span>Status</span>{canDelete && <span>Aksi</span>}
            </div>
            {filtered.map((record) => (
              <div className={`attendance-record-row ${canDelete ? '' : 'read-only'}`} key={record.id}>
                <div className="attendance-student">
                  <span>{initials(record.students?.full_name)}</span>
                  <p>
                    <strong>{record.students?.full_name || 'Murid'}</strong>
                    <small>{record.students?.nis ? `NIS ${record.students.nis} · ` : ''}{record.students?.class_name || 'Belum ada kelompok'}</small>
                  </p>
                </div>
                <div className="attendance-date-cell">
                  <strong>{formatDate(record.attendance_date)}</strong>
                  <small>{record.attendance_date === TODAY ? 'Hari ini' : ''}</small>
                </div>
                <div className="attendance-time-cell">
                  <span><small>Masuk</small><strong>{record.check_in ? formatTime(record.check_in) : '—'}</strong></span>
                  <span><small>Pulang</small><strong>{record.check_out ? formatTime(record.check_out) : '—'}</strong></span>
                </div>
                <span className={`attendance-status ${statusTone(record.status)}`}>{statusLabel(record.status)}</span>
                {canDelete && (
                  <button className="attendance-delete" onClick={() => setPendingDelete(record)} aria-label={`Hapus absensi ${record.students?.full_name || 'murid'}`}>
                    <Trash2 size={17} />
                    <span>Hapus</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="attendance-data-empty">
            <Search size={28} />
            <strong>Data tidak ditemukan</strong>
            <p>{parentView ? 'Belum ada data absensi anak untuk filter yang dipilih.' : 'Ubah pencarian atau filter untuk melihat catatan lainnya.'}</p>
          </div>
        )}
      </section>

      {canDelete && pendingDelete && (
        <div className="attendance-delete-layer" role="presentation">
          <button className="attendance-delete-backdrop" aria-label="Batal menghapus" onClick={() => !deleting && setPendingDelete(null)} />
          <section className="attendance-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-attendance-title">
            <span className="attendance-delete-icon"><Trash2 size={25} /></span>
            <h3 id="delete-attendance-title">Hapus data absensi?</h3>
            <p>
              Data <strong>{pendingDelete.students?.full_name || 'murid'}</strong> tanggal <strong>{formatDate(pendingDelete.attendance_date)}</strong> akan dihapus permanen.
            </p>
            <div className="attendance-delete-summary">
              <span>Masuk <strong>{pendingDelete.check_in ? formatTime(pendingDelete.check_in) : '—'}</strong></span>
              <span>Pulang <strong>{pendingDelete.check_out ? formatTime(pendingDelete.check_out) : '—'}</strong></span>
            </div>
            <div className="attendance-delete-actions">
              <button className="cancel" disabled={deleting} onClick={() => setPendingDelete(null)}>Batal</button>
              <button className="confirm" disabled={deleting} onClick={() => void removeRecord()}>
                <Trash2 size={17} /> {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: JAKARTA_TIME_ZONE,
  })
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function initials(name?: string | null) {
  return (name || 'Murid')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function statusLabel(status: string) {
  if (status === 'late') return 'Terlambat'
  if (status === 'sick') return 'Sakit'
  if (status === 'excused') return 'Izin'
  if (status === 'absent') return 'Tidak hadir'
  return 'Hadir'
}

function statusTone(status: string) {
  if (status === 'late') return 'gold'
  if (status === 'sick') return 'blue'
  if (status === 'excused') return 'purple'
  if (status === 'absent') return 'gray'
  return 'green'
}
