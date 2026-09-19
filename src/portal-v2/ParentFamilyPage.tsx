import { type FormEvent, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Baby, CheckCircle2, Clock3, Edit3, FileText, HeartPulse, MapPin, Paperclip, Plus, ShieldCheck, UsersRound } from 'lucide-react'
import { FormDialog, FormField, FormSection } from '../components/forms'
import { StatusBadge } from '../components/data'
import { Button, EmptyState, PageHeader } from '../components/ui'
import { markParentVerificationSeen, parentFamilyWorkspaceOptions, type ParentChildRow, type VerificationPayload, type VerificationRequestRow } from '../data/queries/parentVerification'
import { queryKeys } from '../data/queryKeys'
import { userErrorMessage } from '../lib/error-utils'
import { supabase, type UserProfile } from '../lib/supabase'
import { Notice } from './PortalPages'

type FamilyForm = {
  account_display_name: string
  primary_phone: string
  family_card_no: string
  family_address: string
  father_name: string
  father_nik: string
  father_birth_place: string
  father_birth_date: string
  father_phone: string
  father_education: string
  father_occupation: string
  mother_name: string
  mother_nik: string
  mother_birth_place: string
  mother_birth_date: string
  mother_phone: string
  mother_education: string
  mother_occupation: string
  guardian_name: string
  guardian_nik: string
  guardian_relationship: string
  guardian_phone: string
  guardian_education: string
  guardian_occupation: string
  emergency_contact_name: string
  emergency_contact_phone: string
}

type ChildForm = {
  full_name: string
  nik: string
  nisn: string
  gender: '' | 'L' | 'P'
  birth_place: string
  birth_date: string
  relationship_to_child: string
  residential_address: string
  blood_type: '' | 'A' | 'B' | 'AB' | 'O'
  allergies: string
  health_notes: string
  special_needs: string
  birth_certificate_no: string
  photo_path: string
  document_paths: string[]
  administrative_notes: string
}

type ChildEditor = {
  targetStudentId: string | null
  supersedesRequestId: string | null
  title: string
  form: ChildForm
  photoFile: File | null
  documentFiles: File[]
}

const emptyFamily = (profile: UserProfile): FamilyForm => ({
  account_display_name: profile.display_name || '',
  primary_phone: profile.phone || '',
  family_card_no: '',
  family_address: profile.address || '',
  father_name: '',
  father_nik: '',
  father_birth_place: '',
  father_birth_date: '',
  father_phone: '',
  father_education: '',
  father_occupation: '',
  mother_name: '',
  mother_nik: '',
  mother_birth_place: '',
  mother_birth_date: '',
  mother_phone: '',
  mother_education: '',
  mother_occupation: '',
  guardian_name: '',
  guardian_nik: '',
  guardian_relationship: '',
  guardian_phone: '',
  guardian_education: '',
  guardian_occupation: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
})

const emptyChild = (): ChildForm => ({
  full_name: '',
  nik: '',
  nisn: '',
  gender: '',
  birth_place: '',
  birth_date: '',
  relationship_to_child: 'Orang Tua',
  residential_address: '',
  blood_type: '',
  allergies: '',
  health_notes: '',
  special_needs: '',
  birth_certificate_no: '',
  photo_path: '',
  document_paths: [],
  administrative_notes: '',
})

const VERIFICATION_BUCKET = 'parent-verification-files'

