import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  Check,
  Edit3,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import { supabase, type UserProfile } from '../lib/supabase'
import { validatePassword } from '../lib/auth-utils.js'
import { Notice, PageTitle } from './PortalPages'

type ProfileForm = {
  display_name: string
  phone: string
  address: string
  bio: string
}

type Message = { tone: 'success' | 'error'; text: string }

function toForm(profile: UserProfile): ProfileForm {
  return {
    display_name: profile.display_name || '',
    phone: profile.phone || '',
    address: profile.address || '',
    bio: profile.bio || '',
  }
}

export function ProfilePageV3({ profile, onProfileChange }: { profile: UserProfile; onProfileChange: (profile: UserProfile) => void }) {
  const [form, setForm] = useState<ProfileForm>(() => toForm(profile))
  const [email, setEmail] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    setForm(toForm(profile))
  }, [profile])

  useEffect(() => {
    let mounted = true
    void supabase.auth.getUser().then(({ data }) => {
      if (mounted) setEmail(data.user?.email || '')
    })
    return () => { mounted = false }
  }, [])

  const dirty = useMemo(() => {
    const original = toForm(profile)
    return (Object.keys(original) as (keyof ProfileForm)[]).some((key) => original[key] !== form[key])
  }, [form, profile])

  const completeness = useMemo(() => {
    const values = [form.display_name, form.phone, form.address, form.bio]
    return Math.round((values.filter((value) => value.trim()).length / values.length) * 100)
  }, [form])

  const cancelEdit = () => {
    setForm(toForm(profile))
    setEditing(false)
    setMessage(null)
  }

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    setMessage(null)

    const name = form.display_name.trim()
    if (name.length < 2) {
      setMessage({ tone: 'error', text: 'Nama lengkap minimal 2 karakter.' })
      return
    }
    if (form.phone.trim() && !/^[+0-9][0-9\s-]{7,24}$/.test(form.phone.trim())) {
      setMessage({ tone: 'error', text: 'Nomor telepon belum valid. Gunakan angka, spasi, +, atau tanda -.' })
      return
    }

    setBusy(true)
    const { data, error } = await supabase.rpc('update_my_profile', {
      p_display_name: name,
      p_phone: form.phone.trim() || null,
      p_address: form.address.trim() || null,
      p_bio: form.bio.trim() || null,
    })
    setBusy(false)

    if (error) {
      setMessage({ tone: 'error', text: error.message || 'Profil gagal diperbarui.' })
      return
    }

    const row = (Array.isArray(data) ? data[0] : data) as UserProfile | null
    if (!row) {
      setMessage({ tone: 'error', text: 'Profil tersimpan, tetapi data terbaru tidak dapat dimuat.' })
      return
    }

    onProfileChange(row)
    setForm(toForm(row))
    setEditing(false)
    setMessage({ tone: 'success', text: 'Profil berhasil diperbarui.' })
  }

  const savePassword = async (event: FormEvent) => {
    event.preventDefault()
    setMessage(null)

    const passwordError = validatePassword(password)
    if (passwordError) {
      setMessage({ tone: 'error', text: passwordError })
      return
    }
    if (password !== confirmPassword) {
      setMessage({ tone: 'error', text: 'Konfirmasi password tidak sama.' })
      return
    }

    setPasswordBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setPasswordBusy(false)

    if (error) {
      setMessage({ tone: 'error', text: error.message })
      return
    }

    setPassword('')
    setConfirmPassword('')
    setMessage({ tone: 'success', text: 'Password berhasil diperbarui.' })
  }

  return (
    <div className="v2-stack profile-v3">
      <PageTitle
        eyebrow="PROFIL PENGGUNA"
        title={profile.role === 'teacher' ? 'Profil Guru' : profile.role === 'parent' ? 'Profil Keluarga' : 'Profil Administrator'}
        text="Kelola data pribadi dan keamanan akun dari satu halaman."
        action={!editing ? <button className="v2-primary" onClick={() => { setEditing(true); setMessage(null) }}><Edit3 size={17} /> Edit Profil</button> : undefined}
      />

      {message && <Notice {...message} />}

      <section className={`profile-v3-hero role-${profile.role}`}>
        <div className="profile-v3-avatar">{initials(profile.display_name)}</div>
        <div className="profile-v3-identity">
          <span><BadgeCheck size={15} /> {roleLabel(profile.role)}</span>
          <h2>{profile.display_name || 'Pengguna'}</h2>
          <p><Mail size={14} /> {email || 'Email akun aktif'}</p>
        </div>
        <div className="profile-v3-score">
          <strong>{completeness}%</strong>
          <small>Kelengkapan profil</small>
          <i><b style={{ width: `${completeness}%` }} /></i>
        </div>
      </section>

      <div className="v2-two-col profile-v3-grid">
        <section className="v2-panel profile-v3-panel">
          <div className="v2-panel-head">
            <div>
              <h3>Informasi Profil</h3>
              <p>Nama, kontak, alamat dan keterangan akun Anda.</p>
            </div>
            <UserRound size={22} />
          </div>

          {editing ? (
            <form className="v2-form profile-v3-form" onSubmit={saveProfile}>
              <label>Nama lengkap
                <input required maxLength={120} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} autoComplete="name" />
              </label>
              <label><Phone size={15} /> Nomor telepon
                <input maxLength={25} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="08xxxxxxxxxx" inputMode="tel" autoComplete="tel" />
              </label>
              <label><MapPin size={15} /> Alamat
                <textarea maxLength={500} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={4} placeholder="Alamat lengkap" autoComplete="street-address" />
              </label>
              <label>Bio / keterangan
                <textarea maxLength={500} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={4} placeholder="Keterangan singkat" />
              </label>
              <div className="profile-v3-hint"><ShieldCheck size={16} /><span>Role dan status akun tidak dapat diubah dari halaman ini.</span></div>
              <div className="v2-form-actions profile-v3-actions">
                <button type="button" className="v2-secondary" onClick={cancelEdit}><X size={16} /> Batal</button>
                <button className="v2-primary" disabled={busy || !dirty}><Save size={17} /> {busy ? 'Menyimpan...' : dirty ? 'Simpan Perubahan' : 'Belum Ada Perubahan'}</button>
              </div>
            </form>
          ) : (
            <div className="profile-v3-info">
              <InfoRow icon={<UserRound size={17} />} label="Nama lengkap" value={profile.display_name || 'Belum diisi'} filled={Boolean(profile.display_name)} />
              <InfoRow icon={<Phone size={17} />} label="Telepon" value={profile.phone || 'Belum diisi'} filled={Boolean(profile.phone)} />
              <InfoRow icon={<MapPin size={17} />} label="Alamat" value={profile.address || 'Belum diisi'} filled={Boolean(profile.address)} />
              <InfoRow icon={<Check size={17} />} label="Bio / keterangan" value={profile.bio || 'Belum diisi'} filled={Boolean(profile.bio)} />
            </div>
          )}
        </section>

        <section className="v2-panel profile-v3-panel security">
          <div className="v2-panel-head">
            <div>
              <h3>Keamanan Akun</h3>
              <p>Ganti password akun Anda secara mandiri.</p>
            </div>
            <KeyRound size={22} />
          </div>
          <div className="profile-v3-security-note"><ShieldCheck size={18} /><div><strong>Akun terlindungi</strong><small>Password minimal 10 karakter, berisi huruf besar, huruf kecil, dan angka.</small></div></div>
          <form className="v2-form" onSubmit={savePassword}>
            <label>Password baru
              <input type="password" minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 10 karakter" />
            </label>
            <label>Ulangi password
              <input type="password" minLength={10} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </label>
            <button className="v2-primary" disabled={passwordBusy || !password}><KeyRound size={17} /> {passwordBusy ? 'Memperbarui...' : 'Ubah Password'}</button>
          </form>
        </section>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value, filled }: { icon: ReactNode; label: string; value: string; filled: boolean }) {
  return <div className="profile-v3-info-row"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div><i className={filled ? 'filled' : ''}>{filled ? <Check size={13} /> : '—'}</i></div>
}

function initials(name?: string | null) {
  return (name || 'Pengguna').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function roleLabel(role: UserProfile['role']) {
  return role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Guru' : 'Orang Tua / Wali'
}
