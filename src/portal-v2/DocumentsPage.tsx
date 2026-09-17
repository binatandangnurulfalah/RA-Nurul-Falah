import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Edit3, ExternalLink, FileText, Plus, Trash2, Upload } from 'lucide-react'
import { DataListSkeleton, DataTable, type DataTableColumn, ErrorState, MobileDataCard, SearchFilterBar, StatusBadge } from '../components/data'
import { ConfirmDialog, FormDialog } from '../components/forms'
import { Button, EmptyState, PageHeader } from '../components/ui'
import { type AppRole, supabase } from '../lib/supabase'
import { getPageRange, sanitizeSearch } from '../lib/data-utils.js'
import { ActionMenu } from './AppExperience'
import { PAGE_SIZE, PaginationControls, useDebouncedValue } from './DataExperience'
import { Notice } from './PortalPages'

type Message = { tone: 'success' | 'error'; text: string }
type SchoolDocument = {
  id: string
  title: string
  category: string
  document_number: string | null
  document_date: string | null
  recipient: string | null
  description: string | null
  file_url: string | null
  audience: 'all' | 'admin' | 'teacher' | 'parent'
  is_published: boolean
  created_at: string
}
type StorageCleanupRow = { id: string; object_path: string; attempts: number }
type CleanupSummary = { processed: number; failed: number; error: string | null }

const DOCUMENT_BUCKET = 'school-documents'
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
const DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