function jsonText(value: unknown) {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function adminNotes(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const notes = (value as Record<string, unknown>).administrative_notes
  return typeof notes === 'string' ? notes : ''
}

function safeFileName(name: string) {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file'
}

function requestUnread(request: VerificationRequestRow) {
  return Boolean(request.reviewed_at && (!request.parent_seen_at || request.parent_seen_at < request.reviewed_at))
}

function stringValue(value: unknown) {
  return value == null ? '' : String(value)
}

function familyFromPayload(profile: UserProfile, payload: Record<string, unknown>): FamilyForm {
  const base = emptyFamily(profile)
  return Object.fromEntries(
    Object.keys(base).map((key) => [key, stringValue(payload[key])]),
  ) as FamilyForm
}

function childFromPayload(payload: VerificationPayload): ChildForm {
  const bloodType = jsonText(payload.blood_type)
  return {
    full_name: jsonText(payload.full_name),
    nik: jsonText(payload.nik),
    nisn: jsonText(payload.nisn),
    gender: payload.gender === 'L' || payload.gender === 'P' ? payload.gender : '',
    birth_place: jsonText(payload.birth_place),
    birth_date: jsonText(payload.birth_date),
    relationship_to_child: jsonText(payload.relationship_to_child) || 'Orang Tua',
    residential_address: jsonText(payload.residential_address),
    blood_type: bloodType === 'A' || bloodType === 'B' || bloodType === 'AB' || bloodType === 'O' ? bloodType : '',
    allergies: jsonText(payload.allergies),
    health_notes: jsonText(payload.health_notes),
    special_needs: jsonText(payload.special_needs),
    birth_certificate_no: jsonText(payload.birth_certificate_no),
    photo_path: jsonText(payload.photo_path),
    document_paths: jsonStringArray(payload.document_paths),
    administrative_notes: adminNotes(payload.school_admin_data),
  }
}

function statusLabel(status: VerificationRequestRow['status']) {
  return status === 'pending' ? 'Menunggu verifikasi'
    : status === 'approved' ? 'Disetujui'
      : status === 'changes_requested' ? 'Perlu perbaikan'
        : 'Ditolak'
}

function statusTone(status: VerificationRequestRow['status']) {
  return status === 'approved' ? 'success' : status === 'pending' ? 'warning' : status === 'changes_requested' ? 'info' : 'danger'
}

export default function ParentFamilyPage({ profile }: { profile: UserProfile }) {
  const queryClient = useQueryClient()
  const workspaceQuery = useQuery(parentFamilyWorkspaceOptions(profile.id))
  const data = workspaceQuery.data
  const requests = data?.requests ?? []
  const family = data?.family ?? null
  const children = (data?.children ?? []) as Array<ParentChildRow & { relationship?: string }>
  const pendingFamily = requests.find((item) => item.request_type === 'family_profile' && item.status === 'pending')
  const pendingChildLinks = requests.filter((item) => item.request_type === 'child_link' && item.status === 'pending')
  const latestFamilyRequest = requests.find((item) => item.request_type === 'family_profile')
  const latestFamilyCorrection = latestFamilyRequest && (latestFamilyRequest.status === 'changes_requested' || latestFamilyRequest.status === 'rejected') ? latestFamilyRequest : null

  const [familyOpen, setFamilyOpen] = useState(false)
  const [familySupersedes, setFamilySupersedes] = useState<string | null>(null)
  const [familyForm, setFamilyForm] = useState<FamilyForm>(() => emptyFamily(profile))
  const [childEditor, setChildEditor] = useState<ChildEditor | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const verifiedFamilyPayload = useMemo(() => family ? familyFromPayload(profile, family as unknown as Record<string, unknown>) : emptyFamily(profile), [family, profile])

  const markSeen = async (request: VerificationRequestRow) => {
    if (!requestUnread(request)) return
    try {
      await markParentVerificationSeen(request.id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.verification.all })
    } catch {
      // Reading the detail must stay usable even if acknowledgement cannot be persisted.
    }
  }

  const openFamily = (request?: VerificationRequestRow) => {
    if (request) void markSeen(request)
    setFamilySupersedes(request?.id ?? null)
    setFamilyForm(request ? familyFromPayload(profile, request.proposed_data) : verifiedFamilyPayload)
    setFormError('')
    setFamilyOpen(true)
  }

  const openNewChild = () => {
    setChildEditor({
      targetStudentId: null,
      supersedesRequestId: null,
      title: 'Tambahkan Anak',
      form: emptyChild(),
      photoFile: null,
      documentFiles: [],
    })
    setFormError('')
  }

  const openChildUpdate = (child: (typeof children)[number]) => {
    setChildEditor({
      targetStudentId: child.id,
      supersedesRequestId: null,
      title: `Ajukan Perubahan · ${child.full_name}`,
      form: {
        full_name: child.full_name,
        nik: child.nik || '',
        nisn: child.nisn || '',
        gender: child.gender || '',
        birth_place: child.birth_place || '',
        birth_date: child.birth_date || '',
        relationship_to_child: child.relationship || 'Orang Tua',
        residential_address: child.parent_details?.residential_address || '',
        blood_type: (child.parent_details?.blood_type === 'A' || child.parent_details?.blood_type === 'B' || child.parent_details?.blood_type === 'AB' || child.parent_details?.blood_type === 'O') ? child.parent_details.blood_type : '',
        allergies: child.parent_details?.allergies || '',
        health_notes: child.parent_details?.health_notes || '',
        special_needs: child.parent_details?.special_needs || '',
        birth_certificate_no: child.parent_details?.birth_certificate_no || '',
        photo_path: child.parent_details?.photo_path || '',
        document_paths: jsonStringArray(child.parent_details?.document_paths),
        administrative_notes: adminNotes(child.parent_details?.school_admin_data),
      },
      photoFile: null,
      documentFiles: [],
    })
    setFormError('')
  }

  const reopenChildRequest = (request: VerificationRequestRow) => {
    setChildEditor({
      targetStudentId: request.target_student_id,
      supersedesRequestId: request.id,
      title: request.request_type === 'child_link' ? 'Perbaiki Pengajuan Anak' : 'Perbaiki Perubahan Anak',
      form: childFromPayload(request.proposed_data),
      photoFile: null,
      documentFiles: [],
    })
    void markSeen(request)
    setFormError('')
  }

  const submitFamily = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFormError('')
    const { error } = await supabase.rpc('submit_parent_family_verification', {
      p_payload: familyForm,
      p_supersedes_request_id: familySupersedes,
    })
    setBusy(false)
    if (error) {
      setFormError(userErrorMessage(error, 'Pengajuan data keluarga gagal dikirim.'))
      return
    }
    setFamilyOpen(false)
    setMessage({ tone: 'success', text: 'Data keluarga berhasil diajukan dan menunggu verifikasi Guru.' })
    await queryClient.invalidateQueries({ queryKey: queryKeys.verification.all })
  }

  const submitChild = async (event: FormEvent) => {
    event.preventDefault()
    if (!childEditor || busy) return
    setBusy(true)
    setFormError('')

    const uploadedPaths: string[] = []
    let photoPath = childEditor.form.photo_path
    const documentPaths = [...childEditor.form.document_paths]

    try {
      const uploadRoot = `${profile.id}/children/${crypto.randomUUID()}`

      if (childEditor.photoFile) {
        const photoName = safeFileName(childEditor.photoFile.name)
        photoPath = `${uploadRoot}/photo-${photoName}`
        const { error } = await supabase.storage
          .from(VERIFICATION_BUCKET)
          .upload(photoPath, childEditor.photoFile, { contentType: childEditor.photoFile.type, upsert: false })
        if (error) throw error
        uploadedPaths.push(photoPath)
      }

      for (const [index, file] of childEditor.documentFiles.entries()) {
        const path = `${uploadRoot}/documents/${index + 1}-${safeFileName(file.name)}`
        const { error } = await supabase.storage
          .from(VERIFICATION_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false })
        if (error) throw error
        uploadedPaths.push(path)
        documentPaths.push(path)
      }

      const { error } = await supabase.rpc('submit_parent_child_verification', {
        p_target_student_id: childEditor.targetStudentId,
        p_payload: {
          full_name: childEditor.form.full_name,
          nik: childEditor.form.nik,
          nisn: childEditor.form.nisn,
          gender: childEditor.form.gender,
          birth_place: childEditor.form.birth_place,
          birth_date: childEditor.form.birth_date,
          relationship_to_child: childEditor.form.relationship_to_child,
          residential_address: childEditor.form.residential_address,
          blood_type: childEditor.form.blood_type,
          allergies: childEditor.form.allergies,
          health_notes: childEditor.form.health_notes,
          special_needs: childEditor.form.special_needs,
          birth_certificate_no: childEditor.form.birth_certificate_no,
          photo_path: photoPath,
          document_paths: documentPaths,
          school_admin_data: { administrative_notes: childEditor.form.administrative_notes || null },
        },
        p_supersedes_request_id: childEditor.supersedesRequestId,
      })
      if (error) throw error
    } catch (error) {
      if (uploadedPaths.length) {
        await supabase.storage.from(VERIFICATION_BUCKET).remove(uploadedPaths)
      }
      setBusy(false)
      setFormError(userErrorMessage(error, 'Pengajuan data anak gagal dikirim.'))
      return
    }

    setBusy(false)
    setChildEditor(null)
    setMessage({ tone: 'success', text: 'Data anak berhasil diajukan dan menunggu verifikasi Guru.' })
    await queryClient.invalidateQueries({ queryKey: queryKeys.verification.all })
  }

  if (workspaceQuery.isError) {
    return <div className="v2-stack"><PageHeader eyebrow="KELUARGA" title="Data Keluarga" subtitle="Kelola data keluarga dan anak yang terhubung ke RA Nurul Falah." /><Notice tone="error" text={userErrorMessage(workspaceQuery.error, 'Data keluarga gagal dimuat.')} /></div>
  }

  return <div className="v2-stack parent-family-page">
    <PageHeader
      eyebrow="KELUARGA"
      title="Data Keluarga"
      subtitle="Lengkapi data Ayah, Ibu/Wali, dan anak. Perubahan baru menjadi data resmi setelah diverifikasi Guru."
      actions={<Button onClick={openNewChild}><Plus size={17} /> Tambahkan Anak</Button>}
    />

    {message && <Notice {...message} />}
    <section className="family-verification-note"><ShieldCheck size={21} /><div><strong>Data resmi dilindungi proses verifikasi</strong><p>Pengajuan Anda tidak langsung mengubah data sekolah. Guru akan memeriksa kecocokan terlebih dahulu.</p></div></section>

    <section className="v2-panel family-profile-card">
      <header className="family-section-head">
        <div><small>DATA ORANG TUA / WALI</small><h3>Profil keluarga</h3></div>
        {pendingFamily
          ? <StatusBadge tone="warning"><Clock3 size={14} /> Menunggu verifikasi</StatusBadge>
          : family
            ? <StatusBadge tone="success"><CheckCircle2 size={14} /> Terverifikasi</StatusBadge>
            : <StatusBadge tone="neutral">Belum dilengkapi</StatusBadge>}
      </header>
      <div className="family-profile-grid">
        <FamilyInfo label="Pemilik akun" value={family?.account_display_name || profile.display_name || 'Belum diisi'} />
        <FamilyInfo label="Telepon utama" value={family?.primary_phone || profile.phone || 'Belum diisi'} />
        <FamilyInfo label="Ayah" value={family?.father_name || 'Belum diisi'} />
        <FamilyInfo label="Ibu" value={family?.mother_name || 'Belum diisi'} />
        <FamilyInfo label="Wali lain" value={family?.guardian_name || 'Tidak ada / belum diisi'} />
        <FamilyInfo label="Alamat keluarga" value={family?.family_address || profile.address || 'Belum diisi'} />
      </div>
      {latestFamilyCorrection && !pendingFamily && <CorrectionNotice request={latestFamilyCorrection} onFix={() => openFamily(latestFamilyCorrection)} />}
      <div className="family-card-actions">
        <Button variant="secondary" disabled={Boolean(pendingFamily)} onClick={() => openFamily()}><Edit3 size={16} /> {family ? 'Ajukan Perubahan' : 'Lengkapi Data Keluarga'}</Button>
      </div>
    </section>

    <section className="v2-panel">
      <header className="family-section-head"><div><small>ANAK</small><h3>Anak terhubung</h3></div><span>{children.length} siswa resmi</span></header>
      {workspaceQuery.isPending ? <p>Memuat data anak...</p> : children.length ? <div className="family-child-grid">{children.map((child) => {
        const latestUpdate = requests.find((request) => request.request_type === 'child_update' && request.target_student_id === child.id)
        const pendingUpdate = latestUpdate?.status === 'pending' ? latestUpdate : null
        const correction = latestUpdate && (latestUpdate.status === 'changes_requested' || latestUpdate.status === 'rejected') ? latestUpdate : null
        return <article className="family-child-card" key={child.id}>
          <span className="family-child-avatar"><Baby size={21} /></span>
          <div className="family-child-main">
            <div className="family-child-title"><h4>{child.full_name}</h4>{pendingUpdate && <StatusBadge tone="warning">Perubahan menunggu</StatusBadge>}</div>
            <p>{child.class_name || 'Kelompok belum ditentukan'} · {child.academic_year || 'Tahun ajaran belum tersedia'}</p>
            <small>{child.nis ? `NIS ${child.nis}` : 'NIS belum diisi'} · Hubungan: {child.relationship || 'Wali'}</small>
            {child.parent_details && <div className="family-child-details">
              {child.parent_details.residential_address && <span><MapPin size={12} /> Alamat tersedia</span>}
              {(child.parent_details.blood_type || child.parent_details.health_notes || child.parent_details.allergies) && <span><HeartPulse size={12} /> Data kesehatan tersedia</span>}
              {(child.parent_details.photo_path || jsonStringArray(child.parent_details.document_paths).length > 0) && <span><Paperclip size={12} /> Berkas terverifikasi</span>}
            </div>}
            {correction && !pendingUpdate && <CorrectionNotice request={correction} onFix={() => reopenChildRequest(correction)} compact />}
          </div>
          <Button size="sm" variant="secondary" disabled={Boolean(pendingUpdate)} onClick={() => openChildUpdate(child)}><Edit3 size={15} /> Ajukan Perubahan</Button>
        </article>
      })}</div> : <EmptyState icon={<UsersRound size={24} />} title="Belum ada anak terhubung" description="Tambahkan data anak untuk diajukan. Guru akan mencocokkannya dengan siswa resmi RA Nurul Falah." action={<Button onClick={openNewChild}><Plus size={16} /> Tambahkan Anak</Button>} />}
    </section>

    {pendingChildLinks.length ? <section className="v2-panel">
      <header className="family-section-head"><div><small>PENGAJUAN ANAK BARU</small><h3>Menunggu pencocokan Guru</h3></div></header>
      <div className="family-pending-list">{pendingChildLinks.map((request) => <div key={request.id}><Baby size={18} /><div><strong>{jsonText(request.proposed_data.full_name) || 'Anak'}</strong><small>{jsonText(request.proposed_data.birth_date) || 'Tanggal lahir belum diisi'} · Guru akan mencocokkan dengan siswa resmi.</small></div><StatusBadge tone="warning">Menunggu</StatusBadge></div>)}</div>
    </section> : null}

    <section className="v2-panel">
      <header className="family-section-head"><div><small>RIWAYAT</small><h3>Riwayat verifikasi</h3></div></header>
      {requests.length ? <div className="family-history">{requests.slice(0, 12).map((request) => <article key={request.id}>
        <div><strong>{request.request_type === 'family_profile' ? 'Data keluarga' : request.request_type === 'child_link' ? `Tambah anak · ${jsonText(request.proposed_data.full_name)}` : `Perubahan anak · ${jsonText(request.proposed_data.full_name)}`}</strong><small>{new Date(request.submitted_at).toLocaleString('id-ID')}</small></div>
        <div className="family-history-status"><StatusBadge tone={statusTone(request.status)}>{statusLabel(request.status)}</StatusBadge>{requestUnread(request) && <span className="verification-unread-dot">Baru</span>}</div>
        {request.review_comment ? <p>{request.review_comment}</p> : null}
        {(request.status === 'changes_requested' || request.status === 'rejected') && <Button size="sm" variant="secondary" onClick={() => request.request_type === 'family_profile' ? openFamily(request) : reopenChildRequest(request)}>Perbaiki & kirim ulang</Button>}
        {requestUnread(request) && request.status === 'approved' && <Button size="sm" variant="secondary" onClick={() => void markSeen(request)}>Tandai dibaca</Button>}
      </article>)}</div> : <p className="helper-text">Belum ada riwayat pengajuan.</p>}
    </section>

    <FormDialog open={familyOpen} title="Data Keluarga" description="Data akan dikirim ke Guru untuk diverifikasi sebelum menjadi data resmi." submitLabel="Ajukan Verifikasi" busy={busy} error={formError} onClose={() => setFamilyOpen(false)} onSubmit={submitFamily}>
      <FamilyFormFields form={familyForm} setForm={setFamilyForm} />
    </FormDialog>

    <FormDialog open={Boolean(childEditor)} title={childEditor?.title || 'Data Anak'} description="Isi identitas anak. Anda tidak perlu memilih siswa dari daftar sekolah; Guru yang akan melakukan pencocokan." submitLabel="Ajukan Verifikasi" busy={busy} error={formError} onClose={() => setChildEditor(null)} onSubmit={submitChild}>
      {childEditor && <ChildFormFields editor={childEditor} setEditor={setChildEditor} />}
    </FormDialog>
  </div>
}

