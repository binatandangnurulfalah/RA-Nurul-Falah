import { type FormEvent, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Edit3, KeyRound, Plus, Trash2, UserRound, UsersRound } from 'lucide-react'
import { DataListSkeleton, DataTable, type DataTableColumn, ErrorState, MobileDataCard, SearchFilterBar, StatCard, StatusBadge } from '../components/data'
import { ConfirmDialog, FormDialog } from '../components/forms'
import { Button, Dialog, EmptyState, PageHeader } from '../components/ui'
import { queryKeys } from '../data/queryKeys'
import { accountPageOptions, accountStatsOptions, type AccountRow, type AccountStats } from '../data/queries/accounts'
import { useDataFilters } from '../data/useDataFilters'
import { userErrorMessage } from '../lib/error-utils'
import { invokeObservedFunction } from '../lib/observed-services'
import { type AppRole } from '../lib/supabase'
import { ActionMenu } from './AppExperience'
import { PAGE_SIZE, PaginationControls, useDebouncedValue } from './DataExperience'
import { Notice } from './PortalPages'

type Account = AccountRow
type Message = { tone: 'success' | 'error'; text: string }
type CreateResult = { manualLink: string | null }

function authRedirectUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

export function AccountsPage() {
  const queryClient = useQueryClient()
  const filters = useDataFilters({ q: '', role: 'all' })
  const search = filters.value('q')
  const roleFilter = (filters.value('role') || 'all') as 'all' | AppRole
  const page = filters.page
  const debouncedSearch = useDebouncedValue(search)
  const pageQuery = useQuery(accountPageOptions({ page, pageSize: PAGE_SIZE, search: debouncedSearch, roleFilter }))
  const statsQuery = useQuery(accountStatsOptions())
  const accounts = pageQuery.data?.rows ?? []
  const total = pageQuery.data?.total ?? 0
  const stats: AccountStats = statsQuery.data ?? { total: 0, teachers: 0, parents: 0 }
  const loading = pageQuery.isPending
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [deleting, setDeleting] = useState<Account | null>(null)
  const [removing, setRemoving] = useState(false)
  const removingRef = useRef(false)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const resetRef = useRef(false)
  const [oneTimeLink, setOneTimeLink] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)

  const setSearch = (value: string) => filters.update({ q: value }, { resetPage: true })
  const setRoleFilter = (value: 'all' | AppRole) => filters.update({ role: value }, { resetPage: true })
  const resetFilters = () => filters.reset('q', 'role')
  const refreshAccounts = async () => queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })

  const closeDelete = () => {
    if (removingRef.current) return
    setDeleting(null)
  }

  const remove = async () => {
    if (!deleting || removingRef.current) return
    removingRef.current = true
    setRemoving(true)
    const { data, error } = await invokeObservedFunction('admin-manage-user', { action: 'delete', user_id: deleting.id },)
    removingRef.current = false
    setRemoving(false)
    if (error || !data?.ok) {
      setMessage({ tone: 'error', text: data?.error || 'Akun gagal dihapus.' })
      return
    }
    const shouldGoBack = accounts.length === 1 && page > 1
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Akun berhasil dihapus.' })
    await refreshAccounts()
    if (shouldGoBack) filters.setPage(page - 1)
  }

  const sendPasswordReset = async (account: Account) => {
    if (resetRef.current) return
    resetRef.current = true
    setResettingId(account.id)
    const { data, error } = await invokeObservedFunction('admin-manage-user', {
        action: 'send_password_reset',
        user_id: account.id,
        redirect_to: authRedirectUrl(),
      },)
    resetRef.current = false
    setResettingId(null)
    if (error || !data?.ok) {
      setMessage({ tone: 'error', text: data?.error || 'Reset password gagal dikirim.' })
      return
    }

    if (data.manual_link) {
      setOneTimeLink(String(data.manual_link))
      setMessage({ tone: 'success', text: 'Link reset dibuat. Bagikan hanya kepada pengguna yang bersangkutan.' })
    } else {
      setMessage({ tone: 'success', text: 'Instruksi reset password telah dikirim ke email pengguna.' })
    }
  }

  const actionItems = (account: Account) => [
    { label: 'Edit akun', icon: Edit3, onSelect: () => setEditing(account) },
    { label: resettingId === account.id ? 'Mengirim reset...' : 'Kirim reset password', icon: KeyRound, onSelect: () => void sendPasswordReset(account) },
    { label: 'Hapus akun', icon: Trash2, danger: true, onSelect: () => setDeleting(account) },
  ]

  const columns: DataTableColumn<Account>[] = [
    {
      key: 'account',
      header: 'Pengguna',
      render: (account) => <div className="data-primary-cell"><span className="data-primary-cell__avatar">{initials(account.display_name)}</span><div className="data-primary-cell__copy"><strong>{account.display_name || 'Tanpa nama'}</strong><small>Dibuat {dateText(account.created_at)}</small></div></div>,
    },
    { key: 'role', header: 'Role', render: (account) => <StatusBadge tone={roleTone(account.role)}>{roleLabel(account.role)}</StatusBadge> },
    { key: 'status', header: 'Status', render: (account) => <StatusBadge tone={account.is_active ? 'success' : 'neutral'}>{account.is_active ? 'Aktif' : 'Nonaktif'}</StatusBadge> },
    { key: 'created', header: 'Terdaftar', render: (account) => dateText(account.created_at) },
    { key: 'actions', header: 'Aksi', align: 'right', render: (account) => <ActionMenu label={`Aksi untuk ${account.display_name || 'akun'}`} items={actionItems(account)} /> },
  ]

  const hasFilters = Boolean(search.trim()) || roleFilter !== 'all'
  const emptyState = (
    <EmptyState
      icon={<UsersRound size={24} />}
      title={hasFilters ? 'Tidak ada akun yang cocok' : 'Belum ada akun pengguna'}
      description={hasFilters ? 'Ubah pencarian atau reset filter untuk melihat akun lainnya.' : 'Akun guru dan wali akan tampil setelah dibuat oleh administrator.'}
      action={hasFilters
        ? <Button variant="secondary" onClick={resetFilters}>Reset Filter</Button>
        : <Button onClick={() => setCreateOpen(true)}><Plus size={17} /> Tambah Akun</Button>}
    />
  )

  return <div className="v2-stack">
    <PageHeader
      eyebrow="AKSES PENGGUNA"
      title="Manajemen Akun"
      subtitle="Tambah, edit, nonaktifkan, kirim reset password, atau hapus akun pengguna."
      actions={<Button onClick={() => setCreateOpen(true)}><Plus size={17} /> Tambah Akun</Button>}
    />
    {message && <Notice {...message} />}
    {statsQuery.isError && <Notice tone="error" text={userErrorMessage(statsQuery.error, 'Ringkasan akun gagal dimuat.')} />}
    <div className="data-stat-grid">
      <StatCard icon={<UsersRound size={20} />} label="Semua Akun" value={stats.total} supportingText="Pengguna terdaftar" tone="success" />
      <StatCard icon={<UserRound size={20} />} label="Guru" value={stats.teachers} supportingText="Akun tenaga pendidik" tone="info" />
      <StatCard icon={<UsersRound size={20} />} label="Wali Murid" value={stats.parents} supportingText="Akun orang tua/wali" tone="purple" />
    </div>
    <section className="v2-panel">
      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Cari nama pengguna..."
        searchLabel="Cari akun pengguna"
        activeFilterCount={roleFilter === 'all' ? 0 : 1}
        onReset={resetFilters}
      >
        <select aria-label="Filter role akun" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'all' | AppRole)}>
          <option value="all">Semua role</option>
          <option value="admin">Admin</option>
          <option value="teacher">Guru</option>
          <option value="parent">Wali</option>
        </select>
      </SearchFilterBar>

      {pageQuery.isError ? <ErrorState description={userErrorMessage(pageQuery.error, 'Data akun gagal dimuat.')} onRetry={() => void pageQuery.refetch()} /> : <>
        <div className="desktop-data-view">
          <DataTable rows={accounts} columns={columns} getRowKey={(account) => account.id} loading={loading} empty={emptyState} caption="Daftar akun pengguna" />
        </div>
        <div className="mobile-data-view">
          {loading ? <DataListSkeleton /> : accounts.length ? <div className="mobile-data-list">{accounts.map((account) => (
            <MobileDataCard
              key={account.id}
              leading={initials(account.display_name)}
              title={account.display_name || 'Tanpa nama'}
              subtitle={roleLabel(account.role)}
              badges={<StatusBadge tone={account.is_active ? 'success' : 'neutral'}>{account.is_active ? 'Aktif' : 'Nonaktif'}</StatusBadge>}
              fields={[
                { label: 'Role', value: roleLabel(account.role) },
                { label: 'Terdaftar', value: dateText(account.created_at) },
              ]}
              actions={<ActionMenu label={`Aksi untuk ${account.display_name || 'akun'}`} items={actionItems(account)} />}
            />
          ))}</div> : emptyState}
        </div>
        {!loading && accounts.length ? <PaginationControls page={page} total={total} onPage={filters.setPage} /> : null}
      </>}
    </section>

    {createOpen && <CreateAccountModal
      onClose={() => setCreateOpen(false)}
      onDone={async ({ manualLink }) => {
        setCreateOpen(false)
        if (manualLink) {
          setOneTimeLink(manualLink)
          setMessage({ tone: 'success', text: 'Akun dibuat. Email belum tersedia, sehingga dibuat link pengaturan password sekali pakai.' })
        } else {
          setMessage({ tone: 'success', text: 'Akun dibuat dan instruksi membuat password telah dikirim ke email pengguna.' })
        }
        await refreshAccounts()
      }}
    />}

    {editing && <EditAccountModal
      account={editing}
      onClose={() => setEditing(null)}
      onDone={async () => {
        setEditing(null)
        setMessage({ tone: 'success', text: 'Akun berhasil diperbarui.' })
        await refreshAccounts()
      }}
    />}

    <ConfirmDialog
      open={Boolean(deleting)}
      title="Hapus akun?"
      description={deleting ? `Akun ${deleting.display_name || 'pengguna'} akan dihapus permanen beserta akses loginnya.` : ''}
      confirmLabel="Ya, Hapus"
      danger
      busy={removing}
      onClose={closeDelete}
      onConfirm={() => void remove()}
    />

    {oneTimeLink && <OneTimeLinkDialog link={oneTimeLink} onClose={() => setOneTimeLink(null)} />}
  </div>
}

