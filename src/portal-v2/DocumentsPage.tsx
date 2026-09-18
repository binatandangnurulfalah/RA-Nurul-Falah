import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit3, ExternalLink, FileText, Plus, Trash2, Upload } from 'lucide-react'
import { DataListSkeleton, DataTable, type DataTableColumn, ErrorState, MobileDataCard, SearchFilterBar, StatusBadge } from '../components/data'
import { ConfirmDialog, FormDialog } from '../components/forms'
import { Button, EmptyState, PageHeader } from '../components/ui'
import { queryKeys } from '../data/queryKeys'
import { documentPageOptions, type SchoolDocumentRow } from '../data/queries/documents'
import { useDataFilters } from '../data/useDataFilters'
import { userErrorMessage } from '../lib/error-utils'
import { invokeObservedFunction, reportDatabaseMutationFailure, reportStorageFailure } from '../lib/observed-services'
import { type AppRole, supabase } from '../lib/supabase'
import { ActionMenu } from './AppExperience'
import { PAGE_SIZE, PaginationControls, useDebouncedValue } from './DataExperience'
import { Notice } from './PortalPages'

type Message = { tone: 'success' | 'error'; text: string }
type SchoolDocument = SchoolDocumentRow
type CleanupSummary = { processed: number; failed: number; skipped: number; pending: number; error: string | null }

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

function externalDocumentUrl(row?: SchoolDocument | null) {
  if (!row) return null
  return row.external_url || (isExternalDocumentUrl(row.file_url) ? row.file_url : null)
}