function FamilyFormFields({ form, setForm }: { form: FamilyForm; setForm: (form: FamilyForm) => void }) {
  return <>
    <FormSection title="Kontak keluarga" description="Identitas pemilik akun dan alamat resmi keluarga.">
      <FormField label="Nama pemilik akun" required><input required maxLength={120} value={form.account_display_name} onChange={(e) => setForm({ ...form, account_display_name: e.target.value })} /></FormField>
      <FormField label="Nomor telepon utama" required><input required inputMode="tel" maxLength={25} value={form.primary_phone} onChange={(e) => setForm({ ...form, primary_phone: e.target.value })} /></FormField>
      <FormField label="Nomor KK"><input inputMode="numeric" maxLength={30} value={form.family_card_no} onChange={(e) => setForm({ ...form, family_card_no: e.target.value.replace(/\D/g, '') })} /></FormField>
      <FormField label="Alamat keluarga" required full><textarea required rows={3} maxLength={1000} value={form.family_address} onChange={(e) => setForm({ ...form, family_address: e.target.value })} /></FormField>
    </FormSection>
    <PersonSection title="Data Ayah" prefix="father" form={form} setForm={setForm} />
    <PersonSection title="Data Ibu" prefix="mother" form={form} setForm={setForm} />
    <PersonSection title="Data Wali (jika berbeda)" prefix="guardian" form={form} setForm={setForm} guardian />
    <FormSection title="Kontak darurat">
      <FormField label="Nama kontak darurat"><input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} /></FormField>
      <FormField label="Nomor kontak darurat"><input inputMode="tel" value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} /></FormField>
    </FormSection>
  </>
}