function isExternalDocumentUrl(value?: string | null) {
  return Boolean(value && /^https?:\/\//i.test(value))
}

function storedDocumentPath(value?: string | null) {
  return value && !isExternalDocumentUrl(value) ? value : null
}

function documentMimeType(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  return DOCUMENT_MIME_BY_EXTENSION[extension] || null
}

function safeDocumentFileName(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const withoutExtension = file.name.replace(/\.[^.]+$/, '').toLowerCase()
  const baseName = withoutExtension.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'dokumen'
  return `${baseName}.${extension}`
}

async function enqueueStorageCleanup(objectPath: string, lastError?: string) {
  const { error } = await supabase
    .from('school_document_storage_cleanup')
    .upsert(
      { object_path: objectPath, attempts: lastError ? 1 : 0, last_error: lastError?.slice(0, 1000) || null },
      { onConflict: 'object_path' },
    )
  return error
}

async function flushDocumentStorageCleanup(): Promise<CleanupSummary> {
  const { data, error } = await supabase
    .from('school_document_storage_cleanup')
    .select('id,object_path,attempts')
    .order('queued_at', { ascending: true })
    .limit(25)

  if (error) return { processed: 0, failed: 0, error: error.message }

  const rows = (data as StorageCleanupRow[] | null) ?? []
  let processed = 0
  let failed = 0

  for (const row of rows) {
    const removal = await supabase.storage.from(DOCUMENT_BUCKET).remove([row.object_path])
    if (removal.error) {
      failed += 1
      await supabase
        .from('school_document_storage_cleanup')
        .update({ attempts: row.attempts + 1, last_error: removal.error.message.slice(0, 1000) })
        .eq('id', row.id)
      continue
    }

    const queueDelete = await supabase.from('school_document_storage_cleanup').delete().eq('id', row.id)
    if (queueDelete.error) {
      failed += 1
      continue
    }
    processed += 1
  }

  return { processed, failed, error: null }
}

async function removeUploadedFileOrQueue(objectPath: string) {
  const removal = await supabase.storage.from(DOCUMENT_BUCKET).remove([objectPath])
  if (!removal.error) return false
  await enqueueStorageCleanup(objectPath, removal.error.message)
  return true
}

function cleanupMessage(summary: CleanupSummary, successText: string) {
  if (summary.error || summary.failed > 0) {
    return `${successText} Sebagian file lama belum bisa dibersihkan dan sudah disimpan dalam antrean untuk dicoba lagi otomatis.`
  }
  return successText
}

export function DocumentsPage({ role }: { role: AppRole }) {
  const canManage = role === 'admin'
  const [rows, setRows] = useState<SchoolDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [editing, setEditing] = useState<SchoolDocument | 'new' | null>(null)
  const [deleting, setDeleting] = useState<SchoolDocument | null>(null)
  const [removing, setRemoving] = useState(false)
  const removingRef = useRef(false)
  const [message, setMessage] = useState<Message | null>(null)
  const debouncedSearch = useDebouncedValue(search)

  const load = async () => {
    setLoading(true)
    setLoadError('')
    const range = getPageRange(page, PAGE_SIZE)
    let query = supabase
      .from('school_documents')
      .select('*', { count: 'exact' })
      .order('document_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(range.from, range.to)

    const normalizedSearch = sanitizeSearch(debouncedSearch)
    if (normalizedSearch) {
      query = query.or(`title.ilike.%${normalizedSearch}%,category.ilike.%${normalizedSearch}%,document_number.ilike.%${normalizedSearch}%,recipient.ilike.%${normalizedSearch}%`)
    }

    const { data, error, count } = await query
    if (error) {
      setLoadError(error.message || 'Data dokumen gagal dimuat.')
      setRows([])
      setTotal(0)
    } else {
      setRows((data as SchoolDocument[] | null) ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [page, debouncedSearch])
  useEffect(() => { setPage(1) }, [debouncedSearch])
  useEffect(() => {
    if (!canManage) return
    void flushDocumentStorageCleanup().then((summary) => {
      if (summary.error || summary.failed > 0) {
        setMessage({ tone: 'error', text: 'Ada file lama yang belum dapat dibersihkan. Sistem akan mencoba lagi otomatis saat Admin membuka halaman Dokumen.' })
      }
    })
  }, [canManage])

  const resetFilters = () => setSearch('')

  const closeDelete = () => {
    if (removingRef.current) return
    setDeleting(null)
  }

  const remove = async () => {
    if (!deleting || !canManage || removingRef.current) return
    removingRef.current = true
    setRemoving(true)
    const { error } = await supabase.from('school_documents').delete().eq('id', deleting.id)
    removingRef.current = false
    setRemoving(false)
    if (error) {
      setMessage({ tone: 'error', text: error.message })
      return
    }

    const shouldGoBack = rows.length === 1 && page > 1
    setDeleting(null)
    const cleanup = await flushDocumentStorageCleanup()
    setMessage({ tone: 'success', text: cleanupMessage(cleanup, 'Dokumen berhasil dihapus.') })
    if (shouldGoBack) setPage((current) => Math.max(1, current - 1))
    else await load()
  }

  const openDocument = async (row: SchoolDocument) => {
    if (!row.file_url) return
    if (isExternalDocumentUrl(row.file_url)) {
      window.open(row.file_url, '_blank', 'noopener,noreferrer')
      return
    }

    const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(row.file_url, 300)
    if (error || !data?.signedUrl) {
      setMessage({ tone: 'error', text: 'Dokumen gagal dibuka. Silakan coba lagi.' })
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const actionItems = (row: SchoolDocument) => [
    ...(row.file_url ? [{ label: 'Buka dokumen', icon: ExternalLink, onSelect: () => void openDocument(row) }] : []),
    ...(canManage ? [
      { label: 'Edit dokumen', icon: Edit3, onSelect: () => setEditing(row) },
      { label: 'Hapus dokumen', icon: Trash2, danger: true, onSelect: () => setDeleting(row) },
    ] : []),
  ]

  const columns: DataTableColumn<SchoolDocument>[] = [
    {
      key: 'document',
      header: 'Dokumen',
      render: (row) => <div className="data-primary-cell"><span className="data-primary-cell__avatar"><FileText size={18} /></span><div className="data-primary-cell__copy"><strong>{row.title}</strong><small>{row.document_number || 'Tanpa nomor surat'}</small></div></div>,
    },
    { key: 'category', header: 'Kategori', render: (row) => row.category },
    { key: 'date', header: 'Tanggal', render: (row) => row.document_date ? dateText(row.document_date) : '—' },
    { key: 'audience', header: 'Audiens', render: (row) => audienceLabel(row.audience) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge tone={row.is_published ? 'success' : 'neutral'}>{row.is_published ? 'Terbit' : 'Draft'}</StatusBadge> },
    { key: 'actions', header: 'Aksi', align: 'right', render: (row) => <ActionMenu label={`Aksi dokumen ${row.title}`} items={actionItems(row)} /> },
  ]

  const hasFilters = Boolean(search.trim())
  const emptyState = (
    <EmptyState
      icon={<FileText size={24} />}
      title={hasFilters ? 'Tidak ada dokumen yang cocok' : 'Belum ada dokumen'}
      description={hasFilters ? 'Ubah pencarian atau reset untuk melihat dokumen lainnya.' : canManage ? 'Dokumen dan surat sekolah akan tampil setelah ditambahkan.' : 'Dokumen yang dipublikasikan untuk akun Anda akan tampil di sini.'}
      action={hasFilters
        ? <Button variant="secondary" onClick={resetFilters}>Reset Pencarian</Button>
        : canManage ? <Button onClick={() => setEditing('new')}><Plus size={17} /> Tambah Dokumen</Button> : undefined}
    />
  )

  return <div className="v2-stack">
    <PageHeader
      eyebrow="ARSIP SEKOLAH"
      title="Dokumen & Surat"
      subtitle={canManage ? 'Kelola surat, arsip dan unggah dokumen resmi sekolah.' : 'Dokumen resmi yang dibagikan kepada akun Anda.'}
      actions={canManage ? <Button onClick={() => setEditing('new')}><Plus size={17} /> Tambah Dokumen</Button> : undefined}
    />
    {message && <Notice {...message} />}
    <section className="v2-panel">
      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Cari judul, kategori, nomor surat..."
        searchLabel="Cari dokumen dan surat"
        onReset={resetFilters}
      />

      {loadError ? <ErrorState description={loadError} onRetry={() => void load()} /> : <>
        <div className="desktop-data-view">
          <DataTable rows={rows} columns={columns} getRowKey={(row) => row.id} loading={loading} empty={emptyState} caption="Daftar dokumen dan surat" />
        </div>
        <div className="mobile-data-view">
          {loading ? <DataListSkeleton /> : rows.length ? <div className="mobile-data-list">{rows.map((row) => (
            <MobileDataCard
              key={row.id}
              leading={<FileText size={18} />}
              title={row.title}
              subtitle={`${row.category}${row.document_number ? ` · ${row.document_number}` : ''}`}
              badges={<StatusBadge tone={row.is_published ? 'success' : 'neutral'}>{row.is_published ? 'Terbit' : 'Draft'}</StatusBadge>}
              fields={[
                { label: 'Tanggal', value: row.document_date ? dateText(row.document_date) : '—' },
                { label: 'Audiens', value: audienceLabel(row.audience) },
                { label: 'Penerima', value: row.recipient || '—' },
              ]}
              actions={<ActionMenu label={`Aksi dokumen ${row.title}`} items={actionItems(row)} />}
            />
          ))}</div> : emptyState}
        </div>
        {!loading && rows.length ? <PaginationControls page={page} total={total} onPage={setPage} /> : null}
      </>}
    </section>

    {editing && canManage && <DocumentModal value={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={async () => {
      setEditing(null)
      const cleanup = await flushDocumentStorageCleanup()
      setMessage({ tone: 'success', text: cleanupMessage(cleanup, 'Dokumen berhasil disimpan.') })
      await load()
    }} />}
    <ConfirmDialog
      open={Boolean(deleting)}
      title="Hapus dokumen?"
      description={deleting ? `${deleting.title} akan dihapus. File Storage terkait tetap mengikuti antrean cleanup yang aman.` : ''}
      confirmLabel="Ya, Hapus"
      danger
      busy={removing}
      onClose={closeDelete}
      onConfirm={() => void remove()}
    />
  </div>
}

function DocumentModal({ value, onClose, onDone }: { value: SchoolDocument | null; onClose: () => void; onDone: () => void }) {
  const existingStoredPath = storedDocumentPath(value?.file_url)
  const [form, setForm] = useState({
    title: value?.title || '',
    category: value?.category || 'Umum',
    number: value?.document_number || '',
    date: value?.document_date || '',
    recipient: value?.recipient || '',
    description: value?.description || '',
    externalUrl: isExternalDocumentUrl(value?.file_url) ? value?.file_url || '' : '',
    audience: value?.audience || 'all' as SchoolDocument['audience'],
    published: value?.is_published ?? true,
    removeStoredFile: false,
  })
  const [file, setFile] = useState<File | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busyRef.current) return
    setErrorText('')

    const externalUrl = form.externalUrl.trim()
    if (externalUrl && !isExternalDocumentUrl(externalUrl)) {
      setErrorText('Tautan eksternal harus diawali http:// atau https://.')
      return
    }
    if (file && externalUrl) {
      setErrorText('Pilih salah satu sumber dokumen: unggah file atau gunakan tautan eksternal.')
      return
    }

    let contentType: string | null = null
    if (file) {
      if (file.size > DOCUMENT_MAX_BYTES) {
        setErrorText('Ukuran file maksimal 10 MB.')
        return
      }
      contentType = documentMimeType(file)
      if (!contentType) {
        setErrorText('Format file tidak didukung. Gunakan PDF, JPG, PNG, atau DOCX.')
        return
      }
    }

    busyRef.current = true
    setBusy(true)
    let uploadedPath: string | null = null
    let fileReference: string | null = externalUrl || (form.removeStoredFile ? null : existingStoredPath)

    if (file && contentType) {
      uploadedPath = `${new Date().getFullYear()}/${crypto.randomUUID()}-${safeDocumentFileName(file)}`
      const upload = await supabase.storage.from(DOCUMENT_BUCKET).upload(uploadedPath, file, { upsert: false, contentType })
      if (upload.error) {
        busyRef.current = false
        setBusy(false)
        setErrorText(upload.error.message)
        return
      }
      fileReference = uploadedPath
    }

    const payload = {
      title: form.title.trim(),
      category: form.category.trim() || 'Umum',
      document_number: form.number.trim() || null,
      document_date: form.date || null,
      recipient: form.recipient.trim() || null,
      description: form.description.trim() || null,
      file_url: fileReference,
      audience: form.audience,
      is_published: form.published,
    }
    const result = value
      ? await supabase.from('school_documents').update(payload).eq('id', value.id)
      : await supabase.from('school_documents').insert(payload)

    if (result.error) {
      let cleanupQueued = false
      if (uploadedPath) cleanupQueued = await removeUploadedFileOrQueue(uploadedPath)
      busyRef.current = false
      setBusy(false)
      setErrorText(`${result.error.message}${cleanupQueued ? ' File unggahan baru masuk antrean pembersihan otomatis.' : ''}`)
      return
    }

    busyRef.current = false
    setBusy(false)
    onDone()
  }

  const currentFileText = file
    ? file.name
    : existingStoredPath && !form.removeStoredFile
      ? `File tersimpan: ${existingStoredPath.split('/').pop() || existingStoredPath}`
      : form.externalUrl
        ? 'Menggunakan tautan eksternal.'
        : 'PDF, JPG, PNG, atau DOCX · maksimal 10 MB'

  return <FormDialog
    open
    title={value ? 'Edit Dokumen' : 'Tambah Dokumen'}
    submitLabel="Simpan Dokumen"
    busy={busy}
    error={errorText}
    onSubmit={submit}
    onClose={onClose}
  >
    <div className="v2-form v2-form-grid">
      <label className="full">Judul dokumen<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
      <label>Kategori<input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Surat Edaran / Formulir / Arsip" /></label>
      <label>Nomor surat<input value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} /></label>
      <label>Tanggal dokumen<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
      <label>Penerima / tujuan<input value={form.recipient} onChange={(event) => setForm({ ...form, recipient: event.target.value })} /></label>
      <label>Ditampilkan kepada<select value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value as SchoolDocument['audience'] })}><option value="all">Guru & Wali</option><option value="teacher">Guru saja</option><option value="parent">Wali saja</option><option value="admin">Admin saja</option></select></label>
      <label className="v2-toggle"><input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} /><span>Publikasikan</span></label>
      <label className="full v5-file-field"><Upload size={17} /> Unggah file<input key={fileInputKey} type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={(event) => {
        const selected = event.target.files?.[0] || null
        setFile(selected)
        if (selected && form.externalUrl) setForm({ ...form, externalUrl: '' })
      }} /><small>{currentFileText}</small></label>
      {existingStoredPath && <label className="full v2-toggle"><input type="checkbox" checked={form.removeStoredFile} onChange={(event) => setForm({ ...form, removeStoredFile: event.target.checked })} /><span>Hapus file tersimpan jika tidak diganti dengan file atau tautan baru</span></label>}
      <label className="full">Atau tautan eksternal<input type="url" value={form.externalUrl} onChange={(event) => {
        const nextUrl = event.target.value
        if (nextUrl && file) {
          setFile(null)
          setFileInputKey((key) => key + 1)
        }
        setForm({ ...form, externalUrl: nextUrl })
      }} placeholder="https://... (opsional)" /><small>{existingStoredPath ? 'Kolom ini sengaja kosong untuk file Storage internal. Isi hanya jika ingin menggantinya dengan tautan eksternal.' : 'Gunakan untuk dokumen yang disimpan di luar aplikasi.'}</small></label>
      <label className="full">Deskripsi<textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
    </div>
  </FormDialog>
}

function dateText(value: string) {
  const date = new Date(`${value}T12:00:00+07:00`)
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function audienceLabel(audience: SchoolDocument['audience']) {
  return audience === 'all' ? 'Guru & Wali' : audience === 'teacher' ? 'Guru' : audience === 'parent' ? 'Wali' : 'Admin'
}
