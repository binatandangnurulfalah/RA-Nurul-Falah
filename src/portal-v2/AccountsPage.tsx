import { type FormEvent, useEffect, useState } from 'react'
import { Edit3, KeyRound, Plus, Save, Search, Trash2, UsersRound } from 'lucide-react'
import { type AppRole, supabase, type UserProfile } from '../lib/supabase'
import { getPageRange, sanitizeSearch } from '../lib/data-utils.js'
import { EmptyCard, Notice, PageTitle, SkeletonRows } from './PortalPages'
import { ActionMenu, Dialog } from './AppExperience'
import { PAGE_SIZE, PaginationControls, useDebouncedValue } from './DataExperience'

type Account = Pick<UserProfile, 'id' | 'role' | 'display_name' | 'is_active' | 'created_at'>
type Message = { tone: 'success' | 'error'; text: string }
type AccountStats = { total: number; teachers: number; parents: number }

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

  const remove = async () => {
    if (!deleting) return
    const { data, error } = await supabase.functions.invoke('admin-manage-user', {
      body: { action: 'delete', user_id: deleting.id },
    })
    if (error || !data?.ok) {
      setMessage({ tone: 'error', text: data?.error || 'Akun gagal dihapus.' })
      return
    }
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Akun berhasil dihapus.' })
    await load()
  }

  const sendPasswordReset = async (account: Account) => {
    setMessage(null)
    const { data, error } = await supabase.functions.invoke('admin-manage-user', {
      body: { action: 'send_password_reset', user_id: account.id },
    })
    if (error || !data?.ok) {
      setMessage({ tone: 'error', text: data?.error || 'Email reset password gagal dikirim.' })
      return
    }
    setMessage({ tone: 'success', text: data.message || 'Email reset password berhasil dikirim.' })
  }

  return <div className="v2-stack">
    <PageTitle
      eyebrow="AKSES PENGGUNA"
      title="Manajemen Akun"
      text="Tambah, edit, nonaktifkan, kirim reset password, atau hapus akun pengguna."
      action={<button className="v2-primary" onClick={() => setCreateOpen(true)}><Plus size={17} /> Tambah Akun</button>}
    />
    {message && <Notice {...message} />}
    <div className="v2-stat-grid three">
      <MiniStat label="Semua Akun" value={stats.total} tone="green" />
      <MiniStat label="Guru" value={stats.teachers} tone="blue" />
      <MiniStat label="Wali Murid" value={stats.parents} tone="purple" />
    </div>
    <section className="v2-panel">
      <div className="v2-toolbar">
        <label><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama pengguna..." /></label>
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'all' | AppRole)}>
          <option value="all">Semua role</option>
          <option value="admin">Admin</option>
          <option value="teacher">Guru</option>
          <option value="parent">Wali</option>
        </select>
      </div>
      {loading ? <SkeletonRows /> : accounts.length ? <>
        <div className="v2-list">
          {accounts.map((account) => <div className="v2-user-row" key={account.id}>
            <span className="v2-avatar">{initials(account.display_name)}</span>
            <div className="grow"><strong>{account.display_name || 'Tanpa nama'}</strong><small>{roleLabel(account.role)} · {account.is_active ? 'Aktif' : 'Nonaktif'}</small></div>
            <span className={`v2-badge ${account.is_active ? 'green' : 'gray'}`}>{account.is_active ? 'Aktif' : 'Nonaktif'}</span>
            <ActionMenu
              label={`Aksi untuk ${account.display_name || 'akun'}`}
              items={[
                { label: 'Edit akun', icon: Edit3, onSelect: () => setEditing(account) },
                { label: 'Kirim reset password', icon: KeyRound, onSelect: () => void sendPasswordReset(account) },
                { label: 'Hapus akun', icon: Trash2, danger: true, onSelect: () => setDeleting(account) },
              ]}
            />
          </div>)}
        </div>
        <PaginationControls page={page} total={total} onPage={setPage} />
      </> : <EmptyCard text="Tidak ada akun yang sesuai filter." />}
    </section>

    {createOpen && <CreateAccountModal
      onClose={() => setCreateOpen(false)}
      onDone={async (text) => {
        setCreateOpen(false)
        setMessage({ tone: 'success', text })
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

    {deleting && <Dialog title="Hapus akun?" onClose={() => setDeleting(null)} confirm>
      <span className="v2-modal-icon danger"><Trash2 /></span>
      <p>Akun {deleting.display_name || 'pengguna'} akan dihapus permanen beserta akses loginnya.</p>
      <div className="v2-form-actions">
        <button className="v2-secondary" onClick={() => setDeleting(null)}>Batal</button>
        <button className="v2-danger" onClick={() => void remove()}>Ya, Hapus</button>
      </div>
    </Dialog>}
  </div>
}

function CreateAccountModal({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'teacher' as 'teacher' | 'parent' })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setErrorText('')
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        email: form.email.trim().toLowerCase(),
        display_name: form.name.trim(),
        role: form.role,
      },
    })
    setBusy(false)
    if (error || !data?.ok) {
      setErrorText(data?.error || 'Akun gagal dibuat.')
      return
    }
    onDone(data.message || 'Akun berhasil dibuat. Pengguna akan menentukan password sendiri melalui email reset.')
  }

  return <Dialog title="Tambah Akun" eyebrow="FORMULIR" onClose={onClose}>
    <form className="v2-form" onSubmit={submit}>
      <label>Nama lengkap<input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><small>Pengguna akan menerima email untuk menentukan password sendiri.</small></label>
      <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as 'teacher' | 'parent' })}><option value="teacher">Guru</option><option value="parent">Orang Tua/Wali</option></select></label>
      {errorText && <p className="v2-field-error" role="alert">{errorText}</p>}
      <button className="v2-primary" disabled={busy}><Plus size={17} /> {busy ? 'Membuat...' : 'Buat Akun'}</button>
    </form>
  </Dialog>
}

function EditAccountModal({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: account.display_name || '', role: account.role, active: account.is_active })
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
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

  return <Dialog title="Edit Akun" eyebrow="FORMULIR" onClose={onClose}>
    <form className="v2-form" onSubmit={submit}>
      <label>Nama lengkap<input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AppRole })}><option value="admin">Admin</option><option value="teacher">Guru</option><option value="parent">Wali</option></select></label>
      <label className="v2-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>Akun aktif</span></label>
      <small>Perubahan password dilakukan oleh pemilik akun melalui email reset, bukan oleh Admin.</small>
      {errorText && <p className="v2-field-error" role="alert">{errorText}</p>}
      <button className="v2-primary" disabled={busy}><Save size={17} /> {busy ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
    </form>
  </Dialog>
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <article className={`v2-stat mini ${tone}`}><span><UsersRound size={20} /></span><div><small>{label}</small><strong>{value}</strong><p>Terdaftar</p></div></article>
}

function initials(name?: string | null) {
  return (name || 'Pengguna').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function roleLabel(role: AppRole) {
  return role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Guru' : 'Wali Murid'
}
