import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit3, Megaphone, Plus, Trash2 } from 'lucide-react'
import { ConfirmDialog, FormDialog } from '../components/forms'
import { queryKeys } from '../data/queryKeys'
import { announcementsOptions, markAnnouncementsRead, type AnnouncementRow } from '../data/queries/announcements'
import { userErrorMessage } from '../lib/error-utils'
import { type AppRole, supabase } from '../lib/supabase'
import { ActionMenu, LoadError } from './AppExperience'
import { EmptyCard, Notice, PageTitle } from './PortalPages'

type Message = { tone: 'success' | 'error'; text: string }
type Announcement = AnnouncementRow

export function AnnouncementsPage({ role, currentUserId }: { role: AppRole; currentUserId: string }) {
  const queryClient = useQueryClient()
  const canCreate = role === 'admin' || role === 'teacher'
  const announcementsQuery = useQuery(announcementsOptions({ role, currentUserId }))
  const rows = announcementsQuery.data ?? []
  const loading = announcementsQuery.isPending
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Announcement | null>(null)
  const [removing, setRemoving] = useState(false)
  const removingRef = useRef(false)
  const readSyncRef = useRef('')
  const readPendingRef = useRef('')
  const [message, setMessage] = useState<Message | null>(null)

  const canManageRow = (row: Announcement) => role === 'admin' || (role === 'teacher' && row.created_by === currentUserId)

  useEffect(() => {
    if (loading || !rows.length) return
    const publishedRows = rows.filter((row) => row.is_published)
    if (!publishedRows.length) return

    const signature = publishedRows
      .map((row) => `${row.id}:${row.updated_at}`)
      .sort()
      .join('|')
    if (readSyncRef.current === signature || readPendingRef.current === signature) return

    readPendingRef.current = signature
    void markAnnouncementsRead(publishedRows.map((row) => row.id))
      .then(() => {
        readSyncRef.current = signature
        return queryClient.invalidateQueries({
          queryKey: queryKeys.announcements.meta('unread', { role, currentUserId }),
          exact: true,
        })
      })
      .catch(() => undefined)
      .finally(() => {
        if (readPendingRef.current === signature) readPendingRef.current = ''
      })
  }, [currentUserId, loading, queryClient, role, rows])

  const refreshAnnouncements = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    ])
  }

  const closeDelete = () => {
    if (removingRef.current) return
    setDeleting(null)
  }

  const remove = async () => {
    if (!deleting || !canManageRow(deleting) || removingRef.current) return
    removingRef.current = true
    setRemoving(true)
    const { error } = await supabase.from('announcements').delete().eq('id', deleting.id)
    removingRef.current = false
    setRemoving(false)
    if (error) {
      setMessage({ tone: 'error', text: error.message })
      return
    }
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Pengumuman berhasil dihapus.' })
    await refreshAnnouncements()
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
    {announcementsQuery.isError ? <LoadError text={userErrorMessage(announcementsQuery.error, 'Pengumuman belum dapat dimuat.')} onRetry={() => void announcementsQuery.refetch()} /> : loading ? <AnnouncementSkeleton /> : rows.length ? <div className="v2-announcement-grid">
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
      await refreshAnnouncements()
    }} />}
    <ConfirmDialog
      open={Boolean(deleting)}
      title="Hapus pengumuman?"
      description={deleting ? `${deleting.title} akan dihapus dari informasi sekolah.` : ''}
      confirmLabel="Ya, Hapus"
      danger
      busy={removing}
      onClose={closeDelete}
      onConfirm={() => void remove()}
    />
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
  const busyRef = useRef(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busyRef.current) return
    busyRef.current = true
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
    title={value ? 'Edit Pengumuman' : 'Buat Pengumuman'}
    description="Atur isi, audiens, dan status publikasi. Hak edit tetap mengikuti kebijakan RLS akun Anda."
    submitLabel="Simpan Pengumuman"
    busy={busy}
    error={errorText}
    onSubmit={submit}
    onClose={() => { if (!busyRef.current) onClose() }}
  >
    <div className="v2-form">
      <label>Judul<input required minLength={3} maxLength={140} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
      <label>Isi pengumuman<textarea required minLength={3} maxLength={5000} rows={6} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label>
      <label>Ditujukan untuk<select value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value as 'all' | 'teacher' | 'parent' })}><option value="all">Semua pengguna</option><option value="teacher">Guru</option><option value="parent">Orang Tua/Wali</option></select></label>
      <label className="v2-toggle"><input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} /><span>Publikasikan sekarang</span></label>
    </div>
  </FormDialog>
}

function AnnouncementSkeleton() {
  return <div className="v2-skeleton-list">{Array.from({ length: 4 }, (_, index) => <i key={index} />)}</div>
}

function audienceLabel(audience: Announcement['audience']) {
  return audience === 'all' ? 'Semua pengguna' : audience === 'teacher' ? 'Guru' : 'Orang Tua/Wali'
}

function dateText(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}
