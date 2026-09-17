import { type FormEvent, useEffect, useState } from 'react'
import { Copy, Edit3, GraduationCap, KeyRound, Plus, Trash2, UserRound, UsersRound } from 'lucide-react'
import { DataListSkeleton, DataTable, type DataTableColumn, MobileDataCard, SearchFilterBar, StatCard, StatusBadge } from '../components/data'
import { ConfirmDialog, FormDialog } from '../components/forms'
import { Button, Dialog, EmptyState, PageHeader } from '../components/ui'
import { type AppRole, supabase, type UserProfile } from '../lib/supabase'
import { getPageRange, sanitizeSearch } from '../lib/data-utils.js'
import { ActionMenu } from './AppExperience'
import { PAGE_SIZE, PaginationControls, useDebouncedValue } from './DataExperience'
import { Notice } from './PortalPages'

type Account = Pick<UserProfile, 'id' | 'role' | 'display_name' | 'is_active' | 'created_at'>
type Message = { tone: 'success' | 'error'; text: string }
type AccountStats = { total: number; teachers: number; parents: number }
type CreateResult = { manualLink: string | null }

function authRedirectUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | AppRole>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<AccountStats>({ total: 0, teachers: 0, parents: 0 })
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [deleting, setDeleting] = useState<Account | null>(null)
  const [removing, setRemoving] = useState(false)
  const [oneTimeLink, setOneTimeLink] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const debouncedSearch = useDebouncedValue(search)

  const load = async () => {
    setLoading(true)
    const range = getPageRange(page, PAGE_SIZE)
    let accountQuery = supabase
      .from('user_profiles')
      .select('id,role,display_name,is_active,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(range.from, range.to)

    if (roleFilter !== 'all') accountQuery = accountQuery.eq('role', roleFilter)
    const normalizedSearch = sanitizeSearch(debouncedSearch)
    if (normalizedSearch) accountQuery = accountQuery.ilike('display_name', `%${normalizedSearch}%`)

    const [accountResult, allCount, teacherCount, parentCount] = await Promise.all([
      accountQuery,
      supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('role', 'teacher'),
      supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('role', 'parent'),
    ])

    const firstError = accountResult.error || allCount.error || teacherCount.error || parentCount.error
    if (firstError) setMessage({ tone: 'error', text: firstError.message })
    setAccounts((accountResult.data as Account[] | null) ?? [])
    setTotal(accountResult.count ?? 0)
    setStats({ total: allCount.count ?? 0, teachers: teacherCount.count ?? 0, parents: parentCount.count ?? 0 })
    setLoading(false)
  }

  useEffect(() => { void load() }, [page, roleFilter, debouncedSearch])
  useEffect(() => { setPage(1) }, [roleFilter, debouncedSearch])

  const resetFilters = () => {
    setSearch('')
    setRoleFilter('all')
  }

  const remove = async () => {
    if (!deleting || removing) return
    setRemoving(true)
    const { data, error } = await supabase.functions.invoke('admin-manage-user', {
      body: { action: 'delete', user_id: deleting.id },
    })
    if (error || !data?.ok) {
      setRemoving(false)
      setMessage({ tone: 'error', text: data?.error || 'Akun gagal dihapus.' })
      return
    }
    setRemoving(false)
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Akun berhasil dihapus.' })
    await load()
  }

  const sendPasswordReset = async (account: Account) => {
    const { data, error } = await supabase.functions.invoke('admin-manage-user', {
      body: {
        action: 'send_password_reset',
        user_id: account.id,
        redirect_to: authRedirectUrl(),
      },
    })
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
    { label: 'Kirim reset password', icon: KeyRound, onSelect: () => void sendPasswordReset(account) },
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
    { key: 'actions', header: 'Aksi', align: 'right', render: (account) => <ActionMenu label={`Aksi untuk ${account.display_name || 'akun'}`} items={actionItems(account)} /> },
  ]

  const hasFilters = Boolean(search.trim()) || roleFilter !== 'all'
  const emptyState = (
    <EmptyState
      icon={<UsersRound size={24} />}
      title={hasFilters ? 'Tidak ada akun yang cocok' : 'Belum ada akun pengguna'}
      description={hasFilters ? 'Ubah kata pencarian atau reset filter role untuk melihat akun lainnya.' : 'Akun Guru atau Wali akan muncul setelah dibuat oleh Administrator.'}
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
    <div className="data-stat-grid">
      <StatCard label="Semua Akun" value={stats.total} icon={<UsersRound size={20} />} supportingText="Pengguna terdaftar" tone="success" />
      <StatCard label="Guru" value={stats.teachers} icon={<GraduationCap size={20} />} supportingText="Akun tenaga pendidik" tone="info" />
      <StatCard label="Wali Murid" value={stats.parents} icon={<UserRound size={20} />} supportingText="Akun keluarga" tone="purple" />
    </div>
    <section className="v2-panel">
      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Cari nama pengguna"
        searchLabel="Cari akun pengguna"
        activeFilterCount={roleFilter === 'all' ? 0 : 1}
        onReset={resetFilters}
      >
        <select aria-label="Filter role pengguna" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'all' | AppRole)}>
          <option value="all">Semua role</option>
          <option value="admin">Admin</option>
          <option value="teacher">Guru</option>
          <option value="parent">Wali</option>
        </select>
      </SearchFilterBar>

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
            fields={[{ label: 'Dibuat', value: dateText(account.created_at) }]}
            actions={<ActionMenu label={`Aksi untuk ${account.display_name || 'akun'}`} items={actionItems(account)} />}
          />
        ))}</div> : emptyState}
      </div>
      {!loading && accounts.length ? <PaginationControls page={page} total={total} onPage={setPage} /> : null}
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
        await load()
      }}
    />}

    {editing && <EditAccountModal
      account={editing}
      onClose={() => setEditing(null)}
      onDone={async () => {
        setEditing(null)
        setMessage({ tone: 'success', text: 'Akun berhasil diperbarui.' })
        await load()
      }}
    />}

    <ConfirmDialog
      open={Boolean(deleting)}
      title="Hapus akun?"
      description={`Akun ${deleting?.display_name || 'pengguna'} akan dihapus permanen beserta akses loginnya.`}
      confirmLabel="Ya, Hapus"
      danger
      busy={removing}
      onClose={() => setDeleting(null)}
      onConfirm={() => void remove()}
    />

    {oneTimeLink && <OneTimeLinkDialog link={oneTimeLink} onClose={() => setOneTimeLink(null)} />}
  </div>
}

