import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { EmptyCard, Notice, PageTitle, SkeletonRows } from './PortalPages'
export { AttendanceScannerNative as AttendanceScannerPage } from './AttendanceScannerNative'

type AttendanceRecord = {
  id: string
  student_id: string
  attendance_date: string
  check_in: string | null
  check_out: string | null
  status: string
  created_at: string
  students?: { full_name: string; class_name: string | null; nis: string | null } | null
}
type Student = { id: string; full_name: string; nis: string | null; class_name: string | null }
type Message = { tone: 'success' | 'error'; text: string }

const JAKARTA = 'Asia/Jakarta'
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA }).format(new Date())

export function AttendanceDataManager({ canManage, parentView }: { canManage: boolean; parentView: boolean }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editing, setEditing] = useState<AttendanceRecord | 'new' | null>(null)
  const [deleting, setDeleting] = useState<AttendanceRecord | null>(null)
  const [message, setMessage] = useState<Message | null>(null)

  const load = async () => {
    setLoading(true)
    const [recordResult, studentResult] = await Promise.all([
      supabase.from('attendance_records').select('id,student_id,attendance_date,check_in,check_out,status,created_at,students(full_name,class_name,nis)').order('attendance_date', { ascending: false }).order('created_at', { ascending: false }).limit(400),
      canManage ? supabase.from('students').select('id,full_name,nis,class_name').eq('is_active', true).order('full_name') : Promise.resolve({ data: [] }),
    ])
    if (recordResult.error) setMessage({ tone: 'error', text: recordResult.error.message })
    setRecords((recordResult.data as unknown as AttendanceRecord[] | null) ?? [])
    setStudents((studentResult.data as Student[] | null) ?? [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [canManage])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return records.filter((r) => {
      const text = `${r.students?.full_name || ''} ${r.students?.nis || ''} ${r.students?.class_name || ''}`.toLowerCase()
      return (!q || text.includes(q)) && (!dateFilter || r.attendance_date === dateFilter) && (statusFilter === 'all' || r.status === statusFilter)
    })
  }, [dateFilter, records, search, statusFilter])

  const todayRows = records.filter((r) => r.attendance_date === TODAY)
  const remove = async () => {
    if (!deleting || !canManage) return
    const { data, error } = await supabase.functions.invoke('manage-attendance-record', { body: { action: 'delete', record_id: deleting.id } })
    if (error || !data?.ok) { setMessage({ tone: 'error', text: data?.error || 'Absensi gagal dihapus.' }); return }
    setDeleting(null); setMessage({ tone: 'success', text: 'Data absensi berhasil dihapus.' }); await load()
  }

  return <div className="v2-stack"><PageTitle eyebrow={parentView ? 'KEHADIRAN ANAK' : 'REKAP KEHADIRAN'} title="Data Absen" text={parentView ? 'Riwayat masuk, pulang, dan status kehadiran anak yang terhubung.' : 'Cari, filter, tambah, edit, dan koreksi data kehadiran.'} action={canManage ? <button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Tambah Manual</button> : undefined} />{message && <Notice {...message} />}<div className="v2-stat-grid three"><SmallStat label="Absen Hari Ini" value={todayRows.length} /><SmallStat label="Sudah Pulang" value={todayRows.filter((r) => r.check_out).length} /><SmallStat label="Terlambat" value={todayRows.filter((r) => r.status === 'late').length} /></div><section className="v2-panel"><div className="v2-toolbar wrap"><label><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={parentView ? 'Cari nama anak...' : 'Cari nama, NIS, kelompok...'} /></label><label className="date"><CalendarDays size={17} /><input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} /></label><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Semua status</option><option value="present">Hadir</option><option value="late">Terlambat</option><option value="sick">Sakit</option><option value="excused">Izin</option><option value="absent">Tidak hadir</option></select><button className="v2-icon-button" title="Muat ulang" onClick={() => void load()}><RefreshCw size={17} /></button></div>{loading ? <SkeletonRows /> : filtered.length ? <div className="v2-attendance-list">{filtered.map((record) => <article key={record.id}><span className="v2-avatar">{initials(record.students?.full_name)}</span><div className="grow"><strong>{record.students?.full_name || 'Murid'}</strong><small>{dateText(record.attendance_date)} · {record.students?.class_name || 'Belum ada kelompok'}</small></div><div className="v2-time-pair"><span><small>Masuk</small><strong>{record.check_in ? timeText(record.check_in) : '—'}</strong></span><span><small>Pulang</small><strong>{record.check_out ? timeText(record.check_out) : '—'}</strong></span></div><span className={`v2-badge ${statusTone(record.status)}`}>{statusLabel(record.status)}</span>{canManage && <div className="v2-inline-actions"><button title="Edit" onClick={() => setEditing(record)}><Edit3 size={17} /></button><button className="danger" title="Hapus" onClick={() => setDeleting(record)}><Trash2 size={17} /></button></div>}</article>)}</div> : <EmptyCard text="Tidak ada data absensi yang sesuai filter." />}</section>{editing && canManage && <AttendanceModal value={editing === 'new' ? null : editing} students={students} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); setMessage({ tone: 'success', text: 'Data absensi berhasil disimpan.' }); await load() }} />}{deleting && <ConfirmModal title="Hapus data absensi?" text={`${deleting.students?.full_name || 'Murid'} · ${dateText(deleting.attendance_date)}`} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}</div>
}