function CreateAccountModal({ onClose, onDone }: { onClose: () => void; onDone: (result: CreateResult) => void }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'teacher' as 'teacher' | 'parent' })
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busyRef.current) return
    busyRef.current = true
    setErrorText('')
    setBusy(true)

    const { data, error } = await invokeObservedFunction('admin-create-user', {
        email: form.email.trim().toLowerCase(),
        display_name: form.name.trim(),
        role: form.role,
        redirect_to: authRedirectUrl(),
      },)
    busyRef.current = false
    setBusy(false)
    if (error || !data?.ok) {
      setErrorText(data?.error || 'Akun gagal dibuat.')
      return
    }
    onDone({ manualLink: data.manual_link ? String(data.manual_link) : null })
  }

  return <FormDialog
    open
    title="Tambah Akun"
    description="Pengguna menentukan password sendiri melalui email atau link sekali pakai. Administrator tidak melihat atau menyimpan password."
    submitLabel="Buat & Kirim Undangan"
    busy={busy}
    error={errorText}
    onSubmit={submit}
    onClose={() => { if (!busyRef.current) onClose() }}
  >
    <div className="v2-form">
      <label>Nama lengkap<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as 'teacher' | 'parent' })}><option value="teacher">Guru</option><option value="parent">Orang Tua/Wali</option></select></label>
    </div>
  </FormDialog>
}