function CreateAccountModal({ onClose, onDone }: { onClose: () => void; onDone: (result: CreateResult) => void }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'teacher' as 'teacher' | 'parent' })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorText('')
    setBusy(true)

    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        email: form.email.trim().toLowerCase(),
        display_name: form.name.trim(),
        role: form.role,
        redirect_to: authRedirectUrl(),
      },
    })
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
    description="Buat akun internal baru. Pengguna menentukan password sendiri melalui alur undangan/recovery."
    submitLabel="Buat & Kirim Undangan"
    busy={busy}
    error={errorText}
    onSubmit={submit}
    onClose={onClose}
  >
    <div className="v2-form">
      <label>Nama lengkap<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as 'teacher' | 'parent' })}><option value="teacher">Guru</option><option value="parent">Orang Tua/Wali</option></select></label>
      <p className="v2-helper">Administrator tidak melihat atau menyimpan password pengguna.</p>
    </div>
  </FormDialog>
}

function EditAccountModal({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: account.display_name || '', role: account.role, active: account.is_active })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorText('')
    setBusy(true)

    const { data, error } = await supabase.functions.invoke('admin-manage-user', {
      body: {
        action: 'update',
        user_id: account.id,
        display_name: form.name.trim(),
        role: form.role,
        is_active: form.active,
      },
    })
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
    description="Perbarui nama, role, atau status akses pengguna tanpa mengubah password."
    submitLabel="Simpan Perubahan"
    busy={busy}
    error={errorText}
    onSubmit={submit}
    onClose={onClose}
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
    <label className="v2-form">Link sekali pakai<input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label>
  </Dialog>
}

function initials(name?: string | null) {
  return (name || 'Pengguna').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function roleLabel(role: AppRole) {
  return role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Guru' : 'Wali Murid'
}

function roleTone(role: AppRole): 'neutral' | 'info' | 'purple' {
  return role === 'admin' ? 'purple' : role === 'teacher' ? 'info' : 'neutral'
}

function dateText(value: string) {
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
