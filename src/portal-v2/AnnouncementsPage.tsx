import { type FormEvent, useEffect, useState } from 'react'
import { Edit3, Megaphone, Plus, Save, Trash2 } from 'lucide-react'
import { type AppRole, supabase } from '../lib/supabase'
import { ActionMenu, Dialog } from './AppExperience'
import { EmptyCard, Notice, PageTitle, SkeletonRows } from './PortalPages'

type Message = { tone: 'success' | 'error'; text: string }
type Announcement = {
  id: string
  title: string
  body: string
  audience: 'all' | 'teacher' | 'parent'
  is_published: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export function AnnouncementsPage({ role, currentUserId }: { role: AppRole; currentUserId: string }) {
  const canCreate = role === 'admin' || role === 'teacher'
  const [rows, setRows] = useState<Announcement[]>([])
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Announcement | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [loading, setLoading] = useState(true)

  const canManageRow = (row: Announcement) => role === 'admin' || (role === 'teacher' && row.created_by === currentUserId)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('announcements')
      .select('id,title,body,audience,is_published,created_by,created_at,updated_at')
      .order('created_at', { ascending: false })
    if (error) setMessage({ tone: 'error', text: error.message })
    setRows((data as Announcement[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => { void load() }, [role, currentUserId])
  useEffect(() => {
    if (loading || !rows.length) return
    const publishedIds = rows.filter((row) => row.is_published).map((row) => row.id)
    localStorage.setItem('ra_read_announcements', JSON.stringify(publishedIds))
    window.dispatchEvent(new Event('ra-announcements-read'))
  }, [loading, rows])

  const remove = async () => {
    if (!deleting || !canManageRow(deleting)) return
    const { error } = await supabase.from('announcements').delete().eq('id', deleting.id)
    if (error) {
      setMessage({ tone: 'error', text: error.message })
      return
    }
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Pengumuman berhasil dihapus.' })
    await load()
  }

  const pageText = role === 'admin'
    ? 'Buat dan kelola seluruh informasi resmi untuk Guru dan Wali.'
    : role === 'teacher'
      ? 'Baca informasi sekolah dan kelola hanya pengumuman yang Anda buat sendiri.'
      : 'Informasi resmi terbaru dari RA Nurul Falah.'

  return <div className="v2-stack">
    <PageTitle
      eyebrow="INFORMASI SEKOLAH"
      title="Pengumuman"
      text={pageText}
      action={canCreate ? <button className="v2-primary" onClick={() => setEditing('new')}><Plus size={17} /> Buat Pengumuman</button> : undefined}
    />
    {message && <Notice {...message} />}
    {loading ? <SkeletonRows /> : rows.length ? <div className="v2-announcement-grid">
      {rows.map((row) => {
        const canManage = canManageRow(row)
        return <article className="v2-announcement" key={row.id}>
          <div className="v2-announcement-icon"><Megaphone /></div>
          <div className="grow">
            <div className="v2-meta">
              <span className={`v2-badge ${row.is_published ? 'green' : 'gray'}`}>{row.is_published ? 'Terbit' : 'Draft'}</span>
              <span>{audienceLabel(row.audience)}</span>
              <span>{dateText(row.created_at)}</span>
              {role === 'teacher' && row.created_by === currentUserId && <span className="v2-badge blue">Milik saya</span>}
            </div>
            <h3>{row.title}</h3>
            <p>{row.body}</p>
          </div>
          {canManage && <ActionMenu label={`Aksi pengumuman ${row.title}`} items={[
            { label: 'Edit pengumuman', icon: Edit3, onSelect: () => setEditing(row) },
            { label: 'Hapus pengumuman', icon: Trash2, danger: true, onSelect: () => setDeleting(row) },
          ]} />}
        </article>
      })}
    </div> : <EmptyCard text="Belum ada pengumuman aktif." />}
    {editing && canCreate && <AnnouncementModal value={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={async () => {
      setEditing(null)
      setMessage({ tone: 'success', text: 'Pengumuman berhasil disimpan.' })
      await load()
    }} />}
    {deleting && <Confirm title="Hapus pengumuman?" text={deleting.title} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />}
  </div>
}

function AnnouncementModal({ value, onClose, onDone }: { value: Announcement | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    title: value?.title || '',
    body: value?.body || '',
    audience: value?.audience || 'all' as 'all' | 'teacher' | 'parent',
    published: value?.is_published ?? true,
  })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrorText('')
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      audience: form.audience,
      is_published: form.published,
    }
    const result = value
      ? await supabase.from('announcements').update(payload).eq('id', value.id)
      : await supabase.from('announcements').insert(payload)
    setBusy(false)
    if (result.error) {
      setErrorText(result.error.message)
      return
    }
    onDone()
  }

  return <Dialog title={value ? 'Edit Pengumuman' : 'Buat Pengumuman'} onClose={onClose} wide>
    <form className="v2-form" onSubmit={submit}>
      <label>Judul<input required minLength={3} maxLength={140} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
      <label>Isi pengumuman<textarea required minLength={3} maxLength={5000} rows={6} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label>
      <label>Ditujukan untuk<select value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value as 'all' | 'teacher' | 'parent' })}><option value="all">Semua pengguna</option><option value="teacher">Guru</option><option value="parent">Orang Tua/Wali</option></select></label>
      <label className="v2-toggle"><input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} /><span>Publikasikan sekarang</span></label>
      {errorText && <p className="v2-field-error">{errorText}</p>}
      <button className="v2-primary" disabled={busy}><Save size={17} /> {busy ? 'Menyimpan...' : 'Simpan Pengumuman'}</button>
    </form>
  </Dialog>
}

function Confirm({ title, text, onClose, onConfirm }: { title: string; text: string; onClose: () => void; onConfirm: () => void }) {
  return <Dialog title={title} onClose={onClose} confirm>
    <span className="v2-modal-icon danger"><Trash2 /></span>
    <p>{text}</p>
    <div className="v2-form-actions"><button className="v2-secondary" onClick={onClose}>Batal</button><button className="v2-danger" onClick={onConfirm}>Hapus Pengumuman</button></div>
  </Dialog>
}

function audienceLabel(audience: Announcement['audience']) {
  return audience === 'all' ? 'Semua pengguna' : audience === 'teacher' ? 'Guru' : 'Orang Tua/Wali'
}

function dateText(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}