function AttendanceModal({ value, students, onClose, onDone }: { value: AttendanceRecord | null; students: Student[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ student_id: value?.student_id || students[0]?.id || '', date: value?.attendance_date || TODAY, check_in: value?.check_in ? timeTextRaw(value.check_in) : '', check_out: value?.check_out ? timeTextRaw(value.check_out) : '', status: value?.status || 'present' })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setErrorText('')
    const { data, error } = await supabase.functions.invoke('manage-attendance-record', { body: { action: value ? 'update' : 'create', record_id: value?.id, student_id: form.student_id, attendance_date: form.date, check_in: form.check_in || null, check_out: form.check_out || null, status: form.status } })
    setBusy(false)
    if (error || !data?.ok) { setErrorText(data?.error || 'Data absensi gagal disimpan.'); return }
    onDone()
  }
  return <div className="v2-modal-layer"><button className="v2-backdrop" aria-label="Tutup" onClick={onClose} /><section className="v2-modal wide"><header><div><small>KOREKSI ABSENSI</small><h2>{value ? 'Edit Data Absen' : 'Tambah Absen Manual'}</h2></div><button className="v2-close" onClick={onClose}><X size={19} /></button></header><form className="v2-form v2-form-grid" onSubmit={submit}><label className="full">Murid<select required value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>{students.map((s) => <option value={s.id} key={s.id}>{s.full_name} {s.class_name ? `· ${s.class_name}` : ''}</option>)}</select></label><label>Tanggal<input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="present">Hadir</option><option value="late">Terlambat</option><option value="sick">Sakit</option><option value="excused">Izin</option><option value="absent">Tidak hadir</option></select></label><label>Jam masuk<input type="time" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} /></label><label>Jam pulang<input type="time" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} /></label>{errorText && <p className="v2-field-error full">{errorText}</p>}<div className="v2-form-actions full"><button type="button" className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-primary" disabled={busy}><CheckCircle2 size={17} /> {busy ? 'Menyimpan...' : 'Simpan Absensi'}</button></div></form></section></div>
}

function ConfirmModal({ title, text, onClose, onConfirm }: { title: string; text: string; onClose: () => void; onConfirm: () => void }) { return <div className="v2-modal-layer"><button className="v2-backdrop" aria-label="Tutup" onClick={onClose} /><section className="v2-modal confirm"><span className="v2-modal-icon danger"><Trash2 /></span><h2>{title}</h2><p>{text}</p><div className="v2-form-actions"><button className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-danger" onClick={onConfirm}>Ya, Hapus</button></div></section></div> }
function SmallStat({ label, value }: { label: string; value: number }) { return <article className="v2-stat mini green"><span><Clock3 size={20} /></span><div><small>{label}</small><strong>{value}</strong><p>Catatan</p></div></article> }
function initials(name?: string | null) { return (name || 'Murid').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() }
function dateText(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) }
function timeText(value: string) { return new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: JAKARTA }) }
function timeTextRaw(value: string) { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: JAKARTA }).format(new Date(value)) }
function statusLabel(status: string) { if (status === 'late') return 'Terlambat'; if (status === 'sick') return 'Sakit'; if (status === 'excused') return 'Izin'; if (status === 'absent') return 'Tidak hadir'; return 'Hadir' }
function statusTone(status: string) { if (status === 'late') return 'gold'; if (status === 'sick') return 'blue'; if (status === 'excused') return 'purple'; if (status === 'absent') return 'gray'; return 'green' }