function PersonSection({ title, prefix, form, setForm, guardian = false }: { title: string; prefix: 'father' | 'mother' | 'guardian'; form: FamilyForm; setForm: (form: FamilyForm) => void; guardian?: boolean }) {
  const field = (name: string) => `${prefix}_${name}` as keyof FamilyForm
  const set = (name: string, value: string) => setForm({ ...form, [field(name)]: value })
  return <FormSection title={title}>
    <FormField label="Nama lengkap"><input value={form[field('name')]} onChange={(e) => set('name', e.target.value)} /></FormField>
    <FormField label="NIK"><input inputMode="numeric" maxLength={16} value={form[field('nik')]} onChange={(e) => set('nik', e.target.value.replace(/\D/g, ''))} /></FormField>
    {guardian ? <FormField label="Hubungan dengan anak"><input value={form.guardian_relationship} onChange={(e) => setForm({ ...form, guardian_relationship: e.target.value })} placeholder="Contoh: Kakek, Bibi, Wali" /></FormField> : <>
      <FormField label="Tempat lahir"><input value={form[field('birth_place')]} onChange={(e) => set('birth_place', e.target.value)} /></FormField>
      <FormField label="Tanggal lahir"><input type="date" value={form[field('birth_date')]} onChange={(e) => set('birth_date', e.target.value)} /></FormField>
    </>}
    <FormField label="Nomor telepon"><input inputMode="tel" value={form[field('phone')]} onChange={(e) => set('phone', e.target.value)} /></FormField>
    <FormField label="Pendidikan terakhir"><input value={form[field('education')]} onChange={(e) => set('education', e.target.value)} /></FormField>
    <FormField label="Pekerjaan"><input value={form[field('occupation')]} onChange={(e) => set('occupation', e.target.value)} /></FormField>
  </FormSection>
}