function EditAccountModal({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: account.display_name || '', role: account.role, active: account.is_active })
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busyRef.current) return
    busyRef.current = true
    setErrorText('')
    setBusy(true)

    const { data, error } = await invokeObservedFunction('admin-manage-user', {
        action: 'update',
        user_id: account.id,
        display_name: form.name.trim(),
        role: form.role,
        is_active: form.active,
      },)
    busyRef.current = false
    setBusy(false)
    if (error || !data?.ok) {
      setErrorText(data?.error || 'Akun gagal diperbarui.')
      return
    }
    onDone()
  }

  return <FormDialog
    open
    title="Edit Akun"
    description="Perbarui nama, role, atau status akses pengguna."
    submitLabel="Simpan Perubahan"
    busy={busy}
    error={errorText}
    onSubmit={submit}
    onClose={() => { if (!busyRef.current) onClose() }}
  >
    <div className="v2-form">
      <label>Nama lengkap<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AppRole })}><option value="admin">Admin</option><option value="teacher">Guru</option><option value="parent">Wali</option></select></label>
      <label className="v2-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>Akun aktif</span></label>
    </div>
  </FormDialog>
}

function OneTimeLinkDialog({ link, onClose }: { link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(link)
    setCopied(true)
  }

  return <Dialog
    open
    title="Link pengaturan password"
    description="Email otomatis belum dapat digunakan. Link ini sensitif dan hanya boleh diberikan kepada pengguna yang bersangkutan."
    onClose={onClose}
    actions={<><Button variant="secondary" onClick={onClose}>Tutup & Buang Link</Button><Button onClick={() => void copy()}><Copy size={17} /> {copied ? 'Tersalin' : 'Salin Link'}</Button></>}
  >
    <div className="v2-form"><label>Link sekali pakai<input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label></div>
  </Dialog>
}

function initials(name?: string | null) {
  return (name || 'Pengguna').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function roleLabel(role: AppRole) {
  return role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Guru' : 'Wali Murid'
}

function roleTone(role: AppRole): 'purple' | 'info' | 'success' {
  return role === 'admin' ? 'purple' : role === 'teacher' ? 'info' : 'success'
}

function dateText(value: string) {
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
