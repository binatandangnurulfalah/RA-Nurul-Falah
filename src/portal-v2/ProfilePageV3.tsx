import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeCheck,
  Camera,
  Check,
  Edit3,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { ProfileAvatar } from '../components/ProfileAvatar'
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
  const [avatarBusy, setAvatarBusy] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
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
      p_phone: form.phone.trim() || undefined,
      p_address: form.address.trim() || undefined,
      p_bio: form.bio.trim() || undefined,
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

  const uploadAvatar = async (file: File) => {
    setMessage(null)

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
    if (!allowedTypes.has(file.type)) {
      setMessage({ tone: 'error', text: 'Format foto harus JPG, PNG, atau WebP.' })
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ tone: 'error', text: 'Ukuran foto maksimal 2 MB.' })
      return
    }

    const path = `${profile.id}/avatar`
    setAvatarBusy(true)

    const { error: uploadError } = await supabase.storage
      .from('profile-photos')
      .upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: '3600',
      })

    if (uploadError) {
      setAvatarBusy(false)
      setMessage({ tone: 'error', text: uploadError.message || 'Foto profil gagal diupload.' })
      return
    }

    const { data, error } = await supabase.rpc('update_my_avatar', { p_avatar_path: path })
    if (error) {
      await supabase.storage.from('profile-photos').remove([path])
      setAvatarBusy(false)
      setMessage({ tone: 'error', text: error.message || 'Foto terupload, tetapi profil gagal diperbarui.' })
      return
    }

    const row = (Array.isArray(data) ? data[0] : data) as UserProfile | null
    setAvatarBusy(false)
    if (!row) {
      setMessage({ tone: 'error', text: 'Foto tersimpan, tetapi profil terbaru tidak dapat dimuat.' })
      return
    }

    onProfileChange(row)
    setMessage({ tone: 'success', text: profile.avatar_path ? 'Foto profil berhasil diganti.' : 'Foto profil berhasil ditambahkan.' })
  }

  const removeAvatar = async () => {
    if (!profile.avatar_path || avatarBusy) return
    setMessage(null)
    setAvatarBusy(true)

    const oldPath = profile.avatar_path
    const { data, error } = await supabase.rpc('update_my_avatar', { p_avatar_path: null })
    if (error) {
      setAvatarBusy(false)
      setMessage({ tone: 'error', text: error.message || 'Foto profil gagal dihapus.' })
      return
    }

    const row = (Array.isArray(data) ? data[0] : data) as UserProfile | null
    if (row) onProfileChange(row)

    const { error: removeError } = await supabase.storage.from('profile-photos').remove([oldPath])
    setAvatarBusy(false)
    setMessage({
      tone: removeError ? 'error' : 'success',
      text: removeError
        ? 'Foto sudah dilepas dari profil, tetapi file lama belum dapat dibersihkan.'
        : 'Foto profil berhasil dihapus.',
    })
  }

  const savePassword = async (event: FormEvent) => {
    event.preventDefault()
    setMessage(null)

    if (!currentPassword) {
      setMessage({ tone: 'error', text: 'Masukkan password saat ini untuk mengonfirmasi perubahan.' })
      return
    }

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
    const { error } = await supabase.auth.updateUser({ password, current_password: currentPassword })
    setPasswordBusy(false)

    if (error) {
      setMessage({ tone: 'error', text: 'Password tidak dapat diperbarui. Periksa password saat ini dan coba lagi.' })
      return
    }

    await supabase.auth.signOut({ scope: 'others' })
    setCurrentPassword('')
    setPassword('')
    setConfirmPassword('')
    setMessage({ tone: 'success', text: 'Password berhasil diperbarui. Sesi di perangkat lain telah diakhiri.' })
  }

  return (
    <div className="v2-stack profile-v3">
      <PageTitle
        eyebrow="PROFIL PENGGUNA"
        title={profile.role === 'teacher' ? 'Profil Guru' : profile.role === 'parent' ? 'Profil Akun' : 'Profil Administrator'}
        text={profile.role === 'parent' ? 'Foto dan keamanan akun dikelola di sini. Identitas, kontak, dan alamat resmi diajukan melalui menu Data Keluarga.' : 'Kelola data pribadi dan keamanan akun dari satu halaman.'}
        action={!editing && profile.role !== 'parent' ? <button className="v2-primary" onClick={() => { setEditing(true); setMessage(null) }}><Edit3 size={17} /> Edit Profil</button> : undefined}
      />

      {message && <Notice {...message} />}

      <section className={`profile-v3-hero role-${profile.role}`}>
        <div className="profile-v3-avatar-wrap">
          <ProfileAvatar profile={profile} className="profile-v3-avatar" />
          <button
            type="button"
            className="profile-v3-avatar-camera"
            aria-label={profile.avatar_path ? 'Ganti foto profil' : 'Tambah foto profil'}
            disabled={avatarBusy}
            onClick={() => avatarInputRef.current?.click()}
          >
            <Camera size={15} />
          </button>
          <input
            ref={avatarInputRef}
            className="profile-v3-avatar-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.currentTarget.value = ''
              if (file) void uploadAvatar(file)
            }}
          />
        </div>
        <div className="profile-v3-identity">
          <span><BadgeCheck size={15} /> {roleLabel(profile.role)}</span>
          <h2>{profile.display_name || 'Pengguna'}</h2>
          <p><Mail size={14} /> {email || 'Email akun aktif'}</p>
          <div className="profile-v3-photo-actions">
            <button type="button" disabled={avatarBusy} onClick={() => avatarInputRef.current?.click()}>
              <Camera size={14} /> {avatarBusy ? 'Memproses...' : profile.avatar_path ? 'Ganti Foto' : 'Pilih Foto'}
            </button>
            {profile.avatar_path && <button type="button" className="danger" disabled={avatarBusy} onClick={() => void removeAvatar()}><Trash2 size={14} /> Hapus</button>}
            <small>JPG, PNG, atau WebP · maksimal 2 MB</small>
          </div>
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

          {profile.role === 'parent' ? (
            <>
              <div className="profile-v3-info">
                <InfoRow icon={<UserRound size={17} />} label="Nama akun terverifikasi" value={profile.display_name || 'Belum diisi'} filled={Boolean(profile.display_name)} />
                <InfoRow icon={<Phone size={17} />} label="Telepon resmi" value={profile.phone || 'Belum diisi'} filled={Boolean(profile.phone)} />
                <InfoRow icon={<MapPin size={17} />} label="Alamat resmi" value={profile.address || 'Belum diisi'} filled={Boolean(profile.address)} />
              </div>
              <div className="profile-v3-hint"><ShieldCheck size={16} /><span>Perubahan nama, telepon, alamat, data Ayah/Ibu/Wali, dan data anak harus diajukan melalui menu <strong>Data Keluarga</strong> agar diverifikasi Guru.</span></div>
            </>
          ) : editing ? (
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
            <label>Password saat ini
              <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Konfirmasi password saat ini" />
            </label>
            <label>Password baru
              <input type="password" minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 10 karakter" />
            </label>
            <label>Ulangi password
              <input type="password" minLength={10} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </label>
            <button className="v2-primary" disabled={passwordBusy || !currentPassword || !password}><KeyRound size={17} /> {passwordBusy ? 'Memperbarui...' : 'Ubah Password'}</button>
          </form>
        </section>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value, filled }: { icon: ReactNode; label: string; value: string; filled: boolean }) {
  return <div className="profile-v3-info-row"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div><i className={filled ? 'filled' : ''}>{filled ? <Check size={13} /> : '—'}</i></div>
}


function roleLabel(role: UserProfile['role']) {
  return role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Guru' : 'Orang Tua / Wali'
}