function ChildFormFields({ editor, setEditor }: { editor: ChildEditor; setEditor: (editor: ChildEditor) => void }) {
  const form = editor.form
  const setForm = (next: ChildForm) => setEditor({ ...editor, form: next })

  return <>
    <FormSection title="Identitas anak" description="Kelas, NIS dan tahun ajaran tetap berasal dari data resmi sekolah dan tidak dapat diubah dari akun Orang Tua.">
      <FormField label="Nama lengkap" required><input required maxLength={120} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></FormField>
      <FormField label="NIK"><input inputMode="numeric" maxLength={16} value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value.replace(/\D/g, '') })} /></FormField>
      <FormField label="NISN"><input inputMode="numeric" maxLength={20} value={form.nisn} onChange={(e) => setForm({ ...form, nisn: e.target.value.replace(/\D/g, '') })} /></FormField>
      <FormField label="Jenis kelamin" required><select required value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as ChildForm['gender'] })}><option value="">Pilih</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></FormField>
      <FormField label="Tempat lahir"><input value={form.birth_place} onChange={(e) => setForm({ ...form, birth_place: e.target.value })} /></FormField>
      <FormField label="Tanggal lahir" required><input type="date" required value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></FormField>
      <FormField label="Hubungan Anda dengan anak" required><select required value={form.relationship_to_child} onChange={(e) => setForm({ ...form, relationship_to_child: e.target.value })}><option>Orang Tua</option><option>Ayah</option><option>Ibu</option><option>Wali</option></select></FormField>
    </FormSection>

    <FormSection title="Alamat & kesehatan" description="Isi informasi dasar yang relevan untuk kebutuhan sekolah dan keadaan darurat.">
      <FormField label="Alamat anak" full><textarea rows={3} maxLength={1000} value={form.residential_address} onChange={(e) => setForm({ ...form, residential_address: e.target.value })} /></FormField>
      <FormField label="Golongan darah"><select value={form.blood_type} onChange={(e) => setForm({ ...form, blood_type: e.target.value as ChildForm['blood_type'] })}><option value="">Belum diketahui</option><option value="A">A</option><option value="B">B</option><option value="AB">AB</option><option value="O">O</option></select></FormField>
      <FormField label="Alergi" full><textarea rows={2} maxLength={1000} value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="Kosongkan jika tidak ada / belum diketahui." /></FormField>
      <FormField label="Catatan kesehatan" full><textarea rows={3} maxLength={2000} value={form.health_notes} onChange={(e) => setForm({ ...form, health_notes: e.target.value })} /></FormField>
      <FormField label="Kebutuhan khusus" full><textarea rows={2} maxLength={1000} value={form.special_needs} onChange={(e) => setForm({ ...form, special_needs: e.target.value })} /></FormField>
    </FormSection>

    <FormSection title="Administrasi & berkas" description="Berkas tersimpan privat dan hanya dapat dilihat Orang Tua/Wali pemilik, Guru, serta Admin yang berwenang.">
      <FormField label="Nomor akta kelahiran"><input maxLength={80} value={form.birth_certificate_no} onChange={(e) => setForm({ ...form, birth_certificate_no: e.target.value })} /></FormField>
      <FormField label="Catatan administrasi" full><textarea rows={3} maxLength={2000} value={form.administrative_notes} onChange={(e) => setForm({ ...form, administrative_notes: e.target.value })} placeholder="Informasi administrasi lain yang perlu diperiksa Guru." /></FormField>
      <FormField label="Foto anak" full>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setEditor({ ...editor, photoFile: e.target.files?.[0] ?? null })} />
        <small className="family-file-hint">{editor.photoFile ? `Dipilih: ${editor.photoFile.name}` : form.photo_path ? 'Foto terverifikasi sebelumnya tetap digunakan jika tidak diganti.' : 'JPG, PNG, atau WebP. Maksimal 5 MB.'}</small>
      </FormField>
      <FormField label="Dokumen pendukung" full>
        <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setEditor({ ...editor, documentFiles: Array.from(e.target.files ?? []).slice(0, 10) })} />
        <small className="family-file-hint"><FileText size={12} /> {editor.documentFiles.length ? `${editor.documentFiles.length} berkas baru dipilih` : form.document_paths.length ? `${form.document_paths.length} berkas terverifikasi sebelumnya tetap tersimpan` : 'Opsional · PDF/JPG/PNG/WebP · maksimal 10 berkas.'}</small>
      </FormField>
    </FormSection>
  </>
}

function FamilyInfo({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><strong>{value}</strong></div>
}

function CorrectionNotice({ request, onFix, compact = false }: { request: VerificationRequestRow; onFix: () => void; compact?: boolean }) {
  return <div className={compact ? 'family-correction compact' : 'family-correction'}><div><strong>{request.status === 'rejected' ? 'Pengajuan ditolak' : 'Perlu diperbaiki'}</strong><p>{request.review_comment || 'Guru meminta Anda memperbarui data sebelum diajukan kembali.'}</p></div><Button size="sm" variant="secondary" onClick={onFix}>Perbaiki</Button></div>
}