function storedDocumentPath(row?: SchoolDocument | null) {
  if (!row) return null
  return row.storage_path || (row.file_url && !isExternalDocumentUrl(row.file_url) ? row.file_url : null)
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

async function processDocumentStorageCleanup(objectPath?: string): Promise<CleanupSummary> {
  const { data, error } = await invokeObservedFunction('process-document-storage-cleanup', objectPath ? { object_path: objectPath } : {})
  if (error || !data?.ok) {
    return { processed: 0, failed: 0, skipped: 0, pending: 0, error: data?.error || error?.message || 'Cleanup dokumen gagal diproses.' }
  }
  return {
    processed: Number(data.processed || 0),
    failed: Number(data.failed || 0),
    skipped: Number(data.skipped || 0),
    pending: Number(data.pending || 0),
    error: null,
  }
}

async function queueUploadedOrphan(objectPath: string) {
  const { error } = await supabase.rpc('enqueue_school_document_storage_cleanup', {
    p_object_path: objectPath,
  })
  if (error) {
    reportDatabaseMutationFailure('queue_document_storage_cleanup', error)
    return false
  }
  void processDocumentStorageCleanup()
  return true
}

function cleanupMessage(summary: CleanupSummary, successText: string) {
  if (summary.error || summary.failed > 0 || summary.pending > 0) {
    return `${successText} Sebagian file lama masih berada dalam antrean cleanup backend dan akan dicoba lagi.`
  }
  return successText
}

export function DocumentsPage({ role }: { role: AppRole }) {
  const queryClient = useQueryClient()
  const canManage = role === 'admin'
  const filters = useDataFilters({ q: '' })
  const search = filters.value('q')
  const page = filters.page
  const debouncedSearch = useDebouncedValue(search)
  const pageQuery = useQuery(documentPageOptions({ page, pageSize: PAGE_SIZE, search: debouncedSearch }))
  const rows = pageQuery.data?.rows ?? []
  const total = pageQuery.data?.total ?? 0
  const loading = pageQuery.isPending
  const [editing, setEditing] = useState<SchoolDocument | 'new' | null>(null)
  const [deleting, setDeleting] = useState<SchoolDocument | null>(null)
  const [removing, setRemoving] = useState(false)
  const removingRef = useRef(false)
  const [message, setMessage] = useState<Message | null>(null)

  useEffect(() => {
    if (!canManage) return
    void processDocumentStorageCleanup().then((summary) => {
      if (summary.error || summary.failed > 0 || summary.pending > 0) {
        setMessage({ tone: 'error', text: 'Ada file lama yang belum dapat dibersihkan. Cleanup tetap tersimpan aman di antrean backend untuk dicoba lagi.' })
      }
    })
  }, [canManage])

  const setSearch = (value: string) => filters.update({ q: value }, { resetPage: true })
  const resetFilters = () => filters.reset('q')
  const refreshDocuments = async () => queryClient.invalidateQueries({ queryKey: queryKeys.documents.all })

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
      reportDatabaseMutationFailure('delete_school_document', error)
      setMessage({ tone: 'error', text: 'Dokumen gagal dihapus. Silakan coba lagi.')
      return
    }

    const shouldGoBack = rows.length === 1 && page > 1
    setDeleting(null)
    const cleanup = await processDocumentStorageCleanup()
    setMessage({ tone: 'success', text: cleanupMessage(cleanup, 'Dokumen berhasil dihapus.') })
    await refreshDocuments()
    if (shouldGoBack) filters.setPage(page - 1)
  }

  const openDocument = async (row: SchoolDocument) => {
    const externalUrl = externalDocumentUrl(row)
    if (externalUrl) {
      window.open(externalUrl, '_blank', 'noopener,noreferrer')
      return
    }

    const storagePath = storedDocumentPath(row)
    if (!storagePath) return

    const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(storagePath, 300)
    if (error || !data?.signedUrl) {
      reportStorageFailure('create_signed_document_url', error ?? new Error('Signed URL tidak tersedia.'))
      setMessage({ tone: 'error', text: 'Dokumen gagal dibuka. Silakan coba lagi.' })
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const actionItems = (row: SchoolDocument) => [
    ...((storedDocumentPath(row) || externalDocumentUrl(row)) ? [{ label: 'Buka dokumen', icon: ExternalLink, onSelect: () => void openDocument(row) }] : []),
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

      {pageQuery.isError ? <ErrorState description={userErrorMessage(pageQuery.error, 'Data dokumen gagal dimuat.')} onRetry={() => void pageQuery.refetch()} /> : <>
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
        {!loading && rows.length ? <PaginationControls page={page} total={total} onPage={filters.setPage} /> : null}
      </>}
    </section>

    {editing && canManage && <DocumentModal value={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={async () => {
      setEditing(null)
      const cleanup = await processDocumentStorageCleanup()
      setMessage({ tone: 'success', text: cleanupMessage(cleanup, 'Dokumen berhasil disimpan.') })
      await refreshDocuments()
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
  const existingStoredPath = storedDocumentPath(value)
  const existingExternalUrl = externalDocumentUrl(value)
  const [form, setForm] = useState({
    title: value?.title || '',
    category: value?.category || 'Umum',
    number: value?.document_number || '',
    date: value?.document_date || '',
    recipient: value?.recipient || '',
    description: value?.description || '',
    externalUrl: existingExternalUrl || '',
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
    let storagePath: string | null = form.removeStoredFile ? null : existingStoredPath
    let resolvedExternalUrl: string | null = externalUrl || null
    let originalFileName: string | null = storagePath ? (value?.original_file_name || storagePath.split('/').pop() || null) : null
    let mimeType: string | null = storagePath ? value?.mime_type || null : null
    let fileSizeBytes: number | null = storagePath ? value?.file_size_bytes || null : null

    if (file && contentType) {
      uploadedPath = `${new Date().getFullYear()}/${crypto.randomUUID()}-${safeDocumentFileName(file)}`
      const upload = await supabase.storage.from(DOCUMENT_BUCKET).upload(uploadedPath, file, { upsert: false, contentType })
      if (upload.error) {
        reportStorageFailure('upload_school_document', upload.error)
        busyRef.current = false
        setBusy(false)
        setErrorText('File gagal diunggah. Periksa koneksi lalu coba lagi.')
        return
      }
      storagePath = uploadedPath
      resolvedExternalUrl = null
      originalFileName = file.name.slice(0, 255)
      mimeType = contentType
      fileSizeBytes = file.size
    }

    if (resolvedExternalUrl) {
      storagePath = null
      originalFileName = null
      mimeType = null
      fileSizeBytes = null
    } else if (!storagePath) {
      originalFileName = null
      mimeType = null
      fileSizeBytes = null
    }

    const payload = {
      title: form.title.trim(),
      category: form.category.trim() || 'Umum',
      document_number: form.number.trim() || null,
      document_date: form.date || null,
      recipient: form.recipient.trim() || null,
      description: form.description.trim() || null,
      storage_path: storagePath,
      external_url: resolvedExternalUrl,
      original_file_name: originalFileName,
      mime_type: mimeType,
      file_size_bytes: fileSizeBytes,
      audience: form.audience,
      is_published: form.published,
    }
    const result = value
      ? await supabase.from('school_documents').update(payload).eq('id', value.id)
      : await supabase.from('school_documents').insert(payload)

    if (result.error) {
      reportDatabaseMutationFailure(value ? 'update_school_document' : 'create_school_document', result.error)
      let cleanupQueued = false
      if (uploadedPath) cleanupQueued = await queueUploadedOrphan(uploadedPath)
      busyRef.current = false
      setBusy(false)
      setErrorText(`Dokumen gagal disimpan.${cleanupQueued ? ' File unggahan baru sudah masuk antrean cleanup backend.' : ''}`)
      return
    }

    busyRef.current = false
    setBusy(false)
    onDone()
  }

  const currentFileText = file
    ? file.name
    : existingStoredPath && !form.removeStoredFile
      ? `File tersimpan: ${value?.original_file_name || existingStoredPath.split('/').pop() || existingStoredPath}`
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
    onClose={() => { if (!busyRef.current) onClose() }}
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
